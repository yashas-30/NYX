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

struct SpeedEstimator {
    window_start: std::time::Instant,
    bytes_in_window: u64,
    smoothed_speed: f64,
    alpha: f64,
    has_sample: bool,
}

impl SpeedEstimator {
    fn new() -> Self {
        Self {
            window_start: std::time::Instant::now(),
            bytes_in_window: 0,
            smoothed_speed: 0.0,
            alpha: 0.25,
            has_sample: false,
        }
    }

    fn add_bytes(&mut self, n: u64) {
        self.bytes_in_window += n;
        let elapsed = self.window_start.elapsed().as_secs_f64();
        if elapsed >= 0.5 {
            let instant_speed = (self.bytes_in_window as f64) / elapsed;
            if !self.has_sample {
                self.smoothed_speed = instant_speed;
                self.has_sample = true;
            } else {
                self.smoothed_speed = self.alpha * instant_speed + (1.0 - self.alpha) * self.smoothed_speed;
            }
            self.window_start = std::time::Instant::now();
            self.bytes_in_window = 0;
        }
    }

    fn current_speed(&self) -> u64 {
        if !self.has_sample {
            let elapsed = self.window_start.elapsed().as_secs_f64();
            if elapsed > 0.1 {
                return ((self.bytes_in_window as f64) / elapsed).max(0.0) as u64;
            }
            return 0;
        }
        self.smoothed_speed.max(0.0) as u64
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
    on_progress: impl Fn(f32, u64, u64, u64, u64) + Send + Sync + 'static,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    // Use full browser User-Agent + TCP connection pooling for max CDN bandwidth.
    // Note: No global request timeout (which previously killed downloads > 10m).
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .tcp_keepalive(std::time::Duration::from_secs(30))
        .tcp_nodelay(true)
        .connect_timeout(std::time::Duration::from_secs(30))
        .pool_max_idle_per_host(16)
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
    // If disk_part_size matches total_size but saved_downloaded is smaller, truncate preallocated file.
    let initial_downloaded = if saved_downloaded > 0 && total_size > 0 && saved_downloaded < total_size {
        saved_downloaded
    } else if disk_part_size > 0 && total_size > 0 && disk_part_size < total_size {
        disk_part_size
    } else {
        0
    };

    if initial_downloaded < disk_part_size {
        if let Ok(file) = tokio::fs::OpenOptions::new().write(true).open(&dest_part).await {
            let _ = file.set_len(initial_downloaded).await;
        }
    }

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

    let mut downloaded = initial_downloaded;
    let mut speed_estimator = SpeedEstimator::new();
    let mut last_emit = std::time::Instant::now();
    let mut last_persist = std::time::Instant::now();

    // Initial progress emission
    let initial_pct = if total_size > 0 {
        ((downloaded as f32 / total_size as f32) * 100.0).min(100.0)
    } else {
        0.0
    };
    on_progress(initial_pct, downloaded, total_size, 0, 0);

    let mut retries = 0;
    const MAX_RETRIES: u32 = 8;

    while (total_size == 0 || downloaded < total_size) && !is_cancelled.load(Ordering::SeqCst) {
        if is_paused.load(Ordering::SeqCst) {
            return Err("Download paused".to_string());
        }

        let file = if downloaded > 0 {
            tokio::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&dest_part)
                .await
                .map_err(|e| e.to_string())?
        } else {
            tokio::fs::OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(&dest_part)
                .await
                .map_err(|e| e.to_string())?
        };

        let mut writer = tokio::io::BufWriter::with_capacity(8 * 1024 * 1024, file);

        let mut req_stream = client.get(&url);
        if downloaded > 0 {
            req_stream = req_stream.header(RANGE, format!("bytes={}-", downloaded));
        }
        if let Some(token) = state.get_token().await {
            req_stream = req_stream.header(AUTHORIZATION, format!("Bearer {}", token));
        }

        let resp_result = tokio::time::timeout(std::time::Duration::from_secs(30), req_stream.send()).await;
        let mut response = match resp_result {
            Ok(Ok(resp)) => resp,
            Ok(Err(e)) => {
                retries += 1;
                if retries > MAX_RETRIES {
                    return Err(format!("Download failed after {} retries: {}", MAX_RETRIES, e));
                }
                let backoff = std::cmp::min(retries * 1000, 5000);
                tokio::time::sleep(std::time::Duration::from_millis(backoff as u64)).await;
                continue;
            }
            Err(_) => {
                retries += 1;
                if retries > MAX_RETRIES {
                    return Err("Connection timed out repeatedly".to_string());
                }
                let backoff = std::cmp::min(retries * 1000, 5000);
                tokio::time::sleep(std::time::Duration::from_millis(backoff as u64)).await;
                continue;
            }
        };

        let status = response.status();
        if downloaded > 0 && status == reqwest::StatusCode::OK {
            // Mirror ignored Range header; restart cleanly from 0
            downloaded = 0;
            let _ = writer.flush().await;
            drop(writer);
            let _ = tokio::fs::OpenOptions::new()
                .write(true)
                .truncate(true)
                .open(&dest_part)
                .await;
            continue;
        }

        if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
            if total_size > 0 && downloaded >= total_size {
                break;
            }
            // Range error, restart from zero
            downloaded = 0;
            let _ = writer.flush().await;
            drop(writer);
            let _ = tokio::fs::OpenOptions::new()
                .write(true)
                .truncate(true)
                .open(&dest_part)
                .await;
            continue;
        }

