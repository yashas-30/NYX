// ─────────────────────────────────────────────────────────────────────────────
// NYX — OpenRouter Provider Orchestrator
// ─────────────────────────────────────────────────────────────────────────────
// Endpoint: https://openrouter.ai/api/v1/chat/completions

use reqwest::{Client, header::{HeaderMap, HeaderValue}};
use serde_json::{json, Value};
use std::sync::LazyLock;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio_util::io::StreamReader;
use futures_util::TryStreamExt;
use crate::llm::types::{UnifiedRequest, StreamChunkPayload, sanitize_messages_for_api};
use super::common::{
    build_fast_http_client, budget_messages, validate_key_format,
    CONTEXT_BUDGET_CHARS, MAX_TOKENS_DEFAULT, QuotaResponse, KEY_VALIDATION_CACHE,
};

/// Dedicated high-speed HTTP client for OpenRouter API
static OPENROUTER_CLIENT: LazyLock<Client> = LazyLock::new(|| build_fast_http_client(64, 120));

/// Normalizes model ID aliases for OpenRouter
pub fn normalize_openrouter_model(raw: &str) -> &str {
    match raw {
        "nemotron-3-super" | "nemotron-3-super:free" => "nvidia/nemotron-3-super-120b-a12b:free",
        "gpt-oss-20b" | "gpt-oss-20b:free" => "openai/gpt-oss-20b:free",
        "north-mini-code" | "north-mini-code:free" => "cohere/north-mini-code:free",
        "gemma-4-26b" | "gemma-4-26b:free" => "google/gemma-4-26b-a4b-it:free",
        "gemma-4-31b" | "gemma-4-31b:free" => "google/gemma-4-31b-it:free",
        "ling-3.0-flash" | "ling-3.0-flash:free" => "inclusionai/ling-3.0-flash:free",
        "nemotron-3-nano" | "nemotron-3-nano:free" => "nvidia/nemotron-3-nano-30b-a3b:free",
        "nemotron-nano-9b" | "nemotron-nano-9b:free" => "nvidia/nemotron-nano-9b-v2:free",
        "nemotron-nano-12b-vl" | "nemotron-nano-12b-vl:free" => "nvidia/nemotron-nano-12b-v2-vl:free",
        "laguna-s" | "laguna-s:free" => "poolside/laguna-s-2.1:free",
        "laguna-xs" | "laguna-xs:free" => "poolside/laguna-xs-2.1:free",
        other => other,
    }
}

/// Builds request payload, headers, and URL for OpenRouter API
pub fn build_request(req: &UnifiedRequest) -> Result<(String, Value, HeaderMap), String> {
    let api_key = if !req.api_key.trim().is_empty() && req.api_key.trim() != "free" {
        req.api_key.trim().to_string()
    } else {
        std::env::var("OPENROUTER_API_KEY").unwrap_or_default()
    };
    if api_key.is_empty() {
        return Err("OpenRouter API key is required. Please set your OpenRouter API key in Settings → API Keys or set the OPENROUTER_API_KEY environment variable (free keys available at openrouter.ai/keys).".to_string());
    }

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", HeaderValue::from_static("application/json"));
    headers.insert(
        "Authorization",
        HeaderValue::from_str(&format!("Bearer {}", api_key)).map_err(|e| e.to_string())?,
    );
    headers.insert("HTTP-Referer", HeaderValue::from_static("https://nyx.ai"));
    headers.insert("X-Title", HeaderValue::from_static("NYX Desktop"));

    let max_tokens = req.max_tokens.unwrap_or(MAX_TOKENS_DEFAULT);
    let budgeted = budget_messages(&req.messages, CONTEXT_BUDGET_CHARS);
    let sanitized_history = sanitize_messages_for_api(&budgeted);

    let normalized_model = normalize_openrouter_model(&req.model_id);

    let mut body = json!({
        "model": normalized_model,
        "messages": sanitized_history,
        "temperature": req.temperature.unwrap_or(0.7),
        "max_tokens": max_tokens,
        "stream": true,
    });

    if let Some(top_p) = req.top_p {
        body["top_p"] = json!(top_p);
    }

    if let Some(ref system_text) = req.system_instruction {
        if !system_text.is_empty() {
            if let Some(messages_arr) = body.get_mut("messages").and_then(|v| v.as_array_mut()) {
                messages_arr.insert(0, json!({
                    "role": "system",
                    "content": system_text
                }));
            }
        }
    }

    if let Some(tools) = &req.tools {
        if tools.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
            body["tools"] = tools.clone();
        }
    }

    let endpoint = req.endpoint_override.clone()
        .unwrap_or_else(|| "https://openrouter.ai/api/v1/chat/completions".to_string());

    Ok((endpoint, body, headers))
}

