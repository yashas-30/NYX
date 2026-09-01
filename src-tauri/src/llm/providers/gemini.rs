// ─────────────────────────────────────────────────────────────────────────────
// NYX — Google AI Studio / Gemini Provider Orchestrator
// ─────────────────────────────────────────────────────────────────────────────
// Endpoint: https://generativelanguage.googleapis.com/v1beta/models/ (SSE streaming)

use reqwest::{Client, header::{HeaderMap, HeaderValue}};
use serde_json::{json, Value};
use std::sync::LazyLock;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio_util::io::StreamReader;
use futures_util::TryStreamExt;
use crate::llm::types::{UnifiedMessage, UnifiedRequest, StreamChunkPayload};
use super::common::{
    build_fast_http_client, budget_messages, get_content_string,
    validate_key_format, GEMINI_CONTEXT_BUDGET_CHARS, MAX_TOKENS_DEFAULT,
    QuotaResponse, KEY_VALIDATION_CACHE,
};

/// Dedicated high-speed HTTP client for Google AI Studio / Gemini API
static GEMINI_CLIENT: LazyLock<Client> = LazyLock::new(|| build_fast_http_client(64, 120));

/// Normalizes model ID aliases for Gemini API
pub fn normalize_gemini_model(raw: &str) -> &str {
    let trimmed = raw.trim();
    let stripped = trimmed.strip_prefix("models/").unwrap_or(trimmed);
    match stripped {
        "gemini-3.5-flash" => "gemini-3.5-flash-preview",
        "gemini-3.5-flash-lite" => "gemini-3.5-flash-lite-preview",
        "gemini-3.1-flash-lite" => "gemini-3.1-flash-lite-preview",
        "gemini-3.7-flash" => "gemini-3.7-flash-preview",
        other => other,
    }
}

/// Cleans OpenAPI JSON schemas into Gemini's expected subset
fn clean_gemini_schema(val: &mut Value) {
    if let Value::Object(map) = val {
        map.remove("additionalProperties");
        map.remove("$schema");
        map.remove("default");
        map.remove("title");
        map.remove("oneOf");
        map.remove("anyOf");
        map.remove("allOf");
        if let Some(prop_val) = map.get_mut("properties") {
            if let Value::Object(props) = prop_val {
                for (_, v) in props.iter_mut() {
                    clean_gemini_schema(v);
                }
            }
        }
        if let Some(items_val) = map.get_mut("items") {
            clean_gemini_schema(items_val);
        }
    }
}


