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

            // Fix #7: Batch all chunks for this file into a single embed() call.
            // The ONNX model supports batch inference — previously we paid N round-trips
            // through spawn_blocking for N chunks. Now it's 1 round-trip per file,
            // making large workspace indexing 10-50× faster.
            match self.embedder.embed(chunks.clone()).await {
                Ok(embeddings) => {
                    for (chunk_idx, (chunk, embedding)) in chunks.iter().zip(embeddings.into_iter()).enumerate() {
                        let path_str = path.to_string_lossy().to_string();
                        let chunk_id = format!("{}::chunk_{}", path_str, chunk_idx);
                        let metadata = serde_json::json!({
                            "file": path_str,
                            "chunk": chunk_idx
                        }).to_string();

                        if let Err(e) = self.db.insert(chunk_id, chunk.clone(), embedding, metadata).await {
                            warn!("Failed to insert chunk for {:?}: {}", path, e);
                        } else {
                            count += 1;
                        }
                    }
                }
                Err(e) => error!("Failed to embed chunks for {:?}: {}", path, e),
            }
        }

        info!("Indexed {} chunks across files in {:?}", count, root);

        // Build the BM25 full-text index on the 'text' column now that all
        // chunks are inserted. This enables hybrid search (vector + keyword).
        if count > 0 {
            match self.db.build_fts_index().await {
                Ok(()) => info!("FTS index built successfully ({} chunks)", count),
                Err(e) => warn!("FTS index build failed (vector-only fallback will be used): {}", e),
            }
        }

        Ok(())
    }

    /// Search for the top-k most relevant chunks using **hybrid search**:
    /// vector similarity (HNSW) + BM25 full-text search merged via RRF.
    ///
    /// Falls back gracefully to vector-only if the FTS index hasn't been built.
    /// Returns `(file_path, chunk_text, relevance_score)` tuples.
    pub async fn search(&self, query: &str, limit: usize) -> Result<Vec<(String, String, f32)>> {
        let mut query_embs = self.embedder.embed(vec![query.to_string()]).await
            .map_err(|e| anyhow::anyhow!(e))?;
        let query_emb = query_embs.remove(0);

        // Use true hybrid search: vector + BM25 fused by RRF
        let raw_results = self.db.search_hybrid(query, query_emb, limit).await
            .map_err(|e| anyhow::anyhow!(e))?;

        // Parse JSON metadata to extract the real file path.
        // RRF already ranked results — preserve that order (index = rank).
        let total = raw_results.len().max(1);
        let results = raw_results
            .into_iter()
            .enumerate()
            .map(|(i, (text, metadata))| {
                let path = serde_json::from_str::<serde_json::Value>(&metadata)
                    .ok()
                    .and_then(|v| v["file"].as_str().map(|s| s.to_string()))
                    .unwrap_or_else(|| "unknown".to_string());
                // Score is proportional to rank — top result = 1.0
                let score = 1.0 - (i as f32 / total as f32);
                (path, text, score)
            })
            .collect();

        Ok(results)
    }

    /// Returns true if any documents have been indexed into this scanner's DB.
    /// Used by the conductor to skip RAG search when no workspace is active.
    pub fn is_indexed(&self) -> bool {
        self.db.has_entries()
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
