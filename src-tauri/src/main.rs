#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Force Windows to use Dedicated GPU (High Performance) for this application and WebView2
#[no_mangle]
pub static NvOptimusEnablement: u32 = 1;
#[no_mangle]
pub static AmdPowerXpressRequestHighPerformance: i32 = 1;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use tokio::sync::Mutex;
use tauri::{
    Manager, WebviewUrl, WebviewWindowBuilder,
};

mod commands;
mod tray;
mod db;
pub mod llm;
pub mod agents;
pub mod rag;
pub mod guardrails;
pub mod research;
pub mod mcp_server;
pub mod orchestrator;

use commands::*;

/// Global application state managed by Tauri.
pub struct AppState {
    pub mcp_manager: Arc<commands::mcp::McpManager>,
    /// Set to `true` to cancel the currently running agent loop.
    /// The orchestrator checks this flag at the start of every ReAct iteration.
    /// Reset to `false` automatically at the start of each new run.
    pub agent_cancel: Arc<AtomicBool>,

    // All pending-action maps use tokio::sync::Mutex for consistency in async
    // commands — std::sync::Mutex held across .await points risks deadlocking
    // the Tokio thread pool.
    pub pending_approvals: Arc<Mutex<std::collections::HashMap<String, tokio::sync::oneshot::Sender<bool>>>>,
    pub pending_plugin_tools: Arc<Mutex<std::collections::HashMap<String, tokio::sync::oneshot::Sender<String>>>>,
    pub pending_browser_actions: Arc<Mutex<std::collections::HashMap<String, tokio::sync::oneshot::Sender<String>>>>,

    /// Per-session conductor tx handles — reuse the same actor across multi-turn conversations.
    pub conductor_channels: Arc<Mutex<std::collections::HashMap<String, tokio::sync::mpsc::Sender<agents::protocol::ConductorMessage>>>>,
    pub search_provider: Arc<tokio::sync::RwLock<String>>,
    pub search_api_key: Arc<tokio::sync::RwLock<String>>,
}

