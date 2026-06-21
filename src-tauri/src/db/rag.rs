use tauri::State;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use turbovec::TurboQuantIndex;

pub struct RagState {
    pub index: Arc<Mutex<Option<TurboQuantIndex>>>,
    pub metadata: Arc<Mutex<Vec<ChunkMeta>>>,
}

impl Default for RagState {
    fn default() -> Self {
        Self {
            index: Arc::new(Mutex::new(None)),
            metadata: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ChunkMeta {
    pub id: String,
    pub document_name: String,
    pub chunk_index: usize,
    pub content: String,
}

#[derive(Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub document_name: String,
    pub chunk_index: usize,
    pub content: String,
    pub similarity: f32,
}

#[tauri::command]
pub async fn db_add_document_chunk(
    id: String,
    document_name: String,
    chunk_index: usize,
    content: String,
    embedding: Vec<f32>,
    state: State<'_, RagState>,
) -> Result<(), String> {
    let emb_vec = embedding;
    let dim = emb_vec.len();
    
    // Ensure turbovec is initialized, but dimension must be a multiple of 8
    let mut padded_vec = emb_vec;
    let remainder = dim % 8;
    if remainder != 0 {
        let padding = 8 - remainder;
        padded_vec.extend(vec![0.0; padding]);
    }
    let padded_dim = padded_vec.len();

    let mut idx_guard = state.index.lock().await;
    if idx_guard.is_none() {
        // 4 bits per coordinate
        *idx_guard = Some(TurboQuantIndex::new(padded_dim, 4).map_err(|e| format!("{:?}", e))?);
    }

    if let Some(index) = idx_guard.as_mut() {
        index.add(&padded_vec);
    }

    let mut meta_guard = state.metadata.lock().await;
    meta_guard.push(ChunkMeta {
        id,
        document_name,
        chunk_index,
        content,
    });

    Ok(())
}

#[tauri::command]
pub async fn db_delete_document_chunks(
    document_name: String,
    state: State<'_, RagState>,
) -> Result<(), String> {
    // Turbovec doesn't support easy deletion.
    // Instead of removing from meta (which misaligns turbovec indices), we mark it deleted.
    let mut meta_guard = state.metadata.lock().await;
    for meta in meta_guard.iter_mut() {
        if meta.document_name == document_name {
            meta.document_name = String::new(); // Mark as deleted
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn db_search_document_chunks(
    query_embedding: Vec<f32>,
    top_k: usize,
    state: State<'_, RagState>,
) -> Result<Vec<SearchResult>, String> {
    let mut emb_vec = query_embedding;
    
    let dim = emb_vec.len();
    let remainder = dim % 8;
    if remainder != 0 {
        let padding = 8 - remainder;
        emb_vec.extend(vec![0.0; padding]);
    }

    let idx_guard = state.index.lock().await;
    let meta_guard = state.metadata.lock().await;

    if let Some(index) = idx_guard.as_ref() {
        if meta_guard.is_empty() {
            return Ok(vec![]);
        }
        
        let k = std::cmp::min(top_k * 2, meta_guard.len()); // fetch more to account for deleted
        if k == 0 {
            return Ok(vec![]);
        }

        let results = index.search(&emb_vec, k);
        let mut final_results = Vec::new();

        for i in 0..results.nq * k {
            if final_results.len() >= top_k {
                break;
            }
            let score = results.scores[i];
            let raw_idx = results.indices[i] as usize;

            if let Some(meta) = meta_guard.get(raw_idx) {
                if !meta.document_name.is_empty() {
                    final_results.push(SearchResult {
                        id: meta.id.clone(),
                        document_name: meta.document_name.clone(),
                        chunk_index: meta.chunk_index,
                        content: meta.content.clone(),
                        similarity: score,
                    });
                }
            }
        }

        Ok(final_results)
    } else {
        Ok(vec![])
    }
}


