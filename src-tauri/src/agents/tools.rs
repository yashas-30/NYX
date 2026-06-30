use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Tool {
    pub name: String,
    pub description: String,
    pub parameters: Value, // JSON schema
}

pub fn get_available_tools() -> Vec<Tool> {
    vec![
        Tool {
            name: "execute_bash".to_string(),
            description: "Execute a bash/powershell command on the host.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The command to execute"
                    }
                },
                "required": ["command"]
            }),
        },
        Tool {
            name: "read_file".to_string(),
            description: "Read contents of a file.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute path to the file"
                    }
                },
                "required": ["path"]
            }),
        },
        Tool {
            name: "search_rag".to_string(),
            description: "Semantically search the codebase for context.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query"
                    }
                },
                "required": ["query"]
            }),
        },
        Tool {
            name: "search_web".to_string(),
            description: "Search the web using Tavily or DuckDuckGo for accurate online information.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query"
                    }
                },
                "required": ["query"]
            }),
        },
        Tool {
            name: "scrape_url".to_string(),
            description: "Scrape and extract content from a specific URL using Scrapling.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to scrape"
                    }
                },
                "required": ["url"]
            }),
        },
        Tool {
            name: "verify_output".to_string(),
            description: "Execute a Python script securely in an isolated Docker container to verify your logic or constraints.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "script": {
                        "type": "string",
                        "description": "The Python script to execute"
                    }
                },
                "required": ["script"]
            }),
        }
    ]
}

pub async fn get_all_tools(mcp_manager: &std::sync::Arc<crate::commands::mcp::McpManager>) -> Vec<Tool> {
    let mut all_tools = get_available_tools();
    
    let servers: Vec<String> = {
        let lock = mcp_manager.servers.lock().await;
        lock.keys().cloned().collect()
    };
    
    for server in servers {
        if let Ok(response) = crate::commands::mcp::mcp_list_tools_internal(&server, mcp_manager).await {
            if let Some(tools_arr) = response.get("tools").and_then(|t| t.as_array()) {
                for t in tools_arr {
                    if let (Some(name), Some(description), Some(input_schema)) = (
                        t.get("name").and_then(|n| n.as_str()),
                        t.get("description").and_then(|d| d.as_str()),
                        t.get("inputSchema")
                    ) {
                        all_tools.push(Tool {
                            name: format!("{}__{}", server, name), // namespace by server to avoid conflicts
                            description: description.to_string(),
                            parameters: input_schema.clone(),
                        });
                    }
                }
            }
        }
    }
    
    all_tools
}

pub async fn execute_tool(name: &str, args: Value, scanner: &crate::rag::scanner::CodebaseScanner, mcp_manager: &std::sync::Arc<crate::commands::mcp::McpManager>) -> Result<String, String> {
    match name {
        "execute_bash" => {
            let cmd = args["command"].as_str().ok_or("Missing command")?;
            let output = tokio::process::Command::new("powershell")
                .arg("-NonInteractive")
                .arg("-c")
                .arg(cmd)
                .output()
                .await
                .map_err(|e| e.to_string())?;
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Ok(format!("STDOUT:\n{}\nSTDERR:\n{}", stdout, stderr))
        }
        "read_file" => {
            let path = args["path"].as_str().ok_or("Missing path")?;
            tokio::fs::read_to_string(path).await.map_err(|e| e.to_string())
        }
        "search_rag" => {
            let query = args["query"].as_str().ok_or("Missing query")?;
            let results = scanner.search(query, 5).await.map_err(|e| e.to_string())?;
            let mut out = String::new();
            for (path, content, score) in results {
                out.push_str(&format!("--- FILE: {} (Score: {})\n{}\n\n", path, score, content));
            }
            Ok(if out.is_empty() { "No results found.".to_string() } else { out })
        }
        "search_web" => {
            let query = args["query"].as_str().ok_or("Missing query")?;
            match crate::commands::agent::search_web_command(query.to_string(), Some(5), None, None).await {
                Ok(res) => Ok(res),
                Err(e) => Err(e)
            }
        }
        "scrape_url" => {
            let url = args["url"].as_str().ok_or("Missing url")?;
            let script = format!(
                "import sys\ntry:\n    from scrapling import Fetcher\n    fetcher = Fetcher(auto_match=False)\n    page = fetcher.get('{}')\n    print(page.text[:4000])\nexcept Exception as e:\n    print('Scrapling Error:', e)",
                url
            );
            let output = tokio::process::Command::new("python")
                .arg("-c")
                .arg(&script)
                .output()
                .await
                .map_err(|e| format!("Failed to execute python: {}", e))?;
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if stdout.is_empty() {
                Ok(format!("Error: {}", stderr))
            } else {
                Ok(stdout)
            }
        }
        "verify_output" => {
            let script = args["script"].as_str().ok_or("Missing script")?;
            // Run in an ephemeral Alpine Python docker container with no network (non-blocking)
            let output = tokio::process::Command::new("docker")
                .arg("run")
                .arg("--rm")
                .arg("--network")
                .arg("none")
                .arg("-i")
                .arg("python:3.11-alpine")
                .arg("python")
                .arg("-c")
                .arg(script)
                .output()
                .await
                .map_err(|e| format!("Failed to execute docker: {}", e))?;
            
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            
            if !stderr.is_empty() {
                Ok(format!("STDOUT:\n{}\nSTDERR:\n{}", stdout, stderr))
            } else {
                Ok(stdout)
            }
        }
        _ => {
            if name.contains("__") {
                let parts: Vec<&str> = name.splitn(2, "__").collect();
                if parts.len() == 2 {
                    let server_name = parts[0];
                    let tool_name = parts[1];
                    match crate::commands::mcp::mcp_call_tool_internal(server_name, tool_name, args, mcp_manager).await {
                        Ok(res) => Ok(serde_json::to_string_pretty(&res).unwrap_or_default()),
                        Err(e) => Err(format!("MCP tool error: {}", e)),
                    }
                } else {
                    Err(format!("Invalid MCP tool format: {}", name))
                }
            } else {
                Err(format!("Unknown tool: {}", name))
            }
        }
    }
}
