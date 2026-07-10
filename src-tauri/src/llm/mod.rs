pub mod downloader;
pub mod manager;
pub mod hf_downloader;
pub mod vram_scheduler;

use tauri::{AppHandle, Manager, State, Emitter};
use std::sync::Arc;
use std::sync::atomic::Ordering;
use crate::llm::manager::LlamaManager;
use crate::llm::downloader::Downloader;
use crate::llm::hf_downloader::{HfDownloaderState, download_hf_model};

/// Guards concurrent download attempts.
/// Using a Mutex<()> means the lock is released automatically
/// when the guard is dropped — even on cancellation or panic.
/// The AtomicBool it replaces could get stuck `true` after a panic.
static DOWNLOAD_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[tauri::command]
pub async fn download_local_model(app: AppHandle) -> Result<(), String> {
    // Try to acquire the download lock without blocking.
    // If already locked, another download is in progress.
    let _lock = DOWNLOAD_LOCK.try_lock()
        .map_err(|_| "A model is already being downloaded".to_string())?;

    let app_dir = app.path().app_data_dir()
        .map_err(|_| "Failed to get app data dir".to_string())?;

    let downloader = Downloader::new();
    let app_clone = app.clone();
    let res = downloader.ensure_assets(&app_dir, move |progress, status| {
        let _ = app_clone.emit("llm-download-progress", serde_json::json!({
            "progress": progress,
            "status": status
        }));
    }).await;
    // _lock is dropped here, releasing the guard.

    match res {
        Ok(res) => {
            let _ = app.emit("llm-download-complete", serde_json::json!({ "model": res.0, "server": res.1 }));
            Ok(())
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn start_local_server(
    app: AppHandle, 
    manager: State<'_, Arc<LlamaManager>>, 
    model_id: String, 
    context_size: Option<u32>,
    gpu_layers: Option<u32>,
    cpu_threads: Option<u32>,
) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|_| "Failed to get app data dir".to_string())?;
    let model_path = app_dir.join("models").join(&model_id);
    let server_path = app_dir.join("binaries").join("llama-server-vulkan.exe");

    if !model_path.exists() || !server_path.exists() {
        return Err("Model or server binary not found. Please download them first.".to_string());
    }

    // --- Phase 3: VRAM-Aware Scheduling ---
    let model_size_gb = crate::llm::vram_scheduler::get_model_size_gb(&model_path);
    let decision = if let Some(vram) = crate::llm::vram_scheduler::query_vram() {
        let d = crate::llm::vram_scheduler::compute_spawn_decision(&vram, model_size_gb);
        
        let final_ngl = if let Some(manual_gpu_layers) = gpu_layers {
            let total_layers = crate::llm::vram_scheduler::estimate_total_layers(model_size_gb);
            let capped = manual_gpu_layers.min(d.ngl).min(total_layers);
            tracing::info!("[Manual] User requested {} layers, capped to {} to prevent VRAM spill (max fit: {}, total: {})", manual_gpu_layers, capped, d.ngl, total_layers);
            capped
        } else {
            tracing::info!(
                "[VramScheduler] GPU: {} | Available: {} MB | Model: {:.1} GB -> Auto NGL: {}",
                vram.gpu_name, vram.available_mb, model_size_gb, d.ngl
            );
            d.ngl
        };

        // Emit VRAM info to frontend so the UI can show the indicator
        let _ = app.emit("vram-decision", serde_json::json!({
            "ngl": final_ngl,
            "fully_gpu": final_ngl >= crate::llm::vram_scheduler::estimate_total_layers(model_size_gb),
            "suggest_cloud_fallback": d.suggest_cloud_fallback,
            "message": d.message,
            "estimated_vram_mb": crate::llm::vram_scheduler::vram_for_ngl(model_size_gb, crate::llm::vram_scheduler::estimate_total_layers(model_size_gb), final_ngl),
            "available_mb": vram.available_mb,
            "gpu_name": vram.gpu_name,
            "model_size_gb": model_size_gb
        }));

        if d.suggest_cloud_fallback {
            return Err(d.message);
        }
        Some(final_ngl)
    } else {
        tracing::warn!("[VramScheduler] Could not query VRAM — using user preference or default");
        gpu_layers
    };

    let mut ctx_size = context_size.unwrap_or(32768);
    if ctx_size < 32768 {
        ctx_size = 32768;
    }
    manager.start_with_ngl(&server_path, &model_path, ctx_size, decision, cpu_threads).await?;
    Ok(())
}


#[tauri::command]
pub async fn stop_local_server(manager: State<'_, Arc<LlamaManager>>) -> Result<(), String> {
    manager.stop().await;
    Ok(())
}

#[derive(serde::Serialize)]
pub struct HardwareEstimation {
    pub estimated_vram_mb: u64,
    pub system_ram_spill_mb: u64,
    pub total_vram_mb: u64,
    pub model_size_gb: f32,
}

#[tauri::command]
pub async fn estimate_hardware_usage(app: AppHandle, model_id: String, context_size: Option<u32>, gpu_layers: u32) -> Result<HardwareEstimation, String> {
    let app_dir = app.path().app_data_dir().map_err(|_| "Failed to get app data dir".to_string())?;
    let model_path = app_dir.join("models").join(&model_id);

    let model_size_gb = crate::llm::vram_scheduler::get_model_size_gb(&model_path);
    let total_layers = crate::llm::vram_scheduler::estimate_total_layers(model_size_gb);
    
    let (total_vram_mb, max_ngl) = if let Some(vram) = crate::llm::vram_scheduler::query_vram() {
        let d = crate::llm::vram_scheduler::compute_spawn_decision(&vram, model_size_gb);
        (vram.total_mb, d.ngl)
    } else {
        (0, total_layers)
    };
    
    // Cap gpu_layers to total_layers AND the maximum layers that fit in VRAM safely
    let actual_gpu_layers = gpu_layers.min(total_layers).min(max_ngl);
    let estimated_vram_mb = crate::llm::vram_scheduler::vram_for_ngl(model_size_gb, total_layers, actual_gpu_layers);

    // Calculate RAM spill: if we didn't offload all layers, the remaining layers go to RAM
    let remaining_layers = total_layers.saturating_sub(actual_gpu_layers);
    let system_ram_spill_mb = if remaining_layers > 0 {
        // Roughly same formula for CPU RAM footprint minus the VRAM overhead
        let model_mb = (model_size_gb * 1024.0) as u64;
        let layer_cost = model_mb / (total_layers as u64).max(1);
        layer_cost * (remaining_layers as u64)
    } else {
        0
    };

    // Add context size cost (rough estimation, 2048 context = ~200MB, scales linearly roughly)
    let ctx = context_size.unwrap_or(32768) as u64;
    let ctx_cost_mb = (ctx * 200) / 2048; 
    let final_system_ram_spill = system_ram_spill_mb + ctx_cost_mb;

    Ok(HardwareEstimation {
        estimated_vram_mb,
        system_ram_spill_mb: final_system_ram_spill,
        total_vram_mb,
        model_size_gb,
    })
}

#[derive(serde::Serialize)]
pub struct LocalModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub description: String,
    pub size_bytes: u64,
    pub status: String,
}

