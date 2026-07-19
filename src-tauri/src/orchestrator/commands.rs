use tauri::AppHandle;
use crate::llm::cloud_orchestrator::{UnifiedRequest, StreamChunkPayload};
use crate::orchestrator::Orchestrator;

#[tauri::command]
pub async fn run_orchestrator_turn(
    app: AppHandle,
    request: UnifiedRequest,
    on_event: tauri::ipc::Channel<StreamChunkPayload>,
) -> Result<(), String> {
    let mut orchestrator = Orchestrator::new();

    // Register available tools.
    orchestrator.register_tool(crate::orchestrator::WebSearchTool::new());
    orchestrator.register_tool(crate::orchestrator::ConversationalMemoryTool::new());
    orchestrator.register_tool(crate::orchestrator::CreateFileTool::new());

    orchestrator.run_turn(app, request, on_event).await
}
