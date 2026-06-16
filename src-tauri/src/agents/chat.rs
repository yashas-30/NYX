use anyhow::Result;
use tauri::{AppHandle, Emitter};
use serde_json::{json, Value};
use crate::commands::agent_orchestrator::{StreamContext, run_agent_stream};

pub async fn run_chat_agent(context: StreamContext, messages: Vec<Value>, app: AppHandle, event_name: String) -> Result<String> {
    if context.is_fast_intent.unwrap_or(false) {
        let _ = app.emit(&event_name, json!({"type": "thinking", "content": "\n━━━ [Chat Agent] Fast Conversational Response... ━━━\n"}));
    } else {
        let _ = app.emit(&event_name, json!({"type": "thinking", "content": "\n━━━ [Chat Agent] Initializing... ━━━\n"}));
    }
    
    // Call the legacy LLM loop to get a real response from the model
    let (full_text, _) = match run_agent_stream(&app, &event_name, &context, &messages).await {
        Ok(res) => res,
        Err(e) => {
            let _ = app.emit(&event_name, json!({"type": "error", "content": format!("Stream error: {}", e)}));
            return Err(anyhow::anyhow!(e));
        }
    };
    
    Ok(full_text)
}
