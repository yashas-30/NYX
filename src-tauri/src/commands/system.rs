use serde::Serialize;
use sysinfo::System;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct SystemResult<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct SystemInfo {
    pub platform: String,
    pub arch: String,
    pub cpus: usize,
    pub totalmem: u64,
    pub freemem: u64,
    pub versions: SystemVersions,
}

#[derive(Serialize)]
pub struct SystemVersions {
    pub app: String,
}

#[derive(Serialize)]
pub struct HardwareSpecs {
    pub cpu_cores: usize,
    pub total_ram: u64,
    pub free_ram: u64,
    pub gpu_name: String,
    pub gpu_vram: u64,
}

#[tauri::command]
pub async fn get_hardware_specs() -> SystemResult<HardwareSpecs> {
    let hw = crate::llm::local_orchestrator::HardwareSnapshot::collect(None).await;

    let specs = HardwareSpecs {
        cpu_cores: hw.cpu_physical_cores as usize,
        total_ram: hw.ram_total_mb * 1024 * 1024,
        free_ram: hw.ram_available_mb * 1024 * 1024,
        gpu_name: hw.gpu_name,
        gpu_vram: hw.vram_total_mb * 1024 * 1024,
    };
    SystemResult { success: true, data: Some(specs), error: None }
}

#[derive(Serialize)]
pub struct OptimalLayers {
    pub gpu_layers: u32,
    pub message: String,
}

#[derive(Serialize)]
pub struct SystemDiagnostics {
    pub totalmem: u64,
    pub vram: u64,
    #[serde(rename = "optimalLayers")]
    pub optimal_layers: Option<OptimalLayers>,
}

#[tauri::command]
pub async fn get_system_diagnostics(model_id: Option<String>) -> SystemDiagnostics {
    let hw = crate::llm::local_orchestrator::HardwareSnapshot::collect(None).await;

    let optimal_layers = if let Some(m) = model_id {
        let path = std::path::PathBuf::from(&m);
        let model_size_gb = if path.exists() {
            tokio::fs::metadata(&path).await.map(|meta| meta.len() as f32 / (1024.0 * 1024.0 * 1024.0)).unwrap_or(4.0)
        } else { 4.0 };

        let decision = crate::llm::local_orchestrator::compute_ngl_decision(&hw, None, model_size_gb, 32768);
        Some(OptimalLayers { gpu_layers: decision.ngl, message: decision.message })
    } else {
        None
    };

    SystemDiagnostics {
        totalmem: hw.ram_total_mb * 1024 * 1024,
        vram: hw.vram_total_mb * 1024 * 1024,
        optimal_layers,
    }
}

#[tauri::command]
pub async fn system_gpu_info() -> SystemResult<serde_json::Value> {
    SystemResult { success: true, data: Some(serde_json::json!({})), error: None }
}

#[tauri::command]
pub async fn system_info(app: AppHandle) -> SystemResult<SystemInfo> {
    let mut sys = System::new_all();
    sys.refresh_all();
    let info = SystemInfo {
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        cpus: sys.cpus().len(),
        totalmem: sys.total_memory(),
        freemem: sys.available_memory(),
        versions: SystemVersions { app: app.package_info().version.to_string() },
    };
    SystemResult { success: true, data: Some(info), error: None }
}

#[tauri::command]
pub async fn system_get_userdata(app: AppHandle) -> SystemResult<String> {
    match app.path().app_data_dir() {
        Ok(path) => SystemResult { success: true, data: Some(path.to_string_lossy().to_string()), error: None },
        Err(err) => SystemResult { success: false, data: None, error: Some(err.to_string()) },
    }
}

#[derive(serde::Serialize)]
pub struct CommandResult {
    #[serde(rename = "stdout")]
    pub stdout: String,
    #[serde(rename = "stderr")]
    pub stderr: String,
    #[serde(rename = "exitCode")]
    pub exit_code: i32,
}

#[tauri::command]
pub async fn execute_command(command: String, cwd: String) -> Result<CommandResult, String> {
    use tokio::process::Command;

    #[cfg(target_os = "windows")]
    let mut cmd = Command::new("cmd");
    #[cfg(target_os = "windows")]
    cmd.args(["/C", &command]);

    #[cfg(not(target_os = "windows"))]
    let mut cmd = Command::new("sh");
    #[cfg(not(target_os = "windows"))]
    cmd.args(["-c", &command]);

    if !cwd.is_empty() {
        cmd.current_dir(cwd);
    }

    let output = cmd.output().await.map_err(|e| e.to_string())?;

    Ok(CommandResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

#[tauri::command]
pub async fn cleanup_session_state(
    app: AppHandle,
    session_id: String,
) -> Result<(), String> {
    tracing::info!("Cleaning up conductor channel for session {}", session_id);
    // PTY sessions are cleaned up individually via pty_close.
    // Here we only drop the conductor mpsc sender so the actor task exits.
    let app_state = app.state::<crate::AppState>();
    let mut conductors = app_state.conductor_channels.lock().await;
    conductors.remove(&session_id);
    app.state::<crate::AppState>().agent_cancel.store(true, std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub async fn set_search_settings(
    app: AppHandle,
    provider: String,
    api_key: String,
) -> Result<(), String> {
    let state = app.state::<crate::AppState>();
    *state.search_provider.write().await = provider;
    *state.search_api_key.write().await = api_key;
    Ok(())
}
