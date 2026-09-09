// ─────────────────────────────────────────────────────────────────────────────
// NYX — NVIDIA NIM Provider Orchestrator
// ─────────────────────────────────────────────────────────────────────────────
// Dedicated, bloat-free orchestrator for the 12 verified NVIDIA NIM frontier models.
// Endpoint: https://integrate.api.nvidia.com/v1/chat/completions
// Documentation: https://build.nvidia.com/explore/discover

use futures_util::TryStreamExt;
use reqwest::{
    header::{HeaderMap, HeaderValue},
    Client,
};
use serde_json::{json, Value};
use std::sync::LazyLock;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio_util::io::StreamReader;

use super::common::{
    budget_messages, build_fast_http_client, validate_key_format, KEY_VALIDATION_CACHE,
    MAX_TOKENS_DEFAULT, QuotaResponse,
};
use crate::llm::types::{sanitize_messages_for_api, StreamChunkPayload, UnifiedRequest};

/// Dedicated high-speed HTTP client for NVIDIA NIM API with HTTP/2 and TCP_NODELAY
static NVIDIA_CLIENT: LazyLock<Client> = LazyLock::new(|| build_fast_http_client(64, 120));

/// Normalizes model ID aliases for the 12 official NVIDIA NIM models
pub fn normalize_nvidia_model(raw: &str) -> &str {
    match raw {
        // 1. Kimi K3 (Moonshot AI)
        "moonshotai/kimi-k3" | "kimi-k3" | "kimi_k3" | "kimi k3" | "kimi" => "moonshotai/kimi-k3",

        // 2. DeepSeek V4 Pro 0813 (DeepSeek AI)
        "deepseek-ai/deepseek-v4-pro-0813"
        | "deepseek-v4-pro-0813"
        | "deepseek-ai/deepseek-v4-pro"
        | "deepseek-v4-pro"
        | "deepseek-v4" => "deepseek-ai/deepseek-v4-pro-0813",

        // 3. Nemotron 3.5 Lightning 30B A3B (NVIDIA)
        "nvidia/nemotron-3.5-lightning-30b-a3b"
        | "nemotron-3.5-lightning-30b-a3b"
        | "nemotron-3.5-lightning"
        | "nemotron-3.5" => "nvidia/nemotron-3.5-lightning-30b-a3b",

        // 4. Muse Glimmer 30B (Meta)
        "meta/muse-glimmer-30b"
        | "muse-glimmer-30b"
        | "nvidia/muse-glimmer-30b"
        | "muse-glimmer" => "meta/muse-glimmer-30b",

        // 5. Laguna XS 2.1 (Poolside)
        "poolside/laguna-xs-2.1"
        | "laguna-xs-2.1"
        | "nvidia/laguna-xs-2.1"
        | "laguna-xs"
        | "laguna" => "poolside/laguna-xs-2.1",

        // 6. Nemotron 3 Ultra 550B A55B (NVIDIA)
        "nvidia/nemotron-3-ultra-550b-a55b"
        | "nemotron-3-ultra-550b-a55b"
        | "nemotron-3-ultra" => "nvidia/nemotron-3-ultra-550b-a55b",

        // 7. Nemotron 3 Nano Omni 30B A3B Reasoning (NVIDIA)
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
        | "nemotron-3-nano-omni-30b-a3b-reasoning"
        | "nvidia/nemotron-3-nano-omni"
        | "nemotron-3-nano-omni"
        | "nemotron-3-nano-omni-reasoning" => "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",

        // 8. Gemma 4 31B IT (Google)
        "google/gemma-4-31b-it" | "gemma-4-31b-it" | "gemma-4-31b" | "gemma-4" => {
            "google/gemma-4-31b-it"
        }

        // 9. Nemotron 3 Super 120B A12B (NVIDIA)
        "nvidia/nemotron-3-super-120b-a12b"
        | "nemotron-3-super-120b-a12b"
        | "nemotron-3-super" => "nvidia/nemotron-3-super-120b-a12b",

        // 10. GPT OSS 20B (OpenAI)
        "openai/gpt-oss-20b" | "gpt-oss-20b" => "openai/gpt-oss-20b",

        // 11. Llama 3.2 90B Vision Instruct (Meta)
        "meta/llama-3.2-90b-vision-instruct"
        | "llama-3.2-90b-vision-instruct"
        | "llama-3.2-90b-vision" => "meta/llama-3.2-90b-vision-instruct",

        // 12. Llama 3.2 11B Vision Instruct (Meta)
        "meta/llama-3.2-11b-vision-instruct"
        | "llama-3.2-11b-vision-instruct"
        | "llama-3.2-11b-vision" => "meta/llama-3.2-11b-vision-instruct",

        other => other,
    }
}

