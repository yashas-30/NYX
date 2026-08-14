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
        self.add_memory_with_meta(text, &format!("memory-{}", self.mode)).await;
    }

    pub async fn add_memory_with_meta(&self, text: &str, metadata: &str) {
        let doc_id = uuid::Uuid::new_v4().to_string();
        if let Ok(embedder) = crate::rag::embeddings::Embedder::new() {
            if let Ok(vecs) = embedder.embed(vec![text.to_string()]).await {
                if let Some(vector) = vecs.into_iter().next() {
                    let _ = self.inner.insert(doc_id, text.to_string(), vector, metadata.to_string()).await;
                }
            }
        }
    }

    /// Chunks large documents (e.g. scraped webpages or full session logs) into ~1000 char segments
    /// with overlapping context and stores each chunk into LanceDB with metadata tags.
    pub async fn add_document_chunks(&self, full_text: &str, metadata_tag: &str) {
        let text = full_text.trim();
        if text.is_empty() {
            return;
        }

        const CHUNK_SIZE: usize = 1000;
        const OVERLAP: usize = 200;

        let chars: Vec<char> = text.chars().collect();
        let mut start = 0;
        let total = chars.len();

        let mut chunks = Vec::new();
        while start < total {
            let end = usize::min(start + CHUNK_SIZE, total);
            let chunk_str: String = chars[start..end].iter().collect();
            if chunk_str.trim().len() >= 30 {
                chunks.push(chunk_str);
            }
            if end >= total {
                break;
            }
            start += CHUNK_SIZE.saturating_sub(OVERLAP);
        }

        if chunks.is_empty() {
            return;
        }

        if let Ok(embedder) = crate::rag::embeddings::Embedder::new() {
            if let Ok(vecs) = embedder.embed(chunks.clone()).await {
                for (chunk_text, vector) in chunks.into_iter().zip(vecs.into_iter()) {
                    let doc_id = uuid::Uuid::new_v4().to_string();
                    let _ = self.inner.insert(doc_id, chunk_text, vector, metadata_tag.to_string()).await;
                }
            }
        }
    }

    pub async fn search_memory(&self, query: &str, limit: usize) -> Vec<(String, String)> {
        if let Ok(embedder) = crate::rag::embeddings::Embedder::new() {
            if let Ok(vecs) = embedder.embed(vec![query.to_string()]).await {
                if let Some(vector) = vecs.into_iter().next() {
                    if let Ok(results) = self.inner.search_hybrid(query, vector, limit).await {
                        return results;
                    }
                }
            }
        }
        Vec::new()
    }

    /// Store a generated image asset in TurboVec vector memory with rich prompt IR metadata
    pub async fn add_image_memory(&self, prompt: &str, image_path: &str, aspect_ratio: &str, engine: &str, seed: Option<u64>) {
        let meta = format!("image_gen|path:{}|ratio:{}|engine:{}|seed:{}", 
            image_path, 
            aspect_ratio, 
            engine, 
            seed.map(|s| s.to_string()).unwrap_or_else(|| "random".to_string())
        );
        let memory_text = format!("Image Generation Asset: prompt='{}', path='{}', aspect_ratio='{}', engine='{}'", prompt, image_path, aspect_ratio, engine);
        self.add_memory_with_meta(&memory_text, &meta).await;
    }

    /// Search visual memories matching a semantic query
    pub async fn search_image_memory(&self, query: &str, limit: usize) -> Vec<(String, String, String)> {
        let mut results = Vec::new();
        let memories = self.search_memory(&format!("Image Generation Asset: {}", query), limit).await;
        for (doc_id, text) in memories {
            if text.contains("Image Generation Asset:") {
                results.push((doc_id, text.clone(), "image_asset".to_string()));
            }
        }
        results
    }
}



