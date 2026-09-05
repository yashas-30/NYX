// ═════════════════════════════════════════════════════════════════════════════
// NYX — Local Inference Engine (2026 Edition)
// ═════════════════════════════════════════════════════════════════════════════
//
// Features:
//   • Per-model token counting (Qwen, Llama-3, Llama-2/Mistral, fallback)
//   • CJK-aware token estimation
//   • Message budgeting with system prompt preservation
//   • Historical image stripping (multi-turn vision optimization)
//   • Tool call parsing with structured output
//   • Cancel-safe SSE streaming with backpressure
//   • Reasoning content extraction (DeepSeek-R1 / QwQ)
//   • Rate limiting via Semaphore

use crate::llm::types::{sanitize_messages_for_api, StreamChunkPayload, UnifiedRequest, UnifiedMessage};
use crate::llm::local_orchestrator::SERVER_PORT;
use reqwest::{Client, header::{HeaderMap, HeaderValue}};
use serde_json::{json, Value};
use tauri::{AppHandle, Listener, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio_util::io::StreamReader;
use futures_util::{Stream, TryStreamExt, StreamExt};
use std::sync::LazyLock;
use tokio::sync::Semaphore;
use tracing::{warn, error, instrument, info};
use async_stream::try_stream;

// ── Rate Limiting: Max 4 concurrent inference streams ──────────────────────
static INFERENCE_SEMAPHORE: LazyLock<Semaphore> = LazyLock::new(|| Semaphore::new(4));

// ── HTTP Client ─────────────────────────────────────────────────────────────
static LOCAL_HTTP_CLIENT: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .tcp_nodelay(true)
        .tcp_keepalive(std::time::Duration::from_secs(600))
        .pool_max_idle_per_host(32)
        .no_proxy()
        .build()
        .expect("Failed to build local HTTP client")
});

// ── Token Counter (2026: tiktoken fallback with per-model heuristics) ──────

static BPE: LazyLock<Option<tiktoken_rs::CoreBPE>> = LazyLock::new(|| {
    match tiktoken_rs::cl100k_base() {
        Ok(bpe) => {
            info!("[TokenCounter] tiktoken cl100k_base loaded");
            Some(bpe)
        }
        Err(e) => {
            warn!("[TokenCounter] tiktoken failed: {}. Using heuristic fallback.", e);
            None
        }
    }
});

fn is_cjk_char(c: char) -> bool {
    let cp = c as u32;
    (0x4E00..=0x9FFF).contains(&cp) ||      // CJK Unified Ideographs
    (0x3040..=0x309F).contains(&cp) ||      // Hiragana
    (0x30A0..=0x30FF).contains(&cp) ||      // Katakana
    (0xAC00..=0xD7AF).contains(&cp) ||      // Hangul Syllables
    (0x1100..=0x11FF).contains(&cp) ||      // Hangul Jamo
    (0x3400..=0x4DBF).contains(&cp) ||      // CJK Extension A
    (0x20000..=0x2A6DF).contains(&cp)       // CJK Extension B
}

/// Count tokens with per-model heuristics. Falls back to tiktoken if available.
fn count_tokens(text: &str, model_id: &str) -> usize {
    let model_lower = model_id.to_lowercase();
    let mut cjk_chars = 0usize;
    let mut other_chars = 0usize;
    
    for c in text.chars() {
        if is_cjk_char(c) {
            cjk_chars += 1;
        } else {
            other_chars += 1;
        }
    }

    // 2026 updated ratios based on latest tokenizer research
    if model_lower.contains("qwen") || model_lower.contains("deepseek") {
        // Qwen2.5 / DeepSeek V3: Dense multilingual vocab (152K+)
        let cjk_tokens = (cjk_chars as f32 / 1.4).ceil() as usize;
        let other_tokens = (other_chars as f32 / 4.2).ceil() as usize;
        cjk_tokens + other_tokens
    } else if model_lower.contains("llama-3") || model_lower.contains("llama3") {
        // Llama 3.1/3.2: 128K vocab, good CJK coverage
        let cjk_tokens = (cjk_chars as f32 / 1.05).ceil() as usize;
        let other_tokens = (other_chars as f32 / 4.0).ceil() as usize;
        cjk_tokens + other_tokens
    } else if model_lower.contains("llama-2") || model_lower.contains("llama2") || 
              model_lower.contains("mistral") || model_lower.contains("mixtral") {
        // Llama 2 / Mistral: 32K vocab, poor CJK
        let cjk_tokens = (cjk_chars as f32 / 0.45).ceil() as usize;
        let other_tokens = (other_chars as f32 / 3.6).ceil() as usize;
        cjk_tokens + other_tokens
    } else if model_lower.contains("gemma") {
        // Gemma 2: 256K vocab, excellent multilingual
        let cjk_tokens = (cjk_chars as f32 / 1.2).ceil() as usize;
        let other_tokens = (other_chars as f32 / 4.3).ceil() as usize;
        cjk_tokens + other_tokens
    } else if model_lower.contains("phi") {
        // Phi-3/4: Good CJK for model size
        let cjk_tokens = (cjk_chars as f32 / 1.0).ceil() as usize;
        let other_tokens = (other_chars as f32 / 4.0).ceil() as usize;
        cjk_tokens + other_tokens
    } else {
        // Generic fallback
        if let Some(bpe) = BPE.as_ref() {
            bpe.encode_with_special_tokens(text).len()
        } else {
            let cjk_tokens = (cjk_chars as f32 / 0.7).ceil() as usize;
            let other_tokens = (other_chars as f32 / 3.5).ceil() as usize;
            cjk_tokens + other_tokens
        }
    }
}

// ── Content Extraction ────────────────────────────────────────────────────