/// Returns the full context window in tokens for NVIDIA NIM models
pub fn get_default_context_window(model: &str) -> u32 {
    match model {
        // 1M Context Models
        "moonshotai/kimi-k3"
        | "deepseek-ai/deepseek-v4-pro-0813"
        | "nvidia/nemotron-3.5-lightning-30b-a3b"
        | "nvidia/nemotron-3-ultra-550b-a55b"
        | "nvidia/nemotron-3-super-120b-a12b" => 1_048_576,

        // 262K Context Models
        "poolside/laguna-xs-2.1"
        | "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
        | "google/gemma-4-31b-it" => 262_144,

        // 131K Context Models
        "meta/muse-glimmer-30b"
        | "openai/gpt-oss-20b"
        | "meta/llama-3.2-90b-vision-instruct"
        | "meta/llama-3.2-11b-vision-instruct" => 131_072,

        _ => 131_072,
    }
}

/// Checks if the model supports native function/tool calling
pub fn supports_tools(model: &str) -> bool {
    !matches!(
        model,
        "meta/llama-3.2-90b-vision-instruct" | "meta/llama-3.2-11b-vision-instruct"
    )
}

/// Checks if the model supports structured outputs (JSON schema / response_format)
pub fn supports_structured_output(model: &str) -> bool {
    matches!(
        model,
        "moonshotai/kimi-k3"
            | "deepseek-ai/deepseek-v4-pro-0813"
            | "nvidia/nemotron-3.5-lightning-30b-a3b"
            | "nvidia/nemotron-3-super-120b-a12b"
            | "openai/gpt-oss-20b"
    )
}

/// Builds request payload, headers, and URL for NVIDIA NIM API
pub fn build_request(req: &UnifiedRequest) -> Result<(String, Value, HeaderMap), String> {
    let api_key = if !req.api_key.trim().is_empty() && req.api_key.trim() != "free" {
        req.api_key.trim().to_string()
    } else {
        std::env::var("NVIDIA_API_KEY")
            .or_else(|_| std::env::var("NVIDIA_NIM_API_KEY"))
            .unwrap_or_default()
    };
    if api_key.is_empty() {
        return Err("NVIDIA NIM API key is required. Please set your NVIDIA NIM API key in Settings → API Keys or set the NVIDIA_API_KEY environment variable (free keys available at build.nvidia.com).".to_string());
    }

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", HeaderValue::from_static("application/json"));
    headers.insert(
        "Authorization",
        HeaderValue::from_str(&format!("Bearer {}", api_key)).map_err(|e| e.to_string())?,
    );

    let normalized_model = normalize_nvidia_model(&req.model_id);
    let max_tokens = req.max_tokens.unwrap_or(MAX_TOKENS_DEFAULT);

    // Full context budgeting respecting up to 1M tokens per model specification
    let ctx_window = req
        .context_window
        .filter(|&w| w > 0)
        .unwrap_or_else(|| get_default_context_window(normalized_model));
    let budget_chars = (ctx_window as usize) * 4;
    let budgeted = budget_messages(&req.messages, budget_chars);
    let sanitized_history = sanitize_messages_for_api(&budgeted);

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
                messages_arr.insert(
                    0,
                    json!({
                        "role": "system",
                        "content": system_text
                    }),
                );
            }
        }
    }

    // Attach tools only for models supporting function calling
    if supports_tools(normalized_model) {
        if let Some(tools) = &req.tools {
            if tools.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
                body["tools"] = tools.clone();
                if let Some(ref tc) = req.tool_choice {
                    body["tool_choice"] = tc.clone();
                }
            }
        }
    }

    // Attach response_format for models supporting structured schema output
    if supports_structured_output(normalized_model) {
        if let Some(ref rf) = req.response_format {
            body["response_format"] = rf.clone();
        }
    }

    let raw_endpoint = req
        .endpoint_override
        .as_deref()
        .unwrap_or("https://integrate.api.nvidia.com/v1/chat/completions");
    let endpoint = if raw_endpoint.ends_with("/chat/completions") {
        raw_endpoint.to_string()
    } else {
        let trimmed = raw_endpoint.trim_end_matches('/');
        if trimmed.ends_with("/v1") {
            format!("{}/chat/completions", trimmed)
        } else {
            format!("{}/v1/chat/completions", trimmed)
        }
    };

    Ok((endpoint, body, headers))
}

