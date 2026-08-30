use super::commands::invalidate_local_models_cache;
// ─────────────────────────────────────────────────────────────────────────────
// NYX — HuggingFace GGUF Downloader & Task Persistence
// ─────────────────────────────────────────────────────────────────────────────

use reqwest::{Client, header::{RANGE, AUTHORIZATION}};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::Mutex;

// § 7 — HF DOWNLOADER (resumable, pause/cancel, persistence)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct PersistentDownload {
    pub model_id: String,
    pub filename: String,
    pub url: String,
    pub total_size: u64,
    #[serde(default)]
    pub downloaded: u64,
    /// Preserved so meta.json is written correctly on resume.
    pub repo_id: Option<String>,
}

pub struct DownloadTask {
    pub is_paused: Arc<AtomicBool>,
    pub is_cancelled: Arc<AtomicBool>,
    pub handle: tokio::task::JoinHandle<()>,
}

pub struct HfDownloaderState {
    pub tasks: Mutex<HashMap<String, DownloadTask>>,
    pub persistent_downloads: Mutex<HashMap<String, PersistentDownload>>,
    pub token: Mutex<Option<String>>,
    pub downloads_file_path: Mutex<Option<PathBuf>>,
}

impl HfDownloaderState {
    pub fn new() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
            persistent_downloads: Mutex::new(HashMap::new()),
            token: Mutex::new(None),
            downloads_file_path: Mutex::new(None),
        }
    }

    pub async fn init_persistence(&self, app_data_dir: PathBuf) {
        let mut path_guard = self.downloads_file_path.lock().await;
        if path_guard.is_some() {
            return;
        }
        let file_path = app_data_dir.join("models").join("downloads.json");
        *path_guard = Some(file_path.clone());
        drop(path_guard);

        if file_path.exists() {
            if let Ok(content) = tokio::fs::read_to_string(&file_path).await {
                if let Ok(map) = serde_json::from_str::<HashMap<String, PersistentDownload>>(&content) {
                    *self.persistent_downloads.lock().await = map;
                }
            }
        }
    }

    pub async fn save_persistence(&self) {
        let path_opt = self.downloads_file_path.lock().await.clone();
        if let Some(path) = path_opt {
            if let Some(parent) = path.parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }
            let map = self.persistent_downloads.lock().await.clone();
            if let Ok(content) = serde_json::to_string_pretty(&map) {
                let tmp_path = path.with_extension("tmp");
                let _ = tokio::fs::write(&tmp_path, content).await;
                let _ = tokio::fs::rename(&tmp_path, &path).await;
            }
        }
    }

    pub async fn set_token(&self, token: String) {
        *self.token.lock().await = Some(token);
    }

    pub async fn get_token(&self) -> Option<String> {
        self.token.lock().await.clone()
    }
}

