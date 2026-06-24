pub mod downloader;
pub mod manager;
pub mod hf_downloader;

use tauri::{AppHandle, Manager, State, Emitter};
use std::sync::Arc;
use std::sync::atomic::Ordering;
use crate::llm::manager::LlamaManager;
use crate::llm::downloader::Downloader;
use crate::llm::hf_downloader::{HfDownloaderState, download_hf_model};

#[tauri::command]
pub async fn download_local_model(app: AppHandle) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|_| "Failed to get app data dir".to_string())?;
    let downloader = Downloader::new();
    
    let app_clone = app.clone();
    let res = downloader.ensure_assets(&app_dir, move |progress, status| {
        let _ = app_clone.emit("llm-download-progress", serde_json::json!({
            "progress": progress,
            "status": status
        }));
    }).await?;
    
    let _ = app.emit("llm-download-complete", serde_json::json!({ "model": res.0, "server": res.1 }));
    Ok(())
}

#[tauri::command]
pub async fn start_local_server(app: AppHandle, manager: State<'_, Arc<LlamaManager>>, model_id: String) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|_| "Failed to get app data dir".to_string())?;
    let model_path = app_dir.join("models").join(&model_id);
    let server_path = app_dir.join("binaries").join("llama-server-vulkan.exe");

    if !model_path.exists() || !server_path.exists() {
        return Err("Model or server binary not found. Please download them first.".to_string());
    }

    manager.start(&server_path, &model_path).await?;
    Ok(())
}

#[tauri::command]
pub async fn stop_local_server(manager: State<'_, Arc<LlamaManager>>) -> Result<(), String> {
    manager.stop().await;
    Ok(())
}

#[derive(serde::Serialize)]
pub struct LocalModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub description: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub async fn list_local_models(app: AppHandle) -> Result<Vec<LocalModelInfo>, String> {
    let app_dir = app.path().app_data_dir().map_err(|_| "Failed to get app data dir".to_string())?;
    let models_dir = app_dir.join("models");
    
    let mut models = Vec::new();
    if models_dir.exists() {
        let mut entries = tokio::fs::read_dir(models_dir).await.map_err(|e| e.to_string())?;
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("gguf") {
                let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                let metadata = entry.metadata().await.ok();
                let size_bytes = metadata.map(|m| m.len()).unwrap_or(0);
                
                models.push(LocalModelInfo {
                    id: name.clone(),
                    name: name.clone(),
                    provider: "nyx-native".to_string(),
                    description: "Locally downloaded Hugging Face GGUF model".to_string(),
                    size_bytes,
                });
            }
        }
    }
    
    Ok(models)
}

// Hugging Face commands

#[tauri::command]
pub async fn hf_set_token(token: String, state: State<'_, Arc<HfDownloaderState>>) -> Result<(), String> {
    state.set_token(token).await;
    Ok(())
}

