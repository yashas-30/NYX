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
        }
    ]
}

pub async fn execute_tool(name: &str, args: Value, scanner: &crate::rag::scanner::CodebaseScanner) -> Result<String, String> {
    match name {
        "execute_bash" => {
            let cmd = args["command"].as_str().ok_or("Missing command")?;
            // Using powershell on Windows
            let output = std::process::Command::new("powershell")
                .arg("-c")
                .arg(cmd)
                .output()
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
            let output = std::process::Command::new("python")
                .arg("-c")
                .arg(&script)
                .output()
                .map_err(|e| format!("Failed to execute python: {}", e))?;
            
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if stdout.is_empty() {
                Ok(format!("Error: {}", stderr))
            } else {
                Ok(stdout)
            }
        }
        _ => Err(format!("Unknown tool: {}", name)),
    }
}
