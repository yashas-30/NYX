use serde_json::Value;
pub mod wasm_runner;
use async_trait::async_trait;

pub struct McpServer {
    tools: std::collections::HashMap<String, Box<dyn Tool + Send + Sync>>,
}

#[async_trait]
pub trait Tool {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    async fn execute(&self, args: Value) -> Result<String, String>;
}

impl McpServer {
    pub fn new(
        store: std::sync::Arc<crate::rag::lancedb_store::LanceDbStore>,
        embedder: std::sync::Arc<crate::rag::embeddings::Embedder>
    ) -> Self {
        let mut server = Self {
            tools: std::collections::HashMap::new(),
        };
        server.register_tool(Box::new(ReadFileTool));
        server.register_tool(Box::new(SemanticSearchTool::new(store, embedder)));
        if let Ok(sandbox) = wasm_runner::WasmSandbox::new() {
            server.register_tool(Box::new(wasm_runner::WasmTool::new(std::sync::Arc::new(sandbox))));
        }
        server
    }

    pub fn register_tool(&mut self, tool: Box<dyn Tool + Send + Sync>) {
        self.tools.insert(tool.name().to_string(), tool);
    }

    pub async fn execute(&self, name: &str, args: Value) -> Result<String, String> {
        if let Some(tool) = self.tools.get(name) {
            tool.execute(args).await
        } else {
            Err(format!("Tool {} not found", name))
        }
    }
}

use tokio::fs;

pub struct ReadFileTool;

#[async_trait]
impl Tool for ReadFileTool {
    fn name(&self) -> &str {
        "read_file"
    }

    fn description(&self) -> &str {
        "Read the contents of a file"
    }

    async fn execute(&self, args: Value) -> Result<String, String> {
        let path = args.get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Missing path argument".to_string())?;

        fs::read_to_string(path).await.map_err(|e| e.to_string())
    }
}

pub struct SemanticSearchTool {
    store: std::sync::Arc<crate::rag::lancedb_store::LanceDbStore>,
    embedder: std::sync::Arc<crate::rag::embeddings::Embedder>,
}

impl SemanticSearchTool {
    pub fn new(
        store: std::sync::Arc<crate::rag::lancedb_store::LanceDbStore>,
        embedder: std::sync::Arc<crate::rag::embeddings::Embedder>
    ) -> Self {
        Self { store, embedder }
    }
}

#[async_trait]
impl Tool for SemanticSearchTool {
    fn name(&self) -> &str {
        "semantic_search"
    }

    fn description(&self) -> &str {
        "Perform a semantic vector search across the codebase using LanceDB"
    }

    async fn execute(&self, args: Value) -> Result<String, String> {
        let query = args.get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Missing query argument".to_string())?;

        let limit = args.get("limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(5) as usize;

        // Generate embedding vector dynamically using fastembed
        let embeddings = self.embedder.embed(vec![query.to_string()]).await?;
        let query_vector = embeddings.into_iter().next().ok_or("Failed to generate embedding")?;

        let results = self.store.search_hybrid(query_vector, limit).await?;
        
        Ok(serde_json::to_string(&results).map_err(|e| e.to_string())?)
    }
}
