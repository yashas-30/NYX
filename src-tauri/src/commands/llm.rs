use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};
use reqwest::{Client, header::{HeaderMap, HeaderValue}};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio_util::io::StreamReader;
use futures_util::TryStreamExt;

// ── Max token defaults per provider (all raised from the broken 4096 cap) ──
const MAX_TOKENS_ANTHROPIC: u32 = 32_768;
const MAX_TOKENS_OPENAI: u32 = 16_384;
const MAX_TOKENS_GEMINI: u32 = 8_192;
const MAX_TOKENS_DEFAULT: u32 = 8_192;

#[derive(Deserialize, Debug, Clone)]
pub struct UnifiedMessage {
    pub role: String,
    pub content: String,
}

#[derive(Deserialize, Debug)]
pub struct UnifiedRequest {
    pub provider: String,
    pub endpoint_override: Option<String>,
    pub model_id: String,
    pub messages: Vec<UnifiedMessage>,
    pub system_instruction: Option<String>,
    pub api_key: String,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub event_name: String,
}

/// Rich stream event payload to match frontend `StreamEvent` exactly.
#[derive(Serialize, Clone)]
pub struct StreamChunkPayload {
    #[serde(rename = "type")]
    pub event_type: String, // "text", "thinking", "tool_start", "tool_result", "done", "error"
    pub content: Option<String>,
    pub done: Option<bool>,
    pub error: Option<String>,
    pub tool_call: Option<Value>,
    pub name: Option<String>,
    pub result: Option<Value>,
    pub metadata: Option<Value>,
}

