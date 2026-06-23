use std::path::PathBuf;
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tracing::info;

pub struct LlamaManager {
    process: Arc<Mutex<Option<Child>>>,
}

impl LlamaManager {
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn start(&self, server_path: &PathBuf, model_path: &PathBuf) -> Result<(), String> {
        let mut process_guard = self.process.lock().await;

        if let Some(mut child) = process_guard.take() {
            info!("Stopping existing Llama Server before starting a new one...");
            let _ = child.kill().await;
        }

        // Clean up any zombie processes from previous crashes
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/IM", "llama-server.exe"])
            .output();
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/IM", "llama-server-cuda.exe"])
            .output();

        info!("Starting Llama Server with model: {}", model_path.display());
        let child = Command::new(server_path)
            .arg("-m")
            .arg(model_path)
            .arg("-ngl")
            .arg("99") // Offload all layers to GPU (Vulkan/CUDA)
            .arg("--port")
            .arg("8080")
            .arg("--ctx-size")
            .arg("4096")
            .spawn()
            .map_err(|e| format!("Failed to start llama-server: {}", e))?;

        *process_guard = Some(child);
        Ok(())
    }

    pub async fn stop(&self) {
        let mut process_guard = self.process.lock().await;
        if let Some(mut child) = process_guard.take() {
            info!("Stopping Llama Server...");
            let _ = child.kill().await;
        }
    }
}
