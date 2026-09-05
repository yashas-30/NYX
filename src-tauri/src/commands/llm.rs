#![allow(unused_imports)]
// ─────────────────────────────────────────────────────────────────────────────
// commands/llm.rs — Compatibility Shim
// ─────────────────────────────────────────────────────────────────────────────
//
// All implementation has moved to:
//   llm/providers/             — cloud streaming providers hub
//   llm/local_orchestrator.rs  — local model management
//
// Re-export everything so that existing call sites (research.rs, main.rs,
// orchestrator/*.rs) continue to compile without modification.

pub use crate::llm::types::{
    UnifiedRequest,
    UnifiedMessage,
    StreamChunkPayload,
};

// Cloud types & commands
pub use crate::llm::providers::{
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
    hf_get_model_details,
    hf_get_model_files,
    hf_get_model_readme,
    get_llamacpp_version,
};

pub use crate::llm::local_inference::{
    execute_local_stream,
    llm_local_stream_request,
};

pub use crate::llm::diffusers::generate_local_image;
pub use crate::llm::ocr::run_local_ocr;