#[tauri::command]
pub async fn llm_stream_request(
    app: AppHandle,
    req: UnifiedRequest,
) -> Result<(), String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", HeaderValue::from_static("application/json"));

    let max_tokens = req.max_tokens.unwrap_or(match req.provider.as_str() {
        "anthropic" => MAX_TOKENS_ANTHROPIC,
        "openai" | "openrouter" => MAX_TOKENS_OPENAI,
        "gemini" => MAX_TOKENS_GEMINI,
        _ => MAX_TOKENS_DEFAULT,
    });

    let (url, body, provider_type) = match req.provider.as_str() {
        "openai" | "ollama" | "lmstudio" | "openrouter" | "deepseek" => {
            let mut msgs = vec![];
            if let Some(sys) = &req.system_instruction {
                msgs.push(json!({"role": "system", "content": sys}));
            }
            
            // Slice history to budget
            let mut current_tokens = 0;
            let mut budget_msgs = vec![];
            
            let bpe = tiktoken_rs::cl100k_base().unwrap();
            for m in req.messages.iter().rev() {
                let msg_tokens = bpe.encode_with_special_tokens(&m.content).len();
                if current_tokens + msg_tokens > 80_000 {
                    break;
                }
                current_tokens += msg_tokens;
                budget_msgs.push(m.clone());
            }
            budget_msgs.reverse();
            
            for m in &budget_msgs {
                msgs.push(json!({"role": m.role, "content": m.content}));
            }

            let mut body = json!({
                "model": req.model_id,
                "messages": msgs,
                "temperature": req.temperature.unwrap_or(0.7),
                "max_tokens": max_tokens,
                "stream": true,
                "tools": crate::commands::agent::get_builtin_tools()
            });

            match req.provider.as_str() {
                "openai" | "deepseek" => {
                    headers.insert(
                        "Authorization",
                        HeaderValue::from_str(&format!("Bearer {}", req.api_key))
                            .map_err(|e| e.to_string())?,
                    );
                }
                "openrouter" => {
                    headers.insert(
                        "Authorization",
                        HeaderValue::from_str(&format!("Bearer {}", req.api_key))
                            .map_err(|e| e.to_string())?,
                    );
                    headers.insert("HTTP-Referer", HeaderValue::from_static("https://nyx.local"));
                    headers.insert("X-Title", HeaderValue::from_static("NYX"));
                }
                _ => {} // ollama/lmstudio — no auth header
            }

            let endpoint = req.endpoint_override.clone().unwrap_or_else(|| {
                match req.provider.as_str() {
                    "openai" => "https://api.openai.com/v1/chat/completions".to_string(),
                    "openrouter" => "https://openrouter.ai/api/v1/chat/completions".to_string(),
                    "deepseek" => "https://api.deepseek.com/v1/chat/completions".to_string(),
                    "lmstudio" => "http://127.0.0.1:1234/v1/chat/completions".to_string(),
                    _ => "http://127.0.0.1:11434/v1/chat/completions".to_string(),
                }
            });

            (endpoint, body, "openai")
        }
        "anthropic" => {
            let mut msgs = vec![];
            
            // Slice history to budget
            let mut current_tokens = 0;
            let mut budget_msgs = vec![];
            
            let bpe = tiktoken_rs::cl100k_base().unwrap();
            for m in req.messages.iter().rev() {
                let msg_tokens = bpe.encode_with_special_tokens(&m.content).len();
                if current_tokens + msg_tokens > 80_000 {
                    break;
                }
                current_tokens += msg_tokens;
                budget_msgs.push(m.clone());
            }
            budget_msgs.reverse();
            
            for m in &budget_msgs {
                msgs.push(json!({"role": m.role, "content": m.content}));
            }

            let mut body = json!({
                "model": req.model_id,
                "messages": msgs,
                "temperature": req.temperature.unwrap_or(0.7),
                "stream": true,
                "max_tokens": max_tokens
            });

            if let Some(sys) = &req.system_instruction {
                body["system"] = json!(sys);
            }

            headers.insert(
                "x-api-key",
                HeaderValue::from_str(&req.api_key).map_err(|e| e.to_string())?,
            );
            headers.insert(
                "anthropic-version",
                HeaderValue::from_static("2023-06-01"),
            );
            // Enable extended thinking for claude-3-7+ and claude-sonnet-4+
            if req.model_id.contains("claude-3-7") || req.model_id.contains("claude-sonnet-4") || req.model_id.contains("claude-opus-4") {
                headers.insert("anthropic-beta", HeaderValue::from_static("interleaved-thinking-2025-05-14"));
            }

            let endpoint = req
                .endpoint_override
                .unwrap_or_else(|| "https://api.anthropic.com/v1/messages".to_string());

            (endpoint, body, "anthropic")
        }
        "gemini" => {
            let mut contents = vec![];
            
            // Slice history to budget
            let mut current_tokens = 0;
            let mut budget_msgs = vec![];
            
            let bpe = tiktoken_rs::cl100k_base().unwrap();
            for m in req.messages.iter().rev() {
                let msg_tokens = bpe.encode_with_special_tokens(&m.content).len();
                if current_tokens + msg_tokens > 80_000 {
                    break;
                }
                current_tokens += msg_tokens;
                budget_msgs.push(m.clone());
            }
            budget_msgs.reverse();
            
            for m in &budget_msgs {
                let role = if m.role == "assistant" { "model" } else { "user" };
                contents.push(json!({
                    "role": role,
                    "parts": [{"text": m.content}]
                }));
            }

            let mut body = json!({
                "contents": contents,
                "generationConfig": {
                    "temperature": req.temperature.unwrap_or(0.7),
                    "maxOutputTokens": max_tokens
                }
            });

            if let Some(sys) = &req.system_instruction {
                body["systemInstruction"] = json!({
                    "parts": [{"text": sys}]
                });
            }

            let base = req.endpoint_override.unwrap_or_else(|| {
                "https://generativelanguage.googleapis.com/v1beta/models/".to_string()
            });
            let endpoint = format!(
                "{}{}:streamGenerateContent?alt=sse&key={}",
                base, req.model_id, req.api_key
            );

            (endpoint, body, "gemini")
        }
        _ => return Err(format!("Unsupported provider: {}", req.provider)),
    };

    let res = client
        .post(&url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Request failed ({}): {}", status, err_text));
    }

    let event_name = req.event_name.clone();
    let provider_type = provider_type.to_string();

    tauri::async_runtime::spawn(async move {
        // Convert the response byte stream into an async line reader
        let byte_stream = res.bytes_stream().map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, e)
        });
        let stream_reader = StreamReader::new(byte_stream);
        let mut lines = BufReader::new(stream_reader).lines();

        let mut buffer = String::new();

        loop {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    // SSE spec: blank line = event boundary, "data:" prefix = payload
                    if line.is_empty() {
                        // Process accumulated buffer
                        if !buffer.is_empty() {
                            let data = buffer.trim().to_string();
                            buffer.clear();

                            if data == "[DONE]" {
                                let _ = app.emit(&event_name, StreamChunkPayload {
                                    event_type: "done".to_string(),
                                    content: None,
                                    done: Some(true),
                                    error: None,
                                    tool_call: None,
                                    name: None,
                                    result: None,
                                    metadata: None,
                                });
                                break;
                            }

                            match extract_stream_event(&data, &provider_type) {
                                StreamEventParse::Text(text) => {
                                    if !text.is_empty() {
                                        let _ = app.emit(&event_name, StreamChunkPayload {
                                            event_type: "text".to_string(),
                                            content: Some(text),
                                            done: Some(false),
                                            error: None,
                                            tool_call: None,
                                            name: None,
                                            result: None,
                                            metadata: None,
                                        });
                                    }
                                }
                                StreamEventParse::ToolCallStart { id, name } => {
                                    let _ = app.emit(&event_name, StreamChunkPayload {
                                        event_type: "tool_start".to_string(),
                                        content: None,
                                        done: Some(false),
                                        error: None,
                                        tool_call: Some(json!({"id": id})),
                                        name: Some(name),
                                        result: None,
                                        metadata: None,
                                    });
                                }
                                StreamEventParse::ToolCallArgs { args } => {
                                    // Normally we would accumulate args here and execute
                                    // For now, we just pass the raw stream to the UI, 
                                    // but we eventually need to do execution in Rust.
                                    let _ = app.emit(&event_name, StreamChunkPayload {
                                        event_type: "tool_call".to_string(),
                                        content: Some(args),
                                        done: Some(false),
                                        error: None,
                                        tool_call: None,
                                        name: None,
                                        result: None,
                                        metadata: None,
                                    });
                                }
                                StreamEventParse::None => {}
                            }
                        }
                        continue;
                    }

                    // Strip "data: " prefix
                    if let Some(payload) = line.strip_prefix("data: ") {
                        if payload == "[DONE]" {
                            let _ = app.emit(&event_name, StreamChunkPayload {
                                event_type: "done".to_string(),
                                content: None,
                                done: Some(true),
                                error: None,
                                tool_call: None,
                                name: None,
                                result: None,
                                metadata: None,
                            });
                            break;
                        }
                        buffer = payload.to_string();
                    } else if line.starts_with("data:") {
                        // Handle "data:" without space
                        buffer = line[5..].trim().to_string();
                    }
                    // Ignore "event:", "id:", "retry:" lines
                }
                Ok(None) => {
                    // Stream ended cleanly
                    let _ = app.emit(&event_name, StreamChunkPayload {
                        event_type: "done".to_string(),
                        content: None,
                        done: Some(true),
                        error: None,
                        tool_call: None,
                        name: None,
                        result: None,
                        metadata: None,
                    });
                    break;
                }
                Err(e) => {
                    let _ = app.emit(&event_name, StreamChunkPayload {
                        event_type: "error".to_string(),
                        content: None,
                        done: Some(true),
                        error: Some(e.to_string()),
                        tool_call: None,
                        name: None,
                        result: None,
                        metadata: None,
                    });
                    break;
                }
            }
        }
    });

    Ok(())
}

