// ─────────────────────────────────────────────────────────────────────────────
// NYX — Local LLM Module Root
// ─────────────────────────────────────────────────────────────────────────────

pub mod hardware;
pub mod scheduler;
pub mod server;
pub mod binary_manager;
pub mod hf_downloader;
pub mod commands;

// Re-export all submodules so `crate::llm::local::*` or `crate::llm::local_orchestrator::*`
// can access all structs, types, constants, and tauri commands seamlessly.
pub use hardware::*;
pub use scheduler::*;
pub use server::*;
pub use binary_manager::*;
pub use hf_downloader::*;
pub use commands::*;
