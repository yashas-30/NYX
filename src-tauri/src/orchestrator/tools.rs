use async_trait::async_trait;
use serde_json::{json, Value};
use crate::commands::agent::search_web_command;
use std::path::PathBuf;
use tokio::fs;

#[async_trait]
pub trait Tool: Send + Sync {
    /// The name of the tool as the LLM will see it
    fn name(&self) -> &'static str;
    
    /// The description of the tool
    fn description(&self) -> &'static str;
    
    /// JSON schema for the arguments
    fn parameters_schema(&self) -> Value;
    
    /// Execute the tool with the given arguments
    async fn execute(&self, app: &tauri::AppHandle, args: Value) -> Result<Value, String>;
}

pub struct WebSearchTool;

impl WebSearchTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for WebSearchTool {
    fn name(&self) -> &'static str {
        "web_search"
    }

    fn description(&self) -> &'static str {
        "Search the web for real-time information. Use this when you need facts about current events, documentation, or anything outside your training data."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query"
                }
            },
            "required": ["query"]
        })
    }

    async fn execute(&self, _app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
        let query = args.get("query")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'query' parameter")?;
            
        let res = search_web_command(query.to_string(), Some(5), None, None).await?;
        Ok(json!(res))
    }
}

pub struct ConversationalMemoryTool;

impl ConversationalMemoryTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for ConversationalMemoryTool {
    fn name(&self) -> &'static str {
        "conversational_memory"
    }

    fn description(&self) -> &'static str {
        "Save or retrieve facts about the user from long-term memory. Use this to remember user preferences, names, past events, or anything they tell you to remember."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["save", "search"],
                    "description": "Whether to 'save' a new fact or 'search' for existing facts."
                },
                "fact": {
                    "type": "string",
                    "description": "The fact to save (only required if action is 'save')"
                },
                "query": {
                    "type": "string",
                    "description": "The query to search for (only required if action is 'search')"
                }
            },
            "required": ["action"]
        })
    }

    async fn execute(&self, app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
        let action = args.get("action").and_then(|v| v.as_str()).unwrap_or("search");
        use tauri::Manager;

        let pool = app.state::<sqlx::SqlitePool>();
        // Use the global fastembed Embedder — warms up once on first call.
        let embedder = crate::rag::embeddings::Embedder::new()?;

        if action == "save" {
            let fact = args.get("fact").and_then(|v| v.as_str()).unwrap_or("");
            if fact.is_empty() {
                return Err("Missing 'fact' parameter for save action".to_string());
            }

            // Generate a real embedding so future semantic searches return correct results.
            let embeddings = embedder.embed(vec![fact.to_string()]).await?;
            let vector = embeddings.into_iter().next().ok_or("Embedder returned no vectors")?;
            // Fix #8: encode as LE-f32 BLOB bytes, not JSON string.
            let embedding_blob = crate::db::models::encode_embedding(&vector);

            let id = uuid::Uuid::new_v4().to_string();
            crate::db::commands::db_add_memory(
                pool,
                id,
                fact.to_string(),
                "general".to_string(),
                embedding_blob,
            ).await.map_err(|e| e.to_string())?;

            Ok(json!({"status": "success", "message": "Fact saved to long term memory."}))
        } else {
            let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
            if query.is_empty() {
                return Err("Missing 'query' parameter for search action".to_string());
            }

            // Embed the query so we do real semantic nearest-neighbour retrieval.
            let embeddings = embedder.embed(vec![query.to_string()]).await?;
            let query_vector = embeddings.into_iter().next().ok_or("Embedder returned no vectors")?;

            let results = crate::db::commands::db_search_memories(
                pool,
                query_vector,
                5,
            ).await.map_err(|e| e.to_string())?;
            Ok(json!(results))
        }
    }
}

pub struct CreateFileTool;

impl CreateFileTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for CreateFileTool {
    fn name(&self) -> &'static str {
        "create_file"
    }

    fn description(&self) -> &'static str {
        "Create a file on the user's local file system. Supports markdown (.md), text (.txt), and pseudo-word (.doc)."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "The name of the file (e.g. document.md)"
                },
                "content": {
                    "type": "string",
                    "description": "The content to write into the file"
                }
            },
            "required": ["filename", "content"]
        })
    }

    async fn execute(&self, _app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
        let filename = args.get("filename").and_then(|v| v.as_str()).unwrap_or("untitled.md");
        let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
        
        let mut path = dirs::download_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push("NYX_Files");
        
        if !path.exists() {
        fs::create_dir_all(&path).await.map_err(|e| e.to_string())?;
        }
        
        path.push(filename);
        
        fs::write(&path, content).await.map_err(|e| e.to_string())?;
        
        Ok(json!({"status": "success", "path": path.to_string_lossy().to_string()}))
    }
}
