// ─────────────────────────────────────────────────────────────────────────────
// NYX — Cloud Model Orchestrator
// ─────────────────────────────────────────────────────────────────────────────
//
// Single source of truth for all cloud LLM streaming across every provider
// NYX supports.  It owns:
//
//  • UnifiedRequest / UnifiedMessage  — shared input types
//  • StreamChunkPayload               — shared output type
//  • execute_cloud_stream()           — the single streaming engine
//  • extract_stream_event()           — SSE line parser per provider
//  • llm_stream_request               — Tauri command (IPC + cancellation)
//  • get_models_quota                 — API key validation (real, not mocked)
//
// Supported providers
//   - "nyx-native"   → local llama-server on 127.0.0.1:8080 (OpenAI-compat)
//   - "openrouter"   → https://openrouter.ai/api/v1/chat/completions
//   - "gemini"       → Google AI Studio SSE (Gemini models)
//   - "gemma"        → Google AI Studio (Gemma models, system prompt via prepend)
//
// Design goals
//   1. Consistent character-based context budget for ALL providers.
//   2. Real API key validation (format check) instead of always valid=true.
//   3. No tokenizer dependency for context budgeting — simple, correct, fast.
//   4. Full tool-call streaming preserved for all providers.
//   5. Reasoning/thinking token separation (OpenRouter R1, Gemini thinking).
//   6. Cancellation via frontend event ("cancel_<event_name>").



use reqwest::{Client, header::{HeaderMap, HeaderValue}};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Listener};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio_util::io::StreamReader;
use futures_util::TryStreamExt;
use std::sync::LazyLock;

// ─────────────────────────────────────────────────────────────────────────────
// § 1 — SHARED TYPES
// ─────────────────────────────────────────────────────────────────────────────

/// Fix #10: Shared HTTP client reused for every streaming request.
/// Avoids DNS resolution + TLS handshake + TCP connection on every LLM call.
static CLOUD_HTTP_CLIENT: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .http2_keep_alive_interval(std::time::Duration::from_secs(15))
        .http2_keep_alive_timeout(std::time::Duration::from_secs(5))
        .tcp_nodelay(true)
        .tcp_keepalive(std::time::Duration::from_secs(120))
        .pool_max_idle_per_host(64)
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .expect("Failed to build cloud HTTP client")
});

/// Maximum output tokens when the caller does not specify a limit.
const MAX_TOKENS_DEFAULT: u32 = 8_192;

/// Context budget in characters (~4 chars per token, ~128k token window).
/// Using character counts rather than a tokenizer avoids a per-model BPE
/// dependency and is accurate enough for context-window management.
const CONTEXT_BUDGET_CHARS: usize = 128_000 * 4; // ≈ 512 k chars

/// Gemini's context window is 1M tokens; use a comfortable 256k-token budget.
const GEMINI_CONTEXT_BUDGET_CHARS: usize = 256_000 * 4;

use crate::llm::types::sanitize_messages_for_api;
pub use crate::llm::types::{UnifiedMessage, UnifiedRequest, StreamChunkPayload};

// ─────────────────────────────────────────────────────────────────────────────
// § 2 — CONTENT HELPERS
// ─────────────────────────────────────────────────────────────────────────────

fn get_content_string(val: &serde_json::Value) -> String {
    match val {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(arr) => {
            arr.iter()
               .filter_map(|item| item.get("text").and_then(|v| v.as_str()))
               .collect::<Vec<_>>()
               .join("")
        }
        other => other.to_string(),
    }
}

