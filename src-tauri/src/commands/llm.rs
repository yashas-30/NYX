use tauri::AppHandle;
use serde::{Deserialize, Serialize};
use reqwest::{Client, header::{HeaderMap, HeaderValue}};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio_util::io::StreamReader;
use futures_util::TryStreamExt;
use std::sync::LazyLock;

// ── Max token defaults per provider (all raised from the broken 4096 cap) ──

const MAX_TOKENS_DEFAULT: u32 = 8_192;

// Initialize tiktoken once per process. Creating a CoreBPE is expensive (∼10ms + disk IO);
// re-doing it on every request is a measurable latency regression.
static BPE_TOKENIZER: LazyLock<tiktoken_rs::CoreBPE> = LazyLock::new(|| {
    tiktoken_rs::cl100k_base().expect("Failed to load cl100k_base tokenizer")
});

#[derive(Deserialize, Debug, Clone)]
pub struct UnifiedMessage {
    pub role: String,
    pub content: serde_json::Value,
}

fn get_content_string(val: &serde_json::Value) -> String {
    match val {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(arr) => {
            let mut text = String::new();
            for item in arr {
                if let Some(t) = item.get("text").and_then(|v| v.as_str()) {
                    text.push_str(t);
                }
            }
            text
        }
        other => other.to_string(),
    }
}

#[derive(Deserialize, Debug)]
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
    pub reasoning_effort: Option<String>,
    #[serde(default)]
    pub event_name: Option<String>,
    #[serde(default)]
    pub tools: Option<Value>,
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

