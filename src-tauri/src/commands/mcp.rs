use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;
use std::sync::Arc;
use tauri::{State, Emitter};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McpRequest {
    pub jsonrpc: String,
    pub id: u64,
    pub method: String,
    pub params: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[allow(dead_code)]
pub struct McpResponse {
    pub jsonrpc: String,
    pub id: u64,
    pub result: Option<serde_json::Value>,
    pub error: Option<serde_json::Value>,
}

pub struct McpProcess {
    pub stdin: tokio::process::ChildStdin,
    pub process: tokio::process::Child,
}

pub struct McpManager {
    // Map of server name to child process wrapper
    pub servers: Mutex<HashMap<String, McpProcess>>,
}

impl Default for McpManager {
    fn default() -> Self {
        Self {
            servers: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
pub async fn mcp_start_server(
    name: String,
    command: String,
    args: Vec<String>,
    env: Option<HashMap<String, String>>,
    mcp_manager: State<'_, Arc<McpManager>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    tracing::info!("Starting MCP server '{}': {} {:?}", name, command, args);
    
    let mut cmd = Command::new(command);
    cmd.args(args)
       .stdin(Stdio::piped())
       .stdout(Stdio::piped())
       .stderr(Stdio::piped())
       .kill_on_drop(true);

    if let Some(envs) = env {
        cmd.envs(envs);
    }
       
    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn MCP process: {}", e))?;

    let stdin = child.stdin.take().ok_or("Failed to open stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    // Store process to send requests and manage lifecycle
    mcp_manager.servers.lock().await.insert(name.clone(), McpProcess {
        stdin,
        process: child,
    });

    let name_clone = name.clone();
    let app_clone = app_handle.clone();
    
    // Spawn task to read stdout (JSON-RPC responses from server)
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            tracing::debug!("MCP [{}] OUT: {}", name_clone, line);
            // Emit to frontend via Tauri event
            let _ = app_clone.emit(&format!("mcp-msg-{}", name_clone), line);
        }
        tracing::warn!("MCP [{}] stdout closed", name_clone);
    });

    let name_err_clone = name.clone();
    // Spawn task to read stderr (Logs from server)
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            tracing::info!("MCP [{}] LOG: {}", name_err_clone, line);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn mcp_send_request(
    name: String,
    request: McpRequest,
    mcp_manager: State<'_, Arc<McpManager>>,
) -> Result<(), String> {
    let mut servers = mcp_manager.servers.lock().await;
    if let Some(mcp) = servers.get_mut(&name) {
        let req_str = serde_json::to_string(&request).map_err(|e| e.to_string())? + "\n";
        mcp.stdin.write_all(req_str.as_bytes()).await.map_err(|e| e.to_string())?;
        mcp.stdin.flush().await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("MCP server '{}' not found", name))
    }
}

#[tauri::command]
pub async fn mcp_stop_server(
    name: String,
    mcp_manager: State<'_, Arc<McpManager>>,
) -> Result<(), String> {
    let mut servers = mcp_manager.servers.lock().await;
    if let Some(mut mcp) = servers.remove(&name) {
        mcp.process.kill().await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("MCP server '{}' not found", name))
    }
}

#[tauri::command]
pub async fn mcp_list_servers(
    mcp_manager: State<'_, Arc<McpManager>>,
) -> Result<Vec<String>, String> {
    let servers = mcp_manager.servers.lock().await;
    Ok(servers.keys().cloned().collect())
}