        if !status.is_success() && status != reqwest::StatusCode::PARTIAL_CONTENT {
            retries += 1;
            if retries > MAX_RETRIES {
                return Err(format!("Download failed ({}): {}", status, url));
            }
            let backoff = std::cmp::min(retries * 1000, 5000);
            tokio::time::sleep(std::time::Duration::from_millis(backoff as u64)).await;
            continue;
        }

        let mut stream_interrupted = false;
        loop {
            if is_cancelled.load(Ordering::SeqCst) {
                let _ = writer.flush().await;
                let _ = tokio::fs::remove_file(&dest_part).await;
                return Err("Download cancelled".to_string());
            }
            if is_paused.load(Ordering::SeqCst) {
                let _ = writer.flush().await;
                return Err("Download paused".to_string());
            }

            let chunk_res = tokio::time::timeout(std::time::Duration::from_secs(30), response.chunk()).await;
            let chunk = match chunk_res {
                Ok(Ok(Some(c))) => c,
                Ok(Ok(None)) => break,
                Ok(Err(e)) => {
                    eprintln!("[hf_downloader] Stream chunk error: {}, resuming...", e);
                    stream_interrupted = true;
                    break;
                }
                Err(_) => {
                    eprintln!("[hf_downloader] Stream chunk read timeout (30s), resuming...");
                    stream_interrupted = true;
                    break;
                }
            };

            writer.write_all(&chunk).await.map_err(|e| e.to_string())?;
            let chunk_len = chunk.len() as u64;
            downloaded += chunk_len;
            retries = 0; // Reset retries on productive chunk

            speed_estimator.add_bytes(chunk_len);

            if last_emit.elapsed().as_millis() >= 150 {
                last_emit = std::time::Instant::now();
                let speed = speed_estimator.current_speed();
                let eta = if speed > 0 && total_size > downloaded {
                    (total_size - downloaded) / speed
                } else {
                    0
                };
                let pct = if total_size > 0 {
                    ((downloaded as f32 / total_size as f32) * 100.0).min(100.0)
                } else {
                    0.0
                };
                on_progress(pct, downloaded, total_size, speed, eta);

                if last_persist.elapsed().as_secs() >= 2 {
                    last_persist = std::time::Instant::now();
                    let mut pd = state.persistent_downloads.lock().await;
                    if let Some(item) = pd.get_mut(&model_id) {
                        item.downloaded = downloaded;
                    }
                }
            }
        }

        writer.flush().await.map_err(|e| e.to_string())?;

