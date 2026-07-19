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
use serde::{Deserialize, Serialize};
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
        .connect_timeout(std::time::Duration::from_secs(30))
        .tcp_keepalive(std::time::Duration::from_secs(60))
        .pool_max_idle_per_host(4)
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

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct UnifiedMessage {
    pub role: String,
    pub content: serde_json::Value,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct UnifiedRequest {
    pub provider: String,
    #[serde(default)]
    pub endpoint_override: Option<String>,
    pub model_id: String,
    pub messages: Vec<UnifiedMessage>,
    #[serde(default)]
    pub system_instruction: Option<String>,
    pub api_key: String,
    #[serde(default)]
    pub temperature: Option<f32>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub top_p: Option<f32>,
    #[serde(default)]
    pub top_k: Option<u32>,
    #[serde(default)]
    pub repeat_penalty: Option<f32>,
    #[serde(default)]
    pub presence_penalty: Option<f32>,
    #[serde(default)]
    pub frequency_penalty: Option<f32>,
    #[serde(default)]
    pub reasoning_effort: Option<String>,
    #[serde(default)]
    pub event_name: Option<String>,
    #[serde(default)]
    pub tools: Option<Value>,
    #[serde(default)]
    pub execution_mode: Option<String>,
}

/// Full stream event payload sent to the frontend via Tauri IPC channel.
#[derive(Serialize, Clone)]
pub struct StreamChunkPayload {
    #[serde(rename = "type")]
    pub event_type: String, // "text" | "thinking" | "tool_start" | "tool_call" |
                            // "tool_call_complete" | "tool_result" | "done" | "error"
    pub content: Option<String>,
    pub done: Option<bool>,
    pub error: Option<String>,
    pub tool_call: Option<Value>,
    pub name: Option<String>,
    pub result: Option<Value>,
    pub metadata: Option<Value>,
}

impl StreamChunkPayload {
    pub fn text(content: String) -> Self {
        Self { event_type: "text".into(), content: Some(content),
               done: Some(false), error: None, tool_call: None,
               name: None, result: None, metadata: None }
    }
    fn thinking(content: String) -> Self {
        Self { event_type: "thinking".into(), content: Some(content),
               done: Some(false), error: None, tool_call: None,
               name: None, result: None, metadata: None }
    }
    fn tool_start(id: String, name: String) -> Self {
        Self { event_type: "tool_start".into(), content: None,
               done: Some(false), error: None,
               tool_call: Some(json!({"id": id})),
               name: Some(name), result: None, metadata: None }
    }
    fn tool_args(args: String) -> Self {
        Self { event_type: "tool_call".into(), content: Some(args),
               done: Some(false), error: None, tool_call: None,
               name: None, result: None, metadata: None }
    }
    pub fn tool_complete() -> Self {
        Self { event_type: "tool_call_complete".into(), content: None,
               done: Some(false), error: None, tool_call: None,
               name: None, result: None, metadata: None }
    }
    pub fn done() -> Self {
        Self { event_type: "done".into(), content: None, done: Some(true),
               error: None, tool_call: None, name: None, result: None,
               metadata: None }
    }
    pub fn error(msg: String) -> Self {
        Self { event_type: "error".into(), content: None, done: Some(true),
               error: Some(msg), tool_call: None, name: None, result: None,
               metadata: None }
    }
}

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

fn reasoning_directive(effort: &str) -> &'static str {
    match effort.to_lowercase().as_str() {
        "low"    => " Keep your reasoning brief and direct.",
        "medium" => " Think step-by-step before answering.",
        "high"   => " Think deeply and comprehensively, exploring multiple angles before answering.",
        "max"    => " Conduct an exhaustive analysis. Double-check all logic and reasoning. Provide a very detailed thought process.",
        _ => "",
    }
}

