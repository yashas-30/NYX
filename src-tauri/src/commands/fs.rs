use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

// Fix #2: tokio::sync::Mutex instead of std::sync::Mutex — safe to lock
// inside async Tauri commands without blocking the Tokio thread pool.
pub struct WatcherState {
    pub watchers: Arc<Mutex<HashMap<String, RecommendedWatcher>>>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self {
            watchers: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[tauri::command]
pub async fn fs_watch_start(
    app: AppHandle,
    state: State<'_, WatcherState>,
    id: String,
    path: String,
    recursive: bool,
) -> Result<(), String> {
    let app_clone = app.clone();
    let id_clone = id.clone();

    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        match res {
            Ok(event) => {
                // Emit event to frontend
                let payload = serde_json::json!({
                    "id": id_clone,
                    "kind": format!("{:?}", event.kind),
                    "paths": event.paths,
                });
                let _ = app_clone.emit(&format!("fs-change-{}", id_clone), payload);
            }
            Err(e) => {
                tracing::error!("Watch error: {:?}", e);
            }
        }
    }).map_err(|e| e.to_string())?;

    // We can configure the watcher if needed
    let mode = if recursive { RecursiveMode::Recursive } else { RecursiveMode::NonRecursive };
    watcher.watch(Path::new(&path), mode).map_err(|e| e.to_string())?;

    // Fix #2: .lock().await — uses tokio Mutex, never blocks the executor.
    state.watchers.lock().await.insert(id, watcher);
    Ok(())
}

#[tauri::command]
pub async fn fs_watch_stop(
    state: State<'_, WatcherState>,
    id: String,
) -> Result<(), String> {
    // Fix #2: .lock().await — tokio Mutex, non-blocking.
    let mut watchers = state.watchers.lock().await;
    // Removing the watcher drops it, which calls Watcher::Drop and stops watching.
    watchers.remove(&id);
    Ok(())
}

#[tauri::command]
pub async fn fs_parse_and_chunk_file(
    path: String,
    chunk_size: usize,
    _overlap: usize,
) -> Result<Vec<String>, String> {
    let contents = tokio::fs::read_to_string(&path).await.map_err(|e| e.to_string())?;

    if contents.is_empty() {
        return Ok(Vec::new());
    }

    // Step 3.3: Layout-Aware Parsing (Structural Chunking)
    // Instead of dumb token splitting, we split by paragraphs/headers.
    let mut chunks = Vec::new();
    let paragraphs: Vec<&str> = contents.split("\n\n").collect();
    
    let mut current_chunk = String::new();
    let mut current_header = String::new();

    for paragraph in paragraphs {
        let para_trimmed = paragraph.trim();
        if para_trimmed.is_empty() {
            continue;
        }

        // Track the current markdown header to prepend to orphaned chunks
        if para_trimmed.starts_with('#') {
            let first_line = para_trimmed.lines().next().unwrap_or("");
            if first_line.starts_with('#') {
                current_header = first_line.to_string();
            }
        }

        // If adding this paragraph exceeds chunk size, push current_chunk and start new
        if current_chunk.len() + para_trimmed.len() > chunk_size && !current_chunk.is_empty() {
            chunks.push(current_chunk.trim().to_string());
            current_chunk = String::new();
            
            // Add overlap or structural context (the header) to the new chunk
            if !current_header.is_empty() && !para_trimmed.starts_with(&current_header) {
                current_chunk.push_str(&current_header);
                current_chunk.push_str("\n\n");
            }
        }

        current_chunk.push_str(para_trimmed);
        current_chunk.push_str("\n\n");
    }

    if !current_chunk.trim().is_empty() {
        chunks.push(current_chunk.trim().to_string());
    }

    Ok(chunks)
}

#[derive(serde::Serialize)]
pub struct FileInfo {
    name: String,
    #[serde(rename = "type")]
    file_type: String,
    size: Option<u64>,
}

/// Fix #15: Guard against accidentally reading multi-GB binaries into memory.
const MAX_READ_BYTES: u64 = 10 * 1024 * 1024; // 10 MB

#[tauri::command]
pub async fn fs_read_file(path: String) -> Result<String, String> {
    // Check file size first to avoid OOM on large binaries.
    let meta = tokio::fs::metadata(&path).await.map_err(|e| e.to_string())?;
    if meta.len() > MAX_READ_BYTES {
        return Err(format!(
            "File is too large to read directly ({} MB). Maximum is {} MB.",
            meta.len() / (1024 * 1024),
            MAX_READ_BYTES / (1024 * 1024)
        ));
    }
    tokio::fs::read_to_string(&path).await.map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct FileWriteResult {
    success: bool,
    path: String,
    #[serde(rename = "bytesWritten")]
    bytes_written: u64,
    existed: bool,
}

#[tauri::command]
pub async fn fs_write_file(path: String, content: String, overwrite: bool) -> Result<FileWriteResult, String> {
    let existed = tokio::fs::metadata(&path).await.is_ok();
    if existed && !overwrite {
        return Err(format!("File {} already exists and overwrite is false", path));
    }
    
    tokio::fs::write(&path, &content).await.map_err(|e| e.to_string())?;
    
    Ok(FileWriteResult {
        success: true,
        path,
        bytes_written: content.len() as u64,
        existed,
    })
}

#[tauri::command]
pub async fn fs_list_dir(dir_path: String) -> Result<Vec<FileInfo>, String> {
    let mut result = Vec::new();
    let mut entries = tokio::fs::read_dir(&dir_path).await.map_err(|e| e.to_string())?;

    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let meta = entry.metadata().await.map_err(|e| e.to_string())?;
        let is_dir = meta.is_dir();
        result.push(FileInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            file_type: if is_dir { "directory".to_string() } else { "file".to_string() },
            size: if is_dir { None } else { Some(meta.len()) },
        });
    }
    Ok(result)
}