/// Slice a message list to stay within the context budget (character-based).
/// Always keeps at least the most-recent message even if it exceeds the budget.
fn budget_messages(messages: &[UnifiedMessage], budget_chars: usize) -> Vec<UnifiedMessage> {
    if messages.is_empty() {
        return Vec::new();
    }
    let mut total = 0usize;
    let mut start_idx = messages.len();

    for (i, m) in messages.iter().enumerate().rev() {
        let chars = get_content_string(&m.content).len();
        if total + chars > budget_chars && start_idx < messages.len() {
            break;
        }
        total += chars;
        start_idx = i;
    }
    messages[start_idx..].to_vec()
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3 — REQUEST BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

fn build_openai_compat_request(
    req: &UnifiedRequest,
) -> Result<(String, Value, HeaderMap), String> {
    let max_tokens = req.max_tokens.unwrap_or(MAX_TOKENS_DEFAULT);
    let budget = CONTEXT_BUDGET_CHARS;
    let budgeted = budget_messages(&req.messages, budget);

    // Flatten text-only arrays to plain strings (avoids unnecessary multimodal paths).
    let mut flattened: Vec<UnifiedMessage> = budgeted.into_iter().collect();
    for m in flattened.iter_mut() {
        if let Some(arr) = m.content.as_array() {
            if arr.iter().all(|item| item.get("type").and_then(|t| t.as_str()) == Some("text")) {
                let text_only = get_content_string(&m.content);
                m.content = json!(text_only);
            }
        }
    }

    let mut system_text = req.system_instruction.clone().unwrap_or_default();

    if !system_text.contains("VISUAL GENERATION DIRECTIVE") {
        system_text.push_str("\n\n[VISUAL GENERATION DIRECTIVE]\nYou MUST format your response using vibrant, contextually relevant emojis in section titles, sub-headers, bullet points, callout boxes, statistics, and tables (e.g. 🚀, 💡, 📊, 🎯, ✨, ⚡, 📌, 🔑, 🛠️, 🔍, 📈). Use bold text, Markdown tables, callout blocks (> 💡 **KEY TAKEAWAY**), and embed markdown images ![Description](URL) if image URLs are available. NEVER output plain dry unformatted text paragraphs.");
    }

    if req.reasoning_enabled == Some(true) && !system_text.contains("<think>") {
        system_text.push_str("\n\n[REASONING DIRECTIVE]\nYou MUST perform deep, step-by-step reasoning inside <think>...</think> tags before providing your final answer.");
    }

    // Build messages array with shared tool-call sanitizer.
    let mut msgs: Vec<Value> = Vec::new();
    if !system_text.is_empty() {
        msgs.push(json!({"role": "system", "content": system_text}));
    }
    msgs.extend(sanitize_messages_for_api(&flattened));

    // No sanitization for strict Jinja templates required for cloud APIs.

    // Force reasoning models to skip thinking by pre-filling the assistant response
    if req.reasoning_enabled == Some(false) {
        let is_reasoning_model = req.model_id.to_lowercase().contains("r1") 
            || req.model_id.to_lowercase().contains("reasoning")
            || req.model_id.to_lowercase().contains("think")
            || req.model_id.to_lowercase().contains("qwq")
            || req.model_id.to_lowercase().contains("o1")
            || req.model_id.to_lowercase().contains("o3");
            
        if is_reasoning_model {
            msgs.push(json!({"role": "assistant", "content": "</think>\n"}));
        }
    }

    let mut target_model_id = req.model_id.clone();
    if target_model_id == "deepseek/deepseek-reasoner" || target_model_id == "deepseek-reasoner" {
        target_model_id = "deepseek/deepseek-r1".to_string();
    }

    let mut body = json!({
        "model": target_model_id,
        "messages": msgs,
        "temperature": req.temperature.unwrap_or(0.7),
        "max_tokens": max_tokens,
        "stream": true,
    });

    if req.reasoning_enabled == Some(true) {
        body["include_reasoning"] = json!(true);
        body["reasoning"] = json!({ "effort": "high" });
    }

    if let Some(top_p) = req.top_p {
        body["top_p"] = json!(top_p);
    }
    if let Some(top_k) = req.top_k {
        body["top_k"] = json!(top_k);
    }
    if let Some(repeat_penalty) = req.repeat_penalty {
        body["repeat_penalty"] = json!(repeat_penalty);
    }
    if let Some(presence_penalty) = req.presence_penalty {
        body["presence_penalty"] = json!(presence_penalty);
    }
    if let Some(frequency_penalty) = req.frequency_penalty {
        body["frequency_penalty"] = json!(frequency_penalty);
    }

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", HeaderValue::from_static("application/json"));

    let endpoint = match req.provider.as_str() {
        "openrouter" => {
            if !req.api_key.trim().is_empty() && req.api_key.trim() != "free" {
                headers.insert(
                    "Authorization",
                    HeaderValue::from_str(&format!("Bearer {}", req.api_key.trim()))
                        .map_err(|e| e.to_string())?,
                );
            }
            headers.insert("HTTP-Referer", HeaderValue::from_static("https://nyx.ai"));
            headers.insert("X-Title", HeaderValue::from_static("NYX Desktop"));

            // Tools for OpenRouter.
            if let Some(tools) = &req.tools {
                if tools.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
                    body["tools"] = tools.clone();
                }
            }

            req.endpoint_override.clone()
                .unwrap_or_else(|| "https://openrouter.ai/api/v1/chat/completions".to_string())
        }

        _other => {
            // Generic OpenAI-compatible endpoint with bearer auth.
            headers.insert("Authorization",
                HeaderValue::from_str(&format!("Bearer {}", req.api_key))
                    .map_err(|e| e.to_string())?);
            req.endpoint_override.clone()
                .unwrap_or_else(|| {
                    let p = crate::llm::local_orchestrator::SERVER_PORT.load(std::sync::atomic::Ordering::Relaxed);
                    let port = if p > 0 { p } else { 8080 };
                    format!("http://127.0.0.1:{}/v1/chat/completions", port)
                })
        }
    };

    Ok((endpoint, body, headers))
}

