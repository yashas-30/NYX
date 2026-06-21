use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct WorkspaceConfig {
    pub current_workspace: Option<String>,
}

fn get_workspace_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path()
        .app_data_dir()
        .map_err(|_| "Failed to get app data directory".to_string())?;
    
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    
    Ok(app_dir.join("workspace.json"))
}

#[tauri::command]
pub fn workspace_get(app: AppHandle) -> Result<String, String> {
    let config_path = get_workspace_config_path(&app)?;
    
    if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        if let Ok(config) = serde_json::from_str::<WorkspaceConfig>(&content) {
            if let Some(ws) = config.current_workspace {
                return Ok(ws);
            }
        }
    }
    Ok("".to_string())
}

#[tauri::command]
pub fn workspace_select(app: AppHandle, path: String) -> Result<(), String> {
    let config_path = get_workspace_config_path(&app)?;
    
    // Read existing
    let mut config = WorkspaceConfig::default();
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(parsed) = serde_json::from_str::<WorkspaceConfig>(&content) {
                config = parsed;
            }
        }
    }
    
    // Update
    config.current_workspace = Some(path);
    
    // Save
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(config_path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn workspace_create(app: AppHandle, path: String, name: String) -> Result<String, String> {
    let full_path = PathBuf::from(&path).join(&name);
    
    // Create directory
    fs::create_dir_all(&full_path).map_err(|e| e.to_string())?;
    
    let path_str = full_path.to_string_lossy().to_string();
    
    // Auto select it
    workspace_select(app, path_str.clone())?;
    
    Ok(path_str)
}

fn get_projects_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path()
        .app_data_dir()
        .map_err(|_| "Failed to get app data directory".to_string())?;
    Ok(app_dir.join("projects.json"))
}

#[tauri::command]
pub fn workspace_list_projects(app: AppHandle) -> Result<serde_json::Value, String> {
    let path = get_projects_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!([]));
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn workspace_create_project(app: AppHandle, project: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_projects_path(&app)?;
    let mut projects: Vec<serde_json::Value> = if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| vec![])
    } else {
        vec![]
    };
    
    let mut new_project = project.clone();
    new_project["id"] = serde_json::json!(uuid::Uuid::new_v4().to_string());
    new_project["createdAt"] = serde_json::json!(chrono::Utc::now().to_rfc3339());
    new_project["updatedAt"] = serde_json::json!(chrono::Utc::now().to_rfc3339());
    
    projects.push(new_project.clone());
    let json = serde_json::to_string_pretty(&projects).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    
    Ok(new_project)
}

#[tauri::command]
pub fn workspace_update_project(app: AppHandle, id: String, updates: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_projects_path(&app)?;
    let mut projects: Vec<serde_json::Value> = if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| vec![])
    } else {
        return Err("No projects found".to_string());
    };
    
    let mut updated_project = None;
    for p in projects.iter_mut() {
        if p["id"].as_str() == Some(&id) {
            if let Some(obj) = p.as_object_mut() {
                if let Some(updates_obj) = updates.as_object() {
                    for (k, v) in updates_obj {
                        obj.insert(k.clone(), v.clone());
                    }
                    obj.insert("updatedAt".to_string(), serde_json::json!(chrono::Utc::now().to_rfc3339()));
                }
            }
            updated_project = Some(p.clone());
            break;
        }
    }
    
    if let Some(up) = updated_project {
        let json = serde_json::to_string_pretty(&projects).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())?;
        Ok(up)
    } else {
        Err("Project not found".to_string())
    }
}

#[tauri::command]
pub fn workspace_delete_project(app: AppHandle, id: String) -> Result<(), String> {
    let path = get_projects_path(&app)?;
    if !path.exists() { return Ok(()); }
    
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let projects: Vec<serde_json::Value> = serde_json::from_str(&content).unwrap_or_else(|_| vec![]);
    
    let filtered: Vec<serde_json::Value> = projects.into_iter().filter(|p| p["id"].as_str() != Some(&id)).collect();
    
    let json = serde_json::to_string_pretty(&filtered).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}

