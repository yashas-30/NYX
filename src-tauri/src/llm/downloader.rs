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

    pub async fn ensure_server(&self, data_dir: &Path, on_progress: impl Fn(f32, &str) + Send + 'static) -> Result<PathBuf, String> {
        let bin_dir = data_dir.join("binaries");
        tokio::fs::create_dir_all(&bin_dir).await.map_err(|e| e.to_string())?;

        // 1. Download llama-server.exe (Vulkan Windows build for universal GPU support)
        let server_path = bin_dir.join("llama-server-vulkan.exe");
        // A valid server binary must be at least 1 MB. If the file is smaller it was
        // truncated or corrupted during a previous interrupted download — re-download it.
        let server_needs_download = match tokio::fs::metadata(&server_path).await {
            Ok(m) => m.len() < 1024 * 1024, // < 1 MB → corrupt
            Err(_) => true,                   // doesn't exist
        };
        if server_needs_download {
            // Remove the corrupt stub if present so the extraction rename succeeds.
            let _ = tokio::fs::remove_file(&server_path).await;
            let server_url = "https://github.com/ggerganov/llama.cpp/releases/download/b9776/llama-b9776-bin-win-vulkan-x64.zip";
            let zip_path = bin_dir.join("llama_vulkan.zip");
            self.download_file(server_url, &zip_path, |p| on_progress(p, "Downloading llama.cpp Vulkan server...")).await?;
            
            let zip_str = zip_path.to_string_lossy().replace("\\\\?\\", "");
            let bin_str = bin_dir.to_string_lossy().replace("\\\\?\\", "");
            
            let mut output_success = false;
            let mut stderr_str = String::new();
            
            for _ in 0..5 {
                let output = std::process::Command::new("tar")
                    .arg("-xf")
                    .arg(&zip_str)
                    .arg("-C")
                    .arg(&bin_str)
                    .output()
                    .map_err(|e| e.to_string())?;
                    
                stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
                if output.status.success() {
                    output_success = true;
                    break;
                }
                
                // Sleep to wait for Windows Defender or other processes to release the file lock
                tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
            }
            
            if !output_success {
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

        Ok(server_path)
    }

    /// Downloads the GGUF model and the llama-server.exe
    /// Returns the path to the model and the executable.
    pub async fn ensure_assets(&self, data_dir: &Path, on_progress: impl Fn(f32, &str) + Send + 'static + Clone) -> Result<(PathBuf, PathBuf), String> {
        let models_dir = data_dir.join("models");
        tokio::fs::create_dir_all(&models_dir).await.map_err(|e| e.to_string())?;

        let on_progress_server = on_progress.clone();
        let server_path = self.ensure_server(data_dir, on_progress_server).await?;

        // 2. Download Model: Qwen2.5-0.5B-Instruct-GGUF (Q4_K_M)
        let model_path = models_dir.join("qwen2.5-0.5b-instruct-q4_k_m.gguf");
        if !model_path.exists() {
            let model_url = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf";
            self.download_file(model_url, &model_path, |p| on_progress(p, "Downloading Qwen2.5 0.5B (Q4)...")).await?;
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
        let file = tokio::fs::File::create(&tmp_dest).await.map_err(|e| e.to_string())?;
        let mut writer = tokio::io::BufWriter::with_capacity(1024 * 1024, file); // 1MB buffer for fast I/O
        
        let mut downloaded: u64 = 0;
        let mut last_emit = std::time::Instant::now();

        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            writer.write_all(&chunk).await.map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;
            
            // Throttle IPC events to 250ms so we don't flood the frontend
            if total_size > 0 && last_emit.elapsed().as_millis() > 250 {
                on_progress((downloaded as f32 / total_size as f32) * 100.0);
                last_emit = std::time::Instant::now();
            }
        }
        
        // Ensure final 100% emission
        if total_size > 0 {
            on_progress(100.0);
        }
        
        writer.flush().await.map_err(|e| e.to_string())?;
        drop(writer);
        
        tokio::fs::rename(tmp_dest, dest).await.map_err(|e| e.to_string())?;
        
        Ok(())
    }
}
