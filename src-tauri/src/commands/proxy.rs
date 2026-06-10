use tauri::State;
use reqwest::Client;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use crate::AppState;

#[derive(Serialize)]
pub struct ProxyResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
}

#[tauri::command]
pub async fn proxy_request(
    state: State<'_, AppState>,
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<ProxyResponse, String> {
    let fastify_port = {
        let mgr = state.server_manager.lock().await;
        if let Some(ref manager) = *mgr {
            manager.fastify_port
        } else {
            return Err("Server not running".to_string());
        }
    };

    // Construct the absolute URL
    let url = format!("http://127.0.0.1:{}{}", fastify_port, path);

    let client = Client::new();
    let mut req = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "PATCH" => client.patch(&url),
        _ => return Err(format!("Unsupported method: {}", method)),
    };

    for (k, v) in headers {
        req = req.header(k, v);
    }

    if let Some(b) = body {
        req = req.body(b);
    }

    let res = req.send().await.map_err(|e| e.to_string())?;

    let status = res.status().as_u16();
    let mut res_headers = HashMap::new();
    for (name, value) in res.headers() {
        if let Ok(v) = value.to_str() {
            res_headers.insert(name.as_str().to_string(), v.to_string());
        }
    }

    let body_bytes = res.bytes().await.map_err(|e| e.to_string())?;
    let body_str = String::from_utf8_lossy(&body_bytes).to_string();

    Ok(ProxyResponse {
        status,
        headers: res_headers,
        body: body_str,
    })
}
