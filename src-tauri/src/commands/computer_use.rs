use tauri::command;
use enigo::{Enigo, Mouse, Keyboard, Coordinate, Button, Direction, Settings};
use xcap::Monitor;
use base64::{Engine as _, engine::general_purpose};
use std::io::Cursor;
use image::ImageFormat;
use std::time::Duration;

#[command]
pub async fn execute_computer_action(action: String, params: String) -> Result<String, String> {
    println!("Executing Computer Action: {} with params: {}", action, params);
    
    // Parse params (expecting JSON string)
    let parsed_params: serde_json::Value = serde_json::from_str(&params)
        .unwrap_or(serde_json::Value::Null);

    // Default delay to allow UI to settle before taking screenshots or acting
    tokio::time::sleep(Duration::from_millis(100)).await;

    match action.as_str() {
        "screenshot" => {
            let monitors = Monitor::all().map_err(|e| e.to_string())?;
            // Use the primary monitor or the first one available
            let monitor = monitors.into_iter()
                .find(|m| m.is_primary().unwrap_or(false))
                .or_else(|| Monitor::all().unwrap_or_default().into_iter().next())
                .ok_or("No monitor found")?;

            let image = monitor.capture_image().map_err(|e| e.to_string())?;
            
            // Resize image if it's too large to save token costs (optional)
            // For now, return the raw screenshot encoded in base64 as JPEG
            let mut buf = Cursor::new(Vec::new());
            image.write_to(&mut buf, ImageFormat::Jpeg).map_err(|e| e.to_string())?;
            
            let b64 = general_purpose::STANDARD.encode(buf.into_inner());
            Ok(b64)
        },
        "mouse_move" => {
            let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
            let x = parsed_params["x"].as_i64().unwrap_or(0) as i32;
            let y = parsed_params["y"].as_i64().unwrap_or(0) as i32;
            enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| e.to_string())?;
            Ok(format!("Moved mouse to {}, {}", x, y))
        },
        "left_click" => {
            let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
            enigo.button(Button::Left, Direction::Click).map_err(|e| e.to_string())?;
            Ok("Clicked left mouse button".to_string())
        },
        "left_click_drag" => {
            let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
            let x = parsed_params["x"].as_i64().unwrap_or(0) as i32;
            let y = parsed_params["y"].as_i64().unwrap_or(0) as i32;
            enigo.button(Button::Left, Direction::Press).map_err(|e| e.to_string())?;
            enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| e.to_string())?;
            enigo.button(Button::Left, Direction::Release).map_err(|e| e.to_string())?;
            Ok(format!("Dragged to {}, {}", x, y))
        },
        "right_click" => {
            let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
            enigo.button(Button::Right, Direction::Click).map_err(|e| e.to_string())?;
            Ok("Clicked right mouse button".to_string())
        },
        "middle_click" => {
            let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
            enigo.button(Button::Middle, Direction::Click).map_err(|e| e.to_string())?;
            Ok("Clicked middle mouse button".to_string())
        },
        "double_click" => {
            let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
            enigo.button(Button::Left, Direction::Click).map_err(|e| e.to_string())?;
            tokio::time::sleep(Duration::from_millis(100)).await;
            enigo.button(Button::Left, Direction::Click).map_err(|e| e.to_string())?;
            Ok("Double-clicked".to_string())
        },
        "type" => {
            let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
            let text = parsed_params["text"].as_str().unwrap_or("");
            enigo.text(text).map_err(|e| e.to_string())?;
            Ok(format!("Typed text: {}", text))
        },
        "key" => {
            let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
            let text = parsed_params["text"].as_str().unwrap_or("");
            // Parse keys like 'Return', 'Tab', etc.
            match text {
                "Return" | "enter" => enigo.key(enigo::Key::Return, Direction::Click).map_err(|e| e.to_string())?,
                "Tab" | "tab" => enigo.key(enigo::Key::Tab, Direction::Click).map_err(|e| e.to_string())?,
                "Space" | "space" => enigo.key(enigo::Key::Space, Direction::Click).map_err(|e| e.to_string())?,
                "Escape" | "escape" => enigo.key(enigo::Key::Escape, Direction::Click).map_err(|e| e.to_string())?,
                "Backspace" | "backspace" => enigo.key(enigo::Key::Backspace, Direction::Click).map_err(|e| e.to_string())?,
                _ => {
                    // Fallback to text for unmapped keys or single characters
                    enigo.text(text).map_err(|e| e.to_string())?;
                }
            };
            Ok(format!("Pressed key: {}", text))
        },
        _ => Err(format!("Unknown action: {}", action)),
    }
}
