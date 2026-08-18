#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

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
use crate::commands::db::{
    db_get_local_models,
    db_upsert_local_model,
    db_update_model_preset,
    db_update_model_metadata,
    db_delete_local_model,
};


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
        .manage({
            let mcp_manager = std::sync::Arc::new(commands::mcp::McpManager::default());
            AppState {
                mcp_manager,
                ..AppState::default()
            }
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
            
            let db_path = data_dir.join("nyx.db");

            let pool = tauri::async_runtime::block_on(db::pool::init_db_pool(db_path))
                .expect("Failed to initialize SQLite database pool");
            app.manage(pool);

            // Restore persistent API keys into environment variables from safeStorage/Keyring + encrypted vault
            commands::vault::restore_all_vault_keys_to_env();


            // ── Spawn the rest of the UI setup, CodebaseScanner & binary auto-updater asynchronously ─
            let handle = app.handle().clone();
            let rag_db_path = data_dir.join("rag.db");
            let turbovec_data_dir = data_dir.clone();
            tauri::async_runtime::spawn(async move {
                let handle_rag = handle.clone();
                let rag_path = rag_db_path.clone();
                tauri::async_runtime::spawn(async move {
                    if let Ok(scanner) = crate::rag::scanner::CodebaseScanner::new(rag_path).await {
                        handle_rag.manage(std::sync::Arc::new(scanner));
                        tracing::info!("[RAG] CodebaseScanner initialized asynchronously");
                    } else {
                        tracing::error!("Failed to initialize CodebaseScanner");
                    }
                });

                // Initialize TurbovecStore (LanceDB-backed vector memory) and register as app state.
                // This wires up the previously declared but unused TurboVec memory backend.
                let handle_tv = handle.clone();
                tauri::async_runtime::spawn(async move {
                    let store = crate::rag::turbovec_store::TurbovecStore::new(&turbovec_data_dir, "chat").await;
                    handle_tv.manage(std::sync::Arc::new(store));
                    tracing::info!("[TurboVec] Chat memory store initialized");
                });

                // Auto-check and update local binaries on app startup / restart
                let handle_update = handle.clone();
                tauri::async_runtime::spawn(async move {
                    if let Ok(app_dir) = handle_update.path().app_data_dir() {
                        tracing::info!("[AutoUpdate] Checking for binary & library updates on startup...");
                        let downloader = crate::llm::local_orchestrator::Downloader::new();
                        let hw = crate::llm::local_orchestrator::HardwareSnapshot::collect().await;
                        let _ = downloader.ensure_server(&app_dir, &hw.gpu_backend, |_p, msg| {
                            tracing::info!("[AutoUpdate] {}", msg);
                        }).await;
                    }
                });

                // Pre-load the ONNX embedding model in the background so the 
                // first web search or codebase scan doesn't hang.
                tauri::async_runtime::spawn_blocking(|| {
                    crate::rag::embeddings::warm_up();
                });
                
                // Auto-start Qwen 2.5 1.5B on GPU in background if model is present on disk
                let handle_qwen = handle.clone();
                tauri::async_runtime::spawn(async move {
                    let resolved = crate::llm::local_orchestrator::resolve_model_path(
                        &handle_qwen,
                        "qwen2.5-1.5b-instruct-q4_k_m.gguf"
                    ).await;
                    
                    if resolved.is_some() {
                        tracing::info!("[Startup] Qwen 2.5 1.5B detected on disk. Auto-loading model to GPU VRAM with 100% offload...");
                        let manager = handle_qwen.state::<std::sync::Arc<crate::llm::local_orchestrator::LlamaManager>>();
                        let _ = crate::llm::local_orchestrator::start_local_server(
                            handle_qwen.clone(),
                            manager,
                            "qwen2.5-1.5b-instruct-q4_k_m.gguf".to_string(),
                            Some(8192),
                            Some(99), // 100% GPU offload
                            None,
                            Some(true), // flash attention
                            None,
                            None,
                            Some(512),
                            None,
                            None,
                            None,
                            None,
                        ).await;
                    }
                });

                setup_app(&handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            dialog_open_directory,
            window_minimize, window_maximize, window_close, window_show, window_hide,
            system_gpu_info, system_info, system_get_userdata, execute_command,
            app_get_version, app_open_external,
            execute_computer_action,
            mcp_start_server, mcp_send_request, mcp_call_tool, mcp_stop_server, mcp_list_servers,
            llm::cloud_orchestrator::llm_stream_request,
            llm::local_inference::llm_local_stream_request,
            commands::lucifer::run_lucifer_turn,
            commands::lucifer::analyze_lucifer_turn,
            commands::system::cleanup_session_state,
            commands::system::set_search_settings,
            pty_spawn, pty_write, pty_resize, pty_close,
            fs_watch_start, fs_watch_stop, fs_parse_and_chunk_file,
            commands::fs::fs_read_file, commands::fs::fs_write_file, commands::fs::fs_list_dir,
            commands::db::db_get_chat_conversations,
            commands::db::db_get_chat_messages,
            commands::db::db_get_all_chat_sessions,
            commands::db::db_get_db_sessions,
            commands::db::db_get_db_messages,
            commands::db::db_get_swarm_context,
            commands::db::db_save_chat_session,
            commands::db::db_delete_chat_session,
            commands::db::db_update_chat_session_meta,
            commands::db::db_create_folder,
            commands::db::db_delete_folder,
            commands::db::db_get_folders,
            commands::db::db_add_memory,
            commands::db::db_get_memories,
            commands::db::db_insert_experience_ledger,
            commands::db::db_get_recent_experience_ledger,
            commands::db::db_delete_memory,
            commands::db::db_clear_memories,
            commands::db::db_prune_memories,
            commands::db::db_search_memories,
            commands::db::db_search_chat_history,
            db_get_local_models,
            db_upsert_local_model,
            db_update_model_preset,
            db_update_model_metadata,
            db_delete_local_model,
            search_web_command,
            commands::agent::search_images_command,
            commands::agent::fetch_image_base64,
            commands::agent::generate_search_queries_with_model,
            commands::agent::generate_intelligent_query_plan_command,
            commands::agent::fetch_image_data_url_command,
            commands::agent::check_prompt_cache_command,
            commands::agent::save_prompt_cache_command,
            commands::agent::clear_prompt_cache_command,
            commands::agent::fetch_page_html_command,
            commands::agent::fetch_multiple_pages_command,
            commands::agent::run_agent_tool,
            commands::agent::approve_tool,
            commands::agent::reject_tool,
            commands::agent::resolve_plugin_tool,
            commands::agent::resolve_browser_action,
            // Vault Secure Storage Commands
            commands::vault::vault_store_key,
            commands::vault::vault_get_key,
            commands::vault::vault_delete_key,
            commands::vault::vault_status,
            commands::vault::vault_list_keys,
            commands::vault::vault_validate,
            commands::vault::vault_encrypt,
            commands::vault::vault_decrypt,
            // Local model orchestration
            llm::local_orchestrator::analyze_hardware,
            llm::local_orchestrator::download_local_model,
            llm::local_orchestrator::open_external_installer_cli,
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
            llm::local_orchestrator::check_and_update_binaries,
            llm::diffusers::generate_local_image,
            llm::ocr::run_local_ocr,
            // Cloud model orchestration
            llm::cloud_orchestrator::get_models_quota,
            llm::cloud_orchestrator::check_provider_reachable,
            commands::system::get_hardware_specs,
            commands::system::get_system_diagnostics,
            research::start_deep_research,
            commands::observability::get_llm_traces,
            commands::observability::get_observability_summary,
            commands::observability::prune_llm_traces,
            commands::memory::get_episodic_memories,
            commands::memory::get_memory_entities,
            commands::memory::delete_entity,
            commands::memory::extract_session_memory,
            commands::memory::turbovec_add_memory,
            commands::memory::turbovec_search_memory,
            commands::memory::turbovec_search_chat_history,
            commands::memory::turbovec_sync_chat_session,
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
        .transparent(false)
        .visible(false)
        .build()
        .expect("Failed to create window")
}



fn main() {
    // Enforce 16MB minimum stack size for all threads (including Tokio worker threads)
    unsafe {
        std::env::set_var("RUST_MIN_STACK", "16777216");
    }

    // Run Tauri application directly on the OS main thread (required by TAO/Winit Windows EventLoop)
    run();
}



