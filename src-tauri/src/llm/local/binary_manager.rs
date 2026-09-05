// ─────────────────────────────────────────────────────────────────────────────
// NYX — Binary Downloader & Lifecycle Manager
// ─────────────────────────────────────────────────────────────────────────────

use reqwest::Client;
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;
use tracing::info;

use super::hardware::GpuBackend;
use super::server::{DOWNLOAD_SEMAPHORE, LLAMACPP_CUDA_ZIP, LLAMACPP_VULKAN_ZIP, LLAMACPP_CUDART_ZIP, LLAMACPP_RELEASE_BASE, MIN_SERVER_BINARY_BYTES, LLAMACPP_PINNED_VERSION};

// § 6 — DOWNLOADER (server binary)
// ─────────────────────────────────────────────────────────────────────────────

pub struct Downloader {
    client: Client,
}

impl Downloader {
    pub fn new() -> Self {
        Self { client: Client::builder()
            .timeout(std::time::Duration::from_secs(600))
            .user_agent("NYX-Local-Orchestrator") // REQUIRED FOR GITHUB API
            .build()
            .expect("HTTP client") }
    }

    pub fn binary_name(backend: &GpuBackend) -> &'static str {
        match backend {
            GpuBackend::Cuda => "llama-server-cuda.exe",
            GpuBackend::Vulkan => "llama-server-vulkan.exe",
            // Metal (macOS) uses the generic metal build; on Windows this falls back to CUDA
            GpuBackend::Metal => "llama-server",
            // NPU (Qualcomm Hexagon / Intel NPU / AMD XDNA): use Vulkan binary as compatible
            // fallback until dedicated QNN/OpenVINO llama.cpp releases are stable.
            GpuBackend::Npu => "llama-server-vulkan.exe",
            GpuBackend::Unknown => "llama-server-cuda.exe",
        }
    }

    /// Fetches the latest release from GitHub API (scanning recent releases for newest b* tag),
    /// and returns (tag_name, binary_zip_url, optional_cudart_zip_url).
    async fn resolve_release(&self, backend: &GpuBackend) -> (String, String, Option<String>) {
        let api_urls = [
            "https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=10",
            "https://api.github.com/repos/ggerganov/llama.cpp/releases?per_page=10",
        ];

        for api_url in api_urls {
            if let Ok(resp) = self.client.get(api_url).send().await {
                if resp.status().is_success() {
                    if let Ok(releases) = resp.json::<serde_json::Value>().await {
                        if let Some(rel_array) = releases.as_array() {
                            for rel in rel_array {
                                let tag = match rel.get("tag_name").and_then(|v| v.as_str()) {
                                    Some(t) if t.starts_with('b') => t,
                                    _ => continue,
                                };

                                if let Some(assets) = rel.get("assets").and_then(|a| a.as_array()) {
                                    let mut target_url = None;
                                    let mut cudart_url = None;

                                    for asset in assets {
                                        if let (Some(name), Some(url)) = (asset["name"].as_str(), asset["browser_download_url"].as_str()) {
                                            let name_lower = name.to_lowercase();
                                            if name_lower.contains("win") && (name_lower.contains("x64") || name_lower.contains("x86_64")) && name_lower.ends_with(".zip") {
                                                let is_cuda = matches!(backend, GpuBackend::Cuda | GpuBackend::Unknown) && name_lower.contains("cuda");
                                                let is_vulkan = matches!(backend, GpuBackend::Vulkan | GpuBackend::Npu) && name_lower.contains("vulkan");

                                                if name_lower.starts_with("cudart") && is_cuda {
                                                    cudart_url = Some(url.to_string());
                                                } else if (is_cuda || is_vulkan) && !name_lower.starts_with("cudart") {
                                                    target_url = Some(url.to_string());
                                                }
                                            }
                                        }
                                    }

                                    if let Some(url) = target_url {
                                        return (tag.to_string(), url, cudart_url);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Fallback to pinned release
        let (zip_name, cudart_name) = match backend {
            GpuBackend::Cuda | GpuBackend::Unknown => (LLAMACPP_CUDA_ZIP, Some(LLAMACPP_CUDART_ZIP)),
            GpuBackend::Vulkan | GpuBackend::Npu => (LLAMACPP_VULKAN_ZIP, None),
            GpuBackend::Metal => (LLAMACPP_CUDA_ZIP, None),
        };

        (
            LLAMACPP_PINNED_VERSION.to_string(),
            format!("{}/{}/{}", LLAMACPP_RELEASE_BASE, LLAMACPP_PINNED_VERSION, zip_name),
            cudart_name.map(|c| format!("{}/{}/{}", LLAMACPP_RELEASE_BASE, LLAMACPP_PINNED_VERSION, c)),
        )
    }

    pub async fn get_installed_version(data_dir: &Path) -> String {
        let version_file = data_dir.join("binaries").join(".version");
        tokio::fs::read_to_string(&version_file).await.unwrap_or_else(|_| LLAMACPP_PINNED_VERSION.to_string()).trim().to_string()
    }

    pub async fn ensure_server(
        &self,
        data_dir: &Path,
        backend: &GpuBackend,
        on_progress: impl Fn(f32, &str) + Send + 'static,
    ) -> Result<PathBuf, String> {
        let bin_dir = data_dir.join("binaries");
        tokio::fs::create_dir_all(&bin_dir).await.map_err(|e| e.to_string())?;

        let binary_name = Self::binary_name(backend);
        let server_path = bin_dir.join(binary_name);

        let installed_version = Self::get_installed_version(data_dir).await;
        let needs_download = match tokio::fs::metadata(&server_path).await {
            Ok(m) => m.len() < MIN_SERVER_BINARY_BYTES,
            Err(_) => true,
        };

        if !needs_download {
            on_progress(100.0, &format!("Server binary ({}) already installed.", installed_version));
            return Ok(server_path);
        }

        let _ = tokio::fs::remove_file(&server_path).await;
        
        let (tag_name, url, cudart_url_opt) = self.resolve_release(backend).await;
        let zip_name = url.split('/').last().unwrap_or("llama-server.zip");
        let zip_path = bin_dir.join(zip_name);

        on_progress(0.0, &format!("Downloading llama.cpp {} ({})...", tag_name,
            match backend {
                GpuBackend::Cuda | GpuBackend::Unknown => "CUDA",
                GpuBackend::Vulkan => "Vulkan",
                GpuBackend::Metal => "Metal",
                GpuBackend::Npu => "Vulkan (NPU-compatible)",
            }));

        self.download_file(&url, &zip_path, |p| {
            on_progress(p * 0.7, &format!("Downloading llama-server... {:.0}%", p));
        }).await?;

        on_progress(70.0, "Extracting server binary...");

        let zip_str = zip_path.to_string_lossy().replace("\\\\?\\", "");
        let bin_str = bin_dir.to_string_lossy().replace("\\\\?\\", "");

        let extract_ok = Self::extract_with_retry(&zip_str, &bin_str).await;
        if !extract_ok {
            return Err(format!("Failed to extract {}", zip_name));
        }

        // If CUDA runtime DLLs (cudart/cublas) are needed and missing, download cudart package
        if let Some(cudart_url) = cudart_url_opt {
            let has_cublas = bin_dir.join("cublas64_12.dll").exists() || bin_dir.join("cublas64_11.dll").exists();
            if !has_cublas {
                on_progress(75.0, "Downloading CUDA runtime libraries (cudart)...");
                let cudart_zip_name = cudart_url.split('/').last().unwrap_or("cudart.zip");
                let cudart_zip_path = bin_dir.join(cudart_zip_name);
                if let Ok(()) = self.download_file(&cudart_url, &cudart_zip_path, |p| {
                    on_progress(75.0 + (p * 0.15), &format!("Downloading CUDA runtime... {:.0}%", p));
                }).await {
                    let czip_str = cudart_zip_path.to_string_lossy().replace("\\\\?\\", "");
                    let _ = Self::extract_with_retry(&czip_str, &bin_str).await;
                    let _ = tokio::fs::remove_file(&cudart_zip_path).await;
                }
            }
        }

        let extracted = bin_dir.join("llama-server.exe");
        if extracted.exists() {
            tokio::fs::rename(&extracted, &server_path).await
                .map_err(|e| format!("Failed to rename binary: {}", e))?;
        } else if !server_path.exists() {
            return Err(format!("Expected binary not found after extraction: {}", binary_name));
        }

        let _ = tokio::fs::remove_file(&zip_path).await;
        let _ = tokio::fs::write(bin_dir.join(".version"), &tag_name).await;

        on_progress(100.0, &format!("llama-server {} installed.", tag_name));
        Ok(server_path)
    }

    pub fn sd_binary_name(backend: &GpuBackend) -> &'static str {
        #[cfg(target_os = "windows")]
        {
            match backend {
                GpuBackend::Cuda => "sd-cli-cuda.exe",
                GpuBackend::Vulkan | GpuBackend::Npu => "sd-cli-vulkan.exe",
                _ => "sd-cli-vulkan.exe", // default to Vulkan — no CPU fallback
            }
        }
        #[cfg(target_os = "macos")]
        {
            "sd-cli"
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            match backend {
                GpuBackend::Vulkan | GpuBackend::Npu => "sd-cli-vulkan",
                _ => "sd-cli",
            }
        }
    }

    pub fn sd_server_binary_name() -> &'static str {
        #[cfg(target_os = "windows")]
        { "sd-server.exe" }
        #[cfg(not(target_os = "windows"))]
        { "sd-server" }
    }

    async fn resolve_sd_release(&self, backend: &GpuBackend) -> (String, String) {
        if let Ok(resp) = self.client.get("https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/latest").send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(tag) = json["tag_name"].as_str() {
                        if let Some(assets) = json["assets"].as_array() {
                            let mut target_url = None;
                            for asset in assets {
                                if let (Some(name), Some(url)) = (asset["name"].as_str(), asset["browser_download_url"].as_str()) {
                                    let name_lower = name.to_lowercase();
                                    #[cfg(target_os = "windows")]
                                    {
                                        if name_lower.starts_with("sd-") && name_lower.contains("win") && name_lower.contains("x64") && name_lower.ends_with(".zip") {
                                            let is_cuda = matches!(backend, GpuBackend::Cuda | GpuBackend::Unknown) && name_lower.contains("cuda");
                                            let is_vulkan = matches!(backend, GpuBackend::Vulkan) && name_lower.contains("vulkan");
                                            let is_cpu = matches!(backend, GpuBackend::Metal) && name_lower.contains("cpu");
                                            if is_cuda || is_vulkan || is_cpu {
                                                target_url = Some(url.to_string());
                                                break;
                                            }
                                        }
                                    }
                                    #[cfg(target_os = "macos")]
                                    {
                                        if name_lower.starts_with("sd-") && name_lower.contains("darwin") && name_lower.contains("mac") && name_lower.contains("arm64") && name_lower.ends_with(".zip") {
                                            target_url = Some(url.to_string());
                                            break;
                                        }
                                    }
                                    #[cfg(target_os = "linux")]
                                    {
                                        if name_lower.starts_with("sd-") && name_lower.contains("linux") && name_lower.contains("x86_64") && name_lower.ends_with(".zip") {
                                            let is_vulkan = matches!(backend, GpuBackend::Vulkan) && name_lower.contains("vulkan");
                                            if is_vulkan {
                                                target_url = Some(url.to_string());
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            if let Some(url) = target_url {
                                return (tag.to_string(), url);
                            }
                        }
                    }
                }
            }
        }
        
        let fallback_url = match backend {
            GpuBackend::Cuda | GpuBackend::Unknown => "https://github.com/leejet/stable-diffusion.cpp/releases/download/master-796-2d0385b/sd-master-2d0385b-bin-win-cuda12-x64.zip",
            GpuBackend::Vulkan | GpuBackend::Npu => "https://github.com/leejet/stable-diffusion.cpp/releases/download/master-796-2d0385b/sd-master-2d0385b-bin-win-vulkan-x64.zip",
            _ => "https://github.com/leejet/stable-diffusion.cpp/releases/download/master-796-2d0385b/sd-master-2d0385b-bin-win-vulkan-x64.zip",
        };
        ("master-796-2d0385b".to_string(), fallback_url.to_string())
    }

    pub async fn ensure_sd_cli(
        &self,
        data_dir: &Path,
        backend: &GpuBackend,
        on_progress: impl Fn(f32, &str) + Send + 'static,
    ) -> Result<PathBuf, String> {
        let bin_dir = data_dir.join("binaries");
        let sd_bin_dir = bin_dir.join("stable-diffusion");
        tokio::fs::create_dir_all(&sd_bin_dir).await.map_err(|e| e.to_string())?;

        let binary_name = Self::sd_binary_name(backend);
        let cli_path = sd_bin_dir.join(binary_name);

        let needs_download = match tokio::fs::metadata(&cli_path).await {
            Ok(m) => m.len() < 1024,
            Err(_) => true,
        };

        if !needs_download {
            on_progress(100.0, "stable-diffusion-cpp binary already installed.");
            return Ok(cli_path);
        }

        let _permit = DOWNLOAD_SEMAPHORE.acquire().await.unwrap();

        if cli_path.exists() && tokio::fs::metadata(&cli_path).await.map(|m| m.len()).unwrap_or(0) >= 1024 {
            on_progress(100.0, "stable-diffusion-cpp binary already installed.");
            return Ok(cli_path);
        }

        on_progress(0.0, "Resolving stable-diffusion.cpp release...");
        let (tag_name, url) = self.resolve_sd_release(backend).await;
        let zip_name = url.split('/').last().unwrap_or("sd-cli.zip");
        let zip_path = sd_bin_dir.join(zip_name);

        on_progress(5.0, &format!("Downloading stable-diffusion.cpp {} ({:?})...", tag_name, backend));
        self.download_file(&url, &zip_path, |p| {
            on_progress(5.0 + (p * 0.8), &format!("Downloading stable-diffusion-cpp... {:.0}%", p));
        }).await?;

        on_progress(85.0, "Extracting stable-diffusion-cpp binary...");
        let zip_str = zip_path.to_string_lossy().replace("\\\\?\\", "");
        let sd_bin_str = sd_bin_dir.to_string_lossy().replace("\\\\?\\", "");

        let extract_ok = Self::extract_with_retry(&zip_str, &sd_bin_str).await;
        if !extract_ok {
            return Err(format!("Failed to extract stable-diffusion-cpp {}", zip_name));
        }

        let mut found_exe = None;
        if let Ok(mut entries) = tokio::fs::read_dir(&sd_bin_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let name = entry.file_name().to_string_lossy().to_string();
                let name_lower = name.to_lowercase();
                if name_lower == "sd-cli.exe" || name_lower == "sd.exe" || name_lower == "sd-cli" || name_lower == "sd" {
                    found_exe = Some(entry.path());
                    break;
                }
            }
        }

        if found_exe.is_none() {
            if let Ok(mut entries) = tokio::fs::read_dir(&sd_bin_dir).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    if entry.path().is_dir() {
                        if let Ok(mut sub_entries) = tokio::fs::read_dir(entry.path()).await {
                            while let Ok(Some(sub_entry)) = sub_entries.next_entry().await {
                                let name = sub_entry.file_name().to_string_lossy().to_string();
                                let name_lower = name.to_lowercase();
                                if name_lower == "sd-cli.exe" || name_lower == "sd.exe" || name_lower == "sd-cli" || name_lower == "sd" {
                                    found_exe = Some(sd_bin_dir.join(&name));
                                    let mut move_entries = tokio::fs::read_dir(entry.path()).await.map_err(|e| e.to_string())?;
                                    while let Ok(Some(me)) = move_entries.next_entry().await {
                                        let dest = sd_bin_dir.join(me.file_name());
                                        let _ = tokio::fs::rename(me.path(), dest).await;
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some(src_exe) = found_exe {
            if src_exe != cli_path {
                tokio::fs::rename(&src_exe, &cli_path).await
                    .map_err(|e| format!("Failed to rename stable-diffusion binary: {}", e))?;
            }
        } else if !cli_path.exists() {
            return Err(format!("Expected stable-diffusion binary not found after extraction: {}", binary_name));
        }

        let _ = tokio::fs::remove_file(&zip_path).await;
        let _ = tokio::fs::write(sd_bin_dir.join(".version"), &tag_name).await;

        on_progress(100.0, &format!("stable-diffusion-cpp {} installed.", tag_name));
        Ok(cli_path)
    }


    /// Ensure the llama-server binary is present for local inference.
    pub async fn ensure_assets(
        &self,
        data_dir: &Path,
        backend: &GpuBackend,
        on_progress: impl Fn(f32, &str) + Send + 'static + Clone,
    ) -> Result<(PathBuf, PathBuf), String> {
        let models_dir = data_dir.join("models");
        tokio::fs::create_dir_all(&models_dir).await.map_err(|e| e.to_string())?;

        let on_server = on_progress.clone();
        let server_path = self.ensure_server(data_dir, backend, on_server).await?;
        on_progress(100.0, "Inference engine ready.");
        Ok((models_dir, server_path))
    }

    async fn extract_with_retry(zip_str: &str, bin_str: &str) -> bool {
        let zip_path = PathBuf::from(zip_str);
        let bin_path = PathBuf::from(bin_str);
        
        for attempt in 0..5 {
            let zp = zip_path.clone();
            let bp = bin_path.clone();
            let result = tokio::task::spawn_blocking(move || -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
                let file = std::fs::File::open(&zp)?;
                let mut archive = zip::ZipArchive::new(file)?;
                
                for i in 0..archive.len() {
                    let mut file = archive.by_index(i)?;
                    let outpath = match file.enclosed_name() {
                        Some(path) => bp.join(path),
                        None => continue,
                    };
                    
                    if file.is_dir() {
                        std::fs::create_dir_all(&outpath)?;
                    } else {
                        if let Some(p) = outpath.parent() {
                            if !p.exists() {
                                std::fs::create_dir_all(&p)?;
                            }
                        }
                        let mut outfile = std::fs::File::create(&outpath)?;
                        std::io::copy(&mut file, &mut outfile)?;
                    }
                }
                Ok(())
            }).await;

            if let Ok(Ok(())) = result {
                return true;
            }

            if attempt < 4 {
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            }
        }
        false
    }

    async fn download_file(
        &self,
        url: &str,
        dest: &Path,
        on_progress: impl Fn(f32),
    ) -> Result<(), String> {
        info!("[Downloader] Downloading: {}", url);
        let mut response = self.client.get(url).send().await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Download failed ({}): {}", response.status(), url));
        }

        let total = response.content_length().unwrap_or(0);
        let tmp = dest.with_extension("tmp");
        let file = tokio::fs::File::create(&tmp).await.map_err(|e| e.to_string())?;
        let mut writer = tokio::io::BufWriter::with_capacity(1024 * 1024, file);

        let mut downloaded = 0u64;
        let mut last_emit = std::time::Instant::now();

        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            writer.write_all(&chunk).await.map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;
            if total > 0 && last_emit.elapsed().as_millis() > 250 {
                on_progress((downloaded as f32 / total as f32) * 100.0);
                last_emit = std::time::Instant::now();
            }
        }

        if total > 0 { on_progress(100.0); }
        writer.flush().await.map_err(|e| e.to_string())?;
        drop(writer);
        tokio::fs::rename(&tmp, dest).await.map_err(|e| e.to_string())?;
        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
