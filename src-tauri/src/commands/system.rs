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
    pub shared_gpu_memory: u64,
    pub dedicated_vram: u64,
    pub has_dedicated_gpu: bool,
}

#[tauri::command]
pub async fn get_hardware_specs() -> SystemResult<HardwareSpecs> {
    let hw = crate::llm::local_orchestrator::HardwareSnapshot::collect().await;

    let specs = HardwareSpecs {
        cpu_cores: hw.cpu_physical_cores as usize,
        total_ram: hw.ram_total_mb * 1024 * 1024,
        free_ram: hw.ram_available_mb * 1024 * 1024,
        gpu_name: hw.gpu_name,
        gpu_vram: hw.vram_total_mb * 1024 * 1024,
        shared_gpu_memory: hw.shared_gpu_memory_mb * 1024 * 1024,
        dedicated_vram: hw.dedicated_vram_available_mb * 1024 * 1024,
        has_dedicated_gpu: hw.has_dedicated_gpu,
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
    let hw = crate::llm::local_orchestrator::HardwareSnapshot::collect().await;

    let optimal_layers = if let Some(m) = model_id {
        let path = std::path::PathBuf::from(&m);
        let model_size_gb = if path.exists() {
            tokio::fs::metadata(&path).await.map(|meta| meta.len() as f32 / (1024.0 * 1024.0 * 1024.0)).unwrap_or(4.0)
        } else { 4.0 };

        let decision = crate::llm::local_orchestrator::compute_ngl_decision(&hw, None, model_size_gb, 8192);
        let (gpu_layers, message) = match decision {
            Ok(d) => (d.ngl, d.message),
            Err(err_msg) => (0, err_msg),
        };
        Some(OptimalLayers { gpu_layers, message })
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

    let trimmed = command.trim();
    
    // Safety guard against arbitrary RCE via shell chaining
    if trimmed.contains('&') || trimmed.contains('|') || trimmed.contains(';') || trimmed.contains('>') || trimmed.contains('<') || trimmed.contains('$') || trimmed.contains('`') {
        return Err("Security Violation: Shell chaining, redirection, and interpolation operators are not allowed".to_string());
    }

    // Only allow specific safe executables for the AI to run natively
    let allowed_commands = ["git", "npm", "cargo", "rustc", "node", "python", "python3", "npx", "ls", "dir", "cat", "echo", "pwd"];
    let cmd_name = trimmed.split_whitespace().next().unwrap_or("");
    
    if !allowed_commands.contains(&cmd_name) {
        return Err(format!("Security Violation: Command '{}' is not in the allowlist of safe executables.", cmd_name));
    }

    // Safety guard against catastrophic disk-wipe / bricking payloads
    let lower_cmd = command.to_lowercase().replace(' ', "");
    if lower_cmd.contains("rm")
        || lower_cmd.contains("del")
        || lower_cmd.contains("format")
        || lower_cmd.contains("mkfs")
        || lower_cmd.contains("dd")
        || lower_cmd.contains("curl")
        || lower_cmd.contains("wget")
    {
        return Err("Security Violation: Catastrophic or remote download system command blocked by NYX SafetyGuard".to_string());
    }

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

    let output = match tokio::time::timeout(std::time::Duration::from_secs(30), cmd.output()).await {
        Ok(res) => res.map_err(|e| e.to_string())?,
        Err(_) => {
            return Err("Execution timed out: command exceeded the 30-second limit.".to_string());
        }
    };

    Ok(CommandResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

#[tauri::command]
pub async fn cleanup_session_state(
    _app: AppHandle,
    session_id: String,
) -> Result<(), String> {
    tracing::info!("Cleaning up session state for session {}", session_id);
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

use std::path::PathBuf;

/// Returns the system PATH augmented with all user-local tool directories:
/// ~/.local/bin, npm global, WinGet Links & Packages, Python scripts, Cargo bin, etc.
pub fn get_augmented_path() -> String {
    let sep = if cfg!(windows) { ";" } else { ":" };
    let mut dirs_to_add: Vec<PathBuf> = Vec::new();

    if let Some(home) = dirs::home_dir() {
        // Critical tool directories
        dirs_to_add.push(home.join(".local").join("bin"));
        dirs_to_add.push(home.join(".cargo").join("bin"));

        #[cfg(windows)]
        {
            dirs_to_add.push(home.join("AppData").join("Roaming").join("npm"));
            dirs_to_add.push(home.join("AppData").join("Local").join("Microsoft").join("WinGet").join("Links"));

            // WinGet Packages directories (e.g. astral-sh.uv, etc.)
            let winget_pkgs = home.join("AppData").join("Local").join("Microsoft").join("WinGet").join("Packages");
            if let Ok(entries) = std::fs::read_dir(&winget_pkgs) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        dirs_to_add.push(p.clone());
                        let bin_sub = p.join("bin");
                        if bin_sub.is_dir() {
                            dirs_to_add.push(bin_sub);
                        }
                    }
                }
            }

            // Python installations and scripts
            let py_root = home.join("AppData").join("Local").join("Programs").join("Python");
            if let Ok(entries) = std::fs::read_dir(&py_root) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        dirs_to_add.push(p.join("Scripts"));
                        dirs_to_add.push(p);
                    }
                }
            }
        }

        #[cfg(not(windows))]
        {
            dirs_to_add.push(home.join(".npm-global").join("bin"));
            dirs_to_add.push(PathBuf::from("/usr/local/bin"));
            dirs_to_add.push(PathBuf::from("/opt/homebrew/bin"));
        }
    }

    let current_path = std::env::var("PATH").unwrap_or_default();
    let current_splits: Vec<&str> = current_path.split(if cfg!(windows) { ';' } else { ':' }).collect();

    let mut result_parts: Vec<String> = Vec::new();

    // Add extra dirs first if they exist and aren't already included
    for dir in dirs_to_add {
        if dir.exists() {
            let s = dir.to_string_lossy().to_string();
            if !result_parts.iter().any(|x| x.eq_ignore_ascii_case(&s)) &&
               !current_splits.iter().any(|x| x.eq_ignore_ascii_case(&s)) {
                result_parts.push(s);
            }
        }
    }

    // Append existing PATH
    for part in current_splits {
        let p_trimmed = part.trim();
        if !p_trimmed.is_empty() && !result_parts.iter().any(|x| x.eq_ignore_ascii_case(p_trimmed)) {
            result_parts.push(p_trimmed.to_string());
        }
    }

    result_parts.join(sep)
}