/// Ensure the messages array satisfies Gemini's strict alternation rules:
///   1. First turn must have role "user" (not "assistant" / "tool").
///   2. Consecutive turns must alternate between "user" and "assistant"/"model".
///
/// Strategy:
///   - Drop any leading non-user turns (they're orphaned history after budgeting).
///   - Merge consecutive same-role turns by concatenating their text content.
fn sanitize_gemini_turns(messages: Vec<UnifiedMessage>) -> Vec<UnifiedMessage> {
    use serde_json::json;

    // Step 1: drop leading assistant/tool messages.
    let messages: Vec<_> = messages
        .into_iter()
        .skip_while(|m| m.role != "user")
        .collect();

    if messages.is_empty() {
        return messages;
    }

    // Step 2: merge consecutive same-role turns (text only — never merge tool/function array turns).
    let mut out: Vec<UnifiedMessage> = Vec::new();
    for m in messages {
        // Never merge tool-result or tool-call turns (they have array content with special structure).
        let is_tool_turn = m.content.is_array();

        if let Some(last) = out.last_mut() {
            if last.role == m.role && !is_tool_turn && !last.content.is_array() {
                // Both turns are plain-text — safe to merge.
                let existing = get_content_string(&last.content);
                let incoming = get_content_string(&m.content);
                last.content = json!(format!("{}\n\n{}", existing, incoming));
                continue;
            }
        }
        out.push(m);
    }
    out
}

fn clean_gemini_schema(val: &mut Value) {
    match val {
        Value::Object(map) => {
            // Remove fields unsupported by Google Gemini API in function declarations
            map.remove("additionalProperties");
            map.remove("$schema");
            map.remove("title");

            // Convert OpenAI JSON schema 'type' to Google Gemini uppercase string
            if let Some(t_val) = map.get_mut("type") {
                if let Some(arr) = t_val.as_array() {
                    let first_type = arr.iter()
                        .find_map(|item| item.as_str().filter(|s| *s != "null"))
                        .unwrap_or("string");
                    *t_val = Value::String(first_type.to_uppercase());
                } else if let Some(s) = t_val.as_str() {
                    *t_val = Value::String(s.to_uppercase());
                }
            }

            for v in map.values_mut() {
                clean_gemini_schema(v);
            }
        }
        Value::Array(arr) => {
            for item in arr.iter_mut() {
                clean_gemini_schema(item);
            }
        }
        _ => {}
    }
}

