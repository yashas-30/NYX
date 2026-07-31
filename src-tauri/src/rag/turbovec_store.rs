use std::path::PathBuf;
use crate::rag::lancedb_store::LanceDbStore;

/// High-performance vector memory store bridging chat and coder RAG spaces.
pub struct TurbovecStore {
    pub inner: LanceDbStore,
    pub db_path: PathBuf,
    pub mode: String,
}

impl TurbovecStore {
    pub async fn new(app_data_dir: &PathBuf, mode: &str) -> Self {
        let db_name = match mode {
            "coder" => "coder_rag.lance",
            _ => "chat_rag.lance",
        };
        let db_path = app_data_dir.join(db_name);
        let inner = LanceDbStore::new();
        let _ = inner.init(&db_path.to_string_lossy()).await;

        Self {
            inner,
            db_path,
            mode: mode.to_string(),
        }
    }
    
    pub async fn add_memory(&self, text: &str) {
        let doc_id = uuid::Uuid::new_v4().to_string();
        if let Ok(embedder) = crate::rag::embeddings::Embedder::new() {
            if let Ok(vecs) = embedder.embed(vec![text.to_string()]).await {
                if let Some(vector) = vecs.into_iter().next() {
                    let _ = self.inner.insert(doc_id, text.to_string(), vector, format!("memory-{}", self.mode)).await;
                }
            }
        }
    }

    pub async fn search_memory(&self, query: &str, limit: usize) -> Vec<(String, String)> {
        if let Ok(embedder) = crate::rag::embeddings::Embedder::new() {
            if let Ok(vecs) = embedder.embed(vec![query.to_string()]).await {
                if let Some(vector) = vecs.into_iter().next() {
                    if let Ok(results) = self.inner.search_vector(vector, limit).await {
                        return results;
                    }
                }
            }
        }
        Vec::new()
    }
}
