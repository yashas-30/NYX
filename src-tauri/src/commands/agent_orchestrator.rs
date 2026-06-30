use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, State};
use crate::AppState;
use std::sync::atomic::Ordering;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StreamContext {
    pub request_id: String,
    pub session_id: String,
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub max_iterations: Option<usize>,
    pub system_instruction: Option<String>,
    pub agent_type: Option<String>,
    pub is_fast_intent: Option<bool>,
}



/// Main agent orchestration command.
///
/// Improvements over the original:
///  • Fix 1  — no debug file write (API key leak removed)
///  • Fix 3  — tool calls execute in PARALLEL via join_all
///  • Fix 4  — 5-minute hard wall-clock timeout
///  • Fix 7  — Gemini API key sent as x-goog-api-key header, not in URL
///  • Fix 8  — tool errors detected via Result<>, not string sniffing
///  • Fix 11 — per-run cancellation via AtomicBool in AppState
///  • Fix 12 — 429/503 retries with exponential backoff
///  • Fix 13 — direct fast path for local model chat (bypasses Conductor Actor machinery)
#[tauri::command]
pub async fn orchestrate_supervisor(
    app: AppHandle,
    app_state: State<'_, AppState>,
    messages: Vec<Value>,
    context: StreamContext,
    event_name: String,
) -> Result<String, String> {
    app_state.agent_cancel.store(false, std::sync::atomic::Ordering::SeqCst);

    // Extract prompt from messages
    let prompt = messages.last()
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    let api_key_trimmed = context.api_key.trim().to_string();
    let is_local = context.provider == "local" || context.model.ends_with(".gguf") || context.model.ends_with("-local");

    // When running fully offline (no API key), always treat as fast_intent to skip the cloud Synthesizer
    let mut is_fast_intent = if is_local && api_key_trimmed.is_empty() {
        true
    } else {
        context.is_fast_intent.unwrap_or(context.agent_type.as_deref() == Some("chat"))
    };
    if !is_fast_intent {
        is_fast_intent = classify_intent_with_llm(&prompt, &api_key_trimmed).await;
    }

    // ── FAST PATH ── Local model + simple chat intent → stream directly to frontend.
    // Bypasses the entire Conductor/Worker/Actor machinery to eliminate multi-layer latency.
    if is_local && is_fast_intent {
        return direct_local_stream(&app, &messages, &event_name).await;
    }

    let session_id = context.session_id.clone();

    // Reuse or boot a ConductorActor for this session
    let tx = {
        let mut map = app_state.conductor_channels.lock().await;

        // Check if the existing sender is still alive
        let is_alive = if let Some(existing_tx) = map.get(&session_id) {
            !existing_tx.is_closed()
        } else {
            false
        };

        if is_alive {
            map[&session_id].clone()
        } else {
            // Spawn a fresh conductor for this session
            let (tx, rx) = tokio::sync::mpsc::channel(100);
            let conductor = crate::agents::conductor::ConductorActor::new(app.clone(), rx, tx.clone());
            tokio::spawn(async move {
                conductor.run().await;
            });
            map.insert(session_id.clone(), tx.clone());
            tx
        }
    };

    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    // Dispatch the task to the conductor
    let msg = crate::agents::protocol::ConductorMessage::RunTask {
        prompt,
        api_key: api_key_trimmed.clone(),
        // When local model is selected, do NOT pass a cloud_model — prevents Synthesizer from routing to Gemini
        cloud_model: if is_local { None } else { Some(context.model.clone()) },
        local_model: if is_local { Some(context.model.clone()) } else { None },
        reply_to: reply_tx,
        event_name: Some(event_name),
        is_fast_intent,
    };

    if let Err(e) = tx.send(msg).await {
        return Err(format!("Failed to send task to Conductor: {}", e));
    }

    // Await completion (5-minute safety timeout)
    match tokio::time::timeout(std::time::Duration::from_secs(300), reply_rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => Err(format!("Conductor reply error: {}", e)),
        Err(_) => Err("Agent loop timed out after 5 minutes.".to_string()),
    }
}

/// Direct streaming path for local model fast chat.
/// Calls the llama.cpp sidecar HTTP endpoint and streams tokens directly
/// to the frontend via Tauri events — zero Actor/Conductor overhead.
async fn direct_local_stream(
    app: &AppHandle,
    messages: &[Value],
    event_name: &str,
) -> Result<String, String> {
    use tauri::Emitter;
    use futures_util::StreamExt;

    let body = serde_json::json!({
        "messages": messages,
        "stream": true,
        "max_tokens": 512,
        "temperature": 0.7
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("[Local Error: {}]", e))?;

    let response = client
        .post("http://127.0.0.1:8080/v1/chat/completions")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("[Local server not running: {}]", e))?;

    let mut stream = response.bytes_stream();
    let mut full_content = String::new();
    let mut buffer = String::new();

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| format!("[Stream Error: {}]", e))?;
        let chunk_str = String::from_utf8_lossy(&chunk).to_string();
        buffer.push_str(&chunk_str);

        while let Some(newline_idx) = buffer.find('\n') {
            let line = buffer[..newline_idx].trim().to_string();
            buffer = buffer[newline_idx + 1..].to_string();

            if line.starts_with("data: ") {
                let data = &line[6..];
                if data == "[DONE]" { continue; }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(content) = json.pointer("/choices/0/delta/content").and_then(|v| v.as_str()) {
                        if !content.is_empty() {
                            full_content.push_str(content);
                            let _ = app.emit(event_name, serde_json::json!({
                                "type": "text",
                                "content": content
                            }));
                        }
                    }
                }
            }
        }
    }

    Ok(full_content.trim().to_string())
}

async fn classify_intent_with_llm(prompt: &str, api_key: &str) -> bool {
    if api_key.is_empty() || api_key == "demo_key" {
        return prompt.len() < 100 && !prompt.to_lowercase().contains("code") && !prompt.to_lowercase().contains("file");
    }

    let endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
    let system_instruction = "You are an intent classifier. Respond with exactly one word: 'CHAT' if the user's prompt is conversational, a greeting, or a simple question that does NOT require tools, file access, web search, or codebase execution. Respond with 'COMPLEX' if the user is asking to build software, run commands, research, or modify code.";

    let body = serde_json::json!({
        "system_instruction": {
            "parts": [{"text": system_instruction}]
        },
        "contents": [{
            "role": "user",
            "parts": [{"text": prompt}]
        }]
    });

    let client = reqwest::Client::new();
    match client.post(endpoint)
        .header("x-goog-api-key", api_key)
        .json(&body)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => {
            if let Ok(json) = res.json::<serde_json::Value>().await {
                if let Some(text) = json["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                    return text.trim().to_uppercase().contains("CHAT");
                }
            }
            false
        }
        _ => false // Default to complex if classification fails
    }
}

/// Cancel the currently running agent loop.
/// The loop checks this flag at the start of every iteration.
#[tauri::command]
pub fn cancel_agent_loop(app_state: State<'_, AppState>) {
    app_state.agent_cancel.store(true, Ordering::SeqCst);
    tracing::info!("Agent cancellation requested.");
}