/// Slice a message list to stay within the context budget (character-based).
/// Always keeps at least the most-recent message even if it exceeds the budget.
fn budget_messages(messages: &[UnifiedMessage], budget_chars: usize) -> Vec<UnifiedMessage> {
    let mut total = 0usize;
    let mut result: Vec<UnifiedMessage> = Vec::new();

    for m in messages.iter().rev() {
        let chars = get_content_string(&m.content).len();
        if total + chars > budget_chars && !result.is_empty() {
            break;
        }
        total += chars;
        result.push(m.clone());
    }
    result.reverse();
    result
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3 — REQUEST BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

fn build_openai_compat_request(
    req: &UnifiedRequest,
) -> Result<(String, Value, HeaderMap), String> {
    let max_tokens = req.max_tokens.unwrap_or(MAX_TOKENS_DEFAULT);

    // Build system message with optional reasoning directive.
    let mut system_text = req.system_instruction.clone().unwrap_or_default();
    if let Some(effort) = &req.reasoning_effort {
        let directive = reasoning_directive(effort);
        if !directive.is_empty() {
            if !system_text.is_empty() { system_text.push_str("\n\n"); }
            system_text.push_str(&format!("Reasoning Effort Directive:{}", directive));
        }
    }

    let budget = if req.provider == "nyx-native" {
        // Local models typically have 4K–8K context windows.
        // Keep well within the model's context window to ensure GPU processes
        // the KV cache in VRAM. Sending too much context causes KV cache overflow
        // which forces llama.cpp to fall back to CPU, making GPU idle.
        // 6k tokens × 4 chars/token = 24k chars. Leave room for system prompt + output.
        24_000
    } else {
        CONTEXT_BUDGET_CHARS
    };

    let mut budgeted = budget_messages(&req.messages, budget);

    // Many local models (e.g. Mistral v0.3) use strict Jinja templates that crash if the first role is "system".
    // We merge the system prompt into the very first user message to guarantee compatibility.
    if req.provider == "nyx-native" && !system_text.is_empty() {
        if let Some(first_user) = budgeted.iter_mut().find(|m| m.role == "user") {
            let old_content = get_content_string(&first_user.content);
            first_user.content = json!(format!("{}\n\n{}", system_text, old_content));
            system_text.clear();
        }
    }

    let mut msgs: Vec<Value> = Vec::new();
    if !system_text.is_empty() {
        msgs.push(json!({"role": "system", "content": system_text}));
    }

    for m in &budgeted {
        // Reconstruct tool-call assistant turns.
        if m.role == "assistant" && m.content.is_array() {
            let mut tool_calls: Vec<Value> = Vec::new();
            if let Some(arr) = m.content.as_array() {
                for item in arr {
                    if item.get("type").and_then(|t| t.as_str()) == Some("tool_call") {
                        tool_calls.push(item.clone());
                    }
                }
            }
            if !tool_calls.is_empty() {
                msgs.push(json!({"role": "assistant", "tool_calls": tool_calls, "content": null}));
                continue;
            }
        }

        // Tool result turns.
        if m.role == "tool" && m.content.is_array() {
            if let Some(item) = m.content.as_array().and_then(|a| a.first()) {
                let tool_call_id = item.get("tool_call_id").and_then(|v| v.as_str()).unwrap_or("");
                let content = item.get("content").and_then(|v| v.as_str()).unwrap_or("");
                msgs.push(json!({"role": "tool", "tool_call_id": tool_call_id, "content": content}));
                continue;
            }
        }

        msgs.push(json!({"role": m.role, "content": m.content.clone()}));
    }

    // Sanitize messages for strict Jinja templates (like Mistral v0.3)
    if req.provider == "nyx-native" {
        let mut sanitized: Vec<Value> = Vec::new();
        for m in msgs {
            let role = m.get("role").and_then(|r| r.as_str()).unwrap_or("");
            
            // Drop leading assistant or tool messages so it always starts with user (or system)
            if sanitized.is_empty() && role != "user" && role != "system" {
                continue;
            }

            if let Some(last) = sanitized.last_mut() {
                let last_role = last.get("role").and_then(|r| r.as_str()).unwrap_or("");
                
                // Merge consecutive messages of the same role (user + user, or assistant + assistant)
                if last_role == role && (role == "user" || role == "assistant") {
                    let last_content = last.get("content").and_then(|c| c.as_str());
                    let curr_content = m.get("content").and_then(|c| c.as_str());
                    if let (Some(l_str), Some(c_str)) = (last_content, curr_content) {
                        last["content"] = json!(format!("{}\n\n{}", l_str, c_str));
                        continue;
                    }
                }
            }
            sanitized.push(m);
        }
        msgs = sanitized;
    }

    let mut body = json!({
        "model": req.model_id,
        "messages": msgs,
        "temperature": req.temperature.unwrap_or(0.7),
        "max_tokens": max_tokens,
        "stream": true,
    });

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
            headers.insert("Authorization",
                HeaderValue::from_str(&format!("Bearer {}", req.api_key))
                    .map_err(|e| e.to_string())?);
            headers.insert("HTTP-Referer", HeaderValue::from_static("https://nyx.local"));
            headers.insert("X-Title", HeaderValue::from_static("NYX"));

            // Reasoning effort for OpenRouter reasoning models.
            let lower = req.model_id.to_lowercase();
            let is_reasoning = lower.contains("r1") || lower.contains("o1")
                || lower.contains("o3") || lower.contains("thinking")
                || lower.contains("reasoning");
            if is_reasoning {
                if let Some(effort) = &req.reasoning_effort {
                    body["reasoning_effort"] = json!(effort);
                }
            }

            // Tools for OpenRouter.
            if let Some(tools) = &req.tools {
                if tools.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
                    body["tools"] = tools.clone();
                }
            }

            req.endpoint_override.clone()
                .unwrap_or_else(|| "https://openrouter.ai/api/v1/chat/completions".to_string())
        }

        "nyx-native" => {
            // No auth header for local server.
            if let Some(tools) = &req.tools {
                if tools.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
                    body["tools"] = tools.clone();
                }
            }
            req.endpoint_override.clone()
                .unwrap_or_else(|| "http://127.0.0.1:8080/v1/chat/completions".to_string())
        }

        _other => {
            // Generic OpenAI-compatible endpoint with bearer auth.
            headers.insert("Authorization",
                HeaderValue::from_str(&format!("Bearer {}", req.api_key))
                    .map_err(|e| e.to_string())?);
            req.endpoint_override.clone()
                .unwrap_or_else(|| format!("http://127.0.0.1:8080/v1/chat/completions"))
        }
    };

    Ok((endpoint, body, headers))
}

