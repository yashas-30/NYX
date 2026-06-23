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

        // 1. Download Model: gemma-2-2b-it-Q4_K_M.gguf
        let model_path = models_dir.join("gemma-2-2b-it-Q4_K_M.gguf");
        if !model_path.exists() {
            let model_url = "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf";
            self.download_file(model_url, &model_path, |p| on_progress(p, "Downloading Gemma 2B (Q4)...")).await?;
        } else {
            on_progress(100.0, "Model exists.");
        }

        // 2. Download llama-server.exe (CUDA Windows build for NVIDIA GPUs)
        let server_path = bin_dir.join("llama-server-cuda.exe");
        if !server_path.exists() {
            let server_url = "https://github.com/ggerganov/llama.cpp/releases/download/b4300/llama-b4300-bin-win-cuda-cu12.4-x64.zip";
            let zip_path = bin_dir.join("llama_cuda.zip");
            self.download_file(server_url, &zip_path, |p| on_progress(p, "Downloading llama.cpp CUDA server...")).await?;
            
            let output = std::process::Command::new("powershell")
                .arg("-c")
                .arg(format!("Expand-Archive -Path '{}' -DestinationPath '{}' -Force", zip_path.display(), bin_dir.display()))
                .output()
                .map_err(|e| e.to_string())?;
            if !output.status.success() {
                return Err(format!("Failed to unzip llama.cpp CUDA: {}", String::from_utf8_lossy(&output.stderr)));
            }
            let _ = tokio::fs::remove_file(zip_path).await;

            // Rename llama-server.exe to llama-server-cuda.exe
            let _ = tokio::fs::rename(bin_dir.join("llama-server.exe"), &server_path).await;
            
            // Download CUDART dependencies
            let cudart_url = "https://github.com/ggerganov/llama.cpp/releases/download/b4300/cudart-llama-bin-win-cu12.4-x64.zip";
            let cudart_zip = bin_dir.join("cudart.zip");
            self.download_file(cudart_url, &cudart_zip, |p| on_progress(p, "Downloading CUDA runtime...")).await?;
            
            let output = std::process::Command::new("powershell")
                .arg("-c")
                .arg(format!("Expand-Archive -Path '{}' -DestinationPath '{}' -Force", cudart_zip.display(), bin_dir.display()))
                .output()
                .map_err(|e| e.to_string())?;
            if !output.status.success() {
                return Err(format!("Failed to unzip CUDART: {}", String::from_utf8_lossy(&output.stderr)));
            }
            let _ = tokio::fs::remove_file(cudart_zip).await;
        } else {
            on_progress(100.0, "Llama Server exists.");
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
        let mut file = tokio::fs::File::create(dest).await.map_err(|e| e.to_string())?;
        
        let mut downloaded: u64 = 0;
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            file.write_all(&chunk).await.map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;
            if total_size > 0 {
                on_progress((downloaded as f32 / total_size as f32) * 100.0);
            }
        }
        
        Ok(())
    }
}
