use serde_json::{Value, json};

#[tauri::command]
pub async fn cancel_all_requests() -> Result<(), String> {
    Ok(())
}

#[tauri::command(rename = "cancel_request")]
pub async fn cancel_request(_request_id: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn get_models_quota(_provider: String, _api_key: Option<String>) -> Result<Value, String> {
    Ok(json!({ "success": true, "data": {} }))
}

#[tauri::command]
pub async fn list_local_models() -> Result<Vec<Value>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn chat_send_message() -> Result<Value, String> {
    Err("Not implemented. Use stream_chat instead.".into())
}

#[tauri::command]
pub async fn chat_send_message_ensemble() -> Result<Value, String> {
    Err("Not implemented. Use stream_chat instead.".into())
}

#[tauri::command]
pub async fn chat_send_message_parallel() -> Result<Value, String> {
    Err("Not implemented. Use stream_chat instead.".into())
}

#[tauri::command]
pub async fn chat_send_message_ab_test() -> Result<Value, String> {
    Err("Not implemented. Use stream_chat instead.".into())
}