        if stream_interrupted {
            retries += 1;
            if retries > MAX_RETRIES {
                return Err(format!("Download stream stalled after {} retries", MAX_RETRIES));
            }
            let backoff = std::cmp::min(retries * 500, 3000);
            tokio::time::sleep(std::time::Duration::from_millis(backoff as u64)).await;
        } else if total_size > 0 && downloaded >= total_size {
            break;
        } else if total_size == 0 {
            break;
        }
    }

    if is_cancelled.load(Ordering::SeqCst) {
        let _ = tokio::fs::remove_file(&dest_part).await;
        return Err("Download cancelled".to_string());
    }

    // Clean up persistence entry on completion
    { state.persistent_downloads.lock().await.remove(&model_id); }
    state.save_persistence().await;

    let final_total = if total_size > 0 { total_size } else { downloaded };
    on_progress(100.0, final_total, final_total, 0, 0);

    tokio::fs::rename(&dest_part, &dest).await
        .map_err(|e| format!("Failed to finalise download: {}", e))?;

    let mut author = "Hugging Face".to_string();
    let mut tags: Vec<String> = Vec::new();
    let mut pipeline_tag: Option<String> = None;
    let mut supports_reasoning = false;
    let mut supports_vision = false;
    let mut supports_audio = false;
    let mut supports_tools = false;
    let mut context_length: Option<u32> = None;
    let mut architecture: Option<String> = None;

    if let Some(ref rid) = repo_id {
        author = rid.split('/').next().unwrap_or("Hugging Face").to_string();
        let token_opt = state.token.lock().await.clone();
        if let Some(hf_info) = fetch_hf_model_metadata(&client, rid, token_opt.as_deref()).await {
            pipeline_tag = hf_info.get("pipeline_tag").and_then(|v| v.as_str()).map(String::from);
            
            // Extract from tags
            if let Some(arr) = hf_info.get("tags").and_then(|v| v.as_array()) {
                for t in arr {
                    if let Some(s) = t.as_str() {
                        let sl = s.to_lowercase();
                        if sl == "reasoning" || sl == "thinking" || sl == "thought" || sl.contains("reasoning") || sl.contains("chain-of-thought") {
                            supports_reasoning = true;
                        }
                        if sl == "vision" || sl == "multimodal" || sl.contains("vision") || sl.contains("image-to-text") || sl.contains("image-text-to-text") {
                            supports_vision = true;
                        }
                        if sl == "audio" || sl == "speech" || sl == "whisper" || sl.contains("audio") || sl.contains("speech") || sl.contains("voice") {
                            supports_audio = true;
                        }
                        if sl == "tool-use" || sl == "function-calling" || sl == "tools" || sl == "agentic" {
                            supports_tools = true;
                        }
                        tags.push(s.to_string());
                    }
                }
            }

            // Inspect live GGUF metadata from HF API
            if let Some(gguf_val) = hf_info.get("gguf") {
                if let Some(ctx) = gguf_val.get("context_length").and_then(|v| v.as_u64()) {
                    context_length = Some(ctx as u32);
                }
                if let Some(arch) = gguf_val.get("architecture").and_then(|v| v.as_str()) {
                    architecture = Some(arch.to_string());
                }
                if let Some(tpl) = gguf_val.get("chat_template").and_then(|v| v.as_str()) {
                    let tpl_lower = tpl.to_lowercase();
                    if tpl.contains("<think>")
                        || tpl.contains("<|thought|>")
                        || tpl.contains("<|channel>thought")
                        || tpl.contains("thought\n")
                        || tpl_lower.contains("enable_thinking")
                        || tpl_lower.contains("strip_thinking")
                        || tpl.contains("[think]")
                        || tpl_lower.contains("reasoning_content")
                    {
                        supports_reasoning = true;
                    }
                    if tpl_lower.contains("tool_call")
                        || tpl_lower.contains("tool_response")
                        || tpl_lower.contains("declaration:")
                        || tpl_lower.contains("<|tool")
                    {
                        supports_tools = true;
                    }
                    if tpl.contains("<|image|>") || tpl_lower.contains("image_url") {
                        supports_vision = true;
                    }
                    if tpl.contains("<|audio|>") || tpl_lower.contains("audio_url") {
                        supports_audio = true;
                    }
                }
            }

            if pipeline_tag.as_deref() == Some("image-to-text")
                || pipeline_tag.as_deref() == Some("image-text-to-text")
                || pipeline_tag.as_deref() == Some("visual-question-answering")
            {
                supports_vision = true;
            }
            if pipeline_tag.as_deref() == Some("automatic-speech-recognition")
                || pipeline_tag.as_deref() == Some("audio-to-text")
                || pipeline_tag.as_deref() == Some("text-to-speech")
                || pipeline_tag.as_deref() == Some("audio-classification")
            {
                supports_audio = true;
            }

            if let Some(cfg) = hf_info.get("config") {
                if context_length.is_none() {
                    context_length = cfg.get("max_position_embeddings")
                        .or_else(|| cfg.get("context_length"))
                        .or_else(|| cfg.get("max_sequence_length"))
                        .and_then(|v| v.as_u64())
                        .map(|v| v as u32);
                }
                if architecture.is_none() {
                    if let Some(m_type) = cfg.get("model_type").and_then(|v| v.as_str()) {
                        architecture = Some(m_type.to_string());
                    } else if let Some(arch_arr) = cfg.get("architectures").and_then(|v| v.as_array()) {
                        if let Some(first_arch) = arch_arr.first().and_then(|v| v.as_str()) {
                            architecture = Some(first_arch.to_string());
                        }
                    }
                }
            }

            // Inherit from base_model if tags are sparse
            let base_model_id = hf_info.get("cardData")
                .and_then(|cd| cd.get("base_model"))
                .and_then(|bm| bm.as_str().or_else(|| bm.as_array().and_then(|a| a.first()?.as_str())))
                .map(String::from);

            if let Some(base_id) = base_model_id {
                if let Some(base_info) = fetch_hf_model_metadata(&client, &base_id, token_opt.as_deref()).await {
                    if let Some(arr) = base_info.get("tags").and_then(|v| v.as_array()) {
                        for t in arr {
                            if let Some(s) = t.as_str() {
                                let sl = s.to_lowercase();
                                if sl == "reasoning" || sl == "thinking" || sl == "thought" || sl.contains("reasoning") || sl.contains("chain-of-thought") {
                                    supports_reasoning = true;
                                }
                                if sl == "vision" || sl == "multimodal" || sl.contains("vision") || sl.contains("image-to-text") || sl.contains("image-text-to-text") {
                                    supports_vision = true;
                                }
                                if sl == "audio" || sl == "speech" || sl == "whisper" || sl.contains("audio") || sl.contains("speech") || sl.contains("voice") {
                                    supports_audio = true;
                                }
                                if sl == "tool-use" || sl == "function-calling" || sl == "tools" || sl == "agentic" {
                                    supports_tools = true;
                                }
                                if !tags.iter().any(|existing| existing.eq_ignore_ascii_case(s)) {
                                    tags.push(s.to_string());
                                }
                            }
                        }
                    }
                    if pipeline_tag.is_none() {
                        pipeline_tag = base_info.get("pipeline_tag").and_then(|v| v.as_str()).map(String::from);
                    }
                    if pipeline_tag.as_deref() == Some("image-to-text")
                        || pipeline_tag.as_deref() == Some("image-text-to-text")
                        || pipeline_tag.as_deref() == Some("visual-question-answering")
                    {
                        supports_vision = true;
                    }
                    if pipeline_tag.as_deref() == Some("automatic-speech-recognition")
                        || pipeline_tag.as_deref() == Some("audio-to-text")
                        || pipeline_tag.as_deref() == Some("text-to-speech")
                        || pipeline_tag.as_deref() == Some("audio-classification")
                    {
                        supports_audio = true;
                    }
                }
            }
        }
    }

    // Also inspect GGUF header if GGUF file
    let is_gguf = dest.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("gguf")).unwrap_or(false);
    if is_gguf {
        if let Ok(gguf_meta) = super::scheduler::parse_gguf_metadata(&dest) {
            if gguf_meta.supports_reasoning {
                supports_reasoning = true;
            }
            if context_length.is_none() {
                context_length = gguf_meta.context_length;
            }
            if architecture.is_none() {
                architecture = gguf_meta.architecture.clone();
            }
            for t in gguf_meta.tags {
                if !tags.contains(&t) {
                    tags.push(t);
                }
            }
        }
    }

    let fname = dest.file_name().unwrap_or_default().to_string_lossy().to_string();
    let meta_path = dest.parent().unwrap_or(&dest).join(format!("{}.meta.json", fname));
    let meta = serde_json::json!({
        "author": author,
        "repo_id": repo_id,
        "pipeline_tag": pipeline_tag,
        "tags": tags,
        "supports_reasoning": supports_reasoning,
        "supports_vision": supports_vision,
        "supports_audio": supports_audio,
        "supports_tools": supports_tools,
        "context_length": context_length,
        "architecture": architecture,
    });
    let _ = tokio::fs::write(&meta_path, serde_json::to_string_pretty(&meta).unwrap_or_else(|_| meta.to_string())).await.ok();

    invalidate_local_models_cache();
    Ok(())
}

async fn fetch_hf_model_metadata(client: &Client, repo_id: &str, token: Option<&str>) -> Option<serde_json::Value> {
    let url = format!("https://huggingface.co/api/models/{}", repo_id);
    let mut req = client.get(&url).header("User-Agent", "NYX-App/1.0");
    if let Some(t) = token {
        if !t.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", t));
        }
    }
    match req.send().await {
        Ok(resp) if resp.status().is_success() => resp.json::<serde_json::Value>().await.ok(),
        _ => None,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
