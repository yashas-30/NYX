use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;
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
    if let Some(mut watcher) = watchers.remove(&id) {
        // Drop the watcher to stop watching
        // But before drop, unwatch isn't strictly necessary, but good practice if needed
        // The Drop trait handles cleanup.
    }
    Ok(())
}
