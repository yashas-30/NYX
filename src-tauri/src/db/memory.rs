use std::sync::Arc;
use tokio::sync::Mutex;
use turbovec::TurboQuantIndex;
use serde::{Serialize, Deserialize};
use axum::{routing::post, Router, Json, extract::State};
use std::net::SocketAddr;

#[derive(Clone)]
pub struct HermesMemoryState {
    pub index: Arc<Mutex<Option<TurboQuantIndex>>>,
    pub metadata: Arc<Mutex<Vec<MemoryMeta>>>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct MemoryMeta {
    pub id: String,
    pub fact: String,
    pub category: String,
    pub created_at: i64,
}

impl Default for HermesMemoryState {
    fn default() -> Self {
        Self {
            index: Arc::new(Mutex::new(None)),
            metadata: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[derive(Deserialize)]
pub struct AddMemoryReq {
    pub id: String,
    pub fact: String,
    pub category: String,
    pub created_at: i64,
    pub embedding: Vec<f32>,
}

#[derive(Deserialize)]
pub struct SearchMemoryReq {
    pub embedding: Vec<f32>,
    pub top_k: usize,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub id: String,
    pub fact: String,
    pub category: String,
    pub created_at: i64,
    pub similarity: f32,
}

async fn handle_add_memory(
    State(state): State<HermesMemoryState>,
    Json(payload): Json<AddMemoryReq>,
) -> Json<bool> {
    let mut emb_vec = payload.embedding;
    let dim = emb_vec.len();
    let remainder = dim % 8;
    if remainder != 0 {
        let padding = 8 - remainder;
        emb_vec.extend(vec![0.0; padding]);
    }
    let padded_dim = emb_vec.len();

    let mut idx_guard = state.index.lock().await;
    if idx_guard.is_none() {
        *idx_guard = Some(TurboQuantIndex::new(padded_dim, 4).unwrap());
    }
    if let Some(index) = idx_guard.as_mut() {
        index.add(&emb_vec);
    }
    let mut meta_guard = state.metadata.lock().await;
    meta_guard.push(MemoryMeta {
        id: payload.id,
        fact: payload.fact,
        category: payload.category,
        created_at: payload.created_at,
    });
    Json(true)
}

async fn handle_search_memory(
    State(state): State<HermesMemoryState>,
    Json(payload): Json<SearchMemoryReq>,
) -> Json<Vec<SearchResult>> {
    let mut emb_vec = payload.embedding;
    let dim = emb_vec.len();
    let remainder = dim % 8;
    if remainder != 0 {
        let padding = 8 - remainder;
        emb_vec.extend(vec![0.0; padding]);
    }

    let idx_guard = state.index.lock().await;
    let meta_guard = state.metadata.lock().await;

    if let Some(index) = idx_guard.as_ref() {
        if meta_guard.is_empty() { return Json(vec![]); }
        let k = std::cmp::min(payload.top_k, meta_guard.len());
        if k == 0 { return Json(vec![]); }

        let results = index.search(&emb_vec, k);
        let mut final_results = Vec::new();

        for i in 0..results.nq * k {
            if final_results.len() >= payload.top_k { break; }
            let score = results.scores[i];
            let raw_idx = results.indices[i] as usize;

            if let Some(meta) = meta_guard.get(raw_idx) {
                final_results.push(SearchResult {
                    id: meta.id.clone(),
                    fact: meta.fact.clone(),
                    category: meta.category.clone(),
                    created_at: meta.created_at,
                    similarity: score,
                });
            }
        }
        Json(final_results)
    } else {
        Json(vec![])
    }
}

pub fn spawn_memory_server(state: HermesMemoryState) {
    tauri::async_runtime::spawn(async move {
        let app = Router::new()
            .route("/api/turbovec/add", post(handle_add_memory))
            .route("/api/turbovec/search", post(handle_search_memory))
            .with_state(state);
        
        let addr = SocketAddr::from(([127, 0, 0, 1], 3011));
        let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
        tracing::info!("🧠 Turbovec Memory Server listening on {}", addr);
        axum::serve(listener, app).await.unwrap();
    });
}

// --- Tauri Commands for Turbovec ---

#[tauri::command]
pub async fn turbovec_add_memory(
    state: tauri::State<'_, HermesMemoryState>,
    id: String,
    fact: String,
    category: String,
    created_at: i64,
    embedding: Vec<f32>,
) -> Result<bool, String> {
    let mut emb_vec = embedding;
    let dim = emb_vec.len();
    let remainder = dim % 8;
    if remainder != 0 {
        let padding = 8 - remainder;
        emb_vec.extend(vec![0.0; padding]);
    }
    let padded_dim = emb_vec.len();

    let mut idx_guard = state.index.lock().await;
    if idx_guard.is_none() {
        *idx_guard = Some(TurboQuantIndex::new(padded_dim, 4).unwrap());
    }
    if let Some(index) = idx_guard.as_mut() {
        index.add(&emb_vec);
    }
    let mut meta_guard = state.metadata.lock().await;
    meta_guard.push(MemoryMeta {
        id,
        fact,
        category,
        created_at,
    });
    Ok(true)
}

#[tauri::command]
pub async fn turbovec_search_memory(
    state: tauri::State<'_, HermesMemoryState>,
    embedding: Vec<f32>,
    top_k: usize,
) -> Result<Vec<SearchResult>, String> {
    let mut emb_vec = embedding;
    let dim = emb_vec.len();
    let remainder = dim % 8;
    if remainder != 0 {
        let padding = 8 - remainder;
        emb_vec.extend(vec![0.0; padding]);
    }

    let idx_guard = state.index.lock().await;
    let meta_guard = state.metadata.lock().await;

    if let Some(index) = idx_guard.as_ref() {
        if meta_guard.is_empty() { return Ok(vec![]); }
        let k = std::cmp::min(top_k, meta_guard.len());
        if k == 0 { return Ok(vec![]); }

        let results = index.search(&emb_vec, k);
        let mut final_results = Vec::new();

        for i in 0..results.nq * k {
            if final_results.len() >= top_k { break; }
            let score = results.scores[i];
            let raw_idx = results.indices[i] as usize;

            if let Some(meta) = meta_guard.get(raw_idx) {
                final_results.push(SearchResult {
                    id: meta.id.clone(),
                    fact: meta.fact.clone(),
                    category: meta.category.clone(),
                    created_at: meta.created_at,
                    similarity: score,
                });
            }
        }
        Ok(final_results)
    } else {
        Ok(vec![])
    }
}
