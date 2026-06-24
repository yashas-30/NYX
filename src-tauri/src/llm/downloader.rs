use reqwest::Client;
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;
use tracing::info;

pub struct Downloader {
    client: Client,
}

impl Downloader {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    /// Downloads the GGUF model and the llama-server.exe
    /// Returns the path to the model and the executable.
    pub async fn ensure_assets(&self, data_dir: &Path, on_progress: impl Fn(f32, &str) + Send + 'static) -> Result<(PathBuf, PathBuf), String> {
        let models_dir = data_dir.join("models");
        let bin_dir = data_dir.join("binaries");

        tokio::fs::create_dir_all(&models_dir).await.map_err(|e| e.to_string())?;
        tokio::fs::create_dir_all(&bin_dir).await.map_err(|e| e.to_string())?;

        // 1. Download llama-server.exe (Vulkan Windows build for universal GPU support)
        let server_path = bin_dir.join("llama-server-vulkan.exe");
        if !server_path.exists() {
            let server_url = "https://github.com/ggerganov/llama.cpp/releases/download/b9776/llama-b9776-bin-win-vulkan-x64.zip";
            let zip_path = bin_dir.join("llama_vulkan.zip");
            self.download_file(server_url, &zip_path, |p| on_progress(p, "Downloading llama.cpp Vulkan server...")).await?;
            
            let zip_str = zip_path.to_string_lossy().replace("\\\\?\\", "");
            let bin_str = bin_dir.to_string_lossy().replace("\\\\?\\", "");
            let output = std::process::Command::new("powershell")
                .arg("-c")
                .arg(format!("Expand-Archive -Path '{}' -DestinationPath '{}' -Force", zip_str, bin_str))
                .output()
                .map_err(|e| e.to_string())?;
                
            let stderr_str = String::from_utf8_lossy(&output.stderr);
            if !output.status.success() || stderr_str.contains("Exception") || stderr_str.contains("Error") {
                return Err(format!("Failed to unzip server: {}", stderr_str));
            }
            
            // Rename llama-server.exe to llama-server-vulkan.exe
            if let Err(e) = tokio::fs::rename(bin_dir.join("llama-server.exe"), &server_path).await {
                return Err(format!("Failed to rename llama-server.exe: {}", e));
            }
            let _ = tokio::fs::remove_file(zip_path).await;
        } else {
            on_progress(100.0, "Llama Server exists.");
        }

        // 2. Download Model: gemma-2-2b-it-Q4_K_M.gguf
        let model_path = models_dir.join("gemma-2-2b-it-Q4_K_M.gguf");
        if !model_path.exists() {
            let model_url = "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf";
            self.download_file(model_url, &model_path, |p| on_progress(p, "Downloading Gemma 2B (Q4)...")).await?;
        } else {
            on_progress(100.0, "Model exists.");
        }

        Ok((model_path, server_path))
    }

    async fn download_file(&self, url: &str, dest: &Path, on_progress: impl Fn(f32)) -> Result<(), String> {
        info!("Starting download: {}", url);
        let mut response = self.client.get(url).send().await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Failed to download {}: {}", url, response.status()));
        }

        let total_size = response.content_length().unwrap_or(0);
        let tmp_dest = dest.with_extension("tmp");
        let mut file = tokio::fs::File::create(&tmp_dest).await.map_err(|e| e.to_string())?;
        
        let mut downloaded: u64 = 0;
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            file.write_all(&chunk).await.map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;
            if total_size > 0 {
                on_progress((downloaded as f32 / total_size as f32) * 100.0);
            }
        }
        
        file.flush().await.map_err(|e| e.to_string())?;
        drop(file);
        
        tokio::fs::rename(tmp_dest, dest).await.map_err(|e| e.to_string())?;
        
        Ok(())
    }
}