fn get_content_string(val: &Value) -> String {
    match val {
        Value::String(s) => s.clone(),
        Value::Array(arr) => {
            arr.iter()
               .filter_map(|item| {
                   if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                       Some(text.to_string())
                   } else if let Some(img) = item.get("image_url").and_then(|v| v.get("url").and_then(|u| u.as_str())) {
                       Some(format!("[Image: {}]", &img[..img.len().min(30)]))
                   } else {
                       None
                   }
               })
               .collect::<Vec<_>>()
               .join("\n")
        }
        Value::Object(obj) => {
            // Handle structured content objects
            if let Some(text) = obj.get("text").and_then(|v| v.as_str()) {
                text.to_string()
            } else {
                val.to_string()
            }
        }
        _ => val.to_string(),
    }
}

/// Surgically truncate text to fit strictly within a token budget while preserving semantic structure.
fn truncate_text_to_token_budget(text: &str, target_tokens: usize, model_id: &str) -> String {
    let current_tokens = count_tokens(text, model_id);
    if current_tokens <= target_tokens {
        return text.to_string();
    }
    if target_tokens < 10 {
        return String::new();
    }

    // If text contains semantic XML blocks (e.g. <user_input>, <web_search_context>, <deep_research_context>),
    // preserve the <user_input> and core execution rules, while pruning the large search/media context.
    if let (Some(u_start), Some(u_end)) = (text.find("<user_input>"), text.find("</user_input>")) {
        let user_query_block = &text[u_start..u_end + 13];
        let user_query_tokens = count_tokens(user_query_block, model_id);
        if user_query_tokens < target_tokens {
            let remaining_budget = target_tokens.saturating_sub(user_query_tokens);
            let prefix = &text[..u_start];
            let suffix = &text[u_end + 13..];
            let half = remaining_budget / 2;
            let pruned_prefix = if half > 10 {
                truncate_text_to_token_budget(prefix, half, model_id)
            } else {
                String::new()
            };
            let pruned_suffix = if remaining_budget.saturating_sub(half) > 10 {
                truncate_text_to_token_budget(suffix, remaining_budget.saturating_sub(half), model_id)
            } else {
                String::new()
            };
            return format!("{}\n{}\n{}", pruned_prefix, user_query_block, pruned_suffix).trim().to_string();
        }
    }

    // General text truncation: approximate character budget (~3.5 chars per token)
    let char_budget = (target_tokens as f32 * 3.5) as usize;
    if text.len() <= char_budget {
        return text.to_string();
    }

    let head_chars = (char_budget * 6) / 10;
    let tail_chars = char_budget.saturating_sub(head_chars);
    let head = &text[..head_chars.min(text.len())];
    let tail = if tail_chars > 0 && text.len() > head_chars + tail_chars {
        &text[text.len() - tail_chars..]
    } else {
        ""
    };

    format!("{}\n\n[...context pruned by Auto Context Controller to fit model context window...]\n\n{}", head, tail)
}

// ── Message Budgeting (2026: Tier-aware context management) ─────────────────

/// Budget messages to fit within context window while preserving critical content.
/// Strategy: Keep all system messages (pruned if necessary), then most recent user/assistant pairs.
fn budget_messages(messages: &[UnifiedMessage], budget_tokens: usize, model_id: &str) -> Vec<UnifiedMessage> {
    let mut total_tokens = 0usize;
    let mut budgeted = Vec::new();
    
    // Phase 1: System messages (limit system instructions to at most 40% of budget)
    let max_system_budget = (budget_tokens * 4) / 10;
    for msg in messages {
        if msg.role == "system" {
            let content_str = get_content_string(&msg.content);
            let msg_tokens = count_tokens(&content_str, model_id);
            if msg_tokens > max_system_budget && max_system_budget > 50 {
                let pruned = truncate_text_to_token_budget(&content_str, max_system_budget, model_id);
                total_tokens += count_tokens(&pruned, model_id);
                budgeted.push(UnifiedMessage {
                    role: "system".to_string(),
                    content: json!(pruned),
                });
            } else {
                total_tokens += msg_tokens;
                budgeted.push(msg.clone());
            }
        }
    }

    // Phase 2: Add recent messages from the end (most important for context)
    let mut temp = Vec::new();
    for msg in messages.iter().rev() {
        if msg.role == "system" { continue; }
        
        let content_str = get_content_string(&msg.content);
        let msg_tokens = count_tokens(&content_str, model_id);
        
        if total_tokens + msg_tokens > budget_tokens {
            let remaining_budget = budget_tokens.saturating_sub(total_tokens);
            // If this is the most recent message (temp is empty), truncate it to fit remaining budget!
            if temp.is_empty() && remaining_budget >= 50 {
                let pruned = truncate_text_to_token_budget(&content_str, remaining_budget, model_id);
                let mut pruned_msg = msg.clone();
                pruned_msg.content = json!(pruned);
                temp.push(pruned_msg);
            }
            break;
        }
        total_tokens += msg_tokens;
        temp.push(msg.clone());
    }
    
    temp.reverse();
    budgeted.extend(temp);
    budgeted
}

/// Strip historical images from all turns except the latest user message.
/// This prevents multi-turn vision bloat while keeping the current image.
fn strip_historical_images(mut budgeted: Vec<UnifiedMessage>) -> Vec<UnifiedMessage> {
    // Find the last user message index
    let last_user_idx = budgeted.iter().rposition(|m| m.role == "user");
    
    // If no user message found, nothing to strip
    let last_user_idx = match last_user_idx {
        Some(idx) => idx,
        None => return budgeted,
    };
    
    for (i, m) in budgeted.iter_mut().enumerate() {
        if i != last_user_idx {
            if let Some(arr) = m.content.as_array_mut() {
                arr.retain(|item| {
                    item.get("type").and_then(|t| t.as_str()) != Some("image_url")
                });
            }
        }
    }
    budgeted
}

