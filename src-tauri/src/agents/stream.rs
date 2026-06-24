use tauri::{AppHandle, Emitter};
use serde::Deserialize;
use super::engine::AgentEngine;
use crate::rag::scanner::CodebaseScanner;
use std::sync::Arc;
use tracing::error;

#[derive(Deserialize)]
pub struct ChatRequest {
    pub messages: Vec<crate::agents::memory::Message>,
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    pub system_prompt: String,
}

// We assume a global scanner is stored in Tauri state
#[tauri::command]
pub async fn start_native_agent(
    req: ChatRequest,
    app: AppHandle,
    scanner: tauri::State<'_, Arc<CodebaseScanner>>,
) -> Result<(), String> {
    
    let mut engine = AgentEngine::new(
        req.api_key,
        req.base_url,
        req.model,
        req.system_prompt,
        req.messages,
        scanner.inner().clone(),
    );

    let app_clone = app.clone();
    let res = engine.run(move |event| {
        // Emit events to frontend
        if let Err(e) = app_clone.emit("agent-stream", event) {
            error!("Failed to emit agent event: {}", e);
        }
    }).await;

    match res {
        Ok(_) => {
            let _ = app.emit("agent-stream", serde_json::json!({ "type": "done" }));
            Ok(())
        }
        Err(e) => {
            let _ = app.emit("agent-stream", serde_json::json!({ "type": "error", "error": e }));
            Err(e)
        }
    }
}
