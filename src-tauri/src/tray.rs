use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WebviewWindow,
};

pub fn create_tray(app: &tauri::AppHandle, _window: &WebviewWindow) -> anyhow::Result<()> {
    let show_i = MenuItem::with_id(app, "show", "Show NYX", true, None::<&str>)?;
    let quick_i = MenuItem::with_id(app, "quick", "Quick Prompt", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let update_i = MenuItem::with_id(app, "update", "Check for Updates...", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit NYX", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_i, &quick_i, &separator, &update_i, &quit_i])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("NYX Platform")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quick" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = app.emit_to("main", "navigate", "/chat");
                    }
                }
                "update" => {}
                "quit" => { app.exit(0); }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}
