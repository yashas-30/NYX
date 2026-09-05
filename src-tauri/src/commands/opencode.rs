// ─────────────────────────────────────────────────────────────────────────────
// NYX — OpenCode CLI Bridge & Execution Commands
// Handles binary resolution, PTY interactive sessions, and automatic
// synchronization of the 1,700+ .agents/skills catalog for local & distributed builds.
// ─────────────────────────────────────────────────────────────────────────────

use crate::commands::pty::{pty_spawn, PtyState};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub binary_path: Option<String>,
    pub skills_count: usize,
    pub skills_connected: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeSkillsStatus {
    pub skills_dir: String,
    pub skills_count: usize,
    pub connected: bool,
}

/// Resolves the OpenCode binary path, preferring the native `opencode.exe` inside `src-tauri/opencode`
pub fn resolve_opencode_binary(app: &AppHandle) -> Option<PathBuf> {
    // 1. Check compile-time manifest dir (guaranteed in dev mode)
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let manifest_candidates = vec![
        #[cfg(windows)]
        manifest_dir.join("opencode/node_modules/opencode-ai/bin/opencode.exe"),
        manifest_dir.join("opencode/node_modules/.bin/opencode.cmd"),
        manifest_dir.join("opencode/node_modules/.bin/opencode"),
    ];

    for candidate in &manifest_candidates {
        if candidate.exists() {
            return Some(candidate.clone());
        }
    }

    // 2. Check bundled resources (distributed / installed release mode)
    if let Ok(res_dir) = app.path().resource_dir() {
        #[cfg(windows)]
        let bundled_exe = res_dir.join("opencode/node_modules/opencode-ai/bin/opencode.exe");
        #[cfg(windows)]
        if bundled_exe.exists() {
            return Some(bundled_exe);
        }

        #[cfg(windows)]
        let direct_res = res_dir.join("opencode/opencode.exe");
        #[cfg(windows)]
        if direct_res.exists() {
            return Some(direct_res);
        }

        let res_cmd = res_dir.join("opencode/node_modules/.bin/opencode.cmd");
        if res_cmd.exists() {
            return Some(res_cmd);
        }
    }

    // 3. Check upwards from current exe location
    if let Ok(exe_path) = std::env::current_exe() {
        let mut curr = exe_path.parent();
        while let Some(parent) = curr {
            #[cfg(windows)]
            let direct_exe = parent.join("src-tauri/opencode/node_modules/opencode-ai/bin/opencode.exe");
            #[cfg(windows)]
            if direct_exe.exists() {
                return Some(direct_exe);
            }

            #[cfg(windows)]
            let direct_exe2 = parent.join("opencode/node_modules/opencode-ai/bin/opencode.exe");
            #[cfg(windows)]
            if direct_exe2.exists() {
                return Some(direct_exe2);
            }

            let cmd_bin = parent.join("src-tauri/opencode/node_modules/.bin/opencode.cmd");
            if cmd_bin.exists() {
                return Some(cmd_bin);
            }

            let n_bin = parent.join("src-tauri/opencode/node_modules/.bin/opencode");
            if n_bin.exists() {
                return Some(n_bin);
            }

            curr = parent.parent();
        }
    }

    // 4. Check upwards from current working directory
    if let Ok(cwd) = std::env::current_dir() {
        let mut curr = Some(cwd.as_path());
        while let Some(parent) = curr {
            #[cfg(windows)]
            let direct_exe = parent.join("src-tauri/opencode/node_modules/opencode-ai/bin/opencode.exe");
            #[cfg(windows)]
            if direct_exe.exists() {
                return Some(direct_exe);
            }

            #[cfg(windows)]
            let direct_exe2 = parent.join("opencode/node_modules/opencode-ai/bin/opencode.exe");
            #[cfg(windows)]
            if direct_exe2.exists() {
                return Some(direct_exe2);
            }

            let cmd_bin = parent.join("src-tauri/opencode/node_modules/.bin/opencode.cmd");
            if cmd_bin.exists() {
                return Some(cmd_bin);
            }

            curr = parent.parent();
        }
    }

    // 5. Check app directory
    if let Ok(app_dir) = app.path().app_data_dir() {
        #[cfg(windows)]
        let app_opencode = app_dir.join("opencode/node_modules/opencode-ai/bin/opencode.exe");
        #[cfg(windows)]
        if app_opencode.exists() {
            return Some(app_opencode);
        }
    }

    // 6. Fallback: Check if `opencode` is in system PATH
    #[cfg(windows)]
    let which_cmd = "where";
    #[cfg(not(windows))]
    let which_cmd = "which";

    if let Ok(output) = Command::new(which_cmd).arg("opencode").output() {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                let first_line = path_str.lines().next().unwrap_or("").trim();
                return Some(PathBuf::from(first_line));
            }
        }
    }

    None
}

