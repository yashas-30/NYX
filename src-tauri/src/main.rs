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
pub mod workers;

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

            let pool = tauri::async_runtime::block_on(db::pool::init_db_pool(db_path.clone()))
                .expect("Failed to initialize SQLite database pool");
            app.manage(pool.clone());

            // ── Spawn Background Worker Loop ──────────────────────────────────
            tauri::async_runtime::spawn(crate::workers::start_worker_loop(pool.clone(), db_path.clone()));

            // ── Spawn Turbovec HTTP API ───────────────────────────────────────
            let mem_state = db::memory::HermesMemoryState::default();
            app.manage(mem_state.clone());
            db::memory::spawn_memory_server(mem_state);

            // ── Initialize RAG State ──────────────────────────────────────────
            let rag_state = db::rag::RagState::default();
            app.manage(rag_state);

            // ── Spawn the rest of the UI setup asynchronously ─────────────────
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                setup_app(&handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            dialog_open_directory,
            vault_store_key, vault_get_key, vault_delete_key, vault_status, vault_list_keys, vault_validate_gemini_key,
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
            db::memory::turbovec_add_memory,
            db::memory::turbovec_search_memory,
            db::rag::db_add_document_chunk,
            db::rag::db_delete_document_chunks,
            db::rag::db_search_document_chunks,
            orchestrate_supervisor,
            cancel_agent_loop,       // Fix 11: expose cancellation to frontend
            search_web_command,
            commands::agent::search_web_json_command,
            commands::agent::fetch_page_html_command,
            commands::agent::run_agent_tool,
            commands::agent::approve_tool,
            commands::agent::reject_tool,
            commands::agent::resolve_plugin_tool,
            commands::agent::resolve_browser_action,
            stream_chat,
            commands::workspace::workspace_get,
            commands::workspace::workspace_select,
            commands::workspace::workspace_create,
            commands::workspace::workspace_list_projects,
            commands::workspace::workspace_create_project,
            commands::workspace::workspace_update_project,
            commands::workspace::workspace_delete_project,
            commands::cache::cache_stats,
            commands::cache::cache_clear,
            commands::voice::voice_tts,
            commands::voice::voice_stt,
            cancel_all_requests,
            cancel_request,
            get_models_quota,
            list_local_models,
            chat_send_message,
            chat_send_message_ensemble,
            chat_send_message_parallel,
            chat_send_message_ab_test,
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

async fn setup_app(handle: &tauri::AppHandle) {
    let window   = create_main_window(handle).await;
    tray::create_tray(handle, &window).expect("Failed to create tray");
    setup_menus(handle);

    let _ = window.show();
    let _ = window.set_focus();

    #[cfg(target_os = "macos")]
    {
        let _ = window_vibrancy::apply_vibrancy(&window, window_vibrancy::NSVisualEffectMaterial::HudWindow, None, None);
    }

    #[cfg(target_os = "windows")]
    {
        let _ = window_vibrancy::apply_mica(&window, Some(true));
    }

    // ── Embedded LLM: try to auto-start in background ─────────────────────────
    // Non-blocking: if the model file exists this completes in ~1.5s.
    // If missing, sets state to ModelMissing so the frontend can offer download.
    tauri::async_runtime::spawn(async {
        crate::llm::embedded::try_autostart_embedded().await;
    });

    // Fastify Backend Sidecar has been removed (migrated to native Rust)


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
