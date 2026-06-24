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
            .args(["/F", "/T", "/IM", "llama-server-vulkan.exe"])
            .output();

        info!("Starting Llama Server with model: {}", model_path.display());
        let mut child = Command::new(server_path)
            .arg("-m")
            .arg(model_path)
            .arg("-ngl")
            .arg("999") // Maximize GPU layer offloading
            .arg("--port")
            .arg("8080")
            .arg("--ctx-size")
            .arg("8192")
            .arg("--cache-type-k")
            .arg("q8_0")
            .arg("--cache-type-v")
            .arg("q8_0")
            .arg("--cache-prompt")
            .arg("--batch-size")
            .arg("512")
            .arg("--ubatch-size")
            .arg("512")
            .arg("-t")
            .arg("8") // physical core count
            .arg("--parallel")
            .arg("1")
            .arg("--keep")
            .arg("-1")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to start llama-server: {}", e))?;

        // Give it a brief moment to see if it crashes immediately
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("Llama server crashed immediately on startup (Exit {}). The model architecture might not be supported or is corrupted.", status));
        }

        *process_guard = Some(child);

        // Silent warmup request to eliminate JIT/alloc latency on the first real request
        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
            let _ = reqwest::Client::new()
                .post("http://127.0.0.1:8080/v1/completions")
                .json(&serde_json::json!({
                    "model": "warmup",
                    "prompt": "Hi",
                    "max_tokens": 1,
                    "stream": false
                }))
                .send()
                .await;
        });

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
