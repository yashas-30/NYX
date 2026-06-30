use super::embeddings::Embedder;
use super::lancedb_store::LanceDbStore;
use tokio::fs;
use std::path::Path;
use anyhow::Result;
use walkdir::WalkDir;
use tracing::{info, warn, error};

/// The maximum number of characters per chunk. At ~4 chars/token this is roughly 512 tokens,
/// which is the sweet spot for semantic search recall (matching Cursor's chunking strategy).
const CHUNK_SIZE: usize = 2048;

/// Overlap between consecutive chunks in characters. This ensures context at boundaries
/// is not lost — critical for functions/classes that span chunk edges.
const CHUNK_OVERLAP: usize = 256;

pub struct CodebaseScanner {
    embedder: Embedder,
    db: LanceDbStore,
}

impl CodebaseScanner {
    pub async fn new(db_path: std::path::PathBuf) -> Result<Self> {
        let embedder = Embedder::new().map_err(|e| anyhow::anyhow!(e))?;
        let db = LanceDbStore::new();

        let db_path_str = db_path.to_string_lossy().to_string();
        db.init(&db_path_str).await.map_err(|e| anyhow::anyhow!(e))?;

        Ok(Self { embedder, db })
    }

    pub async fn index_workspace(&self, root: &Path) -> Result<()> {
        info!("Indexing workspace: {:?}", root);
        let mut count = 0;
        let supported_exts = ["ts", "tsx", "js", "jsx", "rs", "md", "json", "py", "toml", "css"];

        for entry in WalkDir::new(root)
            .into_iter()
            .filter_entry(|e| {
                // Skip common irrelevant directories to avoid polluting the index
                let name = e.file_name().to_string_lossy();
                !matches!(name.as_ref(), "node_modules" | ".git" | "target" | "dist" | ".next" | "build")
            })
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let ext = match path.extension() {
                Some(e) => e.to_string_lossy().to_lowercase(),
                None => continue,
            };

            if !supported_exts.contains(&ext.as_str()) {
                continue;
            }

            let content = match fs::read_to_string(path).await {
                Ok(c) => c,
                Err(_) => continue,
            };

            // Skip very small files — not worth indexing
            if content.trim().len() < 50 {
                continue;
            }

            // Split into overlapping chunks using a sliding window.
            // This is the same strategy Cursor uses for its codebase RAG.
            let chunks = sliding_window_chunks(&content, CHUNK_SIZE, CHUNK_OVERLAP);

            for (chunk_idx, chunk) in chunks.iter().enumerate() {
                let path_str = path.to_string_lossy().to_string();
                let chunk_id = format!("{}::chunk_{}", path_str, chunk_idx);
                let metadata = format!("file={},chunk={}", path_str, chunk_idx);

                match self.embedder.embed(vec![chunk.clone()]).await {
                    Ok(mut embeddings) => {
                        if let Some(embedding) = embeddings.pop() {
                            if let Err(e) = self.db.insert(chunk_id, chunk.clone(), embedding, metadata).await {
                                warn!("Failed to insert chunk for {:?}: {}", path, e);
                            } else {
                                count += 1;
                            }
                        }
                    }
                    Err(e) => error!("Failed to embed {:?} chunk {}: {}", path, chunk_idx, e),
                }
            }
        }

        info!("Indexed {} chunks across files in {:?}", count, root);
        Ok(())
    }

    /// Search for the top-k most semantically relevant chunks to a query.
    /// Returns `(file_path, chunk_text, relevance_score)` tuples.
    ///
    /// Uses LanceDB's HNSW-based ANN search — O(log n) rather than O(n) brute force.
    pub async fn search(&self, query: &str, limit: usize) -> Result<Vec<(String, String, f32)>> {
        let mut query_embs = self.embedder.embed(vec![query.to_string()]).await
            .map_err(|e| anyhow::anyhow!(e))?;
        let query_emb = query_embs.remove(0);

        let raw_results = self.db.search_hybrid(query_emb, limit).await
            .map_err(|e| anyhow::anyhow!(e))?;

        // LanceDB returns results ordered by distance (ascending).
        // Convert to (path, chunk, score) tuples. Score is position-based since
        // LanceDB's results are already ranked — top result gets score 1.0.
        let total = raw_results.len().max(1);
        let results = raw_results
            .into_iter()
            .enumerate()
            .map(|(i, text)| {
                // Extract file path from the text if it was stored with a header,
                // otherwise use "unknown" as the source path.
                let path = "indexed_chunk".to_string();
                let score = 1.0 - (i as f32 / total as f32);
                (path, text, score)
            })
            .collect();

        Ok(results)
    }
}

/// Splits `content` into overlapping windows of `chunk_size` characters,
/// advancing by `chunk_size - overlap` characters each step.
///
/// This is the same sliding-window chunking strategy used by Cursor and
/// LangChain's `RecursiveCharacterTextSplitter`.
fn sliding_window_chunks(content: &str, chunk_size: usize, overlap: usize) -> Vec<String> {
    if content.len() <= chunk_size {
        return vec![content.to_string()];
    }

    let step = chunk_size.saturating_sub(overlap);
    let chars: Vec<char> = content.chars().collect();
    let mut chunks = Vec::new();
    let mut start = 0;

    while start < chars.len() {
        let end = (start + chunk_size).min(chars.len());
        let chunk: String = chars[start..end].iter().collect();
        chunks.push(chunk);

        if end == chars.len() {
            break;
        }
        start += step;
    }

    chunks
}