#[tauri::command]
pub async fn list_local_models(app: AppHandle) -> Result<Vec<LocalModelInfo>, String> {
    let app_dir = app.path().app_data_dir().map_err(|_| "Failed to get app data dir".to_string())?;
    let models_dir = app_dir.join("models");
    
    let mut models = Vec::new();
    
    if !models_dir.exists() {
        let _ = tokio::fs::create_dir_all(&models_dir).await;
    }
    
    if models_dir.exists() {
        let mut entries = tokio::fs::read_dir(models_dir.clone()).await.map_err(|e| e.to_string())?;
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
                    status: "completed".to_string(),
                });
            }
        }
    }
    
    println!("[NYX] list_local_models found {} models in {:?}", models.len(), models_dir);
    
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
pub async fn hf_uninstall_model(
    app: tauri::AppHandle,
    manager: tauri::State<'_, Arc<LlamaManager>>,
    filename: String
) -> Result<(), String> {
    // Attempt to stop any running model to release locks
    manager.stop().await;

    let app_dir = app.path().app_data_dir().map_err(|_| "Failed to get app data dir".to_string())?;
    let models_dir = app_dir.join("models");
    let dest = models_dir.join(&filename);
    
    if dest.exists() {
        let mut retries = 10;
        let mut last_error = None;
        while dest.exists() && retries > 0 {
            match tokio::fs::remove_file(&dest).await {
                Ok(_) => {
                    tracing::info!("Successfully uninstalled model: {}", filename);
                    return Ok(());
                }
                Err(e) => {
                    last_error = Some(e);
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    retries -= 1;
                }
            }
        }
        if dest.exists() {
            return Err(format!("Failed to uninstall model '{}' after retries. The file might still be in use. Error: {:?}", filename, last_error));
        }
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