/// Parses an SSE JSON chunk from OpenRouter (handles standard content, reasoning, reasoning_content, tool calls)
pub fn parse_sse_event(data: &str) -> Vec<StreamChunkPayload> {
    let mut events = Vec::new();
    let val: Value = match serde_json::from_str(data) {
        Ok(v) => v,
        Err(_) => return events,
    };

    if let Some(choices) = val.get("choices").and_then(|c| c.as_array()) {
        if let Some(choice) = choices.first() {
            if let Some(delta) = choice.get("delta") {
                // Support both `reasoning` (Anthropic/OpenRouter standard) and `reasoning_content` (DeepSeek R1 standard)
                if let Some(reasoning) = delta.get("reasoning").or_else(|| delta.get("reasoning_content")).and_then(|r| r.as_str()) {
                    if !reasoning.is_empty() {
                        events.push(StreamChunkPayload::thinking(reasoning.to_string()));
                    }
                }

                if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                    if !content.is_empty() {
                        events.push(StreamChunkPayload::text(content.to_string()));
                    }
                }

                if let Some(tool_calls) = delta.get("tool_calls").and_then(|t| t.as_array()) {
                    for tc in tool_calls {
                        let id = tc.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
                        let name = tc.get("function").and_then(|f| f.get("name")).and_then(|n| n.as_str()).unwrap_or("").to_string();
                        events.push(StreamChunkPayload::tool_start(id, name));
                    }
                }
            }
        }
    }

    if let Some(usage) = val.get("usage") {
        let pt = usage.get("prompt_tokens").and_then(|t| t.as_i64()).unwrap_or(0);
        let ct = usage.get("completion_tokens").and_then(|t| t.as_i64()).unwrap_or(0);
        events.push(StreamChunkPayload {
            event_type: "metadata".to_string(),
            content: Some(format!("Tokens: {} in / {} out", pt, ct)),
            done: Some(false),
            error: None,
            tool_call: None,
            name: None,
            result: None,
            metadata: Some(serde_json::json!({ "prompt_tokens": pt, "completion_tokens": ct })),
        });
    }

    events
}