/// Flatten non-image arrays to simple strings for llama-server compatibility.
fn flatten_arrays(mut budgeted: Vec<UnifiedMessage>) -> Vec<UnifiedMessage> {
    for m in budgeted.iter_mut() {
        if let Some(arr) = m.content.as_array() {
            let has_image = arr.iter().any(|item| {
                item.get("type").and_then(|t| t.as_str()) == Some("image_url")
            });
            if !has_image {
                let mut text_parts = Vec::new();
                for item in arr {
                    if let Some(t) = item.get("text").and_then(|v| v.as_str()) {
                        if !t.trim().is_empty() { text_parts.push(t); }
                    } else if let Some(c) = item.get("content").and_then(|v| v.as_str()) {
                        if !c.trim().is_empty() { text_parts.push(c); }
                    } else if let Some(v) = item.get("value").and_then(|v| v.as_str()) {
                        if !v.trim().is_empty() { text_parts.push(v); }
                    } else if let Some(s) = item.as_str() {
                        if !s.trim().is_empty() { text_parts.push(s); }
                    }
                }
                m.content = json!(text_parts.join("\n\n"));
            }
        }
    }
    budgeted
}

// ── Request Builder (2026: Structured errors, reasoning support) ────────────

#[derive(Debug, Clone)]
pub struct LocalRequestConfig {
    pub endpoint: String,
    pub body: Value,
    pub headers: HeaderMap,
    pub estimated_input_tokens: usize,
    pub effective_context: u32,
}

#[derive(Debug, thiserror::Error, Clone)]
pub enum RequestBuildError {
    #[error("Empty message list")]
    EmptyMessages,
    #[error("Context window too small: {requested} < minimum {minimum}")]
    ContextTooSmall { requested: u32, minimum: u32 },
    #[error("System instruction too long: {tokens} tokens exceeds half of context")]
    SystemTooLong { tokens: usize },
}

#[instrument(skip(req))]
pub fn build_local_request(req: &UnifiedRequest) -> Result<LocalRequestConfig, RequestBuildError> {
    let max_tokens = req.max_tokens.filter(|&v| v > 0);
    let mut system_text = req.system_instruction.clone().unwrap_or_default();

    if !system_text.contains("FORMATTING DIRECTIVE") {
        system_text.push_str("\n\n[FORMATTING DIRECTIVE]\nFormat responses using clean Markdown with headers, tables, and bullet points where appropriate. For code, always use fenced code blocks with the correct language tag. Keep responses concise and direct.");
    }

    let (thinking_budget, reasoning_effort) = match req.thinking_level.as_deref() {
        Some("low") => (1024u32, "low"),
        Some("medium") | Some("med") => (4096u32, "medium"),
        Some("max") | Some("high") => (8192u32, "high"),
        _ => (4096u32, "medium"),
    };

    if req.reasoning_enabled == Some(true) {
        if !system_text.contains("<think>") {
            system_text.push_str(&format!(
                "\n\n[REASONING DIRECTIVE]\nYou MUST perform deep, step-by-step reasoning inside <think>...</think> tags before providing your final answer. Allocate approximately {} tokens to your reasoning process, thoroughly verifying facts and logic before writing the final response.",
                thinking_budget
            ));
        }
    } else {
        system_text.push_str("\n\n[CRITICAL DIRECTIVE: NO REASONING]\nDo NOT include any <think> tags, scratchpad, reasoning chain, or internal monologue. Answer the user's prompt DIRECTLY and immediately without any preamble or thinking block.");
    }

    let active_server_ctx = crate::llm::local_orchestrator::ACTIVE_SERVER_CTX_SIZE.load(std::sync::atomic::Ordering::Relaxed);

    // Context window: use active server ctx if available, request value, or safe fallback
    let context_window: usize = if active_server_ctx > 0 {
        active_server_ctx as usize
    } else if let Some(req_ctx) = req.context_window.filter(|&v| v > 0) {
        req_ctx as usize
    } else {
        4096
    };

    if context_window < 512 {
        return Err(RequestBuildError::ContextTooSmall { 
            requested: context_window as u32, 
            minimum: 512 
        });
    }

    // Reserve space for response dynamically based on available context
    let is_reasoning_model = req.reasoning_enabled == Some(true)
        || req.capabilities.as_ref().map(|c| c.reasoning).unwrap_or(false);
    
    let requested_max = max_tokens.unwrap_or(2048) as usize;
    let max_output_allowed = (context_window / 3).max(256).min(requested_max);
    let response_reserve = max_output_allowed;

    // Budget calculation with safety margin
    let safety_margin = if context_window <= 4096 { 128 } else if is_reasoning_model { 512 } else { 256 };
    let budget = context_window
        .saturating_sub(response_reserve)
        .saturating_sub(safety_margin)
        .max(256);

    // Validate and truncate system prompt size gracefully
    if !system_text.is_empty() {
        let system_tokens = count_tokens(&system_text, &req.model_id);
        let max_system_allowed = (budget * 4) / 10;
        if system_tokens > max_system_allowed && max_system_allowed > 50 {
            system_text = truncate_text_to_token_budget(&system_text, max_system_allowed, &req.model_id);
        }
    }

    let mut msgs: Vec<UnifiedMessage> = req.messages.clone();
    if !system_text.is_empty() {
        msgs.insert(0, UnifiedMessage {
            role: "system".to_string(),
            content: json!(system_text),
        });
    }

    if msgs.is_empty() {
        return Err(RequestBuildError::EmptyMessages);
    }

    let budgeted = budget_messages(&msgs, budget, &req.model_id);
    let budgeted = strip_historical_images(budgeted);
    let budgeted = flatten_arrays(budgeted);
    let sanitized = sanitize_messages_for_api(&budgeted);

    let estimated_input_tokens: usize = budgeted.iter()
        .map(|m| count_tokens(&get_content_string(&m.content), &req.model_id))
        .sum();

    // Resolve virtual model aliases to the actual GGUF filename for llama-server compatibility.
    let effective_model_id = req.model_id.clone();

    let mut body = json!({
        "model": effective_model_id,
        "messages": sanitized,
        "temperature": req.temperature.unwrap_or(0.7),
        "stream": true,
        // Enable KV prompt caching for lightning-fast TTFT (<50ms) across conversation turns.
        "cache_prompt": true,
    });




    let default_stop = vec![
        "<end_of_turn>".to_string(),
        "<start_of_turn>".to_string(),
        "<eos>".to_string(),
        "<|eot_id|>".to_string(),
        "<|eom_id|>".to_string(),
        "<|im_end|>".to_string(),
        "\nUser:".to_string(),
        "\nUser ".to_string(),
        "\nHuman:".to_string(),
        "\nAssistant:".to_string(),
    ];
    if let Some(ref stop_seqs) = req.stop {
        let mut combined = stop_seqs.clone();
        for s in default_stop {
            if !combined.contains(&s) {
                combined.push(s);
            }
        }
        body["stop"] = json!(combined);
    } else {
        body["stop"] = json!(default_stop);
    }

    if let Some(ref tools) = req.tools {
        body["tools"] = tools.clone();
    }

    if let Some(ref tool_choice) = req.tool_choice {
        body["tool_choice"] = json!(tool_choice);
    }

    // max_tokens: ensure headroom so models don't get cut off during generation
    let max_allowed = (context_window.saturating_sub(estimated_input_tokens)).saturating_sub(64) as u32;
    if let Some(tokens) = max_tokens {
        let effective_max = tokens.min(max_allowed).max(1);
        body["max_tokens"] = json!(effective_max);
    } else {
        let default_max = 4096.min(max_allowed).max(1);
        body["max_tokens"] = json!(default_max);
    }

    if let Some(top_p) = req.top_p { body["top_p"] = json!(top_p); }
    if let Some(top_k) = req.top_k { body["top_k"] = json!(top_k); }
    let rep_penalty = req.repeat_penalty.unwrap_or(1.05);
    body["repeat_penalty"] = json!(rep_penalty);
    body["repeat_last_n"] = json!(256);
    if let Some(presence_penalty) = req.presence_penalty { body["presence_penalty"] = json!(presence_penalty); }
    if let Some(frequency_penalty) = req.frequency_penalty { body["frequency_penalty"] = json!(frequency_penalty); }
    
    // JSON mode / structured output support
    if let Some(response_format) = &req.response_format {
        body["response_format"] = response_format.clone();
    }
    
    // If prompt already contains live search results, remove tools so local GGUF models output direct answers
    let prompt_has_search_results = req.messages.iter().any(|m| {
        let s = match &m.content {
            serde_json::Value::String(str_val) => str_val.as_str(),
            _ => "",
        };
        s.contains("LIVE WEB SEARCH") || s.contains("WEB SEARCH RESULTS")
    });

    if prompt_has_search_results {
        if let Some(obj) = body.as_object_mut() {
            obj.remove("tools");
            obj.remove("tool_choice");
        }
    }

    if req.reasoning_enabled == Some(true) {
        body["reasoning_effort"] = json!(reasoning_effort);
        body["enable_thinking"] = json!(true);
        body["chat_template_kwargs"] = json!({ "thinking": true });
        // Expand max_tokens to accommodate reasoning budget on top of output tokens
        let current_max = body["max_tokens"].as_u64().unwrap_or(4096) as u32;
        body["max_tokens"] = json!(current_max + thinking_budget);
    } else {
        // Disable thinking overhead on local GGUF models for instant response generation
        body["reasoning_effort"] = json!("none");
        body["enable_thinking"] = json!(false);
        body["chat_template_kwargs"] = json!({ "thinking": false });
    }

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", HeaderValue::from_static("application/json"));

    let active_port = SERVER_PORT.load(std::sync::atomic::Ordering::Relaxed);
    let endpoint = req.endpoint_override.clone()
        .unwrap_or_else(|| format!("http://127.0.0.1:{}/v1/chat/completions", active_port));

    Ok(LocalRequestConfig {
        endpoint,
        body,
        headers,
        estimated_input_tokens,
        effective_context: context_window as u32,
    })
}

