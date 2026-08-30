// ─────────────────────────────────────────────────────────────────────────────
// NYX — Mistral AI Provider Orchestrator
// ─────────────────────────────────────────────────────────────────────────────
// Endpoint: https://api.mistral.ai/v1/chat/completions

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

/// Dedicated high-speed HTTP client for Mistral AI API
static MISTRAL_CLIENT: LazyLock<Client> = LazyLock::new(|| build_fast_http_client(64, 120));

/// Normalizes model ID aliases for Mistral AI
pub fn normalize_mistral_model(raw: &str) -> &str {
    match raw {
        "mistral-large" => "mistral-large-latest",
        "mistral-medium" => "mistral-medium-latest",
        "mistral-small" => "mistral-small-latest",
        "ministral-8b" => "ministral-8b-latest",
        "ministral-3b" => "ministral-3b-latest",
        "ministral-14b" => "ministral-14b-latest",
        "codestral" => "codestral-latest",
        other => other,
    }
}

/// Builds request payload, headers, and URL for Mistral API
pub fn build_request(req: &UnifiedRequest) -> Result<(String, Value, HeaderMap), String> {
    let api_key = if !req.api_key.trim().is_empty() && req.api_key.trim() != "free" {
        req.api_key.trim().to_string()
    } else {
        std::env::var("MISTRAL_API_KEY").unwrap_or_default()
    };
    if api_key.is_empty() {
        return Err("Mistral API key is required. Please set your Mistral API key in Settings → API Keys or set the MISTRAL_API_KEY environment variable (free keys available at console.mistral.ai).".to_string());
    }

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", HeaderValue::from_static("application/json"));
    headers.insert(
        "Authorization",
        HeaderValue::from_str(&format!("Bearer {}", api_key)).map_err(|e| e.to_string())?,
    );

    let max_tokens = req.max_tokens.unwrap_or(MAX_TOKENS_DEFAULT);
    let budgeted = budget_messages(&req.messages, CONTEXT_BUDGET_CHARS);
    let sanitized_history = sanitize_messages_for_api(&budgeted);

    let normalized_model = normalize_mistral_model(&req.model_id);

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
        .unwrap_or_else(|| "https://api.mistral.ai/v1/chat/completions".to_string());

    Ok((endpoint, body, headers))
}

/// Parses an SSE JSON chunk from Mistral (handles standard text, thinking/reasoning, and tools)
pub fn parse_sse_event(data: &str) -> Vec<StreamChunkPayload> {
    let mut events = Vec::new();
    let val: Value = match serde_json::from_str(data) {
        Ok(v) => v,
        Err(_) => return events,
    };

    if let Some(choices) = val.get("choices").and_then(|c| c.as_array()) {
        if let Some(choice) = choices.first() {
            if let Some(delta) = choice.get("delta") {
                // Support both `reasoning` and `reasoning_content` for Mistral thinking models
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

/// Executes streaming generation on Mistral AI API with automatic 429 retry and tool fallback
pub async fn execute_stream(
    req: &UnifiedRequest,
) -> Result<tokio::sync::mpsc::Receiver<Result<StreamChunkPayload, String>>, String> {
    let (url, body, headers) = build_request(req)?;

    let mut response = MISTRAL_CLIENT.post(&url)
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
            if let Ok(retry_resp) = MISTRAL_CLIENT.post(&url)
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
                    let err_msg = extract_mistral_error(&r_text).unwrap_or(r_text);
                    return Err(format!("Request failed ({}): {}", r_status, err_msg));
                }
            } else {
                let err_msg = extract_mistral_error(&body_text).unwrap_or(body_text);
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
                if let Ok(retry_resp) = MISTRAL_CLIENT.post(&url)
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
                        let err_msg = extract_mistral_error(&r_text).unwrap_or(r_text);
                        return Err(format!("Request failed ({}): {}", r_status, err_msg));
                    }
                } else {
                    let err_msg = extract_mistral_error(&body_text).unwrap_or(body_text);
                    return Err(format!("Request failed ({}): {}", status, err_msg));
                }
            } else {
                let err_msg = extract_mistral_error(&body_text).unwrap_or(body_text);
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

/// Helper to cleanly extract error message from Mistral JSON error responses
fn extract_mistral_error(text: &str) -> Option<String> {
    if let Ok(val) = serde_json::from_str::<Value>(text) {
        if let Some(msg) = val.get("message").and_then(|m| m.as_str()) {
            return Some(msg.to_string());
        }
        if let Some(err) = val.get("error") {
            if let Some(msg) = err.get("message").and_then(|m| m.as_str()) {
                return Some(msg.to_string());
            }
        }
        if let Some(detail) = val.get("detail").and_then(|d| d.as_str()) {
            return Some(detail.to_string());
        }
    }
    None
}

/// Checks API key validity for Mistral with 60-second caching and 429 tolerance
pub async fn check_quota(api_key: Option<String>) -> Result<QuotaResponse, String> {
    let key = api_key.unwrap_or_default();
    if let Some(err) = validate_key_format("mistral", &key) {
        return Ok(QuotaResponse {
            status: "invalid".to_string(),
            valid: false,
            provider: "mistral".to_string(),
            message: err,
        });
    }

    let cache_key = format!("mistral:{}", key);
    if let Ok(cache) = KEY_VALIDATION_CACHE.lock() {
        if let Some((valid, timestamp)) = cache.get(&cache_key) {
            // Reduced to 60s so transient failures self-heal quickly
            if timestamp.elapsed() < std::time::Duration::from_secs(60) {
                return Ok(QuotaResponse {
                    status: if *valid { "ok".into() } else { "invalid".into() },
                    valid: *valid,
                    provider: "mistral".into(),
                    message: if *valid { "Mistral API key is active.".into() } else { "Mistral API key appears invalid.".into() },
                });
            }
        }
    }

    let resp = MISTRAL_CLIENT
        .get("https://api.mistral.ai/v1/models")
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
        provider: "mistral".into(),
        message: if valid { "Mistral API key is active.".into() } else { "Mistral API key appears invalid. Check console.mistral.ai.".into() },
    })
}
