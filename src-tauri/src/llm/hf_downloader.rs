use reqwest::header::{RANGE, AUTHORIZATION};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use std::collections::HashMap;
use tracing::info;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct PersistentDownload {
    pub model_id: String,
    pub filename: String,
    pub url: String,
    pub total_size: u64,
}

pub struct DownloadTask {
    pub is_paused: Arc<AtomicBool>,
    pub is_cancelled: Arc<AtomicBool>,
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
        let file_path = app_data_dir.join("models").join("downloads.json");
        *self.downloads_file_path.lock().await = Some(file_path.clone());
        
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
                let _ = tokio::fs::write(&path, content).await;
            }
        }
    }

    pub async fn set_token(&self, token: String) {
        let mut t = self.token.lock().await;
        *t = Some(token);
    }
    
    pub async fn get_token(&self) -> Option<String> {
        let t = self.token.lock().await;
        t.clone()
    }
}

pub async fn download_hf_model(
    state: Arc<HfDownloaderState>,
    url: String,
    dest: PathBuf,
    model_id: String,
    on_progress: impl Fn(f32, u64, u64) + Send + 'static,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    
    let is_paused = Arc::new(AtomicBool::new(false));
    let is_cancelled = Arc::new(AtomicBool::new(false));
    
    {
        let mut tasks = state.tasks.lock().await;
        tasks.insert(model_id.clone(), DownloadTask {
            is_paused: is_paused.clone(),
            is_cancelled: is_cancelled.clone(),
        });
    }

    let dest_part = dest.with_extension("gguf.part");
    // Check if file exists to resume
    let mut downloaded = 0u64;
    let file = if dest_part.exists() {
        let f = tokio::fs::OpenOptions::new().append(true).open(&dest_part).await.map_err(|e| e.to_string())?;
        downloaded = f.metadata().await.map_err(|e| e.to_string())?.len();
        f
    } else {
        if let Some(parent) = dest_part.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
        }
        tokio::fs::File::create(&dest_part).await.map_err(|e| e.to_string())?
    };

    let mut req = client.get(&url);
    if downloaded > 0 {
        req = req.header(RANGE, format!("bytes={}-", downloaded));
        info!("Resuming download from {} bytes", downloaded);
    }
    
    if let Some(token) = state.get_token().await {
        req = req.header(AUTHORIZATION, format!("Bearer {}", token));
    }

    let mut response = req.send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
            // Already downloaded
            on_progress(100.0, downloaded, downloaded);
            return Ok(());
        }
        return Err(format!("Failed to download {}: {}", url, response.status()));
    }

    if downloaded > 0 && response.status() == reqwest::StatusCode::OK {
        // Server ignored Range header and is sending from the beginning.
        file.set_len(0).await.map_err(|e| e.to_string())?;
        downloaded = 0;
        info!("Server ignored Range header, restarting download from 0 bytes");
    }

    let total_size = response.content_length().unwrap_or(0) + downloaded;
    
    // Save to persistence
    {
        let mut pd = state.persistent_downloads.lock().await;
        pd.insert(model_id.clone(), PersistentDownload {
            model_id: model_id.clone(),
            filename: dest.file_name().unwrap_or_default().to_string_lossy().to_string(),
            url: url.clone(),
            total_size,
        });
    }
    state.save_persistence().await;

    let mut last_emit = std::time::Instant::now();
    let mut writer = tokio::io::BufWriter::with_capacity(1024 * 1024, file); // 1MB buffer

    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if is_cancelled.load(Ordering::SeqCst) {
            info!("Download cancelled for {}", model_id);
            break;
        }

        while is_paused.load(Ordering::SeqCst) {
            if is_cancelled.load(Ordering::SeqCst) {
                break;
            }
            let _ = writer.flush().await;
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        writer.write_all(&chunk).await.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            if last_emit.elapsed().as_millis() > 250 {
                on_progress((downloaded as f32 / total_size as f32) * 100.0, downloaded, total_size);
                last_emit = std::time::Instant::now();
            }
        }
    }
    
    writer.flush().await.map_err(|e| e.to_string())?;
    if total_size > 0 && !is_cancelled.load(Ordering::SeqCst) {
        on_progress(100.0, downloaded, total_size);
    }

    {
        let mut tasks = state.tasks.lock().await;
        tasks.remove(&model_id);
    }
    
    {
        let mut pd = state.persistent_downloads.lock().await;
        pd.remove(&model_id);
    }
    state.save_persistence().await;

    if is_cancelled.load(Ordering::SeqCst) {
        drop(writer); // Explicitly drop writer (and file) so Windows allows deletion
        let _ = tokio::fs::remove_file(dest_part).await;
        return Err("Download cancelled".to_string());
    }

    drop(writer);
    if let Err(e) = tokio::fs::rename(&dest_part, &dest).await {
        return Err(format!("Failed to finalize download: {}", e));
    }

    Ok(())
}
