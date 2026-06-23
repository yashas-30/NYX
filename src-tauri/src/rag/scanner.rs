use super::embeddings::Embedder;
use super::vector_db::VectorDB;
use tokio::fs;
use std::path::Path;
use anyhow::Result;
use walkdir::WalkDir;
use tracing::{info, error};

pub struct CodebaseScanner {
    embedder: Embedder,
    db: VectorDB,
}

impl CodebaseScanner {
    pub async fn new(db_path: std::path::PathBuf) -> Result<Self> {
        let embedder = Embedder::new().map_err(|e| anyhow::anyhow!(e))?;
        let db = VectorDB::new(db_path);
        db.load().await.unwrap_or_else(|e| error!("Failed to load vector db: {}", e));
        
        Ok(Self {
            embedder,
            db,
        })
    }

    pub async fn index_workspace(&self, root: &Path) -> Result<()> {
        info!("Indexing workspace: {:?}", root);
        let mut count = 0;

        for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    let ext_str = ext.to_string_lossy().to_lowercase();
                    if ["ts", "tsx", "js", "jsx", "rs", "md", "json", "py"].contains(&ext_str.as_str()) {
                        let content = match fs::read_to_string(path).await {
                            Ok(c) => c,
                            Err(_) => continue,
                        };
                        
                        // We do a simple file-level embedding for demonstration.
                        // In production, we'd chunk this by paragraph/functions.
                        let chunk = content.chars().take(2000).collect::<String>();
                        
                        match self.embedder.embed(vec![chunk.clone()]).await {
                            Ok(mut embeddings) => {
                                if let Some(embedding) = embeddings.pop() {
                                    self.db.insert(path.to_string_lossy().to_string(), chunk, embedding).await;
                                    count += 1;
                                }
                            }
                            Err(e) => error!("Failed to embed {:?}: {}", path, e),
                        }
                    }
                }
            }
        }

        info!("Indexed {} files successfully.", count);
        self.db.save().await?;
        Ok(())
    }

    pub async fn search(&self, query: &str, limit: usize) -> Result<Vec<(String, String, f32)>> {
        let mut query_embs = self.embedder.embed(vec![query.to_string()]).await.map_err(|e| anyhow::anyhow!(e))?;
        let query_emb = query_embs.remove(0);
        
        let results = self.db.search(&query_emb, limit).await;
        Ok(results)
    }
}