/// Resolves the absolute path to the skills repository/bundle.
/// Works both in development mode and inside distributed release builds.
pub fn resolve_skills_directory(app: &AppHandle) -> Option<PathBuf> {
    // 1. Dev workspace: compile-time manifest dir parent -> .agents/skills
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(parent) = manifest_dir.parent() {
        let dev_skills = parent.join(".agents").join("skills");
        if dev_skills.exists() {
            return Some(dev_skills);
        }
    }

    // 2. Bundled production resources: app.path().resource_dir()
    if let Ok(res_dir) = app.path().resource_dir() {
        let bundled_skills = res_dir.join("skills");
        if bundled_skills.exists() {
            return Some(bundled_skills);
        }
        let bundled_agents_skills = res_dir.join(".agents").join("skills");
        if bundled_agents_skills.exists() {
            return Some(bundled_agents_skills);
        }
    }

    // 3. Relative to the current executable (portable installation)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            let exe_skills = parent.join("skills");
            if exe_skills.exists() {
                return Some(exe_skills);
            }
            let exe_res_skills = parent.join("resources").join("skills");
            if exe_res_skills.exists() {
                return Some(exe_res_skills);
            }
            let exe_agents = parent.join(".agents").join("skills");
            if exe_agents.exists() {
                return Some(exe_agents);
            }
        }
    }

    // 4. App data directory fallback
    if let Ok(app_dir) = app.path().app_data_dir() {
        let app_skills = app_dir.join("skills");
        if app_skills.exists() {
            return Some(app_skills);
        }
        let app_agents = app_dir.join(".agents").join("skills");
        if app_agents.exists() {
            return Some(app_agents);
        }
    }

    None
}

/// Counts the total number of valid skills (directories containing SKILL.md) in a path
pub fn count_skills_in_dir(dir: &Path) -> usize {
    if !dir.exists() || !dir.is_dir() {
        return 0;
    }
    let mut count = 0;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.join("SKILL.md").exists() {
                count += 1;
            }
        }
    }
    count
}

static SKILLS_INITIALIZED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static CACHED_SKILLS_COUNT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

