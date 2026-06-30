import sys

with open("src/commands/agent_orchestrator.rs", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_code = """#[tauri::command]
pub async fn orchestrate_supervisor(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    app_state: State<'_, AppState>,
    mut messages: Vec<Value>,
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

    let mut is_fast_intent = context.is_fast_intent.unwrap_or(context.agent_type.as_deref() == Some("chat"));
    if !is_fast_intent {
        is_fast_intent = classify_intent_with_llm(&prompt, &context.api_key).await;
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
    let is_local = context.provider == "local" || context.model.ends_with(".gguf") || context.model.ends_with("-local");

    // Dispatch the task to the conductor
    let msg = crate::agents::conductor::ConductorMessage::RunTask {
        prompt,
        api_key: context.api_key.clone(),
        cloud_model: if is_local { Some("gemini-2.5-flash".to_string()) } else { Some(context.model.clone()) },
        local_model: Some(context.model.clone()),
        reply_to: reply_tx,
        event_name: Some(event_name),
        is_fast_intent,
    };

    if let Err(e) = tx.send(msg).await {
        return Err(format!("Failed to send task to Conductor: {}", e));
    }

    // Await completion (5-minute safety timeout)
    match tokio::time::timeout(std::time::Duration::from_secs(300), reply_rx).await {
        Ok(Ok(result)) => Ok(result),
        Ok(Err(e)) => Err(format!("Conductor reply error: {}", e)),
        Err(_) => Err("Agent loop timed out after 5 minutes.".to_string()),
    }
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
"""

# Replace lines 332 to 607 inclusive
lines[331:607] = [new_code]

with open("src/commands/agent_orchestrator.rs", "w", encoding="utf-8") as f:
    f.writelines(lines)