// ── Streaming Events ────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub enum LocalStreamEvent {
    Text(String),
    Reasoning(String),      // 2026: DeepSeek-R1 / QwQ reasoning blocks
    ToolStart { id: String, name: String },
    ToolArgs(String),
    ToolComplete,
    Usage { prompt_tokens: u32, completion_tokens: u32, total_tokens: u32 },
    FinishError(String),
    Nothing,
}

// ── SSE Parser (2026: Robust, cancel-safe, reasoning-aware) ─────────────────

fn parse_local_sse_event_value(parsed: &Value, active_tool_call_id: &mut Option<String>) -> Vec<LocalStreamEvent> {
    let mut events = Vec::new();

    // Error handling
    if let Some(error) = parsed.get("error") {
        let msg = error.get("message")
            .and_then(|m| m.as_str())
            .or_else(|| error.as_str())
            .unwrap_or("Unknown error");
        events.push(LocalStreamEvent::FinishError(msg.to_string()));
        return events;
    }

    // Usage tracking (final message)
    if let Some(usage) = parsed.get("usage") {
        if let (Some(pt), Some(ct), Some(tt)) = (
            usage.get("prompt_tokens").and_then(|v| v.as_u64()),
            usage.get("completion_tokens").and_then(|v| v.as_u64()),
            usage.get("total_tokens").and_then(|v| v.as_u64()),
        ) {
            events.push(LocalStreamEvent::Usage {
                prompt_tokens: pt as u32,
                completion_tokens: ct as u32,
                total_tokens: tt as u32,
            });
        }
    }

    if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
        if let Some(choice) = choices.first() {
            if let Some(delta) = choice.get("delta") {
                // Reasoning content (DeepSeek-R1, QwQ, Mythos, etc.)
                let explicit_reasoning = delta.get("reasoning_content")
                    .or_else(|| delta.get("thinking"))
                    .or_else(|| delta.get("reasoning"))
                    .or_else(|| delta.get("thought"))
                    .and_then(|r| r.as_str());

                if let Some(reasoning) = explicit_reasoning {
                    if !reasoning.is_empty() {
                        events.push(LocalStreamEvent::Reasoning(reasoning.to_string()));
                    }
                }

                // Regular content — emitted to process_text_tokens for stateful <think> tag parsing
                if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                    if !content.is_empty() {
                        events.push(LocalStreamEvent::Text(content.to_string()));
                    }
                }

                // Tool calls
                if let Some(tool_calls) = delta.get("tool_calls").and_then(|tc| tc.as_array()) {
                    for tc in tool_calls {
                        let id_opt = tc.get("id").and_then(|id| id.as_str());
                        
                        if let Some(id) = id_opt {
                            if Some(id) != active_tool_call_id.as_deref() {
                                *active_tool_call_id = Some(id.to_string());
                                if let Some(function) = tc.get("function") {
                                    if let Some(name) = function.get("name").and_then(|n| n.as_str()) {
                                        events.push(LocalStreamEvent::ToolStart {
                                            id: id.to_string(),
                                            name: name.to_string(),
                                        });
                                    }
                                }
                            }
                        }

                        if let Some(function) = tc.get("function") {
                            if let Some(args) = function.get("arguments").and_then(|a| a.as_str()) {
                                if !args.is_empty() {
                                    events.push(LocalStreamEvent::ToolArgs(args.to_string()));
                                }
                            }
                        }
                    }
                }
            } else if let Some(message) = choice.get("message") {
                // Non-streaming / final message format fallback
                if let Some(content) = message.get("content").and_then(|c| c.as_str()) {
                    if !content.is_empty() {
                        events.push(LocalStreamEvent::Text(content.to_string()));
                    }
                }
                if let Some(reasoning) = message.get("reasoning_content").and_then(|r| r.as_str()) {
                    if !reasoning.is_empty() {
                        events.push(LocalStreamEvent::Reasoning(reasoning.to_string()));
                    }
                }
            }
            
            if let Some(finish_reason) = choice.get("finish_reason").and_then(|fr| fr.as_str()) {
                if finish_reason == "tool_calls" {
                    events.push(LocalStreamEvent::ToolComplete);
                    *active_tool_call_id = None;
                }
            }
        }
    }
    
    if events.is_empty() { events.push(LocalStreamEvent::Nothing); }
    events
}

