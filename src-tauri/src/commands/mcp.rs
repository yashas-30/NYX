use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;
use std::sync::Arc;
use tauri::{State, Emitter};
use std::collections::HashMap;
use tokio::sync::oneshot;
use serde_json::{json, Value};

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
    // Map of request ID to oneshot sender
    pub pending_requests: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
}

impl Default for McpManager {
    fn default() -> Self {
        Self {
            servers: Mutex::new(HashMap::new()),
            pending_requests: Mutex::new(HashMap::new()),
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
    let mcp_manager_clone = mcp_manager.inner().clone();
    
    // Spawn task to read stdout (JSON-RPC responses from server)
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            tracing::debug!("MCP [{}] OUT: {}", name_clone, line);
            
            // Parse line as JSON-RPC response
            if let Ok(res_val) = serde_json::from_str::<Value>(&line) {
                if let Some(id_val) = res_val["id"].as_u64() {
                    let mut pending = mcp_manager_clone.pending_requests.lock().await;
                    if let Some(tx) = pending.remove(&id_val) {
                        let _ = tx.send(res_val.clone());
                    }
                }
            }

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

#[allow(dead_code)]
pub async fn mcp_list_tools_internal(
    name: &str,
    mcp_manager: &Arc<McpManager>,
) -> Result<Value, String> {
    let request_id = {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT_ID: AtomicU64 = AtomicU64::new(1);
        NEXT_ID.fetch_add(1, Ordering::SeqCst)
    };

    let request = json!({
        "jsonrpc": "2.0",
        "id": request_id,
        "method": "tools/list"
    });

    let (tx, rx) = oneshot::channel();
    {
        let mut pending = mcp_manager.pending_requests.lock().await;
        pending.insert(request_id, tx);
    }

    {
        let mut servers = mcp_manager.servers.lock().await;
        if let Some(mcp) = servers.get_mut(name) {
            let req_str = serde_json::to_string(&request).map_err(|e| e.to_string())? + "\n";
            mcp.stdin.write_all(req_str.as_bytes()).await.map_err(|e| e.to_string())?;
            mcp.stdin.flush().await.map_err(|e| e.to_string())?;
        } else {
            let mut pending = mcp_manager.pending_requests.lock().await;
            pending.remove(&request_id);
            return Err(format!("MCP server '{}' not found", name));
        }
    }

    match tokio::time::timeout(std::time::Duration::from_secs(5), rx).await {
        Ok(Ok(response)) => {
            if let Some(error) = response.get("error") {
                Err(error.to_string())
            } else if let Some(result) = response.get("result") {
                Ok(result.clone())
            } else {
                Ok(response)
            }
        }
        Ok(Err(_)) => Err("Oneshot sender dropped without response".to_string()),
        Err(_) => {
            let mut pending = mcp_manager.pending_requests.lock().await;
            pending.remove(&request_id);
            Err("Timeout waiting for MCP response".to_string())
        }
    }
}

pub async fn mcp_call_tool_internal(
    name: &str,
    tool: &str,
    arguments: Value,
    mcp_manager: &Arc<McpManager>,
) -> Result<Value, String> {
    let request_id = {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT_ID: AtomicU64 = AtomicU64::new(1);
        NEXT_ID.fetch_add(1, Ordering::SeqCst)
    };

    let request = json!({
        "jsonrpc": "2.0",
        "id": request_id,
        "method": "tools/call",
        "params": {
            "name": tool,
            "arguments": arguments
        }
    });

    let (tx, rx) = oneshot::channel();
    {
        let mut pending = mcp_manager.pending_requests.lock().await;
        pending.insert(request_id, tx);
    }

    {
        let mut servers = mcp_manager.servers.lock().await;
        if let Some(mcp) = servers.get_mut(name) {
            let req_str = serde_json::to_string(&request).map_err(|e| e.to_string())? + "\n";
            mcp.stdin.write_all(req_str.as_bytes()).await.map_err(|e| e.to_string())?;
            mcp.stdin.flush().await.map_err(|e| e.to_string())?;
        } else {
            let mut pending = mcp_manager.pending_requests.lock().await;
            pending.remove(&request_id);
            return Err(format!("MCP server '{}' not found", name));
        }
    }

    match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
        Ok(Ok(response)) => {
            if let Some(error) = response.get("error") {
                Err(error.to_string())
            } else if let Some(result) = response.get("result") {
                Ok(result.clone())
            } else {
                Ok(response)
            }
        }
        Ok(Err(_)) => Err("Oneshot sender dropped without response".to_string()),
        Err(_) => {
            let mut pending = mcp_manager.pending_requests.lock().await;
            pending.remove(&request_id);
            Err("Timeout waiting for MCP response".to_string())
        }
    }
}

#[tauri::command]
pub async fn mcp_call_tool(
    name: String,
    tool: String,
    arguments: Value,
    mcp_manager: State<'_, Arc<McpManager>>,
) -> Result<Value, String> {
    mcp_call_tool_internal(&name, &tool, arguments, &mcp_manager).await
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
