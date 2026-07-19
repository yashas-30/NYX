use crate::llm::cloud_orchestrator::{StreamChunkPayload, UnifiedRequest};

/// Execute a streaming LLM request using the rig-core framework to augment memory/agent context,
/// then delegate to the robust NYX orchestrators (local/cloud) for actual streaming inference.
pub async fn execute_rig_stream(
    req: &UnifiedRequest,
) -> Result<tokio::sync::mpsc::Receiver<Result<StreamChunkPayload, String>>, String> {
    
    let exec_mode = req.execution_mode.clone().unwrap_or_else(|| "chat".to_string());
    
    let app_data_dir = dirs::data_local_dir().unwrap_or_default().join("NYX");
    let _memory = crate::rag::turbovec_store::TurbovecStore::new(&app_data_dir, &exec_mode).await;
    
    let mut augmented_req = req.clone();
    
    // Get context from Turbovec memory for the last message (Placeholder for future search implementation)
    // let last_msg = req.messages.last().map(|m| m.content.clone()).unwrap_or_default();
    // let query = if let Some(txt) = last_msg.as_str() { txt.to_string() } else { last_msg.to_string() };
    
    // if let Ok(results) = memory.search(&query, 3).await { ... }
    
    // Inject specialized persona instructions based on execution mode
    let persona_sys = match exec_mode.as_str() {
        "coder" => "\n[Agent Persona]: You are Coderbot, an expert programming assistant. Focus on writing clean, efficient, production-ready code. Think step-by-step.",
        "chat" => "\n[Agent Persona]: You are Chatbot, an intelligent and helpful conversational assistant.",
        _ => "",
    };
    if !persona_sys.is_empty() {
        let new_sys = match &augmented_req.system_instruction {
            Some(existing) => format!("{}\n{}", existing, persona_sys),
            None => persona_sys.to_string(),
        };
        augmented_req.system_instruction = Some(new_sys);
    }
    
    // CLEAR execution_mode so that cloud_orchestrator does not route back to execute_rig_stream (infinite loop)
    augmented_req.execution_mode = None;
    
    // Delegate to NYX's robust model orchestrator (supports all providers, images, quotas, properly formatted endpoints)
    crate::llm::cloud_orchestrator::execute_cloud_stream(&augmented_req).await
}
