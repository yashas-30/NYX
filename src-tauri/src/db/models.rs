use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ChatConversation {
    pub id: String,
    pub title: String,
    pub model: String,
    pub folder_id: Option<String>,
    pub tags: Option<String>,
    pub share_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ChatMessage {
    pub id: String,
    pub conversation_id: String,
    pub parent_id: Option<String>,
    pub role: String,
    pub content: String,
    pub model: String,
    pub is_pinned: i64, // boolean in sqlite, integer in db
    pub timestamp: i64,
    pub token_usage: Option<String>,
    pub attachments: Option<String>,
    pub feedback: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct DbSession {
    pub id: String,
    pub name: String,
    pub model_id: String,
    pub provider: String,
    pub created_at: Option<i64>,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct DbMessage {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub status: Option<String>,
    pub latency_ms: Option<i64>,
    pub tokens: Option<i64>,
    pub tps: Option<f64>,
    pub timestamp: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct SwarmContextPool {
    pub id: String,
    pub session_id: String,
    pub agent_id: String,
    pub task: String,
    pub content: String,
    pub timestamp: i64,
}

// ── Fix #8: Embedding storage helpers ───────────────────────────────────────
//
// Storing 384-float embeddings as JSON text (e.g. [0.1, -0.4, ...])
// wastes ~3-4× more bytes than a raw binary blob and forces a JSON
// parse on every similarity calculation.
//
// We store embeddings as little-endian f32 blobs (BLOB in SQLite).
// Each dimension is exactly 4 bytes; 384-d embedding = 1,536 bytes.

/// Encode a float vector into little-endian raw bytes for SQLite BLOB storage.
pub fn encode_embedding(v: &[f32]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(v.len() * 4);
    for &f in v {
        buf.extend_from_slice(&f.to_le_bytes());
    }
    buf
}

/// Decode little-endian raw bytes back into a float vector.
/// Returns an empty Vec if the blob length is not a multiple of 4.
pub fn decode_embedding(bytes: &[u8]) -> Vec<f32> {
    if bytes.len() % 4 != 0 {
        return Vec::new();
    }
    bytes.chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect()
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct LongTermMemory {
    pub id: String,
    pub fact: String,
    pub category: String,
    /// Raw little-endian f32 bytes (BLOB). Use `decode_embedding` to get Vec<f32>.
    pub embedding: Vec<u8>,
    pub created_at: i64,
}


#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct ExperienceLedgerEntry {
    pub id: String,
    pub prompt: String,
    pub failure_type: String,
    pub assertion_error: String,
    pub timestamp: i64,
}

// ── Phase 1: LLM Observability ───────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct LlmTrace {
    pub id: String,
    pub session_id: Option<String>,
    pub provider: String,
    pub model: String,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub latency_ms: i64,
    pub cached: i64,           // 0 or 1 (SQLite bool)
    pub error: Option<String>,
    pub agent_node_id: Option<String>,
    pub created_at: i64,
}

/// Aggregated stats returned to the frontend for the observability dashboard.
#[derive(Debug, Serialize, Deserialize)]
pub struct ModelStats {
    pub model: String,
    pub provider: String,
    pub total_calls: i64,
    pub avg_latency_ms: f64,
    pub total_prompt_tokens: i64,
    pub total_completion_tokens: i64,
    pub error_count: i64,
    pub cache_hits: i64,
}

// ── Phase 2: Multi-tier Memory ───────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct EpisodicMemory {
    pub id: String,
    pub session_id: String,
    pub summary: String,
    /// Raw little-endian f32 bytes (BLOB). Use `decode_embedding` to get Vec<f32>.
    pub embedding: Vec<u8>,
    pub key_topics: String,    // JSON string array
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct MemoryEntity {
    pub id: String,
    pub entity_name: String,
    pub entity_type: String,   // person | project | technology | preference
    pub description: String,
    pub confidence: f64,
    pub last_seen: i64,
    pub created_at: i64,
}