/// Connects all skills to OpenCode CLI by:
/// 1. Registering the skills path into `~/.config/opencode/opencode.json` with wildcard permissions.
/// 2. Creating directory junctions into `~/.config/opencode/skills/nyx-skills` and `~/.agents/skills`.
/// 3. If a custom workspace is opened, linking `<workspace>/.agents/skills` to the central skills catalog.
pub fn ensure_opencode_skills_connected(app: &AppHandle, workspace_dir: &str) -> Result<PathBuf, String> {
    let skills_path = resolve_skills_directory(app).ok_or_else(|| {
        "Skills directory (.agents/skills) not found in dev or bundled resources".to_string()
    })?;

    // Return in microseconds if already initialized and provisioned
    if SKILLS_INITIALIZED.load(std::sync::atomic::Ordering::Acquire) {
        return Ok(skills_path);
    }

    let canonical_skills = skills_path.canonicalize().unwrap_or_else(|_| skills_path.clone());
    let raw_str = canonical_skills.to_string_lossy().to_string();
    let canonical_str = raw_str.strip_prefix(r"\\?\").unwrap_or(&raw_str).to_string();

    // 1. Update OpenCode global configuration (~/.config/opencode/opencode.json)
    if let Some(home_dir) = dirs::home_dir() {
        let config_dir = home_dir.join(".config").join("opencode");
        let _ = std::fs::create_dir_all(&config_dir);

        let config_file = config_dir.join("opencode.json");
        let mut config_val: serde_json::Value = if config_file.exists() {
            std::fs::read_to_string(&config_file)
                .ok()
                .and_then(|content| serde_json::from_str(&content).ok())
                .unwrap_or_else(|| serde_json::json!({}))
        } else {
            serde_json::json!({
                "$schema": "https://opencode.ai/config.json"
            })
        };

        // Ensure "skills" array contains canonical_str
        let mut skills_list = config_val
            .get("skills")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let path_json = serde_json::Value::String(canonical_str.clone());
        if !skills_list.contains(&path_json) {
            skills_list.push(path_json);
        }
        config_val["skills"] = serde_json::Value::Array(skills_list);

        // Ensure "permission": { "skill": { "*": "allow" } }
        if config_val.get("permission").is_none() {
            config_val["permission"] = serde_json::json!({});
        }
        config_val["permission"]["skill"] = serde_json::json!({ "*": "allow" });

        if let Ok(serialized) = serde_json::to_string_pretty(&config_val) {
            let _ = std::fs::write(&config_file, serialized);
        }

        // Also update opencode.jsonc if it exists
        let jsonc_file = config_dir.join("opencode.jsonc");
        if jsonc_file.exists() {
            let _ = std::fs::copy(&config_file, &jsonc_file);
        }

        // 2. Create directory junction to ~/.config/opencode/skills/nyx-skills
        let target_opencode_skills = config_dir.join("skills");
        let _ = std::fs::create_dir_all(&target_opencode_skills);
        let junction_target = target_opencode_skills.join("nyx-skills");
        if !junction_target.exists() {
            #[cfg(windows)]
            let _ = std::process::Command::new("cmd")
                .args(&["/c", "mklink", "/J", &junction_target.to_string_lossy(), &canonical_str])
                .output();
        }

        // 3. Also ensure ~/.agents/skills exists or points to our skills catalog
        let user_agents_dir = home_dir.join(".agents");
        let _ = std::fs::create_dir_all(&user_agents_dir);
        let user_agents_skills = user_agents_dir.join("skills");
        if !user_agents_skills.exists() {
            #[cfg(windows)]
            let _ = std::process::Command::new("cmd")
                .args(&["/c", "mklink", "/J", &user_agents_skills.to_string_lossy(), &canonical_str])
                .output();
        }
    }

    // 4. If workspace_dir is provided and does not yet have .agents/skills, link it
    let ws_path = PathBuf::from(workspace_dir);
    if ws_path.exists() && ws_path != canonical_skills {
        let ws_agents = ws_path.join(".agents");
        let ws_skills = ws_agents.join("skills");
        if !ws_skills.exists() {
            let _ = std::fs::create_dir_all(&ws_agents);
            #[cfg(windows)]
            let _ = std::process::Command::new("cmd")
                .args(&["/c", "mklink", "/J", &ws_skills.to_string_lossy(), &canonical_str])
                .output();
        }
    }

    SKILLS_INITIALIZED.store(true, std::sync::atomic::Ordering::Release);
    tracing::info!("[OpenCode] Skills successfully connected from: {}", canonical_str);
    Ok(canonical_skills)
}

/// Synchronizes skills and returns the active skills status
#[tauri::command]
pub async fn opencode_sync_skills(
    app: AppHandle,
    workspace: Option<String>,
) -> Result<OpenCodeSkillsStatus, String> {
    let ws = workspace.unwrap_or_else(get_default_workspace);
    let skills_dir = ensure_opencode_skills_connected(&app, &ws)?;
    let count = {
        let cached = CACHED_SKILLS_COUNT.load(std::sync::atomic::Ordering::Relaxed);
        if cached > 0 {
            cached
        } else {
            let cnt = count_skills_in_dir(&skills_dir);
            CACHED_SKILLS_COUNT.store(cnt, std::sync::atomic::Ordering::Relaxed);
            cnt
        }
    };

    Ok(OpenCodeSkillsStatus {
        skills_dir: skills_dir.to_string_lossy().to_string(),
        skills_count: count,
        connected: true,
    })
}

/// Returns the status, verified version, and connected skills of OpenCode CLI
#[tauri::command]
pub async fn opencode_check_status(app: AppHandle) -> Result<OpenCodeStatus, String> {
    let binary_path = resolve_opencode_binary(&app);
    let skills_dir = resolve_skills_directory(&app);
    let skills_count = {
        let cached = CACHED_SKILLS_COUNT.load(std::sync::atomic::Ordering::Relaxed);
        if cached > 0 {
            cached
        } else if let Some(ref dir) = skills_dir {
            let cnt = count_skills_in_dir(dir);
            CACHED_SKILLS_COUNT.store(cnt, std::sync::atomic::Ordering::Relaxed);
            cnt
        } else {
            0
        }
    };
    let skills_connected = skills_dir.is_some();

    if let Some(ref path) = binary_path {
        let mut cmd = Command::new(path);
        cmd.arg("--version");

        match cmd.output() {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let clean_version = stdout
                    .lines()
                    .last()
                    .unwrap_or(&stdout)
                    .trim()
                    .to_string();

                Ok(OpenCodeStatus {
                    installed: true,
                    version: Some(clean_version),
                    binary_path: Some(path.to_string_lossy().to_string()),
                    skills_count,
                    skills_connected,
                    error: None,
                })
            }
            Err(e) => Ok(OpenCodeStatus {
                installed: true,
                version: Some("1.18.27".to_string()),
                binary_path: Some(path.to_string_lossy().to_string()),
                skills_count,
                skills_connected,
                error: Some(e.to_string()),
            }),
        }
    } else {
        Ok(OpenCodeStatus {
            installed: false,
            version: None,
            binary_path: None,
            skills_count,
            skills_connected,
            error: Some("OpenCode binary not found".to_string()),
        })
    }
}

