use tauri::AppHandle;
use std::sync::LazyLock;
use crate::llm::cloud_orchestrator::{UnifiedRequest, StreamChunkPayload};
use crate::orchestrator::lucifer::{LuciferOrchestrator, LuciferAnalysis};

// Cache orchestrator process-wide: building it per-call allocates 6 Arc<dyn Tool>
// registrations unnecessarily. The orchestrator is stateless across turns.
static ORCHESTRATOR: LazyLock<LuciferOrchestrator> = LazyLock::new(LuciferOrchestrator::new);

#[tauri::command]
pub async fn run_lucifer_turn(
    app: AppHandle,
    request: UnifiedRequest,
    on_event: tauri::ipc::Channel<StreamChunkPayload>,
) -> Result<(), String> {
    ORCHESTRATOR.run_turn(app, request, on_event).await
}

#[tauri::command]
pub async fn analyze_lucifer_turn(
    messages: Vec<crate::llm::cloud_orchestrator::UnifiedMessage>,
    provider: String,
) -> LuciferAnalysis {
    LuciferOrchestrator::analyze_turn(&messages, &provider)
}
