// ─────────────────────────────────────────────────────────────────────────────
// NYX — Agent Pipeline Commands (Tauri IPC Bridge)
// ─────────────────────────────────────────────────────────────────────────────

use crate::agents::core::{
    AgentExecutionStep, ConductorProgressEvent, ConductorSupervisor,
};
use crate::agents::tools::{ClineFsTools, WorkspaceSandbox};
use crate::llm::gateway::{DynamicModelSpec, ProviderQuotaState};
use crate::llm::router::{classify_intent_dynamically, RouteDecision};
use crate::AppState;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

/// Runs the full autonomous multi-agent workflow inside the sandboxed project directory
#[tauri::command]
pub async fn nyx_run_agent_pipeline(
    app: AppHandle,
    prompt: String,
    workspace_root: Option<String>,
    on_progress: Channel<ConductorProgressEvent>,
    on_step: Channel<AgentExecutionStep>,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    state.agent_cancel.store(false, Ordering::Relaxed);

    // Determine sandbox root (defaults to current dir or user-provided workspace path)
    let root_path = if let Some(ws) = workspace_root {
        std::path::PathBuf::from(ws)
    } else {
        std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
    };

    let sandbox = WorkspaceSandbox::new(root_path);
    let cline_fs = Arc::new(ClineFsTools::new(sandbox));

    let supervisor = ConductorSupervisor::new(
        cline_fs,
        state.model_registry.clone(),
        state.quota_ledger.clone(),
        state.agent_cancel.clone(),
    );

    supervisor
        .run_agent_workflow(&app, &prompt, on_progress, on_step)
        .await
}

/// Classifies user prompt intent dynamically
#[tauri::command]
pub async fn nyx_classify_intent(
    app: AppHandle,
    prompt: String,
    api_key_override: Option<String>,
) -> Result<RouteDecision, String> {
    let state = app.state::<AppState>();
    classify_intent_dynamically(
        &app,
        &prompt,
        &state.model_registry,
        &state.quota_ledger,
        api_key_override.as_deref(),
    )
    .await
}

/// Fetches live quota and rate-limit states across all providers for UI badges
#[tauri::command]
pub async fn nyx_get_live_quota_states(app: AppHandle) -> Result<Vec<ProviderQuotaState>, String> {
    let state = app.state::<AppState>();
    Ok(state.quota_ledger.get_all_states().await)
}

/// Synchronizes available models dynamically from provider `/models` endpoints
#[tauri::command]
pub async fn nyx_sync_dynamic_models(
    app: AppHandle,
    provider: String,
    api_key: String,
) -> Result<Vec<DynamicModelSpec>, String> {
    let state = app.state::<AppState>();
    state
        .model_registry
        .sync_provider_models(&provider, &api_key)
        .await
}

/// Cancels the currently active agent pipeline run
#[tauri::command]
pub async fn nyx_cancel_agent(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    state.agent_cancel.store(true, Ordering::Relaxed);
    Ok(())
}