pub enum StreamEventParse {
    Text(String),
    ToolCallStart { id: String, name: String },
    ToolCallArgs { args: String },
    None,
}

pub fn extract_stream_event(data: &str, provider_type: &str) -> StreamEventParse {
    let v: Value = match serde_json::from_str(data) {
        Ok(val) => val,
        Err(_) => return StreamEventParse::None,
    };

    match provider_type {
        "openai" => {
            if let Some(choices) = v.get("choices").and_then(|c| c.as_array()) {
                if let Some(choice) = choices.get(0) {
                    if let Some(delta) = choice.get("delta").and_then(|d| d.as_object()) {
                        if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                            return StreamEventParse::Text(content.to_string());
                        }
                        if let Some(tool_calls) = delta.get("tool_calls").and_then(|tc| tc.as_array()) {
                            if let Some(tc) = tool_calls.get(0) {
                                if let Some(func) = tc.get("function") {
                                    if let Some(name) = func.get("name").and_then(|n| n.as_str()) {
                                        let id = tc.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
                                        return StreamEventParse::ToolCallStart { id, name: name.to_string() };
                                    }
                                    if let Some(args) = func.get("arguments").and_then(|a| a.as_str()) {
                                        return StreamEventParse::ToolCallArgs { args: args.to_string() };
                                    }
                                }
                            }
                        }
                    }
                }
            }
            StreamEventParse::None
        }
        "anthropic" => {
            let event_type = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
            match event_type {
                "content_block_delta" => {
                    if let Some(delta) = v.get("delta") {
                        let delta_type = delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        match delta_type {
                            "text_delta" => {
                                if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                                    return StreamEventParse::Text(text.to_string());
                                }
                            }
                            "thinking_delta" => {
                                if let Some(thinking) = delta.get("thinking").and_then(|t| t.as_str()) {
                                    return StreamEventParse::Text(format!("\x00THINK\x00{}", thinking));
                                }
                            }
                            _ => {}
                        }
                    }
                }
                _ => {}
            }
            StreamEventParse::None
        }
        "gemini" => {
            if let Some(candidates) = v.get("candidates").and_then(|c| c.as_array()) {
                if let Some(candidate) = candidates.get(0) {
                    if let Some(content) = candidate.get("content") {
                        if let Some(parts) = content.get("parts").and_then(|p| p.as_array()) {
                            if let Some(part) = parts.get(0) {
                                if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                    return StreamEventParse::Text(text.to_string());
                                }
                            }
                        }
                    }
                }
            }
            StreamEventParse::None
        }
        _ => StreamEventParse::None,
    }
}
