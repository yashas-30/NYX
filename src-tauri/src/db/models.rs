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

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct ModelConfig {
    pub id: String,
    pub provider: String,
    pub name: String,
    pub config: String,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct LongTermMemory {
    pub id: String,
    pub fact: String,
    pub category: String,
    pub embedding: String, // JSON float array
    pub created_at: i64,
}
