use super::commands::invalidate_local_models_cache;
// ─────────────────────────────────────────────────────────────────────────────
// NYX — HuggingFace GGUF Downloader & Task Persistence
// ─────────────────────────────────────────────────────────────────────────────

use futures_util::StreamExt;
use reqwest::{
    header::{ACCEPT_RANGES, AUTHORIZATION, CONTENT_RANGE, RANGE},
    Client, StatusCode,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{info, warn};

#[cfg(windows)]
use std::os::windows::fs::FileExt;

#[cfg(unix)]
use std::os::unix::fs::FileExt;

// § 7 — HF DOWNLOADER CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

pub const CHUNK_SIZE: u64 = 16 * 1024 * 1024; // 16 MiB per chunk
pub const CONCURRENT_WORKERS: usize = 6;       // 6 parallel TCP range streams
pub const MAX_CHUNK_RETRIES: u32 = 5;
pub const MIN_CHUNK_DOWNLOAD_SIZE: u64 = 16 * 1024 * 1024; // 16 MiB minimum for chunking

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PersistentDownload {
    pub model_id: String,
    pub filename: String,
    pub url: String,
    pub total_size: u64,
    #[serde(default)]
    pub downloaded: u64,
    /// Preserved so meta.json is written correctly on resume.
    pub repo_id: Option<String>,
    /// Set of chunk indices completed on disk for resumption.
    #[serde(default)]
    pub completed_chunks: Option<Vec<u32>>,
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

// ─────────────────────────────────────────────────────────────────────────────
// Positional Disk Writer (Lockless across concurrent workers)
// ─────────────────────────────────────────────────────────────────────────────

pub fn write_chunk_at(file: &std::fs::File, mut buf: &[u8], mut offset: u64) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        while !buf.is_empty() {
            let written = file.seek_write(buf, offset)?;
            if written == 0 {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::WriteZero,
                    "Failed to write bytes to file (disk full or write zero)",
                ));
            }
            buf = &buf[written..];
            offset += written as u64;
        }
        Ok(())
    }
    #[cfg(unix)]
    {
        file.write_all_at(buf, offset)
    }
    #[cfg(not(any(windows, unix)))]
    {
        use std::io::{Seek, SeekFrom, Write};
        let mut f = file.try_clone()?;
        f.seek(SeekFrom::Start(offset))?;
        f.write_all(buf)?;
        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sliding Window Speed Estimator (Smooth, jitter-free throughput)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct SpeedSample {
    timestamp: std::time::Instant,
    bytes: u64,
}

pub struct SlidingWindowSpeedEstimator {
    samples: VecDeque<SpeedSample>,
    window_duration: std::time::Duration,
    total_bytes_in_window: u64,
}

impl SlidingWindowSpeedEstimator {
    pub fn new(window_secs: f64) -> Self {
        Self {
            samples: VecDeque::new(),
            window_duration: std::time::Duration::from_secs_f64(window_secs),
            total_bytes_in_window: 0,
        }
    }

    pub fn add_bytes(&mut self, bytes: u64) {
        if bytes == 0 {
            return;
        }
        let now = std::time::Instant::now();
        self.samples.push_back(SpeedSample { timestamp: now, bytes });
        self.total_bytes_in_window += bytes;
        self.prune(now);
    }

    fn prune(&mut self, now: std::time::Instant) {
        while let Some(front) = self.samples.front() {
            if now.duration_since(front.timestamp) > self.window_duration {
                if let Some(removed) = self.samples.pop_front() {
                    self.total_bytes_in_window = self.total_bytes_in_window.saturating_sub(removed.bytes);
                }
            } else {
                break;
            }
        }
    }

    pub fn current_speed(&mut self) -> u64 {
        let now = std::time::Instant::now();
        self.prune(now);
        if let (Some(first), Some(last)) = (self.samples.front(), self.samples.back()) {
            let elapsed = last.timestamp.duration_since(first.timestamp).as_secs_f64();
            let effective_duration = elapsed.max(0.2);
            ((self.total_bytes_in_window as f64) / effective_duration).max(0.0) as u64
        } else {
            0
        }
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
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .tcp_keepalive(std::time::Duration::from_secs(30))
        .tcp_nodelay(true)
        .connect_timeout(std::time::Duration::from_secs(15))
        .pool_max_idle_per_host(32)
        .pool_idle_timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())?;

    let dest_filename = dest.file_name().unwrap_or_default().to_string_lossy();
    let dest_part = dest.parent().unwrap_or(&dest).join(format!("{}.part", dest_filename));

    // Probe total size and range capability with automatic branch fallback (main -> master -> HEAD -> raw)
    let mut resolved_url = url.clone();
    let mut probe_req = client.get(&resolved_url).header(RANGE, "bytes=0-0");
    if let Some(token) = state.get_token().await {
        probe_req = probe_req.header(AUTHORIZATION, format!("Bearer {}", token));
    }

    let mut probe_resp = probe_req.send().await.map_err(|e| e.to_string())?;

    if probe_resp.status() == StatusCode::NOT_FOUND {
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
            let mut alt_req = client.get(&fallback).header(RANGE, "bytes=0-0");
            if let Some(token) = state.get_token().await {
                alt_req = alt_req.header(AUTHORIZATION, format!("Bearer {}", token));
            }
            if let Ok(alt_resp) = alt_req.send().await {
                if alt_resp.status().is_success() {
                    resolved_url = fallback;
                    probe_resp = alt_resp;
                    break;
                }
            }
        }
    }

    if !probe_resp.status().is_success() {
        return Err(format!("Download failed ({}): {}", probe_resp.status(), resolved_url));
    }

    let url = resolved_url;
    let supports_range = probe_resp.status() == StatusCode::PARTIAL_CONTENT
        || probe_resp
            .headers()
            .get(ACCEPT_RANGES)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.contains("bytes"))
            .unwrap_or(false);

    // Determine total file size:
    // 1. From Content-Range header: "bytes 0-0/12345678"
    // 2. From X-Linked-Size header (HF specific)
    // 3. From Content-Length (if status == OK)
    let mut total_size = 0u64;
    if let Some(cr) = probe_resp.headers().get(CONTENT_RANGE).and_then(|v| v.to_str().ok()) {
        if let Some(pos) = cr.rfind('/') {
            if let Ok(size) = cr[pos + 1..].trim().parse::<u64>() {
                total_size = size;
            }
        }
    }
    if total_size == 0 {
        if let Some(xls) = probe_resp.headers().get("X-Linked-Size").and_then(|v| v.to_str().ok()) {
            if let Ok(size) = xls.trim().parse::<u64>() {
                total_size = size;
            }
        }
    }
    if total_size == 0 {
        total_size = probe_resp.content_length().unwrap_or(0);
    }

    let on_progress_arc = Arc::new(on_progress);

    // Dispatch to Concurrent or Sequential Engine
    let downloaded_result = if supports_range && total_size >= MIN_CHUNK_DOWNLOAD_SIZE {
        info!(
            "[hf_downloader] Starting high-speed concurrent range download for {} ({} bytes, {} workers)",
            model_id, total_size, CONCURRENT_WORKERS
        );
        download_hf_model_concurrent(
            state.clone(),
            client.clone(),
            url.clone(),
            dest_part.clone(),
            model_id.clone(),
            repo_id.clone(),
            total_size,
            is_paused.clone(),
            is_cancelled.clone(),
            on_progress_arc.clone(),
        )
        .await
    } else {
        info!(
            "[hf_downloader] Starting sequential download for {} (size: {}, range support: {})",
            model_id, total_size, supports_range
        );
        download_hf_model_sequential(
            state.clone(),
            client.clone(),
            url.clone(),
            dest_part.clone(),
            model_id.clone(),
            repo_id.clone(),
            total_size,
            is_paused.clone(),
            is_cancelled.clone(),
            on_progress_arc.clone(),
        )
        .await
    };

    let downloaded = downloaded_result?;

    if is_cancelled.load(Ordering::SeqCst) {
        let _ = tokio::fs::remove_file(&dest_part).await;
        return Err("Download cancelled".to_string());
    }

    // Clean up persistence entry on completion
    {
        state.persistent_downloads.lock().await.remove(&model_id);
    }
    state.save_persistence().await;

    let final_total = if total_size > 0 { total_size } else { downloaded };
    on_progress_arc(100.0, final_total, final_total, 0, 0);

    tokio::fs::rename(&dest_part, &dest)
        .await
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
// Concurrent Chunk Range Engine
// ─────────────────────────────────────────────────────────────────────────────

