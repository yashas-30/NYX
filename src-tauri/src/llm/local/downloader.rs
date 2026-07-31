// ─────────────────────────────────────────────────────────────────────────────
// NYX — Downloader Submodule
// ─────────────────────────────────────────────────────────────────────────────

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const LLAMACPP_PINNED_VERSION: &str = "b5710";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HfModelResult {
    pub id: String,
    pub downloads: u64,
    pub likes: u64,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HfModelFile {
    pub filename: String,
    pub size: u64,
}

#[derive(Serialize, Deserialize)]
pub struct HfTreeEntry {
    pub r#type: String,
    pub path: String,
    pub size: u64,
    pub lfs: Option<HfLfsInfo>,
}

#[derive(Serialize, Deserialize)]
pub struct HfLfsInfo {
    pub size: u64,
}

pub struct Downloader {
    pub client: Client,
}

impl Downloader {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(600))
                .user_agent("NYX-Local-Orchestrator")
                .build()
                .expect("HTTP client"),
        }
    }

    pub async fn get_installed_version(app_dir: &Path) -> Option<String> {
        let ver_file = app_dir.join("binaries").join("version.txt");
        tokio::fs::read_to_string(&ver_file).await.ok().map(|s| s.trim().to_string())
    }
}
