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

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct LongTermMemory {
    pub id: String,
    pub fact: String,
    pub category: String,
    pub embedding: String, // JSON float array
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
    pub embedding: String,     // JSON float array
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
