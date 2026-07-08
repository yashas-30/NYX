use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Serialize, Deserialize};
use std::path::PathBuf;
use anyhow::Result;

#[derive(Serialize, Deserialize, Clone)]
pub struct VectorRecord {
    pub filepath: String,
    pub content: String,
    pub embedding: Vec<f32>,
    pub last_accessed: u64,
}

pub struct VectorDB {
    vectors: Arc<RwLock<HashMap<String, VectorRecord>>>,
    cache_path: PathBuf,
}

impl VectorDB {
    pub fn new(cache_path: PathBuf) -> Self {
        Self {
            vectors: Arc::new(RwLock::new(HashMap::new())),
            cache_path,
        }
    }

    pub async fn load(&self) -> Result<()> {
        if self.cache_path.exists() {
            let data = tokio::fs::read_to_string(&self.cache_path).await?;
            let map: HashMap<String, VectorRecord> = serde_json::from_str(&data)?;
            let mut vectors = self.vectors.write().await;
            *vectors = map;
        }
        Ok(())
    }

    pub async fn save(&self) -> Result<()> {
        let vectors = self.vectors.read().await;
        let data = serde_json::to_string(&*vectors)?;
        tokio::fs::write(&self.cache_path, data).await?;
        Ok(())
    }

    pub async fn insert(&self, filepath: String, content: String, embedding: Vec<f32>) {
        let mut vectors = self.vectors.write().await;
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        
        vectors.insert(filepath.clone(), VectorRecord {
            filepath,
            content,
            embedding,
            last_accessed: now,
        });
    }

    pub async fn remove(&self, filepath: &str) {
        let mut vectors = self.vectors.write().await;
        vectors.remove(filepath);
    }

    pub async fn search(&self, query_embedding: &[f32], top_k: usize) -> Vec<(String, String, f32)> {
        let vectors = self.vectors.read().await;
        let mut results: Vec<(String, String, f32)> = vectors.values().map(|record| {
            let score = cosine_similarity(query_embedding, &record.embedding);
            (record.filepath.clone(), record.content.clone(), score)
        }).collect();

        // Sort descending by score
        results.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(top_k);
        results
    }
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let mut dot_product = 0.0;
    let mut norm_a = 0.0;
    let mut norm_b = 0.0;
    for (x, y) in a.iter().zip(b.iter()) {
        dot_product += x * y;
        norm_a += x * x;
        norm_b += y * y;
    }
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot_product / (norm_a.sqrt() * norm_b.sqrt())
}
