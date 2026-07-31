use tauri::AppHandle;
use crate::llm::cloud_orchestrator::{UnifiedRequest, StreamChunkPayload};
use crate::orchestrator::lucifer::{LuciferOrchestrator, LuciferAnalysis};

#[tauri::command]
pub async fn run_lucifer_turn(
    app: AppHandle,
    request: UnifiedRequest,
    on_event: tauri::ipc::Channel<StreamChunkPayload>,
) -> Result<(), String> {
    let orchestrator = LuciferOrchestrator::new();
    orchestrator.run_turn(app, request, on_event).await
}

#[tauri::command]
pub fn analyze_lucifer_turn(
    messages: Vec<crate::llm::cloud_orchestrator::UnifiedMessage>,
    provider: String,
) -> LuciferAnalysis {
    LuciferOrchestrator::analyze_turn(&messages, &provider)
}
