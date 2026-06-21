use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn get_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let cache_dir = app.path()
        .app_cache_dir()
        .map_err(|_| "Failed to get app cache directory".to_string())?;
    
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }
    
    Ok(cache_dir)
}

#[tauri::command]
pub fn cache_stats(app: AppHandle) -> Result<serde_json::Value, String> {
    let cache_dir = get_cache_dir(&app)?;
    
    let mut size: u64 = 0;
    let mut count: u64 = 0;
    
    if let Ok(entries) = fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    size += meta.len();
                    count += 1;
                }
            }
        }
    }
    
    Ok(serde_json::json!({
        "sizeBytes": size,
        "fileCount": count,
        "path": cache_dir.to_string_lossy(),
    }))
}

#[tauri::command]
pub fn cache_clear(app: AppHandle) -> Result<(), String> {
    let cache_dir = get_cache_dir(&app)?;
    
    if cache_dir.exists() {
        fs::remove_dir_all(&cache_dir).map_err(|e| e.to_string())?;
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}