#[tauri::command]
pub async fn hf_download_model(
    app: AppHandle,
    state: State<'_, Arc<HfDownloaderState>>,
    url: String,
    model_id: String,
    filename: String,
) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|_| "Failed to get app data dir".to_string())?;
    let models_dir = app_dir.join("models");
    let dest = models_dir.join(&filename);
    
    {
        let tasks = state.tasks.lock().await;
        if tasks.contains_key(&model_id) {
            return Err("Model is already downloading".to_string());
        }
    }
    
    let state_clone = Arc::clone(&*state);
    let app_clone = app.clone();
    let mid = model_id.clone();
    
    // Spawn task to not block command
    tokio::spawn(async move {
        let mid_emit = mid.clone();
        let res = download_hf_model(state_clone, url, dest.clone(), mid.clone(), move |pct, downloaded, total| {
            let _ = app_clone.emit("hf-download-progress", serde_json::json!({
                "model_id": mid_emit,
                "progress": pct,
                "downloaded": downloaded,
                "total": total,
            }));
        }).await;
        
        match res {
            Ok(_) => {
                let _ = app.emit("hf-download-complete", serde_json::json!({
                    "model_id": mid,
                    "filename": filename,
                    "path": dest
                }));
            }
            Err(e) => {
                let _ = app.emit("hf-download-error", serde_json::json!({
                    "model_id": mid,
                    "error": e
                }));
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn hf_pause_download(model_id: String, state: State<'_, Arc<HfDownloaderState>>) -> Result<(), String> {
    let tasks = state.tasks.lock().await;
    if let Some(task) = tasks.get(&model_id) {
        task.is_paused.store(true, Ordering::SeqCst);
        Ok(())
    } else {
        Err("Download task not found".to_string())
    }
}

#[tauri::command]
pub async fn hf_resume_download(app: AppHandle, model_id: String, state: State<'_, Arc<HfDownloaderState>>) -> Result<(), String> {
    let mut is_restored = false;
    let mut restored_info = None;
    
    {
        let tasks = state.tasks.lock().await;
        if let Some(task) = tasks.get(&model_id) {
            task.is_paused.store(false, Ordering::SeqCst);
            return Ok(());
        }
    }
    
    // Check if it's in persistence
    {
        let pd = state.persistent_downloads.lock().await;
        if let Some(p) = pd.get(&model_id) {
            is_restored = true;
            restored_info = Some((p.url.clone(), p.filename.clone()));
        }
    }
    
    if is_restored {
        if let Some((url, filename)) = restored_info {
            return hf_download_model(app, state, url, model_id, filename).await;
        }
    }

    Err("Download task not found".to_string())
}

#[tauri::command]
pub async fn hf_cancel_download(app: AppHandle, model_id: String, state: State<'_, Arc<HfDownloaderState>>) -> Result<(), String> {
    let mut found_in_tasks = false;
    {
        let tasks = state.tasks.lock().await;
        if let Some(task) = tasks.get(&model_id) {
            task.is_cancelled.store(true, Ordering::SeqCst);
            // Also unpause to allow it to exit
            task.is_paused.store(false, Ordering::SeqCst);
            found_in_tasks = true;
        }
    }
    
    if !found_in_tasks {
        let mut pd = state.persistent_downloads.lock().await;
        if let Some(p) = pd.remove(&model_id) {
            state.save_persistence().await;
            
            if let Ok(app_dir) = app.path().app_data_dir() {
                let dest_part = app_dir.join("models").join(&p.filename).with_extension("gguf.part");
                let _ = tokio::fs::remove_file(dest_part).await;
            }
            return Ok(());
        }
        return Err("Download task not found".to_string());
    }
    
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct RestoredDownload {
    pub model_id: String,
    pub filename: String,
    pub url: String,
    pub total_size: u64,
    pub downloaded: u64,
}

#[tauri::command]
pub async fn hf_get_restored_downloads(app: AppHandle, state: State<'_, Arc<HfDownloaderState>>) -> Result<Vec<RestoredDownload>, String> {
    let app_dir = app.path().app_data_dir().map_err(|_| "Failed to get app data dir".to_string())?;
    state.init_persistence(app_dir.clone()).await;
    
    let models_dir = app_dir.join("models");
    let pd_map = state.persistent_downloads.lock().await.clone();
    
    let mut restored = Vec::new();
    let mut to_remove = Vec::new();
    
    for (id, pd) in pd_map {
        let dest_part = models_dir.join(&pd.filename).with_extension("gguf.part");
        if dest_part.exists() {
            if let Ok(metadata) = tokio::fs::metadata(&dest_part).await {
                restored.push(RestoredDownload {
                    model_id: pd.model_id.clone(),
                    filename: pd.filename.clone(),
                    url: pd.url.clone(),
                    total_size: pd.total_size,
                    downloaded: metadata.len(),
                });
            }
        } else {
            to_remove.push(id);
        }
    }
    
    if !to_remove.is_empty() {
        let mut pd = state.persistent_downloads.lock().await;
        for id in to_remove {
            pd.remove(&id);
        }
        state.save_persistence().await;
    }
    
    Ok(restored)
}

#[tauri::command]
pub async fn hf_uninstall_model(app: tauri::AppHandle, filename: String) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|_| "Failed to get app data dir".to_string())?;
    let models_dir = app_dir.join("models");
    let dest = models_dir.join(&filename);
    if dest.exists() {
        tokio::fs::remove_file(dest).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct HfModelResult {
    pub id: String,
    pub downloads: u64,
    pub likes: u64,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[tauri::command]
pub async fn hf_search_models(query: String) -> Result<Vec<HfModelResult>, String> {
    let url = format!("https://huggingface.co/api/models?search={}&filter=gguf&sort=downloads&direction=-1&limit=50", query);
    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        let models: Vec<HfModelResult> = resp.json().await.map_err(|e| e.to_string())?;
        Ok(models)
    } else {
        Err(format!("Failed to search: {}", resp.status()))
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct HfModelFile {
    pub filename: String,
    pub size: u64,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct HfTreeEntry {
    pub r#type: String,
    pub path: String,
    pub size: u64,
    pub lfs: Option<HfLfsInfo>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct HfLfsInfo {
    pub size: u64,
}

#[tauri::command]
pub async fn hf_get_model_files(model_id: String) -> Result<Vec<HfModelFile>, String> {
    let url = format!("https://huggingface.co/api/models/{}/tree/main", model_id);
    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        let entries: Vec<HfTreeEntry> = resp.json().await.map_err(|e| e.to_string())?;
        let files = entries.into_iter()
            .filter(|e| e.r#type == "file" && e.path.ends_with(".gguf"))
            .map(|e| HfModelFile {
                filename: e.path,
                size: e.lfs.map(|lfs| lfs.size).unwrap_or(e.size),
            })
            .collect();
        Ok(files)
    } else {
        Err(format!("Failed to fetch files: {}", resp.status()))
    }
}

#[tauri::command]
pub async fn hf_get_model_readme(model_id: String) -> Result<String, String> {
    let url = format!("https://huggingface.co/{}/raw/main/README.md", model_id);
    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        let content = resp.text().await.map_err(|e| e.to_string())?;
        Ok(content)
    } else {
        Ok("No description available.".to_string())
    }
}