async fn download_hf_model_concurrent(
    state: Arc<HfDownloaderState>,
    client: Client,
    url: String,
    dest_part: PathBuf,
    model_id: String,
    repo_id: Option<String>,
    total_size: u64,
    is_paused: Arc<AtomicBool>,
    is_cancelled: Arc<AtomicBool>,
    on_progress: Arc<dyn Fn(f32, u64, u64, u64, u64) + Send + Sync + 'static>,
) -> Result<u64, String> {
    if let Some(parent) = dest_part.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }

    let std_file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(&dest_part)
        .map_err(|e| format!("Failed to open part file: {}", e))?;

    // Pre-allocate full size on disk (NTFS contiguous cluster allocation)
    if let Err(e) = std_file.set_len(total_size) {
        warn!("[hf_downloader] Could not pre-allocate file length: {}", e);
    }
    let file_arc = Arc::new(std_file);

    let num_chunks = ((total_size + CHUNK_SIZE - 1) / CHUNK_SIZE) as u32;

    // Load persistent state (completed chunks)
    let (saved_downloaded, mut completed_set) = {
        let pd = state.persistent_downloads.lock().await;
        if let Some(item) = pd.get(&model_id) {
            let set: HashSet<u32> = item
                .completed_chunks
                .as_ref()
                .map(|v| v.iter().cloned().collect())
                .unwrap_or_default();
            (item.downloaded, set)
        } else {
            (0, HashSet::new())
        }
    };

    // Backward compatibility: if resuming a download started with old sequential engine
    if completed_set.is_empty() && saved_downloaded > 0 && total_size > 0 {
        let full_chunks = (saved_downloaded / CHUNK_SIZE) as u32;
        for c in 0..full_chunks {
            completed_set.insert(c);
        }
    }

    let initial_downloaded = (completed_set.len() as u64 * CHUNK_SIZE).min(total_size);

    // Save initial persistence entry
    {
        let mut pd = state.persistent_downloads.lock().await;
        pd.insert(
            model_id.clone(),
            PersistentDownload {
                model_id: model_id.clone(),
                filename: dest_part.file_name().unwrap_or_default().to_string_lossy().replace(".part", ""),
                url: url.clone(),
                total_size,
                downloaded: initial_downloaded,
                repo_id: repo_id.clone(),
                completed_chunks: Some(completed_set.iter().cloned().collect()),
            },
        );
    }
    state.save_persistence().await;

    // Build work queue for pending chunks
    let pending: VecDeque<u32> = (0..num_chunks)
        .filter(|idx| !completed_set.contains(idx))
        .collect();

    if pending.is_empty() {
        return Ok(total_size);
    }

    let queue = Arc::new(tokio::sync::Mutex::new(pending));
    let completed_chunks_arc = Arc::new(tokio::sync::Mutex::new(completed_set));

    // In-flight bytes per chunk for smooth progress reporting
    let in_flight = Arc::new(tokio::sync::Mutex::new(HashMap::<u32, u64>::new()));
    let (progress_tx, mut progress_rx) = tokio::sync::mpsc::unbounded_channel::<u64>();

    // Background progress coordinator
    let prog_state = Arc::clone(&state);
    let prog_model_id = model_id.clone();
    let prog_repo_id = repo_id.clone();
    let prog_filename = dest_part.file_name().unwrap_or_default().to_string_lossy().replace(".part", "");
    let prog_url = url.clone();
    let prog_completed = Arc::clone(&completed_chunks_arc);
    let prog_in_flight = Arc::clone(&in_flight);
    let prog_cb = Arc::clone(&on_progress);
    let is_paused_prog = Arc::clone(&is_paused);
    let is_cancelled_prog = Arc::clone(&is_cancelled);

    let progress_handle = tokio::spawn(async move {
        let mut estimator = SlidingWindowSpeedEstimator::new(2.0);
        let mut last_emit = std::time::Instant::now();
        let mut last_persist = std::time::Instant::now();

        while !is_cancelled_prog.load(Ordering::SeqCst) && !is_paused_prog.load(Ordering::SeqCst) {
            while let Ok(bytes) = progress_rx.try_recv() {
                estimator.add_bytes(bytes);
            }

            if last_emit.elapsed().as_millis() >= 100 {
                last_emit = std::time::Instant::now();
                let completed_count = prog_completed.lock().await.len() as u64;
                let in_flight_bytes: u64 = prog_in_flight.lock().await.values().sum();
                let current_downloaded = ((completed_count * CHUNK_SIZE) + in_flight_bytes).min(total_size);

                let speed = estimator.current_speed();
                let eta = if speed > 0 && total_size > current_downloaded {
                    (total_size - current_downloaded) / speed
                } else {
                    0
                };
                let pct = if total_size > 0 {
                    ((current_downloaded as f32 / total_size as f32) * 100.0).min(99.9)
                } else {
                    0.0
                };

                prog_cb(pct, current_downloaded, total_size, speed, eta);

                if last_persist.elapsed().as_secs() >= 2 {
                    last_persist = std::time::Instant::now();
                    let comp_vec: Vec<u32> = prog_completed.lock().await.iter().cloned().collect();
                    let mut pd = prog_state.persistent_downloads.lock().await;
                    pd.insert(
                        prog_model_id.clone(),
                        PersistentDownload {
                            model_id: prog_model_id.clone(),
                            filename: prog_filename.clone(),
                            url: prog_url.clone(),
                            total_size,
                            downloaded: current_downloaded,
                            repo_id: prog_repo_id.clone(),
                            completed_chunks: Some(comp_vec),
                        },
                    );
                }
            }

            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
    });

    // Spawn concurrent worker pool
    let active_worker_count = std::cmp::min(CONCURRENT_WORKERS, queue.lock().await.len().max(1));
    let mut worker_handles = Vec::with_capacity(active_worker_count);
    let token_opt = state.get_token().await;

    for _ in 0..active_worker_count {
        let q_clone = Arc::clone(&queue);
        let file_clone = Arc::clone(&file_arc);
        let client_clone = client.clone();
        let url_clone = url.clone();
        let token_clone = token_opt.clone();
        let is_paused_w = Arc::clone(&is_paused);
        let is_cancelled_w = Arc::clone(&is_cancelled);
        let p_tx = progress_tx.clone();
        let in_flight_clone = Arc::clone(&in_flight);
        let completed_chunks_clone = Arc::clone(&completed_chunks_arc);

        let handle = tokio::spawn(async move {
            loop {
                if is_cancelled_w.load(Ordering::SeqCst) || is_paused_w.load(Ordering::SeqCst) {
                    return Ok(());
                }

                let chunk_opt = {
                    let mut q = q_clone.lock().await;
                    q.pop_front()
                };

                let chunk_idx = match chunk_opt {
                    Some(idx) => idx,
                    None => return Ok(()), // Queue finished!
                };

                let start = chunk_idx as u64 * CHUNK_SIZE;
                let end = std::cmp::min(start + CHUNK_SIZE, total_size) - 1;
                let expected_bytes = end - start + 1;

                let mut retries = 0;
                let mut success = false;

                while retries < MAX_CHUNK_RETRIES && !success {
                    if is_cancelled_w.load(Ordering::SeqCst) || is_paused_w.load(Ordering::SeqCst) {
                        return Ok(());
                    }

                    match download_single_chunk(
                        &client_clone,
                        &url_clone,
                        token_clone.as_deref(),
                        start,
                        end,
                        &file_clone,
                        &p_tx,
                        chunk_idx,
                        &in_flight_clone,
                        &is_paused_w,
                        &is_cancelled_w,
                    )
                    .await
                    {
                        Ok(bytes) if bytes == expected_bytes => {
                            success = true;
                            let mut comp = completed_chunks_clone.lock().await;
                            comp.insert(chunk_idx);
                            in_flight_clone.lock().await.remove(&chunk_idx);
                        }
                        Ok(bytes) => {
                            retries += 1;
                            in_flight_clone.lock().await.remove(&chunk_idx);
                            warn!(
                                "[hf_downloader] Chunk {} short read: expected {}, got {}. Retrying ({}/{})",
                                chunk_idx, expected_bytes, bytes, retries, MAX_CHUNK_RETRIES
                            );
                            tokio::time::sleep(std::time::Duration::from_millis(500 * retries as u64)).await;
                        }
                        Err(e) => {
                            retries += 1;
                            in_flight_clone.lock().await.remove(&chunk_idx);
                            warn!(
                                "[hf_downloader] Chunk {} error: {}. Retrying ({}/{})",
                                chunk_idx, e, retries, MAX_CHUNK_RETRIES
                            );
                            tokio::time::sleep(std::time::Duration::from_millis(500 * retries as u64)).await;
                        }
                    }
                }

                if !success {
                    if is_cancelled_w.load(Ordering::SeqCst) || is_paused_w.load(Ordering::SeqCst) {
                        return Ok(());
                    }
                    return Err(format!("Chunk {} failed after {} retries", chunk_idx, MAX_CHUNK_RETRIES));
                }
            }
        });
        worker_handles.push(handle);
    }

    let mut worker_error = None;
    for handle in worker_handles {
        match handle.await {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                if worker_error.is_none() {
                    worker_error = Some(e);
                }
            }
            Err(e) => {
                if worker_error.is_none() {
                    worker_error = Some(format!("Worker task error: {}", e));
                }
            }
        }
    }

    progress_handle.abort();

    if is_cancelled.load(Ordering::SeqCst) {
        return Err("Download cancelled".to_string());
    }

    if is_paused.load(Ordering::SeqCst) {
        let comp_vec: Vec<u32> = completed_chunks_arc.lock().await.iter().cloned().collect();
        let completed_bytes = (comp_vec.len() as u64 * CHUNK_SIZE).min(total_size);
        let mut pd = state.persistent_downloads.lock().await;
        pd.insert(
            model_id.clone(),
            PersistentDownload {
                model_id: model_id.clone(),
                filename: dest_part.file_name().unwrap_or_default().to_string_lossy().replace(".part", ""),
                url: url.clone(),
                total_size,
                downloaded: completed_bytes,
                repo_id: repo_id.clone(),
                completed_chunks: Some(comp_vec),
            },
        );
        drop(pd);
        state.save_persistence().await;
        return Err("Download paused".to_string());
    }

    if let Some(err) = worker_error {
        return Err(err);
    }

    let all_done = completed_chunks_arc.lock().await.len() == num_chunks as usize;
    if !all_done {
        return Err(format!(
            "Download finished but some chunks are missing ({}/{})",
            completed_chunks_arc.lock().await.len(),
            num_chunks
        ));
    }

    // Flush file buffers to disk
    if let Ok(file) = Arc::try_unwrap(file_arc) {
        let _ = file.sync_all();
    }

    Ok(total_size)
}

