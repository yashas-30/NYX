// ─────────────────────────────────────────────────────────────────────────────
// NYX — Local Submodule Root
// ─────────────────────────────────────────────────────────────────────────────

pub mod downloader;
pub mod manager;

pub use downloader::{Downloader, HfModelResult, HfModelFile, LLAMACPP_PINNED_VERSION};
pub use manager::{LlamaManager, CommandExtWindows, SERVER_PORT, SERVER_HOST};


