use fastembed::{TextEmbedding, InitOptions, EmbeddingModel};
use std::sync::Arc;
use tokio::sync::Mutex;
use anyhow::Result;

pub struct Embedder {
    model: Arc<Mutex<TextEmbedding>>,
}

impl Embedder {
    pub fn new() -> Result<Self, String> {
        let model = TextEmbedding::try_new(InitOptions::new(EmbeddingModel::AllMiniLML6V2).with_show_download_progress(true))
            .or_else(|_| TextEmbedding::try_new(InitOptions::default()))
            .map_err(|e| e.to_string())?;
        
        Ok(Self {
            model: Arc::new(Mutex::new(model)),
        })
    }

    pub async fn embed(&self, texts: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
        let mut model = self.model.lock().await;
        let embeddings = model.embed(texts, None).map_err(|e| e.to_string())?;
        Ok(embeddings)
    }
}
