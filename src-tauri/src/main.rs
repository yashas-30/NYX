// #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

mod commands;
mod server_sidecar;
mod tray;

use commands::*;
use server_sidecar::ServerManager;

#[derive(Default)]
pub struct AppState {
    pub server_manager: Arc<Mutex<Option<ServerManager>>>,
    pub mcp_manager: Arc<commands::mcp::McpManager>,
    pub pty_state: Arc<Mutex<std::collections::HashMap<String, commands::pty::PtySession>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
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
        .manage(AppState {
            server_manager: Arc::new(Mutex::new(None)),
            mcp_manager: Arc::new(commands::mcp::McpManager::default()),
            pty_state: Arc::new(Mutex::new(std::collections::HashMap::new())),
        })
        .manage(commands::pty::PtyState::default())
        .manage(commands::fs::WatcherState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            
            // Register global shortcut
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
            use std::str::FromStr;
            let shortcut = tauri_plugin_global_shortcut::Shortcut::from_str("Super+Space").unwrap_or_else(|_| tauri_plugin_global_shortcut::Shortcut::from_str("CmdOrCtrl+Space").unwrap());
            if let Err(e) = app.global_shortcut().register(shortcut) {
                tracing::warn!("Failed to register global shortcut: {}", e);
            }

            tauri::async_runtime::spawn(async move {
                setup_app(&handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            dialog_open_directory,
            vault_store_key, vault_get_key, vault_delete_key, vault_list_keys,
            window_minimize, window_maximize, window_close, window_show, window_hide,
            system_gpu_info, system_info, system_get_userdata,
            server_get_ports, server_restart,
            app_get_version, app_open_external,
            proxy_request, proxy_stream_request,
            execute_computer_action,
            mcp_start_server, mcp_send_request,
            llm_stream_request,
            pty_spawn, pty_write, pty_resize, pty_close,
            fs_watch_start, fs_watch_stop,
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

    // Create the window immediately with default ports so UI is instant
    let window = create_main_window(handle, 3010).await;
    tray::create_tray(handle, &window).expect("Failed to create tray");
    setup_menus(handle);

    // Show the window now that everything is ready
    let _ = window.show();
    let _ = window.set_focus();

    #[cfg(target_os = "macos")]
    let _ = window_vibrancy::apply_vibrancy(&window, window_vibrancy::NSVisualEffectMaterial::HudWindow, None, None);

    #[cfg(target_os = "windows")]
    let _ = window_vibrancy::apply_blur(&window, Some((18, 18, 18, 125))); // Dark blur

    // Spawn server start in background
    let handle_clone = handle.clone();
    tauri::async_runtime::spawn(async move {
        let mut server_manager = ServerManager::new(handle_clone.clone()).await;
        let ports = match server_manager.start().await {
            Ok(p) => {
                tracing::info!("✅ Backend server started on port {}", p.express_port);
                p
            }
            Err(e) => {
                tracing::error!("❌ Failed to start server: {}", e);
                let _ = tauri_plugin_dialog::DialogExt::dialog(&handle_clone)
                    .message(format!("NYX backend server failed to start:\n\n{}\n\nThe app will open but AI features may not work. Try restarting the app.", e))
                    .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                    .title("Backend Server Error")
                    .blocking_show();
                
                server_sidecar::ServerPorts {
                    express_port: 3010,
                    fastify_port: 3011,
                    scrapling_port: 3012,
                }
            }
        };

        {
            let state = handle_clone.state::<AppState>();
            let mut mgr = state.server_manager.lock().await;
            *mgr = Some(server_manager);
        }
    });

    tracing::info!("✅ NYX Tauri fully initialized");
}

async fn create_main_window(handle: &tauri::AppHandle, port: u16) -> tauri::WebviewWindow {
    // In dev mode, tauri.conf.json `devUrl` already points the window to localhost:3000 (Vite).
    // We must NOT navigate away from it — just return the existing window.
    // In production, Express serves the built frontend, so we navigate there.
    if cfg!(debug_assertions) {
        // Return the existing window that Tauri created via devUrl
        if let Some(window) = handle.get_webview_window("main") {
            return window;
        }
        // Fallback: create pointed at Vite dev server
        WebviewWindowBuilder::new(
            handle, "main",
            WebviewUrl::External("http://localhost:3000".parse().unwrap())
        )
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
    } else {
        let url = format!("http://127.0.0.1:{}", port).parse().unwrap();
        if let Some(window) = handle.get_webview_window("main") {
            let _ = window.navigate(url);
            window
        } else {
            WebviewWindowBuilder::new(
                handle, "main",
                WebviewUrl::External(url)
            )
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
    }
}

fn setup_menus(handle: &tauri::AppHandle) {
    let menu = Menu::new(handle).unwrap();
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

// Global shortcut registration is handled in main()

fn main() {
    run();
}