pub async fn execute_llm_stream(
    req: &UnifiedRequest,
) -> Result<tokio::sync::mpsc::Receiver<Result<StreamChunkPayload, String>>, String> {
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", HeaderValue::from_static("application/json"));

    let max_tokens = req.max_tokens.unwrap_or(MAX_TOKENS_DEFAULT);

    let (url, body, provider_type) = match req.provider.as_str() {
        "nyx-native" | "openrouter" => {
            let mut msgs = vec![];
            
            // Map reasoning effort to a system instruction directive for local models
            let mut final_sys = req.system_instruction.clone().unwrap_or_default();
            if let Some(effort) = &req.reasoning_effort {
                let directive = match effort.to_lowercase().as_str() {
                    "low" => " Keep your reasoning brief and direct.",
                    "medium" => " Think step-by-step before answering.",
                    "high" => " Think deeply and comprehensively, exploring multiple angles before answering.",
                    "max" => " Conduct an exhaustive analysis. Double check all logic and reasoning. Provide a very lengthy and detailed thought process.",
                    _ => ""
                };
                if !directive.is_empty() {
                    if !final_sys.is_empty() {
                        final_sys.push_str("\n\n");
                    }
                    final_sys.push_str(&format!("Reasoning Effort Directive:{}", directive));
                }
            }

            if !final_sys.is_empty() {
                msgs.push(json!({"role": "system", "content": final_sys}));
            }
            
            // Slice history to budget
            let mut current_tokens = 0;
            let mut budget_msgs = vec![];
            
            let bpe = &*BPE_TOKENIZER;
            for m in req.messages.iter().rev() {
                let msg_content_str = get_content_string(&m.content);
                let msg_tokens = bpe.encode_with_special_tokens(&msg_content_str).len();
                if current_tokens + msg_tokens > 128_000 {
                    if budget_msgs.is_empty() {
                        // Always include the most recent message even if it exceeds the budget
                        budget_msgs.push(m.clone());
                    }
                    break;
                }
                current_tokens += msg_tokens;
                budget_msgs.push(m.clone());
            }
            budget_msgs.reverse();
            
            for m in &budget_msgs {
                if m.role == "assistant" && m.content.is_array() {
                    let mut tool_calls = vec![];
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
                } else if m.role == "tool" && m.content.is_array() {
                    if let Some(arr) = m.content.as_array() {
                        if let Some(item) = arr.first() {
                            let tool_call_id = item.get("tool_call_id").and_then(|id| id.as_str()).unwrap_or("");
                            let content = item.get("content").and_then(|c| c.as_str()).unwrap_or("");
                            msgs.push(json!({"role": "tool", "tool_call_id": tool_call_id, "content": content}));
                            continue;
                        }
                    }
                }
                
                let content_val = m.content.clone();
                msgs.push(json!({"role": m.role, "content": content_val}));
            }

            let mut body = json!({
                "model": req.model_id,
                "messages": msgs,
                "temperature": req.temperature.unwrap_or(0.7),
                "max_tokens": max_tokens,
                "stream": true,
            });

            if req.provider == "openrouter" {
                let lower_id = req.model_id.to_lowercase();
                let is_reasoning = lower_id.contains("r1") 
                    || lower_id.contains("reasoning") 
                    || lower_id.contains("thinking") 
                    || lower_id.contains("o1") 
                    || lower_id.contains("o3");
                
                if is_reasoning {
                    if let Some(effort) = &req.reasoning_effort {
                        body["reasoning_effort"] = json!(effort);
                    }
                }
                
                if let Some(tools) = &req.tools {
                    if let Some(arr) = tools.as_array() {
                        if !arr.is_empty() {
                            body["tools"] = tools.clone();
                        }
                    }
                }
            }

            match req.provider.as_str() {
                "openrouter" => {
                    headers.insert(
                        "Authorization",
                        HeaderValue::from_str(&format!("Bearer {}", req.api_key))
                            .map_err(|e| e.to_string())?,
                    );
                    if req.provider == "openrouter" {
                        headers.insert("HTTP-Referer", HeaderValue::from_static("https://nyx.local"));
                        headers.insert("X-Title", HeaderValue::from_static("NYX"));
                    }
                }
                _ => {} // nyx-native — no auth header
            }

            let endpoint = req.endpoint_override.clone().unwrap_or_else(|| {
                match req.provider.as_str() {
                    "openrouter" => "https://openrouter.ai/api/v1/chat/completions".to_string(),
                    "nyx-native" => "http://127.0.0.1:8080/v1/chat/completions".to_string(),
                    _ => "http://127.0.0.1:8080/v1/chat/completions".to_string(),
                }
            });

            (endpoint, body, req.provider.clone())
        }

        // Both "gemini" and "gemma" models use the Google AI Studio (Gemini) API endpoint.
        "gemini" | "gemma" => {
            let mut contents = vec![];
            
            // Slice history to budget using a char-count heuristic for Gemini.
            // Gemini uses SentencePiece (not BPE/cl100k), so we approximate:
            // ~4 chars per token gives us a ~512k-char context window budget.
            let char_budget = 128_000usize * 4; // ≈ 128k tokens
            let mut current_chars = 0usize;
            let mut budget_msgs = vec![];
            
            for m in req.messages.iter().rev() {
                let msg_chars = get_content_string(&m.content).len();
                if current_chars + msg_chars > char_budget {
                    if budget_msgs.is_empty() {
                        budget_msgs.push(m.clone());
                    }
                    break;
                }
                current_chars += msg_chars;
                budget_msgs.push(m.clone());
            }
            budget_msgs.reverse();
            
            for m in &budget_msgs {
                if m.role == "assistant" && m.content.is_array() {
                    if let Some(arr) = m.content.as_array() {
                        if let Some(item) = arr.first() {
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
                } else if m.role == "tool" && m.content.is_array() {
                    if let Some(arr) = m.content.as_array() {
                        if let Some(item) = arr.first() {
                            let _tool_call_id = item.get("tool_call_id").and_then(|id| id.as_str()).unwrap_or("");
                            let name = item.get("name").and_then(|n| n.as_str()).unwrap_or("");
                            let content_str = item.get("content").and_then(|c| c.as_str()).unwrap_or("");
                            
                            // Try parsing content_str as JSON, otherwise wrap in an object
                            let mut resp_obj: Value = serde_json::from_str(content_str).unwrap_or(json!({ "result": content_str }));
                            // Sometimes tools return arrays or plain strings. Gemini requires a JSON object.
                            if !resp_obj.is_object() {
                                resp_obj = json!({ "result": resp_obj });
                            }
                            
                            contents.push(json!({
                                "role": "user", // or "function" depending on Gemini version, "user" works for REST
                                "parts": [{"functionResponse": {"name": name, "response": resp_obj}}]
                            }));
                            continue;
                        }
                    }
                }

                let role = if m.role == "assistant" { "model" } else { "user" };
                
                let mut parts_arr = vec![];
                if let Some(arr) = m.content.as_array() {
                    for item in arr {
                        if let Some(t) = item.get("type").and_then(|t| t.as_str()) {
                            if t == "text" {
                                if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                                    parts_arr.push(json!({"text": text}));
                                }
                            } else if t == "image_url" {
                                if let Some(url) = item.get("image_url").and_then(|o| o.get("url")).and_then(|v| v.as_str()) {
                                    // Parse data URL: data:image/jpeg;base64,...
                                    if url.starts_with("data:") {
                                        let parts: Vec<&str> = url.splitn(2, ',').collect();
                                        if parts.len() == 2 {
                                            let meta = parts[0]; // data:image/jpeg;base64
                                            let data = parts[1];
                                            let mime_part = meta.strip_prefix("data:").unwrap_or("");
                                            let mime_type = mime_part.strip_suffix(";base64").unwrap_or(mime_part);
                                            parts_arr.push(json!({
                                                "inlineData": {
                                                    "mimeType": mime_type,
                                                    "data": data
                                                }
                                            }));
                                        }
                                    }
                                }
                            }
                        } else if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                             parts_arr.push(json!({"text": text}));
                        }
                    }
                } else {
                    parts_arr.push(json!({"text": get_content_string(&m.content)}));
                }

                if parts_arr.is_empty() {
                    parts_arr.push(json!({"text": get_content_string(&m.content)}));
                }

                contents.push(json!({
                    "role": role,
                    "parts": parts_arr
                }));
            }

            let mut body = json!({
                "contents": contents,
                "generationConfig": {
                    "temperature": req.temperature.unwrap_or(0.7),
                    "maxOutputTokens": max_tokens
                }
            });

            if let Some(tools) = &req.tools {
                if let Some(tool_arr) = tools.as_array() {
                    let mut function_declarations = vec![];
                    for t in tool_arr {
                        if let Some(func) = t.get("function") {
                            function_declarations.push(func.clone());
                        }
                    }
                    if !function_declarations.is_empty() {
                        body["tools"] = json!([{
                            "functionDeclarations": function_declarations
                        }]);
                    }
                }
            }

            let mut final_sys = req.system_instruction.clone().unwrap_or_default();
            if let Some(effort) = &req.reasoning_effort {
                let directive = match effort.to_lowercase().as_str() {
                    "low" => " Keep your reasoning brief and direct.",
                    "medium" => " Think step-by-step before answering.",
                    "high" => " Think deeply and comprehensively, exploring multiple angles before answering.",
                    "max" => " Conduct an exhaustive analysis. Double check all logic and reasoning. Provide a very lengthy and detailed thought process.",
                    _ => ""
                };
                if !directive.is_empty() {
                    if !final_sys.is_empty() {
                        final_sys.push_str("\n\n");
                    }
                    final_sys.push_str(&format!("Reasoning Effort Directive:{}", directive));
                }
            }

            if !final_sys.is_empty() {
                let is_gemma = req.model_id.to_lowercase().contains("gemma");
                if is_gemma {
                    if let Some(first) = contents.first_mut() {
                        if let Some(parts) = first.get_mut("parts").and_then(|p| p.as_array_mut()) {
                            if let Some(first_part) = parts.first_mut() {
                                if let Some(text) = first_part.get_mut("text").and_then(|t| t.as_str()) {
                                    *first_part = json!({"text": format!("System Instruction:\n{}\n\n{}", final_sys, text)});
                                }
                            }
                        }
                    } else {
                        contents.push(json!({
                            "role": "user",
                            "parts": [{"text": format!("System Instruction:\n{}", final_sys)}]
                        }));
                    }
                } else {
                    body["systemInstruction"] = json!({
                        "parts": [{"text": final_sys}]
                    });
                }
            }

            // API key goes in the x-goog-api-key header — NOT the URL query string.
            headers.insert(
                "x-goog-api-key",
                HeaderValue::from_str(&req.api_key).map_err(|e| e.to_string())?,
            );

            let base = req.endpoint_override.clone().unwrap_or_else(|| {
                "https://generativelanguage.googleapis.com/v1beta/models/".to_string()
            });

            // Key is now in the header — no &key= in the URL
            let endpoint = format!(
                "{}{}:streamGenerateContent?alt=sse",
                base, req.model_id
            );

            (endpoint, body, "gemini".to_string())
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

    let provider_type = provider_type.to_string();

    let (tx, rx) = tokio::sync::mpsc::channel(100);

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
                                let _ = tx.send(Ok(StreamChunkPayload {
                                    event_type: "done".to_string(),
                                    content: None,
                                    done: Some(true),
                                    error: None,
                                    tool_call: None,
                                    name: None,
                                    result: None,
                                    metadata: None,
                                })).await;
                                break;
                            }

                            for event in extract_stream_event(&data, &provider_type) {
                                match event {
                                    StreamEventParse::Text(text) => {
                                        if !text.is_empty() {
                                            let _ = tx.send(Ok(StreamChunkPayload {
                                                event_type: "text".to_string(),
                                                content: Some(text),
                                                done: Some(false),
                                                error: None,
                                                tool_call: None,
                                                name: None,
                                                result: None,
                                                metadata: None,
                                            })).await;
                                        }
                                    }
                                    StreamEventParse::Reasoning(reasoning) => {
                                        if !reasoning.is_empty() {
                                            let _ = tx.send(Ok(StreamChunkPayload {
                                                event_type: "thinking".to_string(),
                                                content: Some(reasoning),
                                                done: Some(false),
                                                error: None,
                                                tool_call: None,
                                                name: None,
                                                result: None,
                                                metadata: None,
                                            })).await;
                                        }
                                    }
                                    StreamEventParse::ToolCallStart { id, name } => {
                                        let _ = tx.send(Ok(StreamChunkPayload {
                                            event_type: "tool_start".to_string(),
                                            content: None,
                                            done: Some(false),
                                            error: None,
                                            tool_call: Some(json!({"id": id})),
                                            name: Some(name),
                                            result: None,
                                            metadata: None,
                                        })).await;
                                    }
                                    StreamEventParse::ToolCallArgs { args } => {
                                        let _ = tx.send(Ok(StreamChunkPayload {
                                            event_type: "tool_call".to_string(),
                                            content: Some(args),
                                            done: Some(false),
                                            error: None,
                                            tool_call: None,
                                            name: None,
                                            result: None,
                                            metadata: None,
                                        })).await;
                                    }
                                    StreamEventParse::ToolCallComplete => {
                                        let _ = tx.send(Ok(StreamChunkPayload {
                                            event_type: "tool_call_complete".to_string(),
                                            content: None,
                                            done: Some(false),
                                            error: None,
                                            tool_call: None,
                                            name: None,
                                            result: None,
                                            metadata: None,
                                        })).await;
                                    }
                                    StreamEventParse::Error(err_msg) => {
                                        let _ = tx.send(Ok(StreamChunkPayload {
                                            event_type: "error".to_string(),
                                            content: None,
                                            done: Some(true),
                                            error: Some(err_msg),
                                            tool_call: None,
                                            name: None,
                                            result: None,
                                            metadata: None,
                                        })).await;
                                        break; // Stop processing on error
                                    }
                                    StreamEventParse::None => {}
                                }
                            }
                        }
                        continue;
                    }

                    // Strip "data: " prefix
                    if let Some(payload) = line.strip_prefix("data: ") {
                        if payload == "[DONE]" {
                            let _ = tx.send(Ok(StreamChunkPayload {
                                event_type: "done".to_string(),
                                content: None,
                                done: Some(true),
                                error: None,
                                tool_call: None,
                                name: None,
                                result: None,
                                metadata: None,
                            })).await;
                            break;
                        }
                        if !buffer.is_empty() {
                            buffer.push('\n');
                        }
                        buffer.push_str(payload);
                    } else if let Some(stripped) = line.strip_prefix("data:") {
                        // Handle "data:" without space
                        if !buffer.is_empty() {
                            buffer.push('\n');
                        }
                        buffer.push_str(stripped.trim());
                    }
                    // Ignore "event:", "id:", "retry:" lines
                }
                Ok(None) => {
                    // Stream ended cleanly — flush any remaining buffer before sending done.
                    // Some providers close the connection without a trailing blank line,
                    // which would otherwise silently drop the last chunk (BUG-7 fix).
                    if !buffer.is_empty() {
                        let data = buffer.trim().to_string();
                        buffer.clear();
                        if data != "[DONE]" {
                            for event in extract_stream_event(&data, &provider_type) {
                                match event {
                                    StreamEventParse::Text(text) => {
                                        if !text.is_empty() {
                                            let _ = tx.send(Ok(StreamChunkPayload {
                                                event_type: "text".to_string(),
                                                content: Some(text),
                                                done: Some(false),
                                                error: None,
                                                tool_call: None,
                                                name: None,
                                                result: None,
                                                metadata: None,
                                            })).await;
                                        }
                                    }
                                    StreamEventParse::Reasoning(reasoning) => {
                                        if !reasoning.is_empty() {
                                            let _ = tx.send(Ok(StreamChunkPayload {
                                                event_type: "thinking".to_string(),
                                                content: Some(reasoning),
                                                done: Some(false),
                                                error: None,
                                                tool_call: None,
                                                name: None,
                                                result: None,
                                                metadata: None,
                                            })).await;
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                    let _ = tx.send(Ok(StreamChunkPayload {
                        event_type: "done".to_string(),
                        content: None,
                        done: Some(true),
                        error: None,
                        tool_call: None,
                        name: None,
                        result: None,
                        metadata: None,
                    })).await;
                    break;
                }
                Err(e) => {
                    let _ = tx.send(Err(e.to_string())).await;
                    break;
                }
            }
        }
    });

    Ok(rx)
}

#[tauri::command]
pub async fn llm_stream_request(
    app: AppHandle,
    req: UnifiedRequest,
    on_event: tauri::ipc::Channel<StreamChunkPayload>,
) -> Result<(), String> {
    let event_name = req.event_name.clone();
    let mut rx = execute_llm_stream(&req).await?;
    
    use tauri::Listener;
    let cancel_event_name = format!("cancel_{}", event_name.clone().unwrap_or_default());
    let (cancel_tx, mut cancel_rx) = tokio::sync::mpsc::channel::<()>(1);
    
    let cancel_id = app.listen(cancel_event_name, move |_| {
        let _ = cancel_tx.try_send(());
    });
    
    loop {
        tokio::select! {
            msg = rx.recv() => {
                match msg {
                    Some(Ok(payload)) => {
                        let _ = on_event.send(payload.clone());
                        if let Some(ref ev) = event_name {
                            use tauri::Emitter;
                            let _ = app.emit(ev, payload);
                        }
                    }
                    Some(Err(e)) => {
                        let err_payload = StreamChunkPayload {
                            event_type: "error".to_string(),
                            content: None,
                            done: Some(true),
                            error: Some(e.clone()),
                            tool_call: None,
                            name: None,
                            result: None,
                            metadata: None,
                        };
                        let _ = on_event.send(err_payload.clone());
                        if let Some(ref ev) = event_name {
                            use tauri::Emitter;
                            let _ = app.emit(ev, err_payload);
                        }
                    }
                    None => break, // rx dropped, stream finished normally
                }
            }
            _ = cancel_rx.recv() => {
                // Cancel requested by frontend, break loop
                // Dropping `rx` here will cause `tx.send` in `execute_llm_stream` to fail,
                // which breaks its loop and drops the reqwest response stream!
                break;
            }
        }
    }
    
    app.unlisten(cancel_id);
    Ok(())
}

pub enum StreamEventParse {
    Text(String),
    Reasoning(String),
    ToolCallStart { id: String, name: String },
    ToolCallArgs { args: String },
    ToolCallComplete,
    Error(String),
    None,
}

pub fn extract_stream_event(data: &str, provider_type: &str) -> Vec<StreamEventParse> {
    let v: Value = match serde_json::from_str(data) {
        Ok(val) => val,
        Err(_) => return vec![StreamEventParse::None],
    };

    if let Some(error) = v.get("error") {
        let msg = if let Some(msg) = error.get("message").and_then(|m| m.as_str()) {
            msg.to_string()
        } else if let Some(error_obj) = error.as_object() {
            serde_json::to_string(error_obj).unwrap_or_else(|_| "Unknown API Error".to_string())
        } else if let Some(error_str) = error.as_str() {
            error_str.to_string()
        } else {
            "Unknown API Error".to_string()
        };
        return vec![StreamEventParse::Error(msg)];
    }

    let mut events = Vec::new();

    match provider_type {
        "openrouter" | "nyx-native" => {
            if let Some(choices) = v.get("choices").and_then(|c| c.as_array()) {
                if let Some(choice) = choices.first() {
                    if let Some(delta) = choice.get("delta").and_then(|d| d.as_object()) {
                        // 1. Regular text content
                        if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                            if !content.is_empty() {
                                events.push(StreamEventParse::Text(content.to_string()));
                            }
                        }
                        // 2. Reasoning tokens
                        let reasoning = delta.get("reasoning")
                            .or_else(|| delta.get("reasoning_content"))
                            .and_then(|r| r.as_str());
                        if let Some(r) = reasoning {
                            if !r.is_empty() {
                                events.push(StreamEventParse::Reasoning(r.to_string()));
                            }
                        }
                        // 3. Tool calls
                        if let Some(tool_calls) = delta.get("tool_calls").and_then(|tc| tc.as_array()) {
                            for tc in tool_calls {
                                if let Some(func) = tc.get("function").and_then(|f| f.as_object()) {
                                    if let Some(name) = func.get("name").and_then(|n| n.as_str()) {
                                        let id = tc.get("id").and_then(|i| i.as_str()).unwrap_or("");
                                        events.push(StreamEventParse::ToolCallStart {
                                            id: id.to_string(),
                                            name: name.to_string(),
                                        });
                                    }
                                    if let Some(args) = func.get("arguments").and_then(|a| a.as_str()) {
                                        events.push(StreamEventParse::ToolCallArgs {
                                            args: args.to_string(),
                                        });
                                    }
                                }
                            }
                        }
                    }
                    // Handle finish_reason after delta is processed
                    if let Some(finish_reason) = choice.get("finish_reason").and_then(|f| f.as_str()) {
                        if finish_reason == "tool_calls" {
                            events.push(StreamEventParse::ToolCallComplete);
                        } else if finish_reason == "length" {
                            events.push(StreamEventParse::Error("Generation stopped: Maximum token limit reached.".to_string()));
                        } else if finish_reason == "content_filter" {
                            events.push(StreamEventParse::Error("Generation blocked by provider safety filters.".to_string()));
                        }
                    }
                }
            }
        }


        "gemini" => {
            if let Some(candidates) = v.get("candidates").and_then(|c| c.as_array()) {
                if let Some(candidate) = candidates.first() {
                    if let Some(content) = candidate.get("content") {
                        if let Some(parts) = content.get("parts").and_then(|p| p.as_array()) {
                            for part in parts {
                                let is_thought = part.get("thought")
                                    .and_then(|t| t.as_bool())
                                    .unwrap_or(false);

                                if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                    if !text.is_empty() {
                                        if is_thought {
                                            events.push(StreamEventParse::Reasoning(text.to_string()));
                                        } else {
                                            events.push(StreamEventParse::Text(text.to_string()));
                                        }
                                    }
                                } else if let Some(func_call) = part.get("functionCall") {
                                    if let Some(name) = func_call.get("name").and_then(|n| n.as_str()) {
                                        events.push(StreamEventParse::ToolCallStart {
                                            id: format!("call_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()),
                                            name: name.to_string()
                                        });
                                        if let Some(args) = func_call.get("args") {
                                            events.push(StreamEventParse::ToolCallArgs {
                                                args: serde_json::to_string(args).unwrap_or_else(|_| "{}".to_string())
                                            });
                                            events.push(StreamEventParse::ToolCallComplete);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if let Some(finish_reason) = candidate.get("finishReason").and_then(|f| f.as_str()) {
                        if finish_reason == "SAFETY" || finish_reason == "BLOCKLIST" || finish_reason == "PROHIBITED_CONTENT" {
                            events.push(StreamEventParse::Error(format!("Generation blocked by provider safety filters ({})", finish_reason)));
                        } else if finish_reason == "MAX_TOKENS" {
                            events.push(StreamEventParse::Error("Generation stopped: Maximum token limit reached.".to_string()));
                        } else if finish_reason == "RECITATION" {
                            events.push(StreamEventParse::Error("Generation blocked: Recitation of copyrighted material.".to_string()));
                        } else if finish_reason == "OTHER" {
                            events.push(StreamEventParse::Error("Generation stopped: Provider error (OTHER).".to_string()));
                        }
                    }
                }
            }
        }

        _ => {}
    }
    if events.is_empty() {
        events.push(StreamEventParse::None);
    }
    events
}

#[derive(Serialize)]
pub struct QuotaResponse {
    pub status: String,
    pub valid: bool,
    pub provider: String,
}

#[tauri::command]
pub async fn get_models_quota(provider: String, _api_key: Option<String>) -> Result<QuotaResponse, String> {
    // In the future, this can actually make a request to the provider's /usage endpoint to verify the key and get quota.
    // For now, we return a mock successful response to keep the frontend happy and functional.
    Ok(QuotaResponse {
        status: "ok".to_string(),
        valid: true,
        provider,
    })
}
