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

/// Emitted for every parsed text delta and for final events.
#[derive(Serialize, Clone)]
pub struct StreamChunkPayload {
    /// Parsed text delta (never raw SSE protocol noise).
    pub chunk: String,
    /// `true` only on the terminal `[DONE]` event.
    pub done: bool,
    /// Non-empty when an error occurred.
    pub error: Option<String>,
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
            for m in &req.messages {
                msgs.push(json!({"role": m.role, "content": m.content}));
            }

            let body = json!({
                "model": req.model_id,
                "messages": msgs,
                "temperature": req.temperature.unwrap_or(0.7),
                "max_tokens": max_tokens,
                "stream": true
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
                    _ => "http://127.0.0.1:11434/api/chat".to_string(),
                }
            });

            (endpoint, body, "openai")
        }
        "anthropic" => {
            let mut msgs = vec![];
            for m in &req.messages {
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
            for m in &req.messages {
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
                                    chunk: String::new(),
                                    done: true,
                                    error: None,
                                });
                                break;
                            }

                            // Parse and extract text delta based on provider format
                            if let Some(delta) = extract_delta(&data, &provider_type) {
                                if !delta.is_empty() {
                                    let _ = app.emit(&event_name, StreamChunkPayload {
                                        chunk: delta,
                                        done: false,
                                        error: None,
                                    });
                                }
                            }
                        }
                        continue;
                    }

                    // Strip "data: " prefix
                    if let Some(payload) = line.strip_prefix("data: ") {
                        if payload == "[DONE]" {
                            let _ = app.emit(&event_name, StreamChunkPayload {
                                chunk: String::new(),
                                done: true,
                                error: None,
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
                        chunk: String::new(),
                        done: true,
                        error: None,
                    });
                    break;
                }
                Err(e) => {
                    let _ = app.emit(&event_name, StreamChunkPayload {
                        chunk: String::new(),
                        done: true,
                        error: Some(e.to_string()),
                    });
                    break;
                }
            }
        }
    });

    Ok(())
}

/// Extract the text delta from a parsed SSE data payload.
/// Each provider has a different JSON schema for the streaming delta.
fn extract_delta(data: &str, provider_type: &str) -> Option<String> {
    let v: Value = serde_json::from_str(data).ok()?;

    match provider_type {
        // OpenAI-compatible: choices[0].delta.content
        "openai" => {
            v["choices"][0]["delta"]["content"]
                .as_str()
                .map(|s| s.to_string())
        }
        // Anthropic: content_block_delta.delta.text (type: "content_block_delta")
        "anthropic" => {
            let event_type = v["type"].as_str().unwrap_or("");
            match event_type {
                "content_block_delta" => {
                    let delta_type = v["delta"]["type"].as_str().unwrap_or("");
                    match delta_type {
                        "text_delta" => v["delta"]["text"].as_str().map(|s| s.to_string()),
                        "thinking_delta" => {
                            // Prefix thinking content so the frontend can distinguish
                            v["delta"]["thinking"]
                                .as_str()
                                .map(|s| format!("\x00THINK\x00{}", s))
                        }
                        _ => None,
                    }
                }
                "message_delta" => {
                    // Contains stop_reason — ignore for text extraction
                    None
                }
                _ => None,
            }
        }
        // Gemini: candidates[0].content.parts[0].text
        "gemini" => {
            v["candidates"][0]["content"]["parts"][0]["text"]
                .as_str()
                .map(|s| s.to_string())
        }
        _ => None,
    }
}