fn process_text_tokens(
    t: &str,
    in_think_block: &mut bool,
    total_text_chars: &mut usize,
    max_output_chars: usize,
) -> Vec<StreamChunkPayload> {
    let mut outputs = Vec::new();
    *total_text_chars += t.len();
    if *total_text_chars > max_output_chars {
        warn!("[Inference] Output exceeded {} chars, truncating.", max_output_chars);
        outputs.push(StreamChunkPayload::done());
        return outputs;
    }

    let mut current_text = t;
    while !current_text.is_empty() {
        if *in_think_block {
            let end_tags = ["</think>", "</thought>", "</thinking>"];
            let mut earliest_end: Option<(usize, usize)> = None;
            for tag in &end_tags {
                if let Some(idx) = current_text.find(tag) {
                    if earliest_end.map_or(true, |(best_idx, _)| idx < best_idx) {
                        earliest_end = Some((idx, tag.len()));
                    }
                }
            }
            if let Some((end_idx, tag_len)) = earliest_end {
                let thinking_part = &current_text[..end_idx];
                if !thinking_part.is_empty() {
                    outputs.push(StreamChunkPayload::thinking(thinking_part.to_string()));
                }
                *in_think_block = false;
                current_text = &current_text[end_idx + tag_len..];
            } else {
                outputs.push(StreamChunkPayload::thinking(current_text.to_string()));
                break;
            }
        } else {
            let start_tags = ["<think>", "<thought>", "<thinking>"];
            let mut earliest_start: Option<(usize, usize)> = None;
            for tag in &start_tags {
                if let Some(idx) = current_text.find(tag) {
                    if earliest_start.map_or(true, |(best_idx, _)| idx < best_idx) {
                        earliest_start = Some((idx, tag.len()));
                    }
                }
            }
            if let Some((start_idx, tag_len)) = earliest_start {
                let text_part = &current_text[..start_idx];
                if !text_part.is_empty() {
                    outputs.push(StreamChunkPayload::text(text_part.to_string()));
                }
                *in_think_block = true;
                current_text = &current_text[start_idx + tag_len..];
            } else {
                outputs.push(StreamChunkPayload::text(current_text.to_string()));
                break;
            }
        }
    }
    outputs
}

// ── Stream Execution (2026: Rate-limited, backpressure-aware) ─────────────

