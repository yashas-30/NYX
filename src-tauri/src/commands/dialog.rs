use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(serde::Serialize)]
pub struct DialogResult<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn dialog_open_directory(app: AppHandle) -> DialogResult<String> {
    let result = tokio::task::spawn_blocking(move || {
        app.dialog().file().blocking_pick_folder()
    }).await;

    match result {
        Ok(Some(file_path)) => {
            let path_str = match file_path {
                tauri_plugin_dialog::FilePath::Path(p) => p.to_string_lossy().to_string(),
                tauri_plugin_dialog::FilePath::Url(u) => u.path().to_string(),
            };
            DialogResult {
                success: true,
                data: Some(path_str),
                error: None,
            }
        }
        Ok(None) => DialogResult {
            success: true,
            data: None,
            error: None,
        },
        Err(e) => DialogResult {
            success: false,
            data: None,
            error: Some(format!("Dialog failed: {}", e)),
        },
    }
}