fn build_gemini_request(
    req: &UnifiedRequest,
) -> Result<(String, Value, HeaderMap), String> {
    let max_tokens = req.max_tokens.unwrap_or(MAX_TOKENS_DEFAULT);
    let budgeted = budget_messages(&req.messages, GEMINI_CONTEXT_BUDGET_CHARS);

    let is_gemma = req.model_id.to_lowercase().contains("gemma");
    let mut contents: Vec<Value> = Vec::new();

    for m in &budgeted {
        // Tool call turns (model side).
        if m.role == "assistant" && m.content.is_array() {
            if let Some(item) = m.content.as_array().and_then(|a| a.first()) {
                if item.get("type").and_then(|t| t.as_str()) == Some("tool_call") {
                    if let Some(func) = item.get("function") {
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

        // Tool result turns.
        if m.role == "tool" && m.content.is_array() {
            if let Some(item) = m.content.as_array().and_then(|a| a.first()) {
                let name = item.get("name").and_then(|n| n.as_str()).unwrap_or("");
                let content_str = item.get("content").and_then(|c| c.as_str()).unwrap_or("");
                let mut resp_obj: Value = serde_json::from_str(content_str)
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

    let mut body = json!({
        "contents": contents,
        "generationConfig": {
            "temperature": req.temperature.unwrap_or(0.7),
            "maxOutputTokens": max_tokens
        }
    });

    // System instruction.
    let mut system_text = req.system_instruction.clone().unwrap_or_default();
    if let Some(effort) = &req.reasoning_effort {
        let directive = reasoning_directive(effort);
        if !directive.is_empty() {
            if !system_text.is_empty() { system_text.push_str("\n\n"); }
            system_text.push_str(&format!("Reasoning Effort Directive:{}", directive));
        }
    }

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
                .filter_map(|t| t.get("function").cloned())
                .collect();
            if !decls.is_empty() {
                body["tools"] = json!([{"functionDeclarations": decls}]);
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
        "nyx-native" | "openrouter" => {
            let choices = v.get("choices").and_then(|c| c.as_array());
            if let Some(choice) = choices.and_then(|c| c.first()) {
                if let Some(delta) = choice.get("delta").and_then(|d| d.as_object()) {
                    // Text content.
                    if let Some(text) = delta.get("content").and_then(|c| c.as_str()) {
                        if !text.is_empty() { events.push(StreamEvent::Text(text.to_string())); }
                    }
                    // Reasoning tokens (DeepSeek R1, Qwen QwQ, etc.).
                    let reasoning = delta.get("reasoning")
                        .or_else(|| delta.get("reasoning_content"))
                        .and_then(|r| r.as_str());
                    if let Some(r) = reasoning {
                        if !r.is_empty() { events.push(StreamEvent::Reasoning(r.to_string())); }
                    }
                    // Tool calls.
                    if let Some(tool_calls) = delta.get("tool_calls").and_then(|tc| tc.as_array()) {
                        for tc in tool_calls {
                            if let Some(func) = tc.get("function").and_then(|f| f.as_object()) {
                                if let Some(name) = func.get("name").and_then(|n| n.as_str()) {
                                    let id = tc.get("id").and_then(|i| i.as_str()).unwrap_or("");
                                    events.push(StreamEvent::ToolStart {
                                        id: id.to_string(),
                                        name: name.to_string(),
                                    });
                                }
                                if let Some(args) = func.get("arguments").and_then(|a| a.as_str()) {
                                    events.push(StreamEvent::ToolArgs(args.to_string()));
                                }
                            }
                        }
                    }
                }
                // finish_reason handling.
                if let Some(reason) = choice.get("finish_reason").and_then(|f| f.as_str()) {
                    match reason {
                        "tool_calls" => events.push(StreamEvent::ToolComplete),
                        "length" => events.push(StreamEvent::FinishError(
                            "Generation stopped: maximum token limit reached.".into())),
                        "content_filter" => events.push(StreamEvent::FinishError(
                            "Generation blocked by provider safety filters.".into())),
                        _ => {}
                    }
                }
            }
        }

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
        "nyx-native" | "openrouter" => {
            let (url, body, headers) = build_openai_compat_request(req)?;
            (url, body, headers, req.provider.clone())
        }
        "gemini" | "gemma" => {
            let (url, body, headers) = build_gemini_request(req)?;
            (url, body, headers, "gemini".to_string())
        }
        other => return Err(format!("Unsupported provider: '{}'", other)),
    };

    // Fix #10: Reuse the shared pooled client instead of constructing a new one per call.
    let response = CLOUD_HTTP_CLIENT.post(&url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        return Err(format!("Request failed ({}): {}", status, body_text));
    }

    let (tx, rx) = tokio::sync::mpsc::channel(256);

    tauri::async_runtime::spawn(async move {
        let byte_stream = response.bytes_stream().map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, e)
        });
        let stream_reader = StreamReader::new(byte_stream);
        let mut lines = BufReader::new(stream_reader).lines();
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

    let mut rx = if req.execution_mode.is_some() && req.execution_mode.as_deref() != Some("default") {
        crate::llm::rig_orchestrator::execute_rig_stream(&req).await?
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
                        let _ = on_event.send(payload.clone());
                        if let Some(ref ev) = event_name {
                            let _ = app.emit(ev, payload);
                        }
                    }
                    Some(Err(e)) => {
                        final_error = Some(e.clone());
                        let err = StreamChunkPayload::error(e);
                        let _ = on_event.send(err.clone());
                        if let Some(ref ev) = event_name {
                            let _ = app.emit(ev, err);
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
        let reachable = client.get("http://127.0.0.1:8080/v1/models")
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

    // Unknown provider: accept as-is with a warning.
    Ok(QuotaResponse {
        status: "ok".to_string(),
        valid: true,
        provider,
        message: "Unknown provider; key format not verified.".to_string(),
    })
}

fn validate_key_format(provider: &str, key: &str) -> Option<String> {
    if key.is_empty() {
        return Some("API key is empty.".to_string());
    }
    match provider {
        "openrouter" => {
            // OpenRouter keys start with "sk-or-" and are long.
            if !key.starts_with("sk-or-") || key.len() < 20 {
                return Some("OpenRouter keys should start with 'sk-or-'.".to_string());
            }
        }
        "gemini" | "gemma" => {
            // Google AI Studio keys start with "AIza" and are exactly 39 chars.
            if !key.starts_with("AIza") || key.len() < 30 {
                return Some("Google API keys should start with 'AIza'.".to_string());
            }
        }
        _ => {}
    }
    None
}