async fn download_single_chunk(
    client: &Client,
    url: &str,
    token: Option<&str>,
    start: u64,
    end: u64,
    file: &Arc<std::fs::File>,
    progress_tx: &tokio::sync::mpsc::UnboundedSender<u64>,
    chunk_idx: u32,
    in_flight: &Arc<tokio::sync::Mutex<HashMap<u32, u64>>>,
    is_paused: &Arc<AtomicBool>,
    is_cancelled: &Arc<AtomicBool>,
) -> Result<u64, String> {
    let mut req = client.get(url).header(RANGE, format!("bytes={}-{}", start, end));
    if let Some(t) = token {
        if !t.is_empty() {
            req = req.header(AUTHORIZATION, format!("Bearer {}", t));
        }
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    if status != StatusCode::PARTIAL_CONTENT && status != StatusCode::OK {
        return Err(format!("Bad HTTP status on range: {}", status));
    }

    let mut stream = resp.bytes_stream();
    let mut current_offset = start;
    let mut bytes_written = 0u64;

    while let Some(item_res) = tokio::time::timeout(std::time::Duration::from_secs(20), stream.next())
        .await
        .map_err(|_| "Chunk read stream idle timeout (20s)".to_string())?
    {
        if is_cancelled.load(Ordering::SeqCst) || is_paused.load(Ordering::SeqCst) {
            return Err("Interrupted".to_string());
        }

        let chunk = item_res.map_err(|e| e.to_string())?;
        let len = chunk.len() as u64;

        write_chunk_at(file, &chunk, current_offset)
            .map_err(|e| format!("Disk write error at offset {}: {}", current_offset, e))?;

        current_offset += len;
        bytes_written += len;

        in_flight.lock().await.insert(chunk_idx, bytes_written);
        let _ = progress_tx.send(len);
    }

    Ok(bytes_written)
}

// ─────────────────────────────────────────────────────────────────────────────
// Sequential Engine Fallback (For non-range or small files)
// ─────────────────────────────────────────────────────────────────────────────

async fn download_hf_model_sequential(
    state: Arc<HfDownloaderState>,
    client: Client,
    url: String,
    dest_part: PathBuf,
    model_id: String,
    _repo_id: Option<String>,
    total_size: u64,
    is_paused: Arc<AtomicBool>,
    is_cancelled: Arc<AtomicBool>,
    on_progress: Arc<dyn Fn(f32, u64, u64, u64, u64) + Send + Sync + 'static>,
) -> Result<u64, String> {
    use tokio::io::AsyncWriteExt;

    let saved_downloaded = {
        let pd = state.persistent_downloads.lock().await;
        pd.get(&model_id).map(|p| p.downloaded).unwrap_or(0)
    };

    let disk_part_size = if dest_part.exists() {
        tokio::fs::metadata(&dest_part).await.map(|m| m.len()).unwrap_or(0)
    } else {
        if let Some(parent) = dest_part.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
        }
        tokio::fs::File::create(&dest_part).await.map_err(|e| e.to_string())?;
        0
    };

    let mut downloaded = if saved_downloaded > 0 && total_size > 0 && saved_downloaded < total_size {
        saved_downloaded
    } else if disk_part_size > 0 && total_size > 0 && disk_part_size < total_size {
        disk_part_size
    } else {
        0
    };

    if downloaded < disk_part_size {
        if let Ok(file) = tokio::fs::OpenOptions::new().write(true).open(&dest_part).await {
            let _ = file.set_len(downloaded).await;
        }
    }

    let mut speed_estimator = SlidingWindowSpeedEstimator::new(2.0);
    let mut last_emit = std::time::Instant::now();
    let mut last_persist = std::time::Instant::now();
    let mut retries = 0;

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

        let mut writer = tokio::io::BufWriter::with_capacity(4 * 1024 * 1024, file);

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
                if retries > MAX_CHUNK_RETRIES {
                    return Err(format!("Download failed after {} retries: {}", MAX_CHUNK_RETRIES, e));
                }
                let backoff = std::cmp::min(retries * 1000, 5000);
                tokio::time::sleep(std::time::Duration::from_millis(backoff as u64)).await;
                continue;
            }
            Err(_) => {
                retries += 1;
                if retries > MAX_CHUNK_RETRIES {
                    return Err("Connection timed out repeatedly".to_string());
                }
                let backoff = std::cmp::min(retries * 1000, 5000);
                tokio::time::sleep(std::time::Duration::from_millis(backoff as u64)).await;
                continue;
            }
        };

        let status = response.status();
        if downloaded > 0 && status == reqwest::StatusCode::OK {
            downloaded = 0;
            let _ = writer.flush().await;
            drop(writer);
            let _ = tokio::fs::OpenOptions::new().write(true).truncate(true).open(&dest_part).await;
            continue;
        }

        if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
            if total_size > 0 && downloaded >= total_size {
                break;
            }
            downloaded = 0;
            let _ = writer.flush().await;
            drop(writer);
            let _ = tokio::fs::OpenOptions::new().write(true).truncate(true).open(&dest_part).await;
            continue;
        }

        if !status.is_success() && status != reqwest::StatusCode::PARTIAL_CONTENT {
            retries += 1;
            if retries > MAX_CHUNK_RETRIES {
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

            let chunk_res = tokio::time::timeout(std::time::Duration::from_secs(20), response.chunk()).await;
            let chunk = match chunk_res {
                Ok(Ok(Some(c))) => c,
                Ok(Ok(None)) => break,
                Ok(Err(e)) => {
                    warn!("[hf_downloader] Stream chunk error: {}, resuming...", e);
                    stream_interrupted = true;
                    break;
                }
                Err(_) => {
                    warn!("[hf_downloader] Stream chunk read timeout (20s), resuming...");
                    stream_interrupted = true;
                    break;
                }
            };

            writer.write_all(&chunk).await.map_err(|e| e.to_string())?;
            let chunk_len = chunk.len() as u64;
            downloaded += chunk_len;
            retries = 0;

            speed_estimator.add_bytes(chunk_len);

            if last_emit.elapsed().as_millis() >= 100 {
                last_emit = std::time::Instant::now();
                let speed = speed_estimator.current_speed();
                let eta = if speed > 0 && total_size > downloaded {
                    (total_size - downloaded) / speed
                } else {
                    0
                };
                let pct = if total_size > 0 {
                    ((downloaded as f32 / total_size as f32) * 100.0).min(99.9)
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
            if retries > MAX_CHUNK_RETRIES {
                return Err(format!("Download stream stalled after {} retries", MAX_CHUNK_RETRIES));
            }
            let backoff = std::cmp::min(retries * 500, 3000);
            tokio::time::sleep(std::time::Duration::from_millis(backoff as u64)).await;
        } else if (total_size > 0 && downloaded >= total_size) || total_size == 0 {
            break;
        }
    }

    Ok(downloaded)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sliding_window_speed_estimator() {
        let mut est = SlidingWindowSpeedEstimator::new(1.0);
        assert_eq!(est.current_speed(), 0);

        est.add_bytes(1024 * 1024); // 1 MB
        let speed = est.current_speed();
        assert!(speed > 0);
    }

    #[test]
    fn test_write_chunk_at() {
        let temp_dir = std::env::temp_dir();
        let temp_file_path = temp_dir.join(format!("nyx_chunk_test_{}.tmp", std::process::id()));

        let file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .open(&temp_file_path)
            .expect("open temp file");

        file.set_len(1024).expect("set_len");

        let slice1 = b"HELLO_NYX_CHUNK_1";
        let slice2 = b"WORLD_NYX_CHUNK_2";

        write_chunk_at(&file, slice1, 100).expect("write slice 1");
        write_chunk_at(&file, slice2, 500).expect("write slice 2");

        use std::io::{Read, Seek, SeekFrom};
        let mut reader = file;
        reader.seek(SeekFrom::Start(100)).expect("seek 100");
        let mut buf1 = vec![0u8; slice1.len()];
        reader.read_exact(&mut buf1).expect("read slice 1");
        assert_eq!(&buf1, slice1);

        reader.seek(SeekFrom::Start(500)).expect("seek 500");
        let mut buf2 = vec![0u8; slice2.len()];
        reader.read_exact(&mut buf2).expect("read slice 2");
        assert_eq!(&buf2, slice2);

        let _ = std::fs::remove_file(&temp_file_path);
    }

    #[test]
    fn test_chunk_partitioning() {
        let total_size = (35 * 1024 * 1024) as u64; // 35 MB
        let num_chunks = ((total_size + CHUNK_SIZE - 1) / CHUNK_SIZE) as u32;
        assert_eq!(num_chunks, 3); // 16MB + 16MB + 3MB

        let chunk0_start = 0 * CHUNK_SIZE;
        let chunk0_end = std::cmp::min(chunk0_start + CHUNK_SIZE, total_size) - 1;
        assert_eq!(chunk0_start, 0);
        assert_eq!(chunk0_end, 16 * 1024 * 1024 - 1);

        let chunk2_start = 2 * CHUNK_SIZE;
        let chunk2_end = std::cmp::min(chunk2_start + CHUNK_SIZE, total_size) - 1;
        assert_eq!(chunk2_start, 32 * 1024 * 1024);
        assert_eq!(chunk2_end, total_size - 1);
    }
}