/// Executes streaming generation on OpenRouter API with automatic retry for 429 and unsupported tools
pub async fn execute_stream(
    req: &UnifiedRequest,
) -> Result<tokio::sync::mpsc::Receiver<Result<StreamChunkPayload, String>>, String> {
    let (url, body, headers) = build_request(req)?;

    let mut response = OPENROUTER_CLIENT.post(&url)
        .headers(headers.clone())
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();

        // 1. Handle short 429 rate limit backoff retry (2s sleep)
        if status.as_u16() == 429 {
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            if let Ok(retry_resp) = OPENROUTER_CLIENT.post(&url)
                .headers(headers.clone())
                .json(&body)
                .send()
                .await
            {
                if retry_resp.status().is_success() {
                    response = retry_resp;
                } else {
                    let r_status = retry_resp.status();
                    let r_text = retry_resp.text().await.unwrap_or_default();
                    let err_msg = extract_openrouter_error(&r_text).unwrap_or(r_text);
                    return Err(format!("Request failed ({}): {}", r_status, err_msg));
                }
            } else {
                let err_msg = extract_openrouter_error(&body_text).unwrap_or(body_text);
                return Err(format!("Request failed ({}): {}", status, err_msg));
            }
        } else {
            // 2. Handle unsupported tools retry fallback
            let is_tool_unsupported = (status.as_u16() == 400 || status.as_u16() == 422)
                && (body_text.to_lowercase().contains("tool") 
                    || body_text.to_lowercase().contains("function") 
                    || body_text.to_lowercase().contains("not support")
                    || body_text.to_lowercase().contains("unsupported"));

            if is_tool_unsupported && body.get("tools").is_some() {
                let mut retry_body = body.clone();
                if let Some(map) = retry_body.as_object_mut() {
                    map.remove("tools");
                }
                if let Ok(retry_resp) = OPENROUTER_CLIENT.post(&url)
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
                        let err_msg = extract_openrouter_error(&r_text).unwrap_or(r_text);
                        return Err(format!("Request failed ({}): {}", r_status, err_msg));
                    }
                } else {
                    let err_msg = extract_openrouter_error(&body_text).unwrap_or(body_text);
                    return Err(format!("Request failed ({}): {}", status, err_msg));
                }
            } else {
                let err_msg = extract_openrouter_error(&body_text).unwrap_or(body_text);
                return Err(format!("Request failed ({}): {}", status, err_msg));
            }
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
                            let trimmed = line.trim();
                            if let Some(payload) = trimmed.strip_prefix("data:") {
                                let payload = payload.trim();
                                if payload == "[DONE]" {
                                    let _ = tx.send(Ok(StreamChunkPayload::done())).await;
                                    break 'outer;
                                }
                                if !payload.is_empty() {
                                    let events = parse_sse_event(payload);
                                    if !events.is_empty() {
                                        for ev in events {
                                            if tx.send(Ok(ev)).await.is_err() { break 'outer; }
                                        }
                                    } else {
                                        if !buffer.is_empty() { buffer.push('\n'); }
                                        buffer.push_str(payload);
                                    }
                                }
                            } else if trimmed.is_empty() && !buffer.is_empty() {
                                let data = buffer.trim().to_string();
                                buffer.clear();
                                for ev in parse_sse_event(&data) {
                                    if tx.send(Ok(ev)).await.is_err() { break 'outer; }
                                }
                            }
                        }
                        Ok(None) => {
                            if !buffer.is_empty() {
                                let data = buffer.trim().to_string();
                                for ev in parse_sse_event(&data) {
                                    let _ = tx.send(Ok(ev)).await;
                                }
                            }
                            let _ = tx.send(Ok(StreamChunkPayload::done())).await;
                            break 'outer;
                        }
                        Err(e) => {
                            let _ = tx.send(Err(e.to_string())).await;
                            break 'outer;
                        }
                    }
                }
            }
        }
    });

    Ok(rx)
}

/// Helper to cleanly extract error message from OpenRouter JSON error responses
fn extract_openrouter_error(text: &str) -> Option<String> {
    if let Ok(val) = serde_json::from_str::<Value>(text) {
        if let Some(err) = val.get("error") {
            if let Some(msg) = err.get("message").and_then(|m| m.as_str()) {
                return Some(msg.to_string());
            }
        }
    }
    None
}

/// Checks API key validity for OpenRouter with 60-second caching and 429 tolerance
pub async fn check_quota(api_key: Option<String>) -> Result<QuotaResponse, String> {
    let key = api_key.unwrap_or_default();
    if let Some(err) = validate_key_format("openrouter", &key) {
        return Ok(QuotaResponse {
            status: "invalid".to_string(),
            valid: false,
            provider: "openrouter".to_string(),
            message: err,
        });
    }

    let cache_key = format!("openrouter:{}", key);
    if let Ok(cache) = KEY_VALIDATION_CACHE.lock() {
        if let Some((valid, timestamp)) = cache.get(&cache_key) {
            // Reduced to 60s so transient errors self-heal quickly
            if timestamp.elapsed() < std::time::Duration::from_secs(60) {
                return Ok(QuotaResponse {
                    status: if *valid { "ok".into() } else { "invalid".into() },
                    valid: *valid,
                    provider: "openrouter".into(),
                    message: if *valid { "OpenRouter API key is active.".into() } else { "OpenRouter API key appears invalid.".into() },
                });
            }
        }
    }

    let resp = OPENROUTER_CLIENT
        .get("https://openrouter.ai/api/v1/auth/key")
        .header("Authorization", format!("Bearer {}", key))
        .send()
        .await;

    // Treat 200 and 429 (rate limit on key auth endpoint) as valid=true
    let valid = resp.map(|r| {
        let s = r.status();
        s.is_success() || s.as_u16() == 429
    }).unwrap_or(false);

    if let Ok(mut cache) = KEY_VALIDATION_CACHE.lock() {
        cache.insert(cache_key, (valid, std::time::Instant::now()));
    }

    Ok(QuotaResponse {
        status: if valid { "ok".into() } else { "invalid".into() },
        valid,
        provider: "openrouter".into(),
        message: if valid { "OpenRouter API key is active.".into() } else { "OpenRouter API key appears invalid. Check openrouter.ai/keys.".into() },
    })
}