/// Parses an SSE JSON chunk from NVIDIA NIM (handles text, reasoning, tool arguments, and completion)
pub fn parse_sse_event(data: &str) -> Vec<StreamChunkPayload> {
    let mut events = Vec::new();
    let val: Value = match serde_json::from_str(data) {
        Ok(v) => v,
        Err(_) => return events,
    };

    if let Some(choices) = val.get("choices").and_then(|c| c.as_array()) {
        if let Some(choice) = choices.first() {
            let finish_reason = choice.get("finish_reason").and_then(|f| f.as_str());

            if let Some(delta) = choice.get("delta") {
                // 1. Separate thinking / reasoning streams across all model families
                if let Some(reasoning) = delta
                    .get("reasoning")
                    .or_else(|| delta.get("reasoning_content"))
                    .or_else(|| delta.get("thought"))
                    .or_else(|| delta.get("thinking"))
                    .and_then(|r| r.as_str())
                {
                    if !reasoning.is_empty() {
                        events.push(StreamChunkPayload::thinking(reasoning.to_string()));
                    }
                }

                // 2. Main content stream
                if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                    if !content.is_empty() {
                        events.push(StreamChunkPayload::text(content.to_string()));
                    }
                }

                // 3. Tool calls streaming: emit tool_start for names, tool_args for arguments
                if let Some(tool_calls) = delta.get("tool_calls").and_then(|t| t.as_array()) {
                    for tc in tool_calls {
                        let id = tc.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
                        if let Some(func) = tc.get("function") {
                            let name = func
                                .get("name")
                                .and_then(|n| n.as_str())
                                .unwrap_or("")
                                .to_string();
                            let arguments = func
                                .get("arguments")
                                .and_then(|a| a.as_str())
                                .unwrap_or("")
                                .to_string();

                            if !name.is_empty() {
                                events.push(StreamChunkPayload::tool_start(id, name));
                            }
                            if !arguments.is_empty() {
                                events.push(StreamChunkPayload::tool_args(arguments));
                            }
                        }
                    }
                }
            }

            // Emit tool_complete when tool calling is finalized
            if finish_reason == Some("tool_calls") {
                events.push(StreamChunkPayload::tool_complete());
            }
        }
    }

    if let Some(usage) = val.get("usage") {
        let pt = usage.get("prompt_tokens").and_then(|t| t.as_i64()).unwrap_or(0);
        let ct = usage.get("completion_tokens").and_then(|t| t.as_i64()).unwrap_or(0);
        let tt = usage.get("total_tokens").and_then(|t| t.as_i64()).unwrap_or(pt + ct);
        events.push(StreamChunkPayload {
            event_type: "metadata".to_string(),
            content: Some(format!("Tokens: {} in / {} out", pt, ct)),
            done: Some(false),
            error: None,
            tool_call: None,
            name: None,
            result: None,
            metadata: Some(serde_json::json!({
                "prompt_tokens": pt,
                "completion_tokens": ct,
                "total_tokens": tt,
            })),
        });
    }

    events
}