/// Ensures strict alternation between user and model turns for Gemini
fn sanitize_gemini_turns(messages: Vec<UnifiedMessage>) -> Vec<UnifiedMessage> {
    let messages: Vec<_> = messages
        .into_iter()
        .skip_while(|m| m.role != "user")
        .collect();

    if messages.is_empty() {
        return messages;
    }

    let mut out: Vec<UnifiedMessage> = Vec::new();
    for m in messages {
        let is_tool_turn = m.content.is_array();
        if let Some(last) = out.last_mut() {
            if last.role == m.role && !is_tool_turn && !last.content.is_array() {
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

/// Builds request payload, headers, and URL for Gemini API
pub fn build_request(req: &UnifiedRequest) -> Result<(String, Value, HeaderMap), String> {
    let max_tokens = req.max_tokens.unwrap_or(MAX_TOKENS_DEFAULT);
    let budgeted = budget_messages(&req.messages, GEMINI_CONTEXT_BUDGET_CHARS);
    let sanitized_history = sanitize_gemini_turns(budgeted);

    let is_gemma = req.model_id.to_lowercase().contains("gemma");

    let contents: Vec<Value> = sanitized_history.iter().map(|m| {
        if m.role == "tool" {
            let mut func_parts: Vec<Value> = Vec::new();
            if let Some(arr) = m.content.as_array() {
                for item in arr {
                    let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("tool");
                    let c_val = item.get("content").cloned().unwrap_or(json!({}));
                    func_parts.push(json!({
                        "functionResponse": {
                            "name": name,
                            "response": {
                                "name": name,
                                "content": c_val
                            }
                        }
                    }));
                }
            } else if let Some(obj) = m.content.as_object() {
                let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("tool");
                let c_val = obj.get("content").cloned().unwrap_or(json!({}));
                func_parts.push(json!({
                    "functionResponse": {
                        "name": name,
                        "response": {
                            "name": name,
                            "content": c_val
                        }
                    }
                }));
            } else {
                func_parts.push(json!({
                    "functionResponse": {
                        "name": "tool",
                        "response": {
                            "name": "tool",
                            "content": m.content.clone()
                        }
                    }
                }));
            }

            return json!({
                "role": "user",
                "parts": func_parts
            });
        }

        let role = match m.role.as_str() {
            "user" => "user",
            "assistant" => "model",
            other => other,
        };

        if let Some(arr) = m.content.as_array() {
            let parts: Vec<Value> = arr.iter().filter_map(|part| {
                let ptype = part.get("type")?.as_str()?;
                match ptype {
                    "text" => {
                        let text = part.get("text")?.as_str()?;
                        Some(json!({"text": text}))
                    }
                    "image_url" => {
                        let url = part.get("image_url")?.get("url")?.as_str()?;
                        if let Some(base64_data) = url.strip_prefix("data:") {
                            if let Some((mime_part, b64)) = base64_data.split_once(";base64,") {
                                return Some(json!({
                                    "inlineData": {
                                        "mimeType": mime_part,
                                        "data": b64
                                    }
                                }));
                            }
                        }
                        None
                    }
                    "tool_call" | "function" => {
                        let func = part.get("function")?;
                        let name = func.get("name")?.as_str()?;
                        let args_val = if let Some(s) = func.get("arguments").and_then(|a| a.as_str()) {
                            serde_json::from_str::<Value>(s).unwrap_or(json!({}))
                        } else {
                            func.get("arguments").cloned().unwrap_or(json!({}))
                        };

                        let maybe_sig = part.get("thoughtSignature")
                            .or_else(|| part.get("thought_signature"))
                            .or_else(|| part.get("signature"))
                            .or_else(|| func.get("thoughtSignature"))
                            .or_else(|| func.get("thought_signature"))
                            .and_then(|s| s.as_str());

                        if let Some(sig) = maybe_sig {
                            if !sig.is_empty() {
                                return Some(json!({
                                    "functionCall": {
                                        "name": name,
                                        "args": args_val
                                    },
                                    "thoughtSignature": sig
                                }));
                            }
                        }

                        // If no thought signature exists on this tool call, serialize as text
                        // to avoid Gemini 400 Bad Request ("Function call is missing a thought_signature")
                        Some(json!({
                            "text": format!("[Invoked tool '{}' with arguments: {}]", name, args_val)
                        }))
                    }
                    _ => None,
                }
            }).collect();

            json!({
                "role": role,
                "parts": parts
            })
        } else {
            let text = get_content_string(&m.content);
            json!({
                "role": role,
                "parts": [{"text": text}]
            })
        }
    }).collect();



    let mut generation_config = json!({
        "temperature": req.temperature.unwrap_or(0.7),
        "maxOutputTokens": max_tokens,
    });

    if let Some(top_p) = req.top_p {
        generation_config["topP"] = json!(top_p);
    }
    if let Some(top_k) = req.top_k {
        generation_config["topK"] = json!(top_k);
    }

    let model_id = req.model_id.as_str();
    let is_gemini_thinking_requested = req.reasoning_enabled == Some(true);
    let is_gemini_thinking_disabled = req.reasoning_enabled == Some(false);

    if !is_gemma {
        if is_gemini_thinking_disabled {
            // Explicitly turned OFF: set thinking budget to 0 to disable thinking tokens and optimize latency
            generation_config["thinkingConfig"] = json!({
                "thinkingBudget": 0
            });
        } else if is_gemini_thinking_requested || req.reasoning_enabled.is_none() {
            // Thinking ON: apply selected thinking level budget (0 disables, -1 unconstrained, or explicit limit)
            let budget: i64 = match req.thinking_level.as_deref() {
                Some("low") => 1024,
                Some("medium") => 8192,
                Some("max") | Some("high") => -1,
                Some("minimal") => 512,
                _ => -1, // dynamic unconstrained adaptive budget
            };
            generation_config["thinkingConfig"] = json!({
                "thinkingBudget": budget
            });
        }
    }


    let mut body = json!({
        "contents": contents,
        "generationConfig": generation_config,
    });

    if let Some(ref system_text) = req.system_instruction {
        if !system_text.is_empty() {
            if is_gemma {
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
    }

    // Tools (Not supported on Gemma)
    let mut tools_list: Vec<Value> = Vec::new();
    if !is_gemma {
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
                    tools_list.push(json!({"functionDeclarations": decls}));
                    body["toolConfig"] = json!({"functionCallingConfig": {"mode": "AUTO"}});
                }
            }
        }

        if !tools_list.is_empty() {
            body["tools"] = Value::Array(tools_list);
        }
    }

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", HeaderValue::from_static("application/json"));
    headers.insert("x-goog-api-key",
        HeaderValue::from_str(&req.api_key).map_err(|e| e.to_string())?);

    let raw_base = req.endpoint_override.as_deref()
        .unwrap_or("https://generativelanguage.googleapis.com/v1beta");
    let base = raw_base.trim_end_matches('/');
    let endpoint = if base.ends_with("/models") {
        format!("{}/{}:streamGenerateContent?alt=sse", base, model_id)
    } else {
        format!("{}/models/{}:streamGenerateContent?alt=sse", base, model_id)
    };

    Ok((endpoint, body, headers))
}

/// Parses an SSE JSON chunk from Gemini supporting both generateContent and Interactions API schemas
pub fn parse_sse_event(data: &str) -> Vec<StreamChunkPayload> {
    let mut events = Vec::new();
    let val: Value = match serde_json::from_str(data) {
        Ok(v) => v,
        Err(_) => return events,
    };

    // 1. Check Interactions API format (step.delta, step.start, step.stop, interaction.completed)
    if let Some(event_type) = val.get("event_type").and_then(|t| t.as_str()) {
        match event_type {
            "step.delta" => {
                if let Some(delta) = val.get("delta") {
                    let dtype = delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    if dtype == "thought_summary" {
                        if let Some(text) = delta.get("content").and_then(|c| c.get("text")).and_then(|t| t.as_str()) {
                            events.push(StreamChunkPayload::thinking(text.to_string()));
                        } else if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                            events.push(StreamChunkPayload::thinking(text.to_string()));
                        }
                    } else if dtype == "text" {
                        if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                            events.push(StreamChunkPayload::text(text.to_string()));
                        }
                    } else if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                        events.push(StreamChunkPayload::text(text.to_string()));
                    }
                }
            }
            "step.start" => {
                if let Some(step) = val.get("step") {
                    let stype = step.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    if stype == "thought" {
                        if let Some(summary_arr) = step.get("summary").and_then(|s| s.as_array()) {
                            for block in summary_arr {
                                if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                    events.push(StreamChunkPayload::thinking(text.to_string()));
                                }
                            }
                        }
                    } else if stype == "model_output" {
                        if let Some(content_arr) = step.get("content").and_then(|c| c.as_array()) {
                            for block in content_arr {
                                if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                    events.push(StreamChunkPayload::text(text.to_string()));
                                }
                            }
                        }
                    }
                }
            }
            "interaction.completed" => {
                if let Some(usage) = val.get("interaction").and_then(|i| i.get("usage")) {
                    let pt = usage.get("total_input_tokens").and_then(|t| t.as_i64()).unwrap_or(0);
                    let ot = usage.get("total_output_tokens").and_then(|t| t.as_i64()).unwrap_or(0);
                    let tt = usage.get("total_thought_tokens").and_then(|t| t.as_i64()).unwrap_or(0);
                    events.push(StreamChunkPayload {
                        event_type: "metadata".to_string(),
                        content: Some(format!("Tokens: {} in / {} out ({} thought)", pt, ot, tt)),
                        done: Some(false),
                        error: None,
                        tool_call: None,
                        name: None,
                        result: None,
                        metadata: Some(serde_json::json!({ "prompt_tokens": pt, "completion_tokens": ot, "thought_tokens": tt })),
                    });
                }
            }
            _ => {}
        }
        if !events.is_empty() {
            return events;
        }
    }

    // 2. Check generateContent API format (candidates -> content -> parts)
    let candidates = val.get("candidates").and_then(|c| c.as_array());
    let first_candidate = candidates.and_then(|arr| arr.first());

    if let Some(cand) = first_candidate {
        if let Some(parts) = cand.get("content").and_then(|c| c.get("parts")).and_then(|p| p.as_array()) {
            for part in parts {
                let is_thought = part.get("thought").and_then(|t| t.as_bool()).unwrap_or(false)
                    || part.get("type").and_then(|t| t.as_str()) == Some("thought");
                if is_thought {
                    if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                        events.push(StreamChunkPayload::thinking(text.to_string()));
                    }
                } else if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                    events.push(StreamChunkPayload::text(text.to_string()));
                }

                if let Some(func_call) = part.get("functionCall") {
                    let name = func_call.get("name").and_then(|n| n.as_str()).unwrap_or_default().to_string();
                    let args = func_call.get("args").cloned().unwrap_or(json!({}));
                    let mut start_payload = StreamChunkPayload::tool_start(name.clone(), name.clone());
                    let sig = part.get("thoughtSignature")
                        .or_else(|| part.get("thought_signature"))
                        .or_else(|| part.get("signature"))
                        .or_else(|| func_call.get("thoughtSignature"))
                        .or_else(|| func_call.get("thought_signature"))
                        .and_then(|s| s.as_str());
                    if let Some(s) = sig {
                        start_payload.metadata = Some(json!({ "thoughtSignature": s, "thought_signature": s }));
                    }
                    events.push(start_payload);
                    events.push(StreamChunkPayload::tool_args(args.to_string()));
                    events.push(StreamChunkPayload::tool_complete());
                }
            }
        }
    }

    if let Some(usage) = val.get("usageMetadata") {
        let pt = usage.get("promptTokenCount").and_then(|t| t.as_i64()).unwrap_or(0);
        let ct = usage.get("candidatesTokenCount").and_then(|t| t.as_i64()).unwrap_or(0);
        let tt = usage.get("candidatesThinkingTokenCount").and_then(|t| t.as_i64()).unwrap_or(0);
        events.push(StreamChunkPayload {
            event_type: "metadata".to_string(),
            content: Some(format!("Tokens: {} in / {} out", pt, ct)),
            done: Some(false),
            error: None,
            tool_call: None,
            name: None,
            result: None,
            metadata: Some(serde_json::json!({ "prompt_tokens": pt, "completion_tokens": ct, "thought_tokens": tt })),
        });
    }

    events
}