pub async fn download_hf_model(
    state: Arc<HfDownloaderState>,
    url: String,
    dest: PathBuf,
    model_id: String,
    repo_id: Option<String>,
    is_paused: Arc<AtomicBool>,
    is_cancelled: Arc<AtomicBool>,
    on_progress: impl Fn(f32, u64, u64) + Send + Sync + 'static,
) -> Result<(), String> {
    use std::io::SeekFrom;
    use tokio::io::AsyncSeekExt;
    use tokio::io::AsyncWriteExt;

    // Use full browser User-Agent + TCP connection pooling for max CDN bandwidth
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .tcp_keepalive(std::time::Duration::from_secs(60))
        .pool_max_idle_per_host(32)
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;

    let dest_filename = dest.file_name().unwrap_or_default().to_string_lossy();
    let dest_part = dest.parent().unwrap_or(&dest).join(format!("{}.part", dest_filename));
    let disk_part_size = if dest_part.exists() {
        tokio::fs::metadata(&dest_part).await.map(|m| m.len()).unwrap_or(0)
    } else {
        if let Some(parent) = dest_part.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
        }
        tokio::fs::File::create(&dest_part).await.map_err(|e| e.to_string())?;
        0
    };

    let saved_downloaded = {
        let pd = state.persistent_downloads.lock().await;
        pd.get(&model_id).map(|p| p.downloaded).unwrap_or(0)
    };

    // Probe total size with automatic branch fallback (main -> master -> HEAD -> raw)
    let mut resolved_url = url.clone();
    let mut req = client.get(&resolved_url);
    if let Some(token) = state.get_token().await {
        req = req.header(AUTHORIZATION, format!("Bearer {}", token));
    }

    let mut head_resp = req.send().await.map_err(|e| e.to_string())?;

    if head_resp.status() == reqwest::StatusCode::NOT_FOUND {
        let fallbacks = if resolved_url.contains("/resolve/main/") {
            vec![
                resolved_url.replace("/resolve/main/", "/resolve/master/"),
                resolved_url.replace("/resolve/main/", "/resolve/HEAD/"),
                resolved_url.replace("/resolve/main/", "/raw/main/"),
                resolved_url.replace("/resolve/main/", "/raw/master/"),
            ]
        } else if resolved_url.contains("/resolve/master/") {
            vec![
                resolved_url.replace("/resolve/master/", "/resolve/main/"),
                resolved_url.replace("/resolve/master/", "/resolve/HEAD/"),
            ]
        } else {
            vec![]
        };

        for fallback in fallbacks {
            let mut alt_req = client.get(&fallback);
            if let Some(token) = state.get_token().await {
                alt_req = alt_req.header(AUTHORIZATION, format!("Bearer {}", token));
            }
            if let Ok(alt_resp) = alt_req.send().await {
                if alt_resp.status().is_success() {
                    resolved_url = fallback;
                    head_resp = alt_resp;
                    break;
                }
            }
        }
    }

    if !head_resp.status().is_success() {
        return Err(format!("Download failed ({}): {}", head_resp.status(), resolved_url));
    }

    let url = resolved_url;
    let total_size = head_resp.content_length().unwrap_or(0);

    // Calculate actual initial downloaded bytes.
    // Pre-allocation expands .part file to total_size on disk.
    // We must ignore disk_part_size if it matches total_size and use saved_downloaded instead.
    let initial_downloaded = if saved_downloaded > 0 && total_size > 0 && saved_downloaded < total_size {
        saved_downloaded
    } else if disk_part_size > 0 && total_size > 0 && disk_part_size < total_size {
        disk_part_size
    } else {
        0
    };

    // Save download persistence state
    {
        let mut pd = state.persistent_downloads.lock().await;
        pd.insert(model_id.clone(), PersistentDownload {
            model_id: model_id.clone(),
            filename: dest.file_name().unwrap_or_default().to_string_lossy().to_string(),
            url: url.clone(),
            total_size,
            downloaded: initial_downloaded,
            repo_id: repo_id.clone(),
        });
    }
    state.save_persistence().await;

    let on_progress_arc = Arc::new(on_progress);

    // Use 8 parallel worker connections for files > 32 MB
    let supports_range = total_size > 32 * 1024 * 1024;

    if supports_range {
        // Pre-allocate destination file size
        let file = tokio::fs::OpenOptions::new()
            .write(true)
            .open(&dest_part).await
            .map_err(|e| e.to_string())?;
        file.set_len(total_size).await.map_err(|e| e.to_string())?;
        drop(file);

        // Fixed 4 MB chunk size for dynamic work-stealing queue
        let chunk_size: u64 = 4 * 1024 * 1024;
        let total_chunks = (total_size + chunk_size - 1) / chunk_size;

        // Compute initial chunk index to resume cleanly without disk byte gaps
        let initial_chunk = initial_downloaded / chunk_size;
        let effective_initial_downloaded = initial_chunk * chunk_size;

        let next_chunk_index = Arc::new(std::sync::atomic::AtomicU64::new(initial_chunk));
        let downloaded_bytes = Arc::new(std::sync::atomic::AtomicU64::new(effective_initial_downloaded));

        let num_workers = 8;
        let mut tasks = Vec::new();

        let last_emit_arc = Arc::new(tokio::sync::Mutex::new(std::time::Instant::now()));

        for _ in 0..num_workers {
            let client_worker = client.clone();
            let url_worker = url.clone();
            let dest_part_worker = dest_part.clone();
            let token_opt = state.get_token().await;
            let is_paused_w = is_paused.clone();
            let is_cancelled_w = is_cancelled.clone();
            let downloaded_bytes_w = downloaded_bytes.clone();
            let next_chunk_w = next_chunk_index.clone();
            let on_progress_w = on_progress_arc.clone();
            let last_emit_w = last_emit_arc.clone();

            let state_worker = state.clone();
            let mid_worker = model_id.clone();

            tasks.push(tokio::spawn(async move {
                let mut file_w = tokio::fs::OpenOptions::new()
                    .write(true)
                    .open(&dest_part_worker).await
                    .map_err(|e| e.to_string())?;

                loop {
                    if is_cancelled_w.load(Ordering::SeqCst) || is_paused_w.load(Ordering::SeqCst) {
                        return Err("Cancelled or paused".to_string());
                    }

                    let chunk_idx = next_chunk_w.fetch_add(1, Ordering::SeqCst);
                    if chunk_idx >= total_chunks {
                        break;
                    }

                    let start = chunk_idx * chunk_size;
                    let end = ((chunk_idx + 1) * chunk_size - 1).min(total_size - 1);

                    // Fetch chunk with per-chunk retry logic (up to 3 retries)
                    let mut attempts = 0;
                    let mut bytes_data = None;

                    while attempts < 3 {
                        if is_cancelled_w.load(Ordering::SeqCst) || is_paused_w.load(Ordering::SeqCst) {
                            return Err("Cancelled or paused".to_string());
                        }

                        let mut req_w = client_worker.get(&url_worker)
                            .header(RANGE, format!("bytes={}-{}", start, end));
                        if let Some(ref t) = token_opt {
                            req_w = req_w.header(AUTHORIZATION, format!("Bearer {}", t));
                        }

                        match tokio::time::timeout(std::time::Duration::from_secs(30), req_w.send()).await {
                            Ok(Ok(resp)) if resp.status().is_success() || resp.status() == reqwest::StatusCode::PARTIAL_CONTENT => {
                                match tokio::time::timeout(std::time::Duration::from_secs(30), resp.bytes()).await {
                                    Ok(Ok(b)) => {
                                        bytes_data = Some(b);
                                        break;
                                    }
                                    _ => {}
                                }
                            }
                            _ => {}
                        }

                        attempts += 1;
                        if attempts < 3 {
                            tokio::time::sleep(std::time::Duration::from_millis(500 * attempts as u64)).await;
                        }
                    }

                    let chunk_bytes = match bytes_data {
                        Some(b) => b,
                        None => return Err(format!("Chunk {} (bytes {}-{}) failed after retries", chunk_idx, start, end)),
                    };

                    file_w.seek(SeekFrom::Start(start)).await.map_err(|e| e.to_string())?;
                    file_w.write_all(&chunk_bytes).await.map_err(|e| e.to_string())?;

                    let total_d = downloaded_bytes_w.fetch_add(chunk_bytes.len() as u64, Ordering::SeqCst) + chunk_bytes.len() as u64;

                    if total_size > 0 {
                        let mut last = last_emit_w.lock().await;
                        if last.elapsed().as_millis() >= 150 {
                            *last = std::time::Instant::now();
                            drop(last);
                            let pct = (total_d as f32 / total_size as f32) * 100.0;
                            on_progress_w(pct.min(100.0), total_d, total_size);

                            {
                                let mut pd = state_worker.persistent_downloads.lock().await;
                                if let Some(item) = pd.get_mut(&mid_worker) {
                                    item.downloaded = total_d;
                                }
                            }
                        }
                    }
                }

                file_w.flush().await.map_err(|e| e.to_string())?;
                Ok(())
            }));
        }

        let results = futures::future::join_all(tasks).await;
        for r in results {
            match r {
                Ok(Ok(())) => {},
                Ok(Err(e)) => {
                    if is_paused.load(Ordering::SeqCst) {
                        return Err("Download paused".to_string());
                    }
                    if is_cancelled.load(Ordering::SeqCst) {
                        let _ = tokio::fs::remove_file(&dest_part).await;
                        return Err("Download cancelled".to_string());
                    }
                    return Err(e);
                }
                Err(e) => return Err(format!("Worker thread panicked: {}", e)),
            }
        }
    } else {
        // Single-stream fallback
        let file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&dest_part).await
            .map_err(|e| e.to_string())?;

        let mut downloaded = initial_downloaded;
        let mut req_s = client.get(&url);
        if downloaded > 0 {
            req_s = req_s.header(RANGE, format!("bytes={}-", downloaded));
        }
        if let Some(token) = state.get_token().await {
            req_s = req_s.header(AUTHORIZATION, format!("Bearer {}", token));
        }

        let mut response = req_s.send().await.map_err(|e| e.to_string())?;
        let mut writer = tokio::io::BufWriter::with_capacity(4 * 1024 * 1024, file);
        let mut last_emit = std::time::Instant::now();

        while !is_cancelled.load(Ordering::SeqCst) {
            if is_paused.load(Ordering::SeqCst) {
                let _ = writer.flush().await;
                return Err("Download paused".to_string());
            }

            let chunk_res = tokio::time::timeout(std::time::Duration::from_secs(30), response.chunk()).await;
            let chunk = match chunk_res {
                Ok(Ok(Some(c))) => c,
                Ok(Ok(None)) => break,
                Ok(Err(e)) => return Err(e.to_string()),
                Err(_) => return Err("Connection timeout".to_string()),
            };

            writer.write_all(&chunk).await.map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;

            if total_size > 0 && last_emit.elapsed().as_millis() > 250 {
                on_progress_arc((downloaded as f32 / total_size as f32) * 100.0, downloaded, total_size);
                last_emit = std::time::Instant::now();
                {
                    let mut pd = state.persistent_downloads.lock().await;
                    if let Some(item) = pd.get_mut(&model_id) {
                        item.downloaded = downloaded;
                    }
                }
            }
        }
        writer.flush().await.map_err(|e| e.to_string())?;
    }

    if is_cancelled.load(Ordering::SeqCst) {
        let _ = tokio::fs::remove_file(&dest_part).await;
        return Err("Download cancelled".to_string());
    }

    // Clean up persistence entry on completion
    { state.persistent_downloads.lock().await.remove(&model_id); }
    state.save_persistence().await;

    on_progress_arc(100.0, total_size, total_size);

    tokio::fs::rename(&dest_part, &dest).await
        .map_err(|e| format!("Failed to finalise download: {}", e))?;

    if let Some(rid) = repo_id {
        let author = rid.split('/').next().unwrap_or("Hugging Face").to_string();
        let fname = dest.file_name().unwrap_or_default().to_string_lossy().to_string();
        let meta_path = dest.parent().unwrap_or(&dest).join(format!("{}.meta.json", fname));
        let meta = serde_json::json!({ "author": author, "repo_id": rid });
        let _ = tokio::fs::write(&meta_path, meta.to_string()).await.ok();
    }

    invalidate_local_models_cache();
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