/// Applies the augmented PATH to the current process's environment.
pub fn apply_augmented_path_to_current_process() {
    let aug = get_augmented_path();
    std::env::set_var("PATH", &aug);
}

/// Helper to search for a binary on the system PATH and common installation directories
pub fn find_executable(name: &str) -> Option<PathBuf> {
    apply_augmented_path_to_current_process();

    #[cfg(windows)]
    let candidates = vec![
        format!("{}.exe", name),
        format!("{}.cmd", name),
        format!("{}.bat", name),
        name.to_string(),
    ];
    #[cfg(not(windows))]
    let candidates = vec![name.to_string()];

    #[cfg(windows)]
    let which_cmd = "where";
    #[cfg(not(windows))]
    let which_cmd = "which";

    for candidate in &candidates {
        let mut cmd = std::process::Command::new(which_cmd);
        cmd.arg(candidate);
        cmd.env("PATH", get_augmented_path());
        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Some(first_line) = stdout.lines().next() {
                    let p = PathBuf::from(first_line.trim());
                    if p.exists() {
                        return Some(p);
                    }
                }
            }
        }
    }

    if let Some(home) = dirs::home_dir() {
        let mut check_dirs = vec![
            home.join("AppData").join("Roaming").join("npm"),
            home.join("AppData").join("Local").join("Programs").join("Python"),
            home.join("AppData").join("Local").join("Microsoft").join("WinGet").join("Links"),
            home.join(".local").join("bin"),
            home.join(".cargo").join("bin"),
        ];

        #[cfg(windows)]
        {
            let winget_pkgs = home.join("AppData").join("Local").join("Microsoft").join("WinGet").join("Packages");
            if let Ok(entries) = std::fs::read_dir(&winget_pkgs) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        check_dirs.push(p.clone());
                        let bin_sub = p.join("bin");
                        if bin_sub.is_dir() {
                            check_dirs.push(bin_sub);
                        }
                    }
                }
            }
        }

        for dir in check_dirs {
            for candidate in &candidates {
                let full = dir.join(candidate);
                if full.exists() {
                    return Some(full);
                }
            }
        }
    }

    None
}

/// Permanently ensures critical tool directories (such as ~/.local/bin and npm)
/// are added to the user's persistent system environment and active process.
pub fn ensure_and_apply_environment_paths() {
    apply_augmented_path_to_current_process();

    #[cfg(windows)]
    {
        if let Some(uv_path) = find_executable("uv") {
            let _ = std::process::Command::new(uv_path)
                .arg("tool")
                .arg("update-shell")
                .output();
        }

        if let Some(home) = dirs::home_dir() {
            let local_bin = home.join(".local").join("bin").to_string_lossy().to_string();
            let npm_bin = home.join("AppData").join("Roaming").join("npm").to_string_lossy().to_string();
            let winget_links = home.join("AppData").join("Local").join("Microsoft").join("WinGet").join("Links").to_string_lossy().to_string();

            let ps_script = format!(
                r#"
                $pathsToAdd = @('{local_bin}', '{npm_bin}', '{winget_links}')
                $current = [Environment]::GetEnvironmentVariable('Path', 'User')
                if ($null -eq $current) {{ $current = '' }}
                $parts = $current -split ';' | Where-Object {{ $_.Trim() -ne '' }}
                $changed = $false
                foreach ($p in $pathsToAdd) {{
                    if (Test-Path $p) {{
                        $exists = $false
                        foreach ($part in $parts) {{
                            if ($part.Trim().TrimEnd('\') -ieq $p.Trim().TrimEnd('\')) {{
                                $exists = $true
                                break
                            }}
                        }}
                        if (-not $exists) {{
                            $parts += $p
                            $changed = $true
                        }}
                    }}
                }}
                if ($changed) {{
                    $newPath = $parts -join ';'
                    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
                }}
                "#,
                local_bin = local_bin.replace('\'', "''"),
                npm_bin = npm_bin.replace('\'', "''"),
                winget_links = winget_links.replace('\'', "''"),
            );

            let _ = std::process::Command::new("powershell.exe")
                .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
                .output();
        }
    }

    apply_augmented_path_to_current_process();
}