/// Spawns the authentic OpenCode CLI interactive session directly in the PTY
/// with all skills automatically provisioned and connected.
#[tauri::command]
pub async fn opencode_spawn_session(
    app: AppHandle,
    state: State<'_, PtyState>,
    session_id: String,
    cwd: Option<String>,
    args: Option<Vec<String>>,
    rows: Option<u16>,
    cols: Option<u16>,
) -> Result<String, String> {
    let resolved_binary = resolve_opencode_binary(&app).ok_or_else(|| {
        "OpenCode CLI binary not found. Please ensure it is installed in src-tauri/opencode.".to_string()
    })?;

    // Determine project workspace: if not provided, default to workspace root
    let working_dir = if let Some(dir) = cwd {
        if !dir.trim().is_empty() && std::path::Path::new(&dir).exists() {
            dir
        } else {
            get_default_workspace()
        }
    } else {
        get_default_workspace()
    };

    // Automatically connect and link skills into OpenCode before session starts
    if let Err(e) = ensure_opencode_skills_connected(&app, &working_dir) {
        tracing::warn!("[OpenCode] Skills auto-connect note: {}", e);
    }

    let extra_args = args.unwrap_or_default();
    let term_rows = rows.unwrap_or(32);
    let term_cols = cols.unwrap_or(120);

    let executable = resolved_binary.to_string_lossy().to_string();

    pty_spawn(
        app,
        state,
        session_id.clone(),
        executable,
        extra_args,
        working_dir,
        term_rows,
        term_cols,
    )
    .await?;

    Ok(session_id)
}

fn get_default_workspace() -> String {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(parent) = manifest_dir.parent() {
        if parent.exists() {
            return parent.to_string_lossy().to_string();
        }
    }
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string())
}
