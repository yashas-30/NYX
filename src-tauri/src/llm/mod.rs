// ─────────────────────────────────────────────────────────────────────────────
// NYX — LLM Module Root
// ─────────────────────────────────────────────────────────────────────────────

pub mod local_orchestrator;
pub mod cloud_orchestrator;
pub mod rig_orchestrator;

// ── Cloud Orchestrator public API ────────────────────────────────────────────
pub use cloud_orchestrator::{
    UnifiedRequest,
    UnifiedMessage,
    StreamChunkPayload,
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
};