fn build_gemini_request(
    req: &UnifiedRequest,
) -> Result<(String, Value, HeaderMap), String> {
    let max_tokens = req.max_tokens.unwrap_or(MAX_TOKENS_DEFAULT);
    let budgeted = budget_messages(&req.messages, GEMINI_CONTEXT_BUDGET_CHARS);

    // ── Gemini turn-alternation sanitization ──────────────────────────────────
    // Gemini requires: first turn = user, strict user↔model alternation.
    // `budget_messages` may slice mid-conversation producing assistant-first or
    // consecutive same-role sequences.  Drop leading non-user messages and merge
    // consecutive same-role turns to avoid the
    // "model output must contain either output text or tool calls" 400 error.
    let budgeted = sanitize_gemini_turns(budgeted);

    let is_gemma = req.model_id.to_lowercase().contains("gemma");

    let mut contents: Vec<Value> = Vec::new();

    for m in &budgeted {
        // Tool call turns (model side) — handles both "tool_call" (internal) and "function" (OpenAI native).
        if m.role == "assistant" && m.content.is_array() {
            if let Some(item) = m.content.as_array().and_then(|a| a.first()) {
                let item_type = item.get("type").and_then(|t| t.as_str());
                if item_type == Some("tool_call") || item_type == Some("function") {
                    // Extract function details — for "function" type the structure is {id, type, function: {name, arguments}}
                    // For "tool_call" type the structure is {id, type, function: {name, arguments}} (same)
                    let func = item.get("function");
                    if let Some(func) = func {
                        let name = func.get("name").and_then(|n| n.as_str()).unwrap_or("");
                        let args_str = func.get("arguments").and_then(|a| a.as_str()).unwrap_or("{}");
                        let args_json: Value = serde_json::from_str(args_str).unwrap_or(json!({}));
                        contents.push(json!({
                            "role": "model",
                            "parts": [{"functionCall": {"name": name, "args": args_json}}]
                        }));
                        continue;
                    }
                }
            }
        }

        // Tool result turns (functionResponse).
        if m.role == "tool" {
            let (raw_name, content_str) = if m.content.is_array() {
                let item = m.content.as_array().and_then(|a| a.first());
                let n = item.and_then(|i| i.get("name")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                let c = item.and_then(|i| i.get("content")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                (n, c)
            } else if m.content.is_object() {
                let n = m.content.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let c = m.content.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();
                (n, c)
            } else {
                ("".to_string(), get_content_string(&m.content))
            };

            // If name is missing/empty, search backward in preceding `contents` for the last model functionCall
            let name = if !raw_name.trim().is_empty() {
                raw_name
            } else {
                contents.iter().rev()
                    .filter_map(|turn| turn.get("parts").and_then(|p| p.as_array()))
                    .flatten()
                    .filter_map(|part| part.get("functionCall").and_then(|fc| fc.get("name")).and_then(|n| n.as_str()))
                    .next()
                    .unwrap_or("tool_call")
                    .to_string()
            };

            let mut resp_obj: Value = serde_json::from_str(&content_str)
                .unwrap_or(json!({"result": content_str}));
            if !resp_obj.is_object() {
                resp_obj = json!({"result": resp_obj});
            }
            contents.push(json!({
                "role": "user",
                "parts": [{"functionResponse": {"name": name, "response": resp_obj}}]
            }));
            continue;
        }

        let role = if m.role == "assistant" { "model" } else { "user" };
        let mut parts: Vec<Value> = Vec::new();

        if let Some(arr) = m.content.as_array() {
            for item in arr {
                if let Some(t) = item.get("type").and_then(|t| t.as_str()) {
                    match t {
                        "text" => {
                            if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                                parts.push(json!({"text": text}));
                            }
                        }
                        "image_url" => {
                            if let Some(url) = item.get("image_url")
                                .and_then(|o| o.get("url"))
                                .and_then(|v| v.as_str())
                            {
                                if url.starts_with("data:") {
                                    let split: Vec<&str> = url.splitn(2, ',').collect();
                                    if split.len() == 2 {
                                        let meta = split[0];
                                        let data = split[1];
                                        let mime = meta.strip_prefix("data:").unwrap_or("")
                                            .strip_suffix(";base64").unwrap_or(meta);
                                        parts.push(json!({
                                            "inlineData": {"mimeType": mime, "data": data}
                                        }));
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                } else if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                    parts.push(json!({"text": text}));
                }
            }
        }

        if parts.is_empty() {
            parts.push(json!({"text": get_content_string(&m.content)}));
        }

        contents.push(json!({"role": role, "parts": parts}));
    }

    let mut generation_config = json!({
        "temperature": req.temperature.unwrap_or(0.7),
        "maxOutputTokens": max_tokens
    });

    let supports_thinking = !is_gemma
        && (req.model_id.contains("thinking") || req.model_id.contains("2.5") || req.model_id.contains("reasoning"));

    if req.reasoning_enabled == Some(true) && supports_thinking {
        if let Some(obj) = generation_config.as_object_mut() {
            obj.insert("thinkingConfig".to_string(), json!({ "thinkingBudget": 16000 }));
        }
    }


    let mut body = json!({
        "contents": contents,
        "generationConfig": generation_config
    });

    // System instruction.
    let system_text = req.system_instruction.clone().unwrap_or_default();

    if !system_text.is_empty() {
        if is_gemma {
            // Gemma doesn't support systemInstruction; prepend to first user turn.
            if let Some(contents_arr) = body.get_mut("contents").and_then(|v| v.as_array_mut()) {
                if let Some(first) = contents_arr.first_mut() {
                    if let Some(parts) = first.get_mut("parts").and_then(|p| p.as_array_mut()) {
                        if let Some(fp) = parts.first_mut() {
                            if let Some(text) = fp.get("text").and_then(|t| t.as_str()) {
                                *fp = json!({"text": format!("System Instruction:\n{}\n\n{}", system_text, text)});
                            }
                        }
                    }
                }
            }
        } else {
            body["systemInstruction"] = json!({"parts": [{"text": system_text}]});
        }
    }

    // Tools.
    if let Some(tools) = &req.tools {
        if let Some(tool_arr) = tools.as_array() {
            let decls: Vec<Value> = tool_arr.iter()
                .filter_map(|t| {
                    let mut func = t.get("function")?.clone();
                    clean_gemini_schema(&mut func);
                    Some(func)
                })
                .collect();
            if !decls.is_empty() {
                body["tools"] = json!([{"functionDeclarations": decls}]);
                // toolConfig tells Gemini it may call any declared function.
                // Without this, Gemini often ignores tool definitions entirely.
                body["toolConfig"] = json!({"functionCallingConfig": {"mode": "AUTO"}});
            }
        }
    }

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", HeaderValue::from_static("application/json"));
    headers.insert("x-goog-api-key",
        HeaderValue::from_str(&req.api_key).map_err(|e| e.to_string())?);

    let base = req.endpoint_override.clone()
        .unwrap_or_else(|| "https://generativelanguage.googleapis.com/v1beta/models/".to_string());
    let endpoint = format!("{}{}:streamGenerateContent?alt=sse", base, req.model_id);

    Ok((endpoint, body, headers))
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4 — SSE EVENT PARSER
// ─────────────────────────────────────────────────────────────────────────────

enum StreamEvent {
    Text(String),
    Reasoning(String),
    ToolStart { id: String, name: String },
    ToolArgs(String),
    ToolComplete,
    FinishError(String),
    Nothing,
}

fn parse_sse_event(data: &str, provider: &str) -> Vec<StreamEvent> {
    let v: Value = match serde_json::from_str(data) {
        Ok(v) => v,
        Err(_) => return vec![StreamEvent::Nothing],
    };

    // Provider-level error field.
    if let Some(err) = v.get("error") {
        let msg = err.get("message").and_then(|m| m.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| serde_json::to_string(err).unwrap_or_else(|_| "API Error".into()));
        return vec![StreamEvent::FinishError(msg)];
    }

    let mut events = Vec::new();

    match provider {
        "gemini" => {
            if let Some(candidates) = v.get("candidates").and_then(|c| c.as_array()) {
                if let Some(candidate) = candidates.first() {
                    if let Some(parts) = candidate
                        .get("content").and_then(|c| c.get("parts")).and_then(|p| p.as_array())
                    {
                        for part in parts {
                            let is_thought = part.get("thought")
                                .and_then(|t| t.as_bool()).unwrap_or(false);

                            if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                if !text.is_empty() {
                                    if is_thought { events.push(StreamEvent::Reasoning(text.to_string())); }
                                    else          { events.push(StreamEvent::Text(text.to_string())); }
                                }
                            } else if let Some(fc) = part.get("functionCall") {
                                if let Some(name) = fc.get("name").and_then(|n| n.as_str()) {
                                    let id = format!("call_{}", std::time::SystemTime::now()
                                        .duration_since(std::time::UNIX_EPOCH)
                                        .unwrap_or_default().as_millis());
                                    events.push(StreamEvent::ToolStart { id, name: name.to_string() });
                                    if let Some(args) = fc.get("args") {
                                        events.push(StreamEvent::ToolArgs(
                                            serde_json::to_string(args).unwrap_or_else(|_| "{}".into())));
                                        events.push(StreamEvent::ToolComplete);
                                    }
                                }
                            }
                        }
                    }
                    if let Some(reason) = candidate.get("finishReason").and_then(|f| f.as_str()) {
                        match reason {
                            "SAFETY" | "BLOCKLIST" | "PROHIBITED_CONTENT" =>
                                events.push(StreamEvent::FinishError(
                                    format!("Generation blocked by safety filters ({})", reason))),
                            "MAX_TOKENS" =>
                                events.push(StreamEvent::FinishError(
                                    "Generation stopped: maximum token limit reached.".into())),
                            "RECITATION" =>
                                events.push(StreamEvent::FinishError(
                                    "Generation blocked: recitation of copyrighted material.".into())),
                            "OTHER" =>
                                events.push(StreamEvent::FinishError(
                                    "Generation stopped: provider error (OTHER).".into())),
                            _ => {}
                        }
                    }
                }
            }
        }

        _ => {}
    }

    if events.is_empty() { events.push(StreamEvent::Nothing); }
    events
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5 — STREAMING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/// Execute a streaming LLM request.  Returns an mpsc receiver that yields
/// `StreamChunkPayload` values (or errors) as the stream arrives.
pub async fn execute_cloud_stream(
    req: &UnifiedRequest,
) -> Result<tokio::sync::mpsc::Receiver<Result<StreamChunkPayload, String>>, String> {
    // Build provider-specific URL, body, and headers.
    let (url, body, headers, provider_type) = match req.provider.as_str() {
        "openrouter" | "ollama" | "lmstudio" | "vllm" | "custom" | "openai" => {
            let (url, body, headers) = build_openai_compat_request(req)?;
            (url, body, headers, req.provider.clone())
        }
        "nyx-native" => {
            return Err("Local models must use the local orchestrator, not cloud orchestrator.".into());
        }
        "gemini" | "gemma" => {
            let (url, body, headers) = build_gemini_request(req)?;
            (url, body, headers, "gemini".to_string())
        }
        _other => {
            // Default fallback for unrecognized OpenAI-compatible providers
            let (url, body, headers) = build_openai_compat_request(req)?;
            (url, body, headers, req.provider.clone())
        }
    };

    let mut response = CLOUD_HTTP_CLIENT.post(&url)
        .headers(headers.clone())
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() && provider_type == "gemini" && response.status().as_u16() == 404 {
        let fallbacks = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
        let base = req.endpoint_override.clone()
            .unwrap_or_else(|| "https://generativelanguage.googleapis.com/v1beta/models/".to_string());
        for fallback_model in fallbacks {
            if fallback_model == req.model_id {
                continue;
            }
            let fallback_url = format!("{}{}:streamGenerateContent?alt=sse", base, fallback_model);
            if let Ok(resp) = CLOUD_HTTP_CLIENT.post(&fallback_url)
                .headers(headers.clone())
                .json(&body)
                .send()
                .await
            {
                if resp.status().is_success() {
                    response = resp;
                    break;
                }
            }
        }
    }

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();

        if (status.as_u16() == 400 || body_text.contains("Thinking budget is not supported"))
            && body.get("generationConfig").and_then(|g| g.get("thinkingConfig")).is_some()
        {
            let mut retry_body = body.clone();
            if let Some(gen) = retry_body.get_mut("generationConfig").and_then(|g| g.as_object_mut()) {
                gen.remove("thinkingConfig");
            }
            if let Ok(retry_resp) = CLOUD_HTTP_CLIENT.post(&url)
                .headers(headers.clone())
                .json(&retry_body)
                .send()
                .await
            {
                if retry_resp.status().is_success() {
                    response = retry_resp;
                } else {
                    let r_status = retry_resp.status();
                    let r_text = retry_resp.text().await.unwrap_or_default();
                    return Err(format!("Request failed ({}): {}", r_status, r_text));
                }
            } else {
                return Err(format!("Request failed ({}): {}", status, body_text));
            }
        } else {
            return Err(format!("Request failed ({}): {}", status, body_text));
        }
    }


    let (tx, rx) = tokio::sync::mpsc::channel(256);

    tauri::async_runtime::spawn(async move {
        let byte_stream = response.bytes_stream().map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, e)
        });
        let stream_reader = StreamReader::new(byte_stream);
        let mut lines = BufReader::with_capacity(64 * 1024, stream_reader).lines();
        let mut buffer = String::new();

        'outer: loop {
            tokio::select! {
                _ = tx.closed() => {
                    break 'outer;
                }
                res = lines.next_line() => {
                    match res {
                Ok(Some(line)) => {
                    if line.is_empty() {
                        // Blank line = SSE event boundary: process buffered data.
                        if !buffer.is_empty() {
                            let data = buffer.trim().to_string();
                            buffer.clear();

                            if data == "[DONE]" {
                                let _ = tx.send(Ok(StreamChunkPayload::done())).await;
                                break;
                            }

                            for ev in parse_sse_event(&data, &provider_type) {
                                if !emit_event(&tx, ev).await { break 'outer; }
                            }
                        }
                        continue;
                    }

                    // Parse SSE line prefixes.
                    if let Some(payload) = line.strip_prefix("data: ") {
                        if payload == "[DONE]" {
                            let _ = tx.send(Ok(StreamChunkPayload::done())).await;
                            break;
                        }
                        if !buffer.is_empty() { buffer.push('\n'); }
                        buffer.push_str(payload);
                    } else if let Some(stripped) = line.strip_prefix("data:") {
                        if !buffer.is_empty() { buffer.push('\n'); }
                        buffer.push_str(stripped.trim());
                    }
                    // Ignore event:, id:, retry: lines.

                    let trimmed = buffer.trim();
                    if trimmed.starts_with('{') && trimmed.ends_with('}') {
                        if serde_json::from_str::<serde_json::Value>(trimmed).is_ok() {
                            let data = trimmed.to_string();
                            buffer.clear();
                            for ev in parse_sse_event(&data, &provider_type) {
                                if !emit_event(&tx, ev).await { break 'outer; }
                            }
                        }
                    }
                }

                Ok(None) => {
                    // Stream ended cleanly.  Flush any remaining buffer so we
                    // don't silently drop the last chunk (some providers close
                    // the connection without a trailing blank line).
                    if !buffer.is_empty() {
                        let data = buffer.trim().to_string();
                        buffer.clear();
                        if data != "[DONE]" {
                            for ev in parse_sse_event(&data, &provider_type) {
                                let _ = emit_event(&tx, ev).await;
                            }
                        }
                    }
                    let _ = tx.send(Ok(StreamChunkPayload::done())).await;
                    break;
                }

                Err(e) => {
                    let _ = tx.send(Err(e.to_string())).await;
                    break 'outer;
                }
            } // match res
            } // res = lines.next_line() =>
        } // tokio::select!
        } // 'outer: loop
    });

    Ok(rx)
}

/// Send a single StreamEvent over the channel.  Returns false if the channel
/// is closed (receiver dropped = frontend cancelled the request).
async fn emit_event(
    tx: &tokio::sync::mpsc::Sender<Result<StreamChunkPayload, String>>,
    ev: StreamEvent,
) -> bool {
    let payload = match ev {
        StreamEvent::Text(t) => StreamChunkPayload::text(t),
        StreamEvent::Reasoning(r) => StreamChunkPayload::thinking(r),
        StreamEvent::ToolStart { id, name } => StreamChunkPayload::tool_start(id, name),
        StreamEvent::ToolArgs(a) => StreamChunkPayload::tool_args(a),
        StreamEvent::ToolComplete => StreamChunkPayload::tool_complete(),
        StreamEvent::FinishError(msg) => {
            let _ = tx.send(Ok(StreamChunkPayload::error(msg))).await;
            return false; // Stop processing after an error.
        }
        StreamEvent::Nothing => return true,
    };
    tx.send(Ok(payload)).await.is_ok()
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6 — TAURI COMMANDS
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn llm_stream_request(
    app: AppHandle,
    mut req: UnifiedRequest,
    on_event: tauri::ipc::Channel<StreamChunkPayload>,
) -> Result<(), String> {
    // Dynamically adjust the agent profile based on execution mode
    if let Some(mode) = &req.execution_mode {
        let additional_prompt = if mode == "coder" {
            "\n\n[CODER MODE]: You are an autonomous coding agent. You have access to mutative tools and must write efficient, production-ready code. Focus purely on technical implementation."
        } else {
            "\n\n[CHAT MODE]: You are a helpful assistant. You are in read-only chat mode. Provide clear, conversational answers."
        };
        
        let new_sys = match &req.system_instruction {
            Some(existing) => format!("{}{}", existing, additional_prompt),
            None => additional_prompt.trim().to_string(),
        };
        req.system_instruction = Some(new_sys);
    }

    let event_name = req.event_name.clone();
    let provider = req.provider.clone();
    let model = req.model_id.clone();
    let prompt_len: usize = req.system_instruction.as_ref().map(|s| s.len()).unwrap_or(0)
        + req.messages.iter().map(|m| m.content.as_str().map(|s| s.len()).unwrap_or_else(|| m.content.to_string().len())).sum::<usize>();
    let prompt_tokens = (prompt_len / 4) as i64; // rough estimate

    let start_time = std::time::Instant::now();
    let mut completion_chars = 0;
    let mut final_error: Option<String> = None;

    let mut rx = if req.provider == "nyx-native" {
        return Err("llm_stream_request cannot be used for local models. Use llm_local_stream_request instead.".into());
    } else {
        execute_cloud_stream(&req).await?
    };

    // Listen for a cancel event from the frontend.
    let cancel_name = format!("cancel_{}", event_name.clone().unwrap_or_default());
    let (cancel_tx, mut cancel_rx) = tokio::sync::mpsc::channel::<()>(1);
    let cancel_id = app.listen(cancel_name, move |_| {
        let _ = cancel_tx.try_send(());
    });

    loop {
        tokio::select! {
            msg = rx.recv() => {
                match msg {
                    Some(Ok(payload)) => {
                        if let Some(text) = &payload.content {
                            completion_chars += text.len();
                        }
                        if payload.event_type == "error" {
                            final_error = payload.error.clone();
                        }
                        if on_event.send(payload.clone()).is_err() {
                            if let Some(ref ev) = event_name {
                                let _ = app.emit(ev, payload);
                            }
                        }
                    }
                    Some(Err(e)) => {
                        final_error = Some(e.clone());
                        let err = StreamChunkPayload::error(e);
                        if on_event.send(err.clone()).is_err() {
                            if let Some(ref ev) = event_name {
                                let _ = app.emit(ev, err);
                            }
                        }
                    }
                    None => break, // rx closed = stream finished
                }
            }
            _ = cancel_rx.recv() => {
                // Dropping rx propagates cancellation upstream — the
                // `tx.send()` in `execute_cloud_stream` will fail and the
                // spawned task will exit cleanly.
                break;
            }
        }
    }

    app.unlisten(cancel_id);

    // Record observability trace
    use tauri::Manager;
    let pool = app.state::<sqlx::SqlitePool>();
    crate::db::traces::record_trace(pool.inner().clone(), crate::db::traces::TraceInput {
        session_id: None,
        provider,
        model,
        prompt_tokens,
        completion_tokens: (completion_chars / 4) as i64,
        latency_ms: start_time.elapsed().as_millis() as i64,
        cached: false,
        error: final_error,
        agent_node_id: None,
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// § 7 — API KEY VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct QuotaResponse {
    pub status: String,
    pub valid: bool,
    pub provider: String,
    pub message: String,
}

/// Validate an API key by checking its format and making a lightweight
/// probe request to the provider.  Previously this always returned valid=true.
#[tauri::command]
pub async fn get_models_quota(
    provider: String,
    api_key: Option<String>,
) -> Result<QuotaResponse, String> {
    let key = api_key.unwrap_or_default();

    // Fast format checks before making any network call.
    let format_error = validate_key_format(&provider, &key);
    if let Some(err) = format_error {
        return Ok(QuotaResponse {
            status: "invalid".to_string(),
            valid: false,
            provider,
            message: err,
        });
    }

    // For nyx-native, check if the local server is reachable.
    if provider == "nyx-native" {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(2))
            .build()
            .map_err(|e| e.to_string())?;
        let p = crate::llm::local_orchestrator::SERVER_PORT.load(std::sync::atomic::Ordering::Relaxed);
        let port = if p > 0 { p } else { 8080 };
        let reachable = client.get(format!("http://127.0.0.1:{}/v1/models", port))
            .send().await
            .map(|r| r.status().is_success())
            .unwrap_or(false);
        return Ok(QuotaResponse {
            status: if reachable { "ok".into() } else { "offline".into() },
            valid: reachable,
            provider,
            message: if reachable {
                "Local server is running.".into()
            } else {
                "Local server is not running. Start a model first.".into()
            },
        });
    }

    // For OpenRouter: call /models (lightweight, no tokens consumed).
    if provider == "openrouter" {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|e| e.to_string())?;
        let resp = client.get("https://openrouter.ai/api/v1/models")
            .header("Authorization", format!("Bearer {}", key))
            .send().await;
        let valid = resp.map(|r| r.status().is_success()).unwrap_or(false);
        return Ok(QuotaResponse {
            status: if valid { "ok".into() } else { "invalid".into() },
            valid,
            provider,
            message: if valid {
                "OpenRouter API key is valid.".into()
            } else {
                "OpenRouter API key appears invalid. Check your key at openrouter.ai.".into()
            },
        });
    }

    // For Gemini: call the models list endpoint.
    if provider == "gemini" || provider == "gemma" {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|e| e.to_string())?;
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models?key={}",
            key
        );
        let resp = client.get(&url).send().await;
        let valid = resp.map(|r| r.status().is_success()).unwrap_or(false);
        return Ok(QuotaResponse {
            status: if valid { "ok".into() } else { "invalid".into() },
            valid,
            provider,
            message: if valid {
                "Google API key is valid.".into()
            } else {
                "Google API key appears invalid. Check aistudio.google.com.".into()
            },
        });
    }

    // For OpenAI: call /v1/models endpoint.
    if provider == "openai" {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|e| e.to_string())?;
        let resp = client.get("https://api.openai.com/v1/models")
            .header("Authorization", format!("Bearer {}", key))
            .send().await;
        let valid = resp.map(|r| r.status().is_success()).unwrap_or(false);
        return Ok(QuotaResponse {
            status: if valid { "ok".into() } else { "invalid".into() },
            valid,
            provider,
            message: if valid {
                "OpenAI API key is valid.".into()
            } else {
                "OpenAI API key appears invalid. Check platform.openai.com.".into()
            },
        });
    }

    // For Anthropic: call /v1/models endpoint.
    if provider == "anthropic" {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|e| e.to_string())?;
        let resp = client.get("https://api.anthropic.com/v1/models")
            .header("x-api-key", &key)
            .header("anthropic-version", "2023-06-01")
            .send().await;
        let valid = resp.map(|r| r.status().is_success() || r.status().as_u16() == 200).unwrap_or(false);
        return Ok(QuotaResponse {
            status: if valid { "ok".into() } else { "invalid".into() },
            valid,
            provider,
            message: if valid {
                "Anthropic API key is valid.".into()
            } else {
                "Anthropic API key appears invalid. Check console.anthropic.com.".into()
            },
        });
    }

    // For DeepSeek: call /v1/models endpoint.
    if provider == "deepseek" {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|e| e.to_string())?;
        let resp = client.get("https://api.deepseek.com/v1/models")
            .header("Authorization", format!("Bearer {}", key))
            .send().await;
        let valid = resp.map(|r| r.status().is_success()).unwrap_or(false);
        return Ok(QuotaResponse {
            status: if valid { "ok".into() } else { "invalid".into() },
            valid,
            provider,
            message: if valid {
                "DeepSeek API key is valid.".into()
            } else {
                "DeepSeek API key appears invalid. Check platform.deepseek.com.".into()
            },
        });
    }

    // For Groq: call /v1/models endpoint.
    if provider == "groq" {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|e| e.to_string())?;
        let resp = client.get("https://api.groq.com/openai/v1/models")
            .header("Authorization", format!("Bearer {}", key))
            .send().await;
        let valid = resp.map(|r| r.status().is_success()).unwrap_or(false);
        return Ok(QuotaResponse {
            status: if valid { "ok".into() } else { "invalid".into() },
            valid,
            provider,
            message: if valid {
                "Groq API key is valid.".into()
            } else {
                "Groq API key appears invalid. Check console.groq.com.".into()
            },
        });
    }

    // Default provider validation
    let has_key = !key.trim().is_empty();
    Ok(QuotaResponse {
        status: if has_key { "ok".to_string() } else { "invalid".to_string() },
        valid: has_key,
        provider,
        message: if has_key { "API key provided.".to_string() } else { "API key missing.".to_string() },
    })
}