/// Executes streaming generation on Google AI Studio / Gemini API with smart resilient retries
pub async fn execute_stream(
    req: &UnifiedRequest,
) -> Result<tokio::sync::mpsc::Receiver<Result<StreamChunkPayload, String>>, String> {
    let (url, body, headers) = build_request(req)?;

    let mut attempts = 0;
    let max_attempts = 3;
    let mut current_body = body.clone();
    let mut final_response = None;

    while attempts < max_attempts {
        attempts += 1;
        let resp_res = GEMINI_CLIENT.post(&url)
            .headers(headers.clone())
            .json(&current_body)
            .send()
            .await;

        match resp_res {
            Ok(resp) => {
                if resp.status().is_success() {
                    final_response = Some(resp);
                    break;
                }

                let status = resp.status();
                let body_text = resp.text().await.unwrap_or_default();

                // 1. Recover if thinkingConfig is unsupported on this specific model
                if (status.as_u16() == 400 || body_text.contains("Thinking budget is not supported") || body_text.contains("thinkingConfig"))
                    && current_body.get("generationConfig").and_then(|g| g.get("thinkingConfig")).is_some()
                {
                    if let Some(gen) = current_body.get_mut("generationConfig").and_then(|g| g.as_object_mut()) {
                        gen.remove("thinkingConfig");
                    }
                    continue;
                }

                // 2. Recover on 429 (Resource Exhausted) or 503 (Model Overloaded / High Demand)
                let is_transient_overload = status.as_u16() == 429
                    || status.as_u16() == 503
                    || body_text.contains("UNAVAILABLE")
                    || body_text.contains("overloaded")
                    || body_text.contains("RESOURCE_EXHAUSTED");

                if is_transient_overload && attempts < max_attempts {
                    let mut delay_secs = attempts as u64;
                    if let Ok(err_json) = serde_json::from_str::<Value>(&body_text) {
                        if let Some(details) = err_json.get("error").and_then(|e| e.get("details")).and_then(|d| d.as_array()) {
                            for d in details {
                                if let Some(delay_str) = d.get("retryDelay").and_then(|r| r.as_str()) {
                                    if let Some(num_str) = delay_str.strip_suffix('s') {
                                        if let Ok(s) = num_str.parse::<u64>() {
                                            delay_secs = s.min(4);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    tokio::time::sleep(tokio::time::Duration::from_secs(delay_secs.max(1))).await;
                    continue;
                }

                // Friendly diagnostic formatting
                if status.as_u16() == 429 || body_text.contains("RESOURCE_EXHAUSTED") {
                    return Err("Google Gemini free-tier rate limit or quota reached on this model. Try switching to Gemini 3.5 Flash or retry in 5-10 seconds.".to_string());
                } else if status.as_u16() == 503 || body_text.contains("UNAVAILABLE") || body_text.contains("overloaded") {
                    return Err("Google Gemini servers are currently in high demand for this preview model. Please retry in a few moments or switch to Gemini 3.5 Flash.".to_string());
                } else {
                    return Err(format!("Google Gemini request failed ({}): {}", status, body_text));
                }
            }
            Err(e) => {
                if attempts < max_attempts {
                    tokio::time::sleep(tokio::time::Duration::from_millis(500 * attempts as u64)).await;
                    continue;
                }
                return Err(format!("Network connection to Google Gemini failed: {}", e));
            }
        }
    }

    let final_response = match final_response {
        Some(r) => r,
        None => return Err("Gemini request timed out after retries.".to_string()),
    };

    let (tx, rx) = tokio::sync::mpsc::channel(256);

    tauri::async_runtime::spawn(async move {
        let byte_stream = final_response.bytes_stream().map_err(|e| {
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

/// Checks API key validity for Gemini with 5-minute in-memory caching
pub async fn check_quota(api_key: Option<String>) -> Result<QuotaResponse, String> {
    let key = api_key.unwrap_or_default();
    if let Some(err) = validate_key_format("gemini", &key) {
        return Ok(QuotaResponse {
            status: "invalid".to_string(),
            valid: false,
            provider: "gemini".to_string(),
            message: err,
        });
    }

    let cache_key = format!("gemini:{}", key);
    if let Ok(cache) = KEY_VALIDATION_CACHE.lock() {
        if let Some((valid, timestamp)) = cache.get(&cache_key) {
            // Reduced from 300s → 60s so transient "invalid" entries self-heal quickly
            if timestamp.elapsed() < std::time::Duration::from_secs(60) {
                return Ok(QuotaResponse {
                    status: if *valid { "ok".into() } else { "invalid".into() },
                    valid: *valid,
                    provider: "gemini".into(),
                    message: if *valid { "Google API key is valid.".into() } else { "Google API key appears invalid.".into() },
                });
            }
        }
    }

    let url = format!("https://generativelanguage.googleapis.com/v1beta/models?key={}", key);
    let resp = GEMINI_CLIENT.get(&url).send().await;
    // A 429 (RESOURCE_EXHAUSTED) on the models-list endpoint means the key IS valid
    // but the validation call itself was rate-limited. Never cache a 429 as invalid.
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
        provider: "gemini".into(),
        message: if valid { "Google API key is valid.".into() } else { "Google API key appears invalid. Check aistudio.google.com.".into() },
    })
}