impl Default for AppState {
    fn default() -> Self {
        let mcp_manager = Arc::new(commands::mcp::McpManager::default());
        Self {
            mcp_manager,
            agent_cancel: Arc::new(AtomicBool::new(false)),
            pending_approvals: Arc::new(Mutex::new(std::collections::HashMap::new())),
            pending_plugin_tools: Arc::new(Mutex::new(std::collections::HashMap::new())),
            pending_browser_actions: Arc::new(Mutex::new(std::collections::HashMap::new())),
            conductor_channels: Arc::new(Mutex::new(std::collections::HashMap::new())),
            search_provider: Arc::new(tokio::sync::RwLock::new("duckduckgo".to_string())),
            search_api_key: Arc::new(tokio::sync::RwLock::new("".to_string())),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]

pub fn run() {
    tracing_subscriber::fmt::init();

    // Optimize Webview2 memory usage on Windows to reduce RAM consumption
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--disable-features=RendererCodeIntegrity,SitePerProcess --js-flags=\"--max-old-space-size=2048\"");

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
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .manage({
            // Register Arc<McpManager> separately so MCP commands can access it
            // via State<'_, Arc<McpManager>> without going through AppState.
            // The instance is the same Arc as AppState.mcp_manager (same allocation).
            std::sync::Arc::new(commands::mcp::McpManager::default())
        })
        .manage(commands::pty::PtyState::default())
        .manage(commands::fs::WatcherState::default())
        .setup(|app| {
            let app_handle = app.handle().clone();


            // Set up Llama sidecar manager (now from local_orchestrator)
            let llama_manager = std::sync::Arc::new(llm::local_orchestrator::LlamaManager::new());
            app_handle.manage(llama_manager);

            let hf_state = std::sync::Arc::new(llm::local_orchestrator::HfDownloaderState::new());
            app_handle.manage(hf_state);

            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Could not determine app data directory");
            std::fs::create_dir_all(&data_dir).expect("Could not create app data directory");
            
            // Set up RAG CodebaseScanner
            let rag_db_path = data_dir.join("rag.db");
            if let Ok(scanner) = tauri::async_runtime::block_on(crate::rag::scanner::CodebaseScanner::new(rag_db_path)) {
                app_handle.manage(std::sync::Arc::new(scanner));
            } else {
                tracing::error!("Failed to initialize CodebaseScanner");
            }

            let db_path = data_dir.join("nyx.db");

            let pool = tauri::async_runtime::block_on(db::pool::init_db_pool(db_path))
                .expect("Failed to initialize SQLite database pool");
            app.manage(pool);

            // ── Spawn the rest of the UI setup asynchronously ─────────────────
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Pre-load the ONNX embedding model in the background so the 
                // first web search or codebase scan doesn't hang.
                tauri::async_runtime::spawn_blocking(|| {
                    crate::rag::embeddings::warm_up();
                });
                
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
            llm::cloud_orchestrator::llm_stream_request,
            orchestrator::commands::run_orchestrator_turn,
            commands::system::cleanup_session_state,
            commands::system::set_search_settings,
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
            db::commands::db_insert_experience_ledger,
            db::commands::db_get_recent_experience_ledger,
            db::commands::db_delete_memory,
            db::commands::db_clear_memories,
            db::commands::db_prune_memories,
            db::commands::db_search_memories,
            search_web_command,
            commands::agent::fetch_page_html_command,
            commands::agent::run_agent_tool,
            commands::agent::approve_tool,
            commands::agent::reject_tool,
            commands::agent::resolve_plugin_tool,
            commands::agent::resolve_browser_action,
            // Local model orchestration (must use actual defining module path for #[tauri::command] symbols)
            llm::local_orchestrator::analyze_hardware,
            llm::local_orchestrator::download_local_model,
            llm::local_orchestrator::list_local_models,
            llm::local_orchestrator::start_local_server,
            llm::local_orchestrator::estimate_hardware_usage,
            llm::local_orchestrator::stop_local_server,
            llm::local_orchestrator::check_local_server_status,
            llm::local_orchestrator::hf_set_token,
            llm::local_orchestrator::hf_download_model,
            llm::local_orchestrator::hf_pause_download,
            llm::local_orchestrator::hf_resume_download,
            llm::local_orchestrator::hf_cancel_download,
            llm::local_orchestrator::hf_uninstall_model,
            llm::local_orchestrator::hf_search_models,
            llm::local_orchestrator::hf_get_model_files,
            llm::local_orchestrator::hf_get_model_readme,
            llm::local_orchestrator::hf_get_restored_downloads,
            llm::local_orchestrator::get_llamacpp_version,
            // Cloud model orchestration
            llm::cloud_orchestrator::get_models_quota,
            commands::system::get_hardware_specs,
            commands::system::get_system_diagnostics,
            research::start_deep_research,
            commands::observability::get_llm_traces,
            commands::observability::get_observability_summary,
            commands::observability::prune_llm_traces,
            commands::memory::get_episodic_memories,
            commands::memory::get_memory_entities,
            commands::memory::delete_entity,
            commands::agent::codebase_search_command,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app_handle = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.hide();
                    }
                });
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running NYX");
}

async fn setup_app(handle: &tauri::AppHandle) {
    tracing::info!("🚀 NYX Tauri boot sequence starting...");

    let window   = create_main_window(handle).await;

    // Maximize the window by default to fill the display as requested, 
    // without pushing the native OS titlebar off-screen.
    let _ = window.maximize();

    tray::create_tray(handle, &window).expect("Failed to create tray");

    let _ = window.show();
    let _ = window.set_focus();

    // Remove the default Windows menu bar (File, Edit, View, Window, Help)
    #[cfg(target_os = "windows")]
    let _ = window.remove_menu();

    // Explicitly enforce resizable state after the window is fully shown.
    // tauri_plugin_window_state or vibrancy effects can silently override this.
    let _ = window.set_resizable(true);
    let _ = window.set_maximizable(true);

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
        .inner_size(1200.0, 760.0) // This is just the fallback before the monitor resize
        .min_inner_size(800.0, 560.0)
        .center()
        .resizable(true)
        .maximizable(true)
        .minimizable(true)
        .decorations(true)
        .shadow(true)
        .transparent(true)
        .visible(false)
        .build()
        .expect("Failed to create window")
}



fn main() {
    run();
}
