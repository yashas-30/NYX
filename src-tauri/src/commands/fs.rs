use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

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

    state.watchers.lock().unwrap().insert(id, watcher);
    Ok(())
}

#[tauri::command]
pub async fn fs_watch_stop(
    state: State<'_, WatcherState>,
    id: String,
) -> Result<(), String> {
    let mut watchers = state.watchers.lock().unwrap();
    if let Some(_watcher) = watchers.remove(&id) {
        // Drop the watcher to stop watching
        // But before drop, unwatch isn't strictly necessary, but good practice if needed
        // The Drop trait handles cleanup.
    }
    Ok(())
}

#[tauri::command]
pub async fn fs_parse_and_chunk_file(
    path: String,
    chunk_size: usize,
    _overlap: usize,
) -> Result<Vec<String>, String> {
    use std::fs::File;
    use std::io::{Read, BufReader};

    let file = File::open(&path).map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(file);
    let mut contents = String::new();
    reader.read_to_string(&mut contents).map_err(|e| e.to_string())?;

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

#[tauri::command]
pub async fn fs_read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
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
    let existed = std::path::Path::new(&path).exists();
    if existed && !overwrite {
        return Err(format!("File {} already exists and overwrite is false", path));
    }
    
    std::fs::write(&path, &content).map_err(|e| e.to_string())?;
    
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
    let entries = std::fs::read_dir(&dir_path).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let is_dir = meta.is_dir();
        result.push(FileInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            file_type: if is_dir { "directory".to_string() } else { "file".to_string() },
            size: if is_dir { None } else { Some(meta.len()) },
        });
    }
    Ok(result)
}
