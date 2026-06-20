// #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use tokio::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

mod commands;
mod tray;
mod db;
pub mod llm;
pub mod agents;

use commands::*;

/// Global application state managed by Tauri.
pub struct AppState {
    pub mcp_manager:  Arc<commands::mcp::McpManager>,
    pub pty_state:    Arc<Mutex<std::collections::HashMap<String, commands::pty::PtySession>>>,
    /// Set to `true` to cancel the currently running agent loop.
    /// The orchestrator checks this flag at the start of every ReAct iteration.
    /// Reset to `false` automatically at the start of each new run.
    pub agent_cancel: Arc<AtomicBool>,
    pub orchestrator: Arc<agents::orchestrator::Orchestrator>,
    pub pending_approvals: Arc<std::sync::Mutex<std::collections::HashMap<String, tokio::sync::oneshot::Sender<bool>>>>,
    pub pending_plugin_tools: Arc<std::sync::Mutex<std::collections::HashMap<String, tokio::sync::oneshot::Sender<String>>>>,
    pub pending_browser_actions: Arc<std::sync::Mutex<std::collections::HashMap<String, tokio::sync::oneshot::Sender<String>>>>,
    pub sidecar_port: Arc<std::sync::Mutex<u16>>,
}

impl Default for AppState {
    fn default() -> Self {
        let mcp_manager = Arc::new(commands::mcp::McpManager::default());
        Self {
            orchestrator: Arc::new(agents::orchestrator::Orchestrator::new(mcp_manager.clone())),
            mcp_manager,
            pty_state:    Arc::new(Mutex::new(std::collections::HashMap::new())),
            agent_cancel: Arc::new(AtomicBool::new(false)),
            pending_approvals: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
            pending_plugin_tools: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
            pending_browser_actions: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
            sidecar_port: Arc::new(std::sync::Mutex::new(3010)),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
use crate::commands::agent_orchestrator::{orchestrate_supervisor, cancel_agent_loop};

pub fn run() {
    tracing_subscriber::fmt::init();
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("spotlight") {
                            if window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build()
        )
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .manage(commands::pty::PtyState::default())
        .manage(commands::fs::WatcherState::default())
        .setup(|app| {
            // ── Register global shortcut ──────────────────────────────────────
            use std::str::FromStr;
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            let shortcut = tauri_plugin_global_shortcut::Shortcut::from_str("Super+Space")
                .unwrap_or_else(|_| tauri_plugin_global_shortcut::Shortcut::from_str("CmdOrCtrl+Space").unwrap());
            if let Err(e) = app.global_shortcut().register(shortcut) {
                tracing::warn!("Failed to register global shortcut: {}", e);
            }

            // ── Initialize SQLite pool synchronously ──────────────────────────
            // Fix 6 & 10: Use Tauri's proper per-app data directory (cross-platform)
            // instead of a heuristic based on nearby files. Blocking here is safe
            // because setup() runs on a non-async thread before any commands fire.
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Could not determine app data directory");
            std::fs::create_dir_all(&data_dir).expect("Could not create app data directory");
            let db_path = data_dir.join("nyx.db");

            let pool = tauri::async_runtime::block_on(db::pool::init_db_pool(db_path))
                .expect("Failed to initialize SQLite database pool");
            app.manage(pool);

            // ── Spawn the rest of the UI setup asynchronously ─────────────────
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                setup_app(&handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            dialog_open_directory,
            vault_store_key, vault_get_key, vault_delete_key, vault_status, vault_list_keys,
            window_minimize, window_maximize, window_close, window_show, window_hide,
            system_gpu_info, system_info, system_get_userdata, execute_command,
            app_get_version, app_open_external,
            execute_computer_action,
            mcp_start_server, mcp_send_request, mcp_call_tool, mcp_stop_server, mcp_list_servers,
            llm_stream_request, llm_load_embedded, llm_embedded_status, llm_download_model, llm_embedded_stats, llm_embedded_finetune,
            pty_spawn, pty_write, pty_resize, pty_close,
            fs_watch_start, fs_watch_stop, fs_parse_and_chunk_file,
            commands::fs::fs_read_file, commands::fs::fs_write_file, commands::fs::fs_list_dir,
            db::commands::db_get_chat_conversations,
            db::commands::db_get_chat_messages,
            db::commands::db_get_all_chat_sessions,
            db::commands::db_get_db_sessions,
            db::commands::db_get_db_messages,
            db::commands::db_get_swarm_context,
            db::commands::db_save_chat_session,
            db::commands::db_delete_chat_session,
            db::commands::db_update_chat_session_meta,
            db::commands::db_create_folder,
            db::commands::db_delete_folder,
            db::commands::db_get_folders,
            db::commands::db_add_memory,
            db::commands::db_get_memories,
            db::commands::db_delete_memory,
            db::commands::db_search_memories,
            orchestrate_supervisor,
            cancel_agent_loop,       // Fix 11: expose cancellation to frontend
            search_web_command,
            commands::agent::fetch_page_html_command,
            commands::agent::run_agent_tool,
            commands::agent::approve_tool,
            commands::agent::reject_tool,
            commands::agent::resolve_plugin_tool,
            commands::agent::resolve_browser_action,
            server_get_ports,
        ])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    let app_handle = window.app_handle().clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(w) = app_handle.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    });
                    api.prevent_close();
                }
                tauri::WindowEvent::Destroyed => {
                    // Kill the embedded llama-server when the window is truly destroyed
                    tauri::async_runtime::spawn(async {
                        crate::llm::embedded::stop_embedded_model().await;
                    });
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running NYX");
}

#[tauri::command]
fn server_get_ports(state: tauri::State<'_, AppState>) -> serde_json::Value {
    let port = *state.sidecar_port.lock().unwrap();
    serde_json::json!({
        "success": true,
        "data": {
            "express_port": port
        }
    })
}

async fn setup_app(handle: &tauri::AppHandle) {
    tracing::info!("🚀 NYX Tauri boot sequence starting...");

    let window   = create_main_window(handle).await;
    let spotlight = create_spotlight_window(handle).await;
    tray::create_tray(handle, &window).expect("Failed to create tray");
    setup_menus(handle);

    let _ = window.show();
    let _ = window.set_focus();

    #[cfg(target_os = "macos")]
    {
        let _ = window_vibrancy::apply_vibrancy(&window, window_vibrancy::NSVisualEffectMaterial::HudWindow, None, None);
        let _ = window_vibrancy::apply_vibrancy(&spotlight, window_vibrancy::NSVisualEffectMaterial::HudWindow, None, None);
    }

    #[cfg(target_os = "windows")]
    {
        let _ = window_vibrancy::apply_mica(&window, Some(true));
        let _ = window_vibrancy::apply_mica(&spotlight, Some(true));
    }

    // ── Embedded LLM: try to auto-start in background ─────────────────────────
    // Non-blocking: if the model file exists this completes in ~1.5s.
    // If missing, sets state to ModelMissing so the frontend can offer download.
    tauri::async_runtime::spawn(async {
        crate::llm::embedded::try_autostart_embedded().await;
    });

    // ── Fastify Backend Sidecar ───────────────────────────────────────────────
    use tauri_plugin_shell::ShellExt;
    
    // Find an ephemeral port
    let sidecar_port = std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .unwrap_or(3001);
        
    // Store it in AppState
    let state = handle.state::<AppState>();
    *state.sidecar_port.lock().unwrap() = sidecar_port;

    match handle.shell().sidecar("nyx-server") {
        Ok(cmd) => {
            let cmd = cmd.env("SIDECAR_PORT", sidecar_port.to_string());
            match cmd.spawn() {
                Ok((mut rx, mut child)) => {
                    tracing::info!("✅ Fastify sidecar started on port {}.", sidecar_port);
                    tauri::async_runtime::spawn(async move {
                        while let Some(event) = rx.recv().await {
                            if let tauri_plugin_shell::process::CommandEvent::Stdout(line) = event {
                                tracing::debug!("[Fastify] {}", String::from_utf8_lossy(&line));
                            } else if let tauri_plugin_shell::process::CommandEvent::Stderr(line) = event {
                                tracing::warn!("[Fastify] {}", String::from_utf8_lossy(&line));
                            }
                        }
                    });
                }
                Err(e) => tracing::error!("❌ Failed to spawn Fastify sidecar: {}", e),
            }
        }
        Err(e) => tracing::error!("❌ Failed to locate Fastify sidecar 'nyx-server': {}", e),
    }

    tracing::info!("✅ NYX Tauri fully initialized");
}

async fn create_main_window(handle: &tauri::AppHandle) -> tauri::WebviewWindow {
    if let Some(window) = handle.get_webview_window("main") {
        return window;
    }

    let url = if cfg!(debug_assertions) {
        WebviewUrl::External("http://localhost:3000".parse().unwrap())
    } else {
        WebviewUrl::App("index.html".into())
    };

    WebviewWindowBuilder::new(handle, "main", url)
        .title("NYX - Native Local Intelligence & Cloud Orchestration Platform")
        .inner_size(1440.0, 900.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .decorations(false)
        .shadow(true)
        .transparent(true)
        .visible(false)
        .build()
        .expect("Failed to create window")
}

async fn create_spotlight_window(handle: &tauri::AppHandle) -> tauri::WebviewWindow {
    if let Some(window) = handle.get_webview_window("spotlight") {
        return window;
    }

    let url = if cfg!(debug_assertions) {
        WebviewUrl::External("http://localhost:3000/spotlight".parse().unwrap())
    } else {
        WebviewUrl::App("spotlight.html".into())
    };

    WebviewWindowBuilder::new(handle, "spotlight", url)
        .title("NYX Spotlight")
        .inner_size(800.0, 600.0)
        .center()
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .visible(false)
        .build()
        .expect("Failed to create spotlight window")
}

fn setup_menus(handle: &tauri::AppHandle) {
    let menu     = Menu::new(handle).unwrap();
    let file_menu = Submenu::new(handle, "File", true).unwrap();
    file_menu.append(&MenuItem::new(handle, "Open Workspace", true, Some("CmdOrCtrl+O")).unwrap()).unwrap();
    file_menu.append(&PredefinedMenuItem::separator(handle).unwrap()).unwrap();
    file_menu.append(&PredefinedMenuItem::quit(handle, Some("Quit")).unwrap()).unwrap();
    menu.append(&file_menu).unwrap();

    let view_menu = Submenu::new(handle, "View", true).unwrap();
    view_menu.append(&MenuItem::new(handle, "Reload", true, Some("CmdOrCtrl+R")).unwrap()).unwrap();
    view_menu.append(&PredefinedMenuItem::separator(handle).unwrap()).unwrap();
    view_menu.append(&PredefinedMenuItem::fullscreen(handle, Some("Toggle Fullscreen")).unwrap()).unwrap();
    menu.append(&view_menu).unwrap();

    let help_menu = Submenu::new(handle, "Help", true).unwrap();
    help_menu.append(&MenuItem::new(handle, "Documentation", true, None::<&str>).unwrap()).unwrap();
    help_menu.append(&MenuItem::new(handle, "Report Issue", true, None::<&str>).unwrap()).unwrap();
    menu.append(&help_menu).unwrap();

    let _ = handle.set_menu(menu);
}

fn main() {
    run();
}
