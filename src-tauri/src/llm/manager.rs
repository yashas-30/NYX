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

    /// Original entry point — delegates to start_with_ngl with default -ngl 999.
    /// Kept for any internal callers that don't go through the VRAM scheduler.
    pub async fn start(&self, server_path: &PathBuf, model_path: &PathBuf, context_size: u32) -> Result<(), String> {
        self.start_with_ngl(server_path, model_path, context_size, None, None).await
    }

    /// Start llama-server with an explicit ngl override and threads override from the VRAM scheduler/frontend.
    /// If `ngl_override` is None, falls back to `-ngl 999` (all layers on GPU).
    pub async fn start_with_ngl(&self, server_path: &PathBuf, model_path: &PathBuf, context_size: u32, ngl_override: Option<u32>, threads_override: Option<u32>) -> Result<(), String> {
        let ngl_value = ngl_override.unwrap_or(999).to_string();

        let mut process_guard = self.process.lock().await;
        if let Some(mut child) = process_guard.take() {
            info!("Stopping existing Llama Server before starting a new one...");
            let _ = child.kill().await;
        }

        let _ = std::process::Command::new("taskkill").args(["/F", "/T", "/IM", "llama-server.exe"]).output();
        let _ = std::process::Command::new("taskkill").args(["/F", "/T", "/IM", "llama-server-vulkan.exe"]).output();

        let cpu_threads = threads_override
            .map(|t| t.to_string())
            .unwrap_or_else(|| {
                std::thread::available_parallelism()
                    .map(|n| (n.get() / 2).max(1).min(16))
                    .unwrap_or(4)
                    .to_string()
            });

        info!("Starting Llama Server: model={} ngl={} threads={}", model_path.display(), ngl_value, cpu_threads);
        let mut child = Command::new(server_path)
            .arg("-m").arg(model_path)
            .arg("-ngl").arg(&ngl_value)
            .arg("--no-mmap")
            .arg("--ctx-size").arg(context_size.to_string())
            .arg("--batch-size").arg("2048")
            .arg("--ubatch-size").arg("512")
            .arg("--cache-prompt")
            .arg("--cache-type-k").arg("q8_0")
            .arg("--cache-type-v").arg("q8_0")
            .arg("-t").arg(&cpu_threads)
            .arg("--port").arg("8080")
            .arg("--host").arg("127.0.0.1")
            .arg("--keep").arg("-1")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to start llama-server: {}", e))?;

        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("Llama server crashed immediately (Exit {}). Check model compatibility.", status));
        }

        info!("Waiting for Llama Server to be ready (ngl={})...", ngl_value);
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(2))
            .build()
            .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

        let mut ready = false;
        for _ in 0..60 {
            if let Ok(res) = client.get("http://127.0.0.1:8080/v1/models").send().await {
                if res.status().is_success() { ready = true; break; }
            }
            if let Ok(Some(status)) = child.try_wait() {
                return Err(format!("Llama server crashed while loading model (Exit {}).", status));
            }
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        }

        if !ready {
            let _ = child.kill().await;
            return Err("Llama server failed to become ready within 120 seconds.".to_string());
        }

        info!("Warming up Llama Server KV cache (ngl={})...", ngl_value);
        let warmup_body = serde_json::json!({
            "messages": [{"role": "system", "content": "You are NYX."}, {"role": "user", "content": "hi"}],
            "max_tokens": 1, "stream": false, "keep_alive": -1
        });
        let warmup_client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(60)).build().unwrap_or_default();
        let _ = warmup_client.post("http://127.0.0.1:8080/v1/chat/completions").json(&warmup_body).send().await;
        info!("Llama Server ready. ngl={}", ngl_value);

        *process_guard = Some(child);
        Ok(())
    }

    pub async fn stop(&self) {
        let mut process_guard = self.process.lock().await;
        if let Some(mut child) = process_guard.take() {
            info!("Stopping Llama Server...");
            let _ = child.kill().await;
        }

        // Ensure all zombie instances are terminated so files are unlocked
        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/T", "/IM", "llama-server.exe"])
                .output();
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/T", "/IM", "llama-server-vulkan.exe"])
                .output();
        }
    }
}
