use fastembed::{TextEmbedding, InitOptions, EmbeddingModel};
use std::sync::{OnceLock, Mutex};

/// Global singleton for the embedding model.
///
/// `embed()` takes `&mut self` so we need a Mutex, but we use std::sync::Mutex
/// (not tokio's) because all calls go through spawn_blocking — a regular thread
/// context where blocking is fine and async Mutex overhead is unnecessary.
///
/// OnceLock ensures the (heavy) ONNX model is loaded exactly once.
static EMBEDDER: OnceLock<Mutex<TextEmbedding>> = OnceLock::new();

fn get_embedder() -> &'static Mutex<TextEmbedding> {
    EMBEDDER.get_or_init(|| {
        let mut model = TextEmbedding::try_new(
            InitOptions::new(EmbeddingModel::AllMiniLML6V2)
                .with_show_download_progress(true),
        )
        .or_else(|_| TextEmbedding::try_new(InitOptions::default()))
        .expect("Failed to initialize fastembed embedding model");
        
        // 🚀 WARMUP INFERENCE: ONNX Runtime does lazy graph optimization and memory
        // allocation during the very first forward pass. By running a dummy string 
        // through it now (on the background thread), the first user search will be 
        // instantly fast and won't suffer this execution provider cold-start penalty.
        let _ = model.embed(vec!["warmup".to_string()], None);
        
        Mutex::new(model)
    })
}

/// Eagerly initialize the embedding model at startup so the first user
/// request doesn't pay the cold-start cost (~500ms–2s ONNX load).
pub fn warm_up() {
    let _ = get_embedder();
}

/// Thin wrapper kept for backward compat with scanner.rs / mcp_server / etc.
pub struct Embedder;

impl Embedder {
    pub fn new() -> Result<Self, String> {
        // Trigger initialization eagerly rather than on first embed call.
        let _ = get_embedder();
        Ok(Self)
    }

    /// Embed a batch of texts.
    ///
    /// Offloads the synchronous, CPU-bound ONNX inference to Tokio's
    /// blocking thread pool so the async reactor is never frozen.
    pub async fn embed(&self, texts: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
        tokio::task::spawn_blocking(move || {
            let mut model = get_embedder()
                .lock()
                .map_err(|e| format!("Embedder mutex poisoned: {}", e))?;
            model
                .embed(texts, None)
                .map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| format!("spawn_blocking join error: {}", e))?
    }
}