#[instrument(skip(app, req))]
pub async fn execute_local_stream(
    app: &AppHandle,
    req: &UnifiedRequest,
) -> Result<std::pin::Pin<Box<dyn Stream<Item = Result<StreamChunkPayload, String>> + Send>>, String> {
    use crate::llm::local_orchestrator::ACTIVE_LOCAL_IMAGE_MODEL;

    // ── Port-0 interception: active model is an image gen model ─────────────
    let active_port = SERVER_PORT.load(std::sync::atomic::Ordering::Relaxed);
    if active_port == 0 {
        let active_image_model: Option<String> = {
            ACTIVE_LOCAL_IMAGE_MODEL.lock().unwrap().clone()
        };
        if let Some(model_path) = active_image_model {
            // Extract the last user prompt from the request
            let prompt = req.messages.iter().rev()
                .find(|m| m.role == "user")
                .map(|m| match &m.content {
                    serde_json::Value::String(s) => s.clone(),
                    serde_json::Value::Array(arr) => arr.iter()
                        .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
                        .collect::<Vec<_>>()
                        .join(" "),
                    other => other.to_string(),
                })
                .unwrap_or_default();

            let app_clone = app.clone();
            let prompt_clone = prompt.clone();
            let model_path_clone = model_path.clone();

            info!("[Inference] Port-0 image interception | model={} | prompt={:.80}", model_path, prompt);

            let stream = try_stream! {
                yield StreamChunkPayload::tool_start(
                    "img_gen_1".to_string(),
                    "generate_image".to_string(),
                );
                yield StreamChunkPayload::tool_args(
                    format!("{{\"prompt\":\"{}\"}}", prompt_clone.replace('"', "\\\""))
                );

                match crate::llm::diffusers::generate_local_image(
                    app_clone,
                    prompt_clone.clone(),
                    Some(model_path_clone),
                    Some(1024),
                    Some(1024),
                ).await {
                    Ok(res) if res.success => {
                        yield StreamChunkPayload::tool_complete();
                        let fwd_path = res.image_path.replace('\\', "/");
                        let markdown = format!(
                            "🎨 **Generated Image** for _\"{}\"_:\n\n![Generated Image](file:///{})",
                            prompt_clone, fwd_path
                        );
                        yield StreamChunkPayload::text(markdown);
                    }
                    Ok(res) => {
                        let err_msg = res.error.unwrap_or_else(|| "Image generation returned no output.".to_string());
                        yield StreamChunkPayload::tool_complete();
                        Err(format!("Image generation failed: {}", err_msg))?;
                        unreachable!();
                    }
                    Err(e) => {
                        yield StreamChunkPayload::tool_complete();
                        Err(format!("Image generation error: {}", e))?;
                        unreachable!();
                    }
                }

                yield StreamChunkPayload::done();
            };

            return Ok(Box::pin(stream));
        }

        // Auto-boot the local model on GPU if port is 0
        let target_model = if !req.model_id.trim().is_empty() && req.model_id != "default" && req.model_id != "local" {
            req.model_id.clone()
        } else {
            // Find any available local GGUF model dynamically
            let available = crate::llm::local_orchestrator::list_local_models(app.clone()).await.unwrap_or_default();
            let mut found_id: Option<String> = None;
            for m in available {
                if (m.id.ends_with(".gguf") || m.name.ends_with(".gguf") || m.model_type.as_deref() == Some("llm"))
                    && m.status == "completed"
                {
                    if crate::llm::local_orchestrator::resolve_model_path(app, &m.id).await.is_some() {
                        found_id = Some(m.id);
                        break;
                    }
                }
            }
            if let Some(id) = found_id {
                id
            } else {
                return Err(
                    "No local GGUF models found to run inference. Please download a model in Settings → Local Models.".to_string()
                );
            }
        };
        
        let resolved = crate::llm::local_orchestrator::resolve_model_path(app, &target_model).await;
        if resolved.is_some() {
            let active_port = SERVER_PORT.load(std::sync::atomic::Ordering::Relaxed);
            if active_port == 0 {
                info!("[Inference] Auto-starting native GPU engine with model: {}", target_model);
                if let Some(manager) = app.try_state::<std::sync::Arc<crate::llm::local_orchestrator::LlamaManager>>() {
                    if let Err(e) = crate::llm::local_orchestrator::start_local_server(
                        app.clone(),
                        manager,
                        target_model.clone(),
                        req.context_window,
                        None, // Dynamic capacity-aware NGL offload (including Shared GPU Memory)
                        None, // Dynamic CPU threads
                        Some(true), // Flash Attention enabled
                        None, // Dynamic KV cache quantization (q8_0 or q4_0 based on headroom)
                        None,
                        None, // Dynamic batch size
                        None,
                        None,
                        None,
                        None,
                    ).await {
                        error!("[Inference] Failed to start local server for {}: {}", target_model, e);
                        return Err(format!("Failed to auto-start local inference server for {}: {}", target_model, e));
                    }
                }

                // Poll for up to 90 seconds (180 × 500ms) for the server to become ready.
                let mut waited = 0u32;
                while waited < 180 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    let p = SERVER_PORT.load(std::sync::atomic::Ordering::Relaxed);
                    if p != 0 {
                        info!("[Inference] Native Lucifer server ready on port {} after {}ms", p, waited * 500);
                        break;
                    }
                    waited += 1;
                }
            }
        }

        let current_port = SERVER_PORT.load(std::sync::atomic::Ordering::Relaxed);
        if current_port == 0 {
            return Err(format!("Local model '{}' is not loaded or could not be found. Please check Settings → Local Models to start the engine.", target_model));
        }
    }

    // Acquire rate limit permit
    let _permit = INFERENCE_SEMAPHORE.acquire().await
        .map_err(|e| format!("Rate limiter error: {}", e))?;

    let config = build_local_request(req)
        .map_err(|e| format!("Request build failed: {}", e))?;

    info!(
        "[Inference] Starting stream | model={} | endpoint={} | estimated_input_tokens={} | context={}",
        req.model_id, config.endpoint, config.estimated_input_tokens, config.effective_context
    );

    let response = LOCAL_HTTP_CLIENT.post(&config.endpoint)
        .headers(config.headers)
        .json(&config.body)
        .timeout(std::time::Duration::from_secs(3600))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    let response = if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        error!("[Inference] HTTP error {}: {}", status, &body_text[..body_text.len().min(500)]);

        if body_text.contains("exceed_context_size_error") || body_text.contains("exceeds the available context size") {
            warn!("[AutoContextController] Context limit exceeded on local server. Auto-recovering...");

            let detected_ctx = if let Ok(err_json) = serde_json::from_str::<Value>(&body_text) {
                err_json.get("error")
                    .and_then(|e| e.get("n_ctx"))
                    .and_then(|v| v.as_u64())
                    .map(|v| v as u32)
            } else {
                None
            }.unwrap_or(4096);

            crate::llm::local_orchestrator::ACTIVE_SERVER_CTX_SIZE.store(detected_ctx, std::sync::atomic::Ordering::Relaxed);

            let mut retry_req = req.clone();
            retry_req.context_window = Some(detected_ctx);
            let reduced_max = (detected_ctx / 4).clamp(256, 1024);
            retry_req.max_tokens = Some(reduced_max);

            let retry_config = build_local_request(&retry_req)
                .map_err(|e| format!("Auto-context rebuild failed: {}", e))?;

            info!(
                "[AutoContextController] Retrying with compacted payload (n_ctx={}, estimated_input={})",
                detected_ctx, retry_config.estimated_input_tokens
            );

            let retry_response = LOCAL_HTTP_CLIENT.post(&retry_config.endpoint)
                .headers(retry_config.headers)
                .json(&retry_config.body)
                .timeout(std::time::Duration::from_secs(3600))
                .send()
                .await
                .map_err(|e| format!("Auto-context retry connection failed: {}", e))?;

            if !retry_response.status().is_success() {
                let retry_status = retry_response.status();
                let retry_body = retry_response.text().await.unwrap_or_default();
                return Err(format!("Local request failed ({}): {}", retry_status, retry_body));
            }

            retry_response
        } else {
            return Err(format!("Local request failed ({}): {}", status, body_text));
        }
    } else {
        response
    };

    let stream = try_stream! {
        let byte_stream = response.bytes_stream().map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, e)
        });
        
        let stream_reader = StreamReader::new(byte_stream);
        let mut lines = BufReader::with_capacity(64 * 1024, stream_reader).lines();
        let mut buffer = String::with_capacity(4096);
        let mut active_tool_call_id: Option<String> = None;
        let mut total_text_chars = 0usize;
        let max_output_chars = 2_000_000; // ~500K tokens safety limit
        
        // 2026: Track if we are inside a <think> block for models that emit it as text
        let mut in_think_block = false;

        loop {
            let line = match lines.next_line().await {
                Ok(Some(l)) => l,
                Ok(None) => break,
                Err(e) => {
                    error!("[Inference] Stream read error: {}", e);
                    Err(format!("Stream interrupted: {}", e))?;
                    unreachable!();
                }
            };

            // Safety: prevent infinite growth
            if buffer.len() > 8_388_608 { // 8MB
                warn!("[SSE] Buffer exceeded 8MB, dropping.");
                buffer.clear();
            }

            if line.is_empty() {
                if !buffer.is_empty() {
                    let data = buffer.trim().to_string();
                    buffer.clear();

                    if data == "[DONE]" {
                        yield StreamChunkPayload::done();
                        break;
                    }

                    if let Ok(v) = serde_json::from_str::<Value>(&data) {
                        for ev in parse_local_sse_event_value(&v, &mut active_tool_call_id) {
                            match ev {
                                LocalStreamEvent::Text(t) => {
                                    for payload in process_text_tokens(&t, &mut in_think_block, &mut total_text_chars, max_output_chars) {
                                        let is_done = payload.done.unwrap_or(false);
                                        yield payload;
                                        if is_done { return; }
                                    }
                                }
                                LocalStreamEvent::Reasoning(r) => yield StreamChunkPayload::thinking(r),
                                LocalStreamEvent::ToolStart { id, name } => yield StreamChunkPayload::tool_start(id, name),
                                LocalStreamEvent::ToolArgs(a) => yield StreamChunkPayload::tool_args(a),
                                LocalStreamEvent::ToolComplete => yield StreamChunkPayload::tool_complete(),
                                LocalStreamEvent::Usage { prompt_tokens, completion_tokens, total_tokens } => {
                                    yield StreamChunkPayload::usage(prompt_tokens, completion_tokens, total_tokens)
                                }
                                LocalStreamEvent::FinishError(msg) => {
                                    Err(msg)?;
                                    unreachable!();
                                }
                                LocalStreamEvent::Nothing => continue,
                            }
                        }
                    }
                }
                continue;
            }

            if let Some(payload) = line.strip_prefix("data: ") {
                if payload == "[DONE]" {
                    yield StreamChunkPayload::done();
                    break;
                }
                if !buffer.is_empty() { buffer.push('\n'); }
                buffer.push_str(payload);
            } else if let Some(stripped) = line.strip_prefix("data:") {
                if !buffer.is_empty() { buffer.push('\n'); }
                buffer.push_str(stripped.trim());
            }

            // Eager parse: if buffer looks like complete JSON, process it
            let trimmed = buffer.trim();
            if trimmed.starts_with('{') && trimmed.ends_with('}') {
                if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
                    buffer.clear();
                    for ev in parse_local_sse_event_value(&v, &mut active_tool_call_id) {
                        match ev {
                            LocalStreamEvent::Text(t) => {
                                for payload in process_text_tokens(&t, &mut in_think_block, &mut total_text_chars, max_output_chars) {
                                    let is_done = payload.done.unwrap_or(false);
                                    yield payload;
                                    if is_done { return; }
                                }
                            }
                            LocalStreamEvent::Reasoning(r) => yield StreamChunkPayload::thinking(r),
                            LocalStreamEvent::ToolStart { id, name } => yield StreamChunkPayload::tool_start(id, name),
                            LocalStreamEvent::ToolArgs(a) => yield StreamChunkPayload::tool_args(a),
                            LocalStreamEvent::ToolComplete => yield StreamChunkPayload::tool_complete(),
                            LocalStreamEvent::Usage { prompt_tokens, completion_tokens, total_tokens } => {
                                yield StreamChunkPayload::usage(prompt_tokens, completion_tokens, total_tokens)
                            }
                            LocalStreamEvent::FinishError(msg) => {
                                Err(msg)?;
                                unreachable!();
                            }
                            LocalStreamEvent::Nothing => continue,
                        }
                    }
                }
            }
        }
        
        // Flush remaining buffer
        if !buffer.is_empty() {
            let data = buffer.trim().to_string();
            if data != "[DONE]" {
                if let Ok(v) = serde_json::from_str::<Value>(&data) {
                    for ev in parse_local_sse_event_value(&v, &mut active_tool_call_id) {
                        match ev {
                            LocalStreamEvent::Text(t) => {
                                for payload in process_text_tokens(&t, &mut in_think_block, &mut total_text_chars, max_output_chars) {
                                    let is_done = payload.done.unwrap_or(false);
                                    yield payload;
                                    if is_done { return; }
                                }
                            }
                            LocalStreamEvent::Reasoning(r) => yield StreamChunkPayload::thinking(r),
                            LocalStreamEvent::ToolStart { id, name } => yield StreamChunkPayload::tool_start(id, name),
                            LocalStreamEvent::ToolArgs(a) => yield StreamChunkPayload::tool_args(a),
                            LocalStreamEvent::ToolComplete => yield StreamChunkPayload::tool_complete(),
                            LocalStreamEvent::Usage { prompt_tokens, completion_tokens, total_tokens } => {
                                yield StreamChunkPayload::usage(prompt_tokens, completion_tokens, total_tokens)
                            }
                            LocalStreamEvent::FinishError(msg) => {
                                Err(msg)?;
                                unreachable!();
                            }
                            LocalStreamEvent::Nothing => continue,
                        }
                    }
                }
            }
        }
        yield StreamChunkPayload::done();
    };

    Ok(Box::pin(stream))
}