/// Executes streaming generation on NVIDIA NIM API with automatic 429 retry and tool fallback
pub async fn execute_stream(
    req: &UnifiedRequest,
) -> Result<tokio::sync::mpsc::Receiver<Result<StreamChunkPayload, String>>, String> {
    let (url, body, headers) = build_request(req)?;

    let response;
    let mut attempts = 0;
    let max_attempts = 4;

    loop {
        attempts += 1;
        let resp = NVIDIA_CLIENT
            .post(&url)
            .headers(headers.clone())
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if resp.status().is_success() {
            response = resp;
            break;
        }

        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();

        // 1. Handle 429 rate limit with progressive exponential backoff (2s, 4s, 6s)
        if status.as_u16() == 429 && attempts < max_attempts {
            let wait_duration = tokio::time::Duration::from_secs(attempts * 2);
            tokio::time::sleep(wait_duration).await;
            continue;
        }

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
                map.remove("tool_choice");
            }
            if let Ok(retry_resp) = NVIDIA_CLIENT
                .post(&url)
                .headers(headers.clone())
                .json(&retry_body)
                .send()
                .await
            {
                if retry_resp.status().is_success() {
                    response = retry_resp;
                    break;
                } else {
                    let r_status = retry_resp.status();
                    let r_text = retry_resp.text().await.unwrap_or_default();
                    let err_msg = extract_nvidia_error(&r_text).unwrap_or(r_text);
                    return Err(format!("Request failed ({}): {}", r_status, err_msg));
                }
            } else {
                let err_msg = extract_nvidia_error(&body_text).unwrap_or(body_text);
                return Err(format!("Request failed ({}): {}", status, err_msg));
            }
        }

        let err_msg = extract_nvidia_error(&body_text).unwrap_or(body_text);
        return Err(format!("Request failed ({}): {}", status, err_msg));
    }

    let (tx, rx) = tokio::sync::mpsc::channel(256);

    tauri::async_runtime::spawn(async move {
        let byte_stream = response
            .bytes_stream()
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e));
        let stream_reader = StreamReader::new(byte_stream);
        let mut lines = BufReader::with_capacity(4 * 1024 * 1024, stream_reader).lines();
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

