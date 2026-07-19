#![allow(unused_imports)]
// ─────────────────────────────────────────────────────────────────────────────
// commands/llm.rs — Compatibility Shim
// ─────────────────────────────────────────────────────────────────────────────
//
// All implementation has moved to:
//   llm/cloud_orchestrator.rs  — cloud streaming engine
//   llm/local_orchestrator.rs  — local model management
//
// Re-export everything so that existing call sites (research.rs, main.rs,
// orchestrator/*.rs) continue to compile without modification.

// Cloud types & commands
pub use crate::llm::cloud_orchestrator::{
    UnifiedRequest,
    UnifiedMessage,
    StreamChunkPayload,
    QuotaResponse,
    execute_cloud_stream as execute_llm_stream,
    llm_stream_request,
    get_models_quota,
};

// Local types & commands
pub use crate::llm::local_orchestrator::{
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