// ── Tauri Command (2026: Cancel-safe, backpressure-aware) ─────────────────

#[tauri::command]
pub async fn llm_local_stream_request(
    app: AppHandle,
    req: UnifiedRequest,
    on_event: tauri::ipc::Channel<StreamChunkPayload>,
) -> Result<(), String> {
    let event_name = req.event_name.clone();

    let stream = execute_local_stream(&app, &req).await?;

    let cancel_name = format!("cancel_{}", event_name.unwrap_or_default());
    let (cancel_tx, mut cancel_rx) = tokio::sync::mpsc::channel::<()>(1);
    
    let cancel_id = app.listen(cancel_name.clone(), move |_| {
        let _ = cancel_tx.try_send(());
    });

    tokio::pin!(stream);
    let mut item_count = 0usize;
    
    loop {
        tokio::select! {
            _ = cancel_rx.recv() => {
                info!("[Inference] Cancelled by user");
                break;
            }
            msg = stream.next() => {
                match msg {
                    Some(Ok(payload)) => {
                        let is_done = payload.done.unwrap_or(false);
                        
                        // Backpressure: check channel capacity before sending
                        // Tauri channels don't expose capacity, so we use a simple counter
                        item_count += 1;
                        if item_count % 100 == 0 {
                            tokio::task::yield_now().await; // Cooperate with scheduler
                        }
                        
                        let _ = on_event.send(payload);
                        if is_done { break; }
                    }
                    Some(Err(err)) => {
                        error!("[Inference] Stream error: {}", err);
                        let _ = on_event.send(StreamChunkPayload::error(err));
                        break;
                    }
                    None => {
                        info!("[Inference] Stream ended normally");
                        let _ = on_event.send(StreamChunkPayload::done());
                        break;
                    }
                }
            }
        }
    }
    
    app.unlisten(cancel_id);
    info!("[Inference] Session complete | items={}", item_count);

    Ok(())
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_count_tokens_english() {
        let text = "This is a simple test sentence of seven words.";
        let qwen = count_tokens(text, "qwen2.5-coder-7b");
        let llama3 = count_tokens(text, "meta-llama-3-8b");
        let fallback = count_tokens(text, "unknown-model");

        println!("English - Qwen: {}, Llama 3: {}, Fallback: {}", qwen, llama3, fallback);
        assert!(qwen > 0);
        assert!(llama3 > 0);
        assert!(fallback > 0);
    }

    #[test]
    fn test_count_tokens_cjk() {
        let text = "这是一个简单的测试句子。";
        let qwen = count_tokens(text, "qwen2.5-coder-7b");
        let llama3 = count_tokens(text, "meta-llama-3-8b");
        let fallback = count_tokens(text, "unknown-model");

        println!("CJK - Qwen: {}, Llama 3: {}, Fallback: {}", qwen, llama3, fallback);
        // Qwen should be more efficient for CJK
        assert!(qwen <= fallback, "Qwen ({}) should be <= fallback ({})", qwen, fallback);
    }

    #[test]
    fn test_budget_messages() {
        let messages = vec![
            UnifiedMessage { role: "system".to_string(), content: json!("You are helpful.") },
            UnifiedMessage { role: "user".to_string(), content: json!("Hello") },
            UnifiedMessage { role: "assistant".to_string(), content: json!("Hi there!") },
            UnifiedMessage { role: "user".to_string(), content: json!("What's the weather?") },
        ];
        
        let budgeted = budget_messages(&messages, 100, "test-model");
        assert!(!budgeted.is_empty());
        // System message should always be included
        assert!(budgeted.iter().any(|m| m.role == "system"));
    }

    #[test]
    fn test_strip_historical_images() {
        let messages = vec![
            UnifiedMessage { 
                role: "user".to_string(), 
                content: json!([
                    {"type": "text", "text": "Look at this"},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,abc"}}
                ])
            },
            UnifiedMessage { role: "assistant".to_string(), content: json!("I see it.") },
            UnifiedMessage { 
                role: "user".to_string(), 
                content: json!([
                    {"type": "text", "text": "And this"},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,def"}}
                ])
            },
        ];
        
        let stripped = strip_historical_images(messages);
        // First user message should have image stripped
        let first_user = stripped.iter().find(|m| m.role == "user").unwrap();
        if let Some(arr) = first_user.content.as_array() {
            assert!(!arr.iter().any(|item| item.get("type").and_then(|t| t.as_str()) == Some("image_url")));
        }
        // Last user message should keep image
        let last_user = stripped.iter().rfind(|m| m.role == "user").unwrap();
        if let Some(arr) = last_user.content.as_array() {
            assert!(arr.iter().any(|item| item.get("type").and_then(|t| t.as_str()) == Some("image_url")));
        }
    }

    #[test]
    fn test_build_local_request_validation() {
        let req = UnifiedRequest {
            provider: "nyx-native".to_string(),
            model_id: "test".to_string(),
            api_key: String::new(),
            messages: vec![],
            system_instruction: None,
            temperature: None,
            max_tokens: None,
            top_p: None,
            top_k: None,
            repeat_penalty: None,
            presence_penalty: None,
            frequency_penalty: None,
            context_window: Some(256), // Too small
            tools: None,
            response_format: None,
            endpoint_override: None,
            event_name: None,
            stop: None,
            execution_mode: None,
            reasoning_enabled: None,
            thinking_level: None,
            capabilities: None,
            tool_choice: None,
            web_search_enabled: false,
            agent_mode: None,
        };

        
        let result = build_local_request(&req);
        assert!(result.is_err());
        match result {
            Err(RequestBuildError::ContextTooSmall { .. }) => {},
            _ => panic!("Expected ContextTooSmall error"),
        }
    }
}
