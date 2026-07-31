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
use tauri::{AppHandle, Listener};
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
        .connect_timeout(std::time::Duration::from_secs(10))
        .tcp_nodelay(true)
        .tcp_keepalive(std::time::Duration::from_secs(120))
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

// ── Message Budgeting (2026: Tier-aware context management) ─────────────────

/// Budget messages to fit within context window while preserving critical content.
/// Strategy: Keep all system messages, then most recent user/assistant pairs.
fn budget_messages(messages: &[UnifiedMessage], budget_tokens: usize, model_id: &str) -> Vec<UnifiedMessage> {
    let mut total_tokens = 0usize;
    let mut budgeted = Vec::new();
    
    // Phase 1: Always include system messages (they're critical)
    for msg in messages {
        if msg.role == "system" {
            let content_str = get_content_string(&msg.content);
            total_tokens += count_tokens(&content_str, model_id);
            budgeted.push(msg.clone());
        }
    }

    // Phase 2: Add recent messages from the end (most important for context)
    let mut temp = Vec::new();
    for msg in messages.iter().rev() {
        if msg.role == "system" { continue; }
        
        let content_str = get_content_string(&msg.content);
        let msg_tokens = count_tokens(&content_str, model_id);
        
        if total_tokens + msg_tokens > budget_tokens {
            // Try to keep at least the most recent user message
            if msg.role == "user" && temp.iter().all(|m: &UnifiedMessage| m.role != "user") {
                // Force include even if it exceeds budget slightly
                temp.push(msg.clone());
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

/// Flatten text-only arrays to simple strings for llama-server compatibility.
fn flatten_arrays(mut budgeted: Vec<UnifiedMessage>) -> Vec<UnifiedMessage> {
    for m in budgeted.iter_mut() {
        if let Some(arr) = m.content.as_array() {
            // Only flatten if all items are text
            let all_text = arr.iter().all(|item| {
                item.get("type").and_then(|t| t.as_str()) == Some("text")
            });
            if all_text {
                let text_only = arr.iter()
                    .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("\n");
                m.content = json!(text_only);
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
    let system_text = req.system_instruction.clone().unwrap_or_default();

    // Context window: use request value, device tier default, or safe fallback (32768, floor 8192)
    let context_window: usize = req.context_window
        .filter(|&v| v > 0)
        .map(|v| v as usize)
        .unwrap_or(32768)
        .max(8192);

    if context_window < 512 {
        return Err(RequestBuildError::ContextTooSmall { 
            requested: context_window as u32, 
            minimum: 512 
        });
    }

    // Reserve space for response dynamically based on available context
    let is_reasoning_model = req.model_id.to_lowercase().contains("reasoning") 
        || req.model_id.to_lowercase().contains("think")
        || req.model_id.to_lowercase().contains("-r1")
        || req.model_id.to_lowercase().contains("qw");
    
    let requested_max = max_tokens.unwrap_or(4096) as usize;
    let response_reserve = if is_reasoning_model {
        (context_window / 3).clamp(2048, requested_max.max(4096))
    } else {
        (context_window / 4).clamp(1024, requested_max)
    };

    // Budget calculation with safety margin
    let safety_margin = if is_reasoning_model { 1024 } else { 512 };
    let budget = context_window
        .saturating_sub(response_reserve)
        .saturating_sub(safety_margin)
        .max(4096);

    // Validate system prompt size - allow system prompts up to usable context window minus safety margin
    if !system_text.is_empty() {
        let system_tokens = count_tokens(&system_text, &req.model_id);
        let max_system_allowed = context_window.saturating_sub(safety_margin + 512);
        if system_tokens > max_system_allowed {
            return Err(RequestBuildError::SystemTooLong { tokens: system_tokens });
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

    let mut body = json!({
        "model": req.model_id,
        "messages": sanitized,
        "temperature": req.temperature.unwrap_or(0.7),
        "stream": true,
        "cache_prompt": true,
    });

    if let Some(ref stop_seqs) = req.stop {
        body["stop"] = json!(stop_seqs);
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
    let rep_penalty = req.repeat_penalty.unwrap_or(1.0);
    if rep_penalty != 1.0 {
        body["repeat_penalty"] = json!(rep_penalty);
    }
    if let Some(presence_penalty) = req.presence_penalty { body["presence_penalty"] = json!(presence_penalty); }
    if let Some(frequency_penalty) = req.frequency_penalty { body["frequency_penalty"] = json!(frequency_penalty); }
    
    // JSON mode / structured output support
    if let Some(response_format) = &req.response_format {
        body["response_format"] = response_format.clone();
    }
    
    // Tool support
    if let Some(tools) = &req.tools {
        if tools.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
            body["tools"] = tools.clone();
            if body.get("tool_choice").is_none() {
                body["tool_choice"] = json!("auto");
            }
        }
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

fn parse_local_sse_event(data: &str, active_tool_call_id: &mut Option<String>) -> Vec<LocalStreamEvent> {
    let parsed: Value = match serde_json::from_str(data) {
        Ok(v) => v,
        Err(e) => {
            warn!("[SSE] JSON parse error: {} | data: {}", e, &data[..data.len().min(200)]);
            return vec![];
        }
    };

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
                // Regular content
                if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                    if !content.is_empty() {
                        events.push(LocalStreamEvent::Text(content.to_string()));
                    }
                }
                
                // 2026: Reasoning content (DeepSeek-R1, QwQ, Mythos, etc.)
                if let Some(reasoning) = delta.get("reasoning_content").and_then(|r| r.as_str()) {
                    if !reasoning.is_empty() {
                        events.push(LocalStreamEvent::Reasoning(reasoning.to_string()));
                    }
                }
                if let Some(reasoning) = delta.get("thinking").and_then(|r| r.as_str()) {
                    if !reasoning.is_empty() {
                        events.push(LocalStreamEvent::Reasoning(reasoning.to_string()));
                    }
                }
                if let Some(reasoning) = delta.get("reasoning").and_then(|r| r.as_str()) {
                    if !reasoning.is_empty() {
                        events.push(LocalStreamEvent::Reasoning(reasoning.to_string()));
                    }
                }
                if let Some(thought) = delta.get("thought").and_then(|t| t.as_str()) {
                    if !thought.is_empty() {
                        events.push(LocalStreamEvent::Reasoning(thought.to_string()));
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

        return Err("No local model loaded. Please load a model before sending messages.".to_string());
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
        .timeout(std::time::Duration::from_secs(600))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        error!("[Inference] HTTP error {}: {}", status, &body_text[..body_text.len().min(500)]);
        return Err(format!("Local request failed ({}): {}", status, body_text));
    }

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

                    for ev in parse_local_sse_event(&data, &mut active_tool_call_id) {
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
                if serde_json::from_str::<Value>(trimmed).is_ok() {
                    let data = trimmed.to_string();
                    buffer.clear();
                    for ev in parse_local_sse_event(&data, &mut active_tool_call_id) {
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
                for ev in parse_local_sse_event(&data, &mut active_tool_call_id) {
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
            yield StreamChunkPayload::done();
        }
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
            capabilities: None,
            tool_choice: None,
        };

        
        let result = build_local_request(&req);
        assert!(result.is_err());
        match result {
            Err(RequestBuildError::ContextTooSmall { .. }) => {},
            _ => panic!("Expected ContextTooSmall error"),
        }
    }
}
