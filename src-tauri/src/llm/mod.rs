// ─────────────────────────────────────────────────────────────────────────────
// NYX — LLM Module Root
// ─────────────────────────────────────────────────────────────────────────────

pub mod local;
pub use local as local_orchestrator;
pub mod providers;
pub mod types;
pub mod local_inference;
pub mod model_formats;
pub mod diffusers;
pub mod ocr;
pub mod gateway;
pub mod router;

pub use model_formats::ModelFormat;
pub use gateway::{LiveQuotaLedger, DynamicModelRegistry, ModelRole, DynamicModelSpec, ProviderQuotaState};
pub use router::{PrimaryIntent, RouteDecision, MediaDecision, classify_intent_dynamically};


// ── Cloud Providers public API ───────────────────────────────────────────────
pub use types::{
    UnifiedRequest,
    UnifiedMessage,
    StreamChunkPayload,
};

pub use providers::{
    QuotaResponse,
    ReachableResponse,
    execute_cloud_stream,
    llm_stream_request,
    get_models_quota,
    check_provider_reachable,
};

// ── Local Orchestrator public API ────────────────────────────────────────────
pub use local_orchestrator::{
    LocalModelInfo,
    HardwareAnalysisResult,
    NglDecision,
    HardwareSnapshot,
    GpuBackend,
    LlamaManager,
    LlamaServerConfig,
    Downloader,
    HfDownloaderState,
    RestoredDownload,
    HfModelResult,
    HfModelFile,
    compute_ngl_decision,
    estimate_total_layers,

    // Tauri commands
    analyze_hardware,
    estimate_hardware_usage,
    download_local_model,
    open_external_installer_cli,
    start_local_server,
    stop_local_server,
    check_local_server_status,
    list_local_models,
    hf_set_token,
    hf_download_model,
    hf_pause_download,
    hf_resume_download,
    hf_cancel_download,
    hf_get_restored_downloads,
    hf_uninstall_model,
    hf_search_models,
    hf_get_model_files,
    hf_get_model_readme,
    get_llamacpp_version,
    check_and_update_binaries,
};

// ── Local Inference public API ──────────────────────────────────────────────────
pub use local_inference::{
    execute_local_stream,
    llm_local_stream_request,
};

use tauri::AppHandle;
use futures_util::StreamExt;
use tokio::sync::mpsc;

/// Executes an LLM stream on either local inference (nyx-native / GGUF) or cloud orchestrator,
/// returning a unified mpsc unbounded channel receiver.
pub async fn execute_any_stream(
    app: &AppHandle,
    req: &UnifiedRequest,
) -> Result<mpsc::UnboundedReceiver<Result<StreamChunkPayload, String>>, String> {
    let is_local = req.provider == "nyx-native" || req.provider.contains("local") || req.model_id.contains(".gguf");
    if is_local {
        let stream = execute_local_stream(app, req).await?;
        let (tx, rx) = mpsc::unbounded_channel();
        tauri::async_runtime::spawn(async move {
            tokio::pin!(stream);
            while let Some(res) = stream.next().await {
                if tx.send(res).is_err() {
                    break;
                }
            }
        });
        Ok(rx)
    } else {
        let mut cloud_rx = execute_cloud_stream(req).await?;
        let (tx, rx) = mpsc::unbounded_channel();
        tauri::async_runtime::spawn(async move {
            while let Some(res) = cloud_rx.recv().await {
                if tx.send(res).is_err() {
                    break;
                }
            }
        });
        Ok(rx)
    }
}

