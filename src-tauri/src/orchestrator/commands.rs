use tauri::AppHandle;
use crate::commands::llm::{UnifiedRequest, StreamChunkPayload};
use crate::orchestrator::Orchestrator;
// We'll import tools here as we build them

#[tauri::command]
pub async fn run_orchestrator_turn(
    app: AppHandle,
    request: UnifiedRequest,
    on_event: tauri::ipc::Channel<StreamChunkPayload>,
) -> Result<(), String> {
    let mut orchestrator = Orchestrator::new();
    
    // Register tools
    orchestrator.register_tool(crate::orchestrator::WebSearchTool::new());
    orchestrator.register_tool(crate::orchestrator::ConversationalMemoryTool::new());
    orchestrator.register_tool(crate::orchestrator::CreateFileTool::new());
    
    orchestrator.run_turn(app, request, on_event).await
}
