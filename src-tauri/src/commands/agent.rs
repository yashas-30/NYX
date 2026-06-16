use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::fs;
use tokio::process::Command;
use std::process::Stdio;

#[derive(Serialize, Clone)]
pub struct StreamEventPayload {
    pub event_type: String, // "text", "tool_start", "tool_result", "done", "error"
    pub content: String,
    pub tool_name: Option<String>,
    pub tool_args: Option<String>,
    pub request_id: String,
}

// Built-in tools for NYX
pub fn get_builtin_tools() -> Value {
    json!([
        {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Search the web for current information.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "The search query" },
                        "num_results": { "type": "number", "description": "Number of results to return" }
                    },
                    "required": ["query"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read the contents of a file from the local filesystem.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the file to read" }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Write contents to a file on the local filesystem.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the file to write" },
                        "content": { "type": "string", "description": "The content to write to the file" }
                    },
                    "required": ["path", "content"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "run_terminal_command",
                "description": "Execute a terminal command on the host machine. On Windows, this runs in PowerShell. On Unix, it runs in sh.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "The terminal command to run" },
                        "cwd": { "type": "string", "description": "Optional absolute path specifying the current working directory for the command" }
                    },
                    "required": ["command"]
                }
            }
        }
    ])
}

pub async fn execute_tool(name: &str, args_json: &str) -> String {
    let args: Value = match serde_json::from_str(args_json) {
        Ok(v) => v,
        Err(_) => return format!("Error: Failed to parse tool arguments as JSON: {}", args_json),
    };

    match name {
        "web_search" => {
            // Placeholder for web search until integrated with a real search API
            let query = args["query"].as_str().unwrap_or("");
            format!("Mock search results for: {}. (Web search API not fully integrated yet)", query)
        }
        "read_file" => {
            let path = args["path"].as_str().unwrap_or("");
            match fs::read_to_string(path).await {
                Ok(content) => content,
                Err(e) => format!("Error reading file at {}: {}", path, e),
            }
        }
        "write_file" => {
            let path = args["path"].as_str().unwrap_or("");
            let content = args["content"].as_str().unwrap_or("");
            match fs::write(path, content).await {
                Ok(_) => format!("Successfully wrote to file: {}", path),
                Err(e) => format!("Error writing to file at {}: {}", path, e),
            }
        }
        "run_terminal_command" => {
            let command = args["command"].as_str().unwrap_or("");
            let cwd = args["cwd"].as_str();

            let mut cmd = if cfg!(target_os = "windows") {
                let mut c = Command::new("powershell");
                c.arg("-Command").arg(command);
                c
            } else {
                let mut c = Command::new("sh");
                c.arg("-c").arg(command);
                c
            };

            if let Some(dir) = cwd {
                cmd.current_dir(dir);
            }

            cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

            match cmd.output().await {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                    let mut result = String::new();
                    if !stdout.is_empty() {
                        result.push_str(&format!("STDOUT:\n{}\n", stdout));
                    }
                    if !stderr.is_empty() {
                        result.push_str(&format!("STDERR:\n{}\n", stderr));
                    }
                    if !output.status.success() {
                        result.push_str(&format!("Exited with status: {}\n", output.status));
                    }
                    if result.is_empty() {
                        result.push_str("Command executed successfully with no output.");
                    }
                    result
                }
                Err(e) => format!("Failed to spawn command '{}': {}", command, e),
            }
        }
        _ => format!("Unknown tool: {}", name),
    }
}

#[tauri::command]
pub async fn fetch_page_html_command(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Fetch failed with status: {}", res.status()));
    }

    let html = res.text().await.map_err(|e| e.to_string())?;
    Ok(html)
}

#[tauri::command]
pub async fn search_web_command(query: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("https://lite.duckduckgo.com/lite/");
    
    let res = client.post(&url)
        .form(&[("q", query.as_str())])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Search failed with status: {}", res.status()));
    }

    let html = res.text().await.map_err(|e| e.to_string())?;
    Ok(html)
}
