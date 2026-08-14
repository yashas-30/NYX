// ─────────────────────────────────────────────────────────────────────────────
// NYX — LLM Module Root
// ─────────────────────────────────────────────────────────────────────────────

pub mod local_orchestrator;
pub mod cloud_orchestrator;
pub mod types;
pub mod local_inference;
pub mod local;
pub mod model_formats;
pub mod diffusers;
pub mod ocr;

pub use model_formats::ModelFormat;


// ── Cloud Orchestrator public API ────────────────────────────────────────────
pub use types::{
    UnifiedRequest,
    UnifiedMessage,
    StreamChunkPayload,
};

pub use cloud_orchestrator::{
    QuotaResponse,
    execute_cloud_stream,
    llm_stream_request,
    get_models_quota,
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