#[derive(Serialize)]
pub struct ReachableResponse {
    pub reachable: bool,
    pub message: String,
}

/// Check whether a provider endpoint is reachable and (if key provided) authorized.
#[tauri::command]
pub async fn check_provider_reachable(
    provider: String,
    api_key: Option<String>,
) -> Result<ReachableResponse, String> {
    let quota = get_models_quota(provider, api_key).await?;
    Ok(ReachableResponse {
        reachable: quota.valid,
        message: quota.message,
    })
}

fn validate_key_format(provider: &str, key: &str) -> Option<String> {
    if key.is_empty() {
        return Some("API key is empty.".to_string());
    }
    match provider {
        "openrouter" => {
            if !key.starts_with("sk-or-") || key.len() < 20 {
                return Some("OpenRouter keys should start with 'sk-or-'.".to_string());
            }
        }
        "gemini" | "gemma" => {
            if !key.starts_with("AIza") || key.len() < 30 {
                return Some("Google API keys should start with 'AIza'.".to_string());
            }
        }
        "openai" => {
            if !key.starts_with("sk-") || key.len() < 20 {
                return Some("OpenAI keys should start with 'sk-'.".to_string());
            }
        }
        "anthropic" => {
            if !key.starts_with("sk-ant-") || key.len() < 20 {
                return Some("Anthropic keys should start with 'sk-ant-'.".to_string());
            }
        }
        _ => {}
    }
    None
}