/// Helper to cleanly extract error message from NVIDIA NIM JSON error responses
fn extract_nvidia_error(text: &str) -> Option<String> {
    if let Ok(val) = serde_json::from_str::<Value>(text) {
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

/// Checks API key validity for NVIDIA NIM with 60-second caching and 429 tolerance
pub async fn check_quota(api_key: Option<String>) -> Result<QuotaResponse, String> {
    let key = api_key.unwrap_or_default();
    if let Some(err) = validate_key_format("nvidia-nim", &key) {
        return Ok(QuotaResponse {
            status: "invalid".to_string(),
            valid: false,
            provider: "nvidia-nim".to_string(),
            message: err,
        });
    }

    let cache_key = format!("nvidia:{}", key);
    if let Ok(cache) = KEY_VALIDATION_CACHE.lock() {
        if let Some((valid, timestamp)) = cache.get(&cache_key) {
            if timestamp.elapsed() < std::time::Duration::from_secs(60) {
                return Ok(QuotaResponse {
                    status: if *valid { "ok".into() } else { "invalid".into() },
                    valid: *valid,
                    provider: "nvidia-nim".into(),
                    message: if *valid {
                        "NVIDIA NIM API key is active.".into()
                    } else {
                        "NVIDIA NIM API key appears invalid.".into()
                    },
                });
            }
        }
    }

    let resp = NVIDIA_CLIENT
        .get("https://integrate.api.nvidia.com/v1/models")
        .header("Authorization", format!("Bearer {}", key))
        .send()
        .await;

    // Treat 200 and 429 (rate limit on key auth endpoint) as valid=true
    let valid = resp
        .map(|r| {
            let s = r.status();
            s.is_success() || s.as_u16() == 429
        })
        .unwrap_or(false);

    if let Ok(mut cache) = KEY_VALIDATION_CACHE.lock() {
        cache.insert(cache_key, (valid, std::time::Instant::now()));
    }

    Ok(QuotaResponse {
        status: if valid { "ok".into() } else { "invalid".into() },
        valid,
        provider: "nvidia-nim".into(),
        message: if valid {
            "NVIDIA NIM API key is active.".into()
        } else {
            "NVIDIA NIM API key appears invalid. Check build.nvidia.com.".into()
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_nvidia_models() {
        assert_eq!(
            normalize_nvidia_model("kimi-k3"),
            "moonshotai/kimi-k3"
        );
        assert_eq!(
            normalize_nvidia_model("deepseek-v4-pro-0813"),
            "deepseek-ai/deepseek-v4-pro-0813"
        );
        assert_eq!(
            normalize_nvidia_model("nemotron-3.5-lightning-30b-a3b"),
            "nvidia/nemotron-3.5-lightning-30b-a3b"
        );
        assert_eq!(
            normalize_nvidia_model("muse-glimmer-30b"),
            "meta/muse-glimmer-30b"
        );
        assert_eq!(
            normalize_nvidia_model("laguna-xs-2.1"),
            "poolside/laguna-xs-2.1"
        );
        assert_eq!(
            normalize_nvidia_model("nemotron-3-ultra-550b-a55b"),
            "nvidia/nemotron-3-ultra-550b-a55b"
        );
        assert_eq!(
            normalize_nvidia_model("nemotron-3-nano-omni-30b-a3b-reasoning"),
            "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
        );
        assert_eq!(
            normalize_nvidia_model("gemma-4-31b-it"),
            "google/gemma-4-31b-it"
        );
        assert_eq!(
            normalize_nvidia_model("nemotron-3-super-120b-a12b"),
            "nvidia/nemotron-3-super-120b-a12b"
        );
        assert_eq!(
            normalize_nvidia_model("gpt-oss-20b"),
            "openai/gpt-oss-20b"
        );
        assert_eq!(
            normalize_nvidia_model("llama-3.2-90b-vision-instruct"),
            "meta/llama-3.2-90b-vision-instruct"
        );
        assert_eq!(
            normalize_nvidia_model("llama-3.2-11b-vision-instruct"),
            "meta/llama-3.2-11b-vision-instruct"
        );
    }

    #[test]
    fn test_context_windows() {
        assert_eq!(get_default_context_window("moonshotai/kimi-k3"), 1_048_576);
        assert_eq!(get_default_context_window("deepseek-ai/deepseek-v4-pro-0813"), 1_048_576);
        assert_eq!(get_default_context_window("nvidia/nemotron-3.5-lightning-30b-a3b"), 1_048_576);
        assert_eq!(get_default_context_window("nvidia/nemotron-3-ultra-550b-a55b"), 1_048_576);
        assert_eq!(get_default_context_window("nvidia/nemotron-3-super-120b-a12b"), 1_048_576);
        assert_eq!(get_default_context_window("poolside/laguna-xs-2.1"), 262_144);
        assert_eq!(get_default_context_window("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"), 262_144);
        assert_eq!(get_default_context_window("google/gemma-4-31b-it"), 262_144);
        assert_eq!(get_default_context_window("meta/muse-glimmer-30b"), 131_072);
        assert_eq!(get_default_context_window("openai/gpt-oss-20b"), 131_072);
        assert_eq!(get_default_context_window("meta/llama-3.2-90b-vision-instruct"), 131_072);
        assert_eq!(get_default_context_window("meta/llama-3.2-11b-vision-instruct"), 131_072);
    }

    #[test]
    fn test_capabilities() {
        assert!(supports_tools("moonshotai/kimi-k3"));
        assert!(supports_tools("google/gemma-4-31b-it"));
        assert!(!supports_tools("meta/llama-3.2-90b-vision-instruct"));
        assert!(!supports_tools("meta/llama-3.2-11b-vision-instruct"));

        assert!(supports_structured_output("moonshotai/kimi-k3"));
        assert!(supports_structured_output("deepseek-ai/deepseek-v4-pro-0813"));
        assert!(supports_structured_output("nvidia/nemotron-3.5-lightning-30b-a3b"));
        assert!(supports_structured_output("nvidia/nemotron-3-super-120b-a12b"));
        assert!(supports_structured_output("openai/gpt-oss-20b"));
        assert!(!supports_structured_output("meta/muse-glimmer-30b"));
        assert!(!supports_structured_output("poolside/laguna-xs-2.1"));
        assert!(!supports_structured_output("google/gemma-4-31b-it"));
    }

    #[test]
    fn test_parse_sse_events() {
        let chunk = r#"{"choices":[{"delta":{"content":"Hello world!","reasoning":"Thinking step 1"},"finish_reason":null}]}"#;
        let events = parse_sse_event(chunk);
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].event_type, "thinking");
        assert_eq!(events[0].content, Some("Thinking step 1".to_string()));
        assert_eq!(events[1].event_type, "text");
        assert_eq!(events[1].content, Some("Hello world!".to_string()));

        let tool_chunk = r#"{"choices":[{"delta":{"tool_calls":[{"id":"call_123","function":{"name":"search","arguments":"{\"query\":\"nyx\"}"}}]},"finish_reason":"tool_calls"}]}"#;
        let tool_events = parse_sse_event(tool_chunk);
        assert_eq!(tool_events.len(), 3);
        assert_eq!(tool_events[0].event_type, "tool_start");
        assert_eq!(tool_events[0].name, Some("search".to_string()));
        assert_eq!(tool_events[1].event_type, "tool_call");
        assert_eq!(tool_events[1].content, Some("{\"query\":\"nyx\"}".to_string()));
        assert_eq!(tool_events[2].event_type, "tool_call_complete");
    }
}
