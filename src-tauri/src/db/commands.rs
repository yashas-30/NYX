use tauri::State;
use sqlx::SqlitePool;
use super::models::{ChatConversation, ChatMessage, DbSession, DbMessage, SwarmContextPool, LongTermMemory};

#[tauri::command]
pub async fn db_get_chat_conversations(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ChatConversation>, String> {
    let convos = sqlx::query_as::<_, ChatConversation>(
        "SELECT * FROM chat_conversations ORDER BY updated_at DESC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(convos)
}

#[tauri::command]
pub async fn db_get_chat_messages(
    pool: State<'_, SqlitePool>,
    conversation_id: String,
) -> Result<Vec<ChatMessage>, String> {
    let msgs = sqlx::query_as::<_, ChatMessage>(
        "SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY timestamp ASC"
    )
    .bind(conversation_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(msgs)
}

#[tauri::command]
pub async fn db_get_db_sessions(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<DbSession>, String> {
    let sessions = sqlx::query_as::<_, DbSession>(
        "SELECT * FROM db_sessions ORDER BY updated_at DESC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(sessions)
}

#[tauri::command]
pub async fn db_get_db_messages(
    pool: State<'_, SqlitePool>,
    session_id: String,
) -> Result<Vec<DbMessage>, String> {
    let msgs = sqlx::query_as::<_, DbMessage>(
        "SELECT * FROM db_messages WHERE session_id = ? ORDER BY timestamp ASC"
    )
    .bind(session_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(msgs)
}

#[tauri::command]
pub async fn db_get_swarm_context(
    pool: State<'_, SqlitePool>,
    session_id: String,
) -> Result<Vec<SwarmContextPool>, String> {
    let ctx = sqlx::query_as::<_, SwarmContextPool>(
        "SELECT * FROM swarm_context_pool WHERE session_id = ? ORDER BY timestamp ASC"
    )
    .bind(session_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(ctx)
}

// Internal Rust API for Swarm Orchestrator

pub async fn write_swarm_context_internal(
    pool: &SqlitePool,
    session_id: &str,
    agent_id: &str,
    task: &str,
    content: &str,
) -> Result<(), sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    sqlx::query(
        "INSERT INTO swarm_context_pool (id, session_id, agent_id, task, content, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(id)
    .bind(session_id)
    .bind(agent_id)
    .bind(task)
    .bind(content)
    .bind(timestamp)
    .execute(pool)
    .await?;

    Ok(())
}

#[allow(dead_code)]
pub async fn get_swarm_context_internal(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<String, sqlx::Error> {
    let ctx = sqlx::query_as::<_, SwarmContextPool>(
        "SELECT * FROM swarm_context_pool WHERE session_id = ? ORDER BY timestamp ASC"
    )
    .bind(session_id)
    .fetch_all(pool)
    .await?;

    if ctx.is_empty() {
        return Ok(String::new());
    }

    let mut result = String::new();
    for entry in ctx {
        result.push_str(&format!(
            "\n\n--- Memory from {} (Task: {}) ---\n{}",
            entry.agent_id, entry.task, entry.content
        ));
    }

    Ok(result)
}

use serde::Deserialize;

#[derive(Debug, Deserialize, serde::Serialize)]
pub struct ChatMessagePayload {
    pub id: Option<String>,
    pub role: String,
    pub content: String,
    pub timestamp: Option<i64>,
    #[serde(rename = "isPinned")]
    pub is_pinned: Option<bool>,
    pub metrics: Option<serde_json::Value>,
    pub attachments: Option<serde_json::Value>,
    pub model: Option<String>,
    pub reasoning: Option<String>,
}

#[derive(Debug, Deserialize, serde::Serialize)]
pub struct ChatSessionPayload {
    pub id: String,
    pub title: String,
    pub messages: Vec<ChatMessagePayload>,
    #[serde(rename = "folderId")]
    pub folder_id: Option<String>,
    pub tags: Option<String>,
    #[serde(rename = "shareId")]
    pub share_id: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: Option<i64>,
    #[serde(rename = "updatedAt")]
    pub updated_at: Option<i64>,
    pub model: Option<String>,
}

#[tauri::command]
pub async fn db_get_all_chat_sessions(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ChatSessionPayload>, String> {
    let convos = sqlx::query_as::<_, super::models::ChatConversation>(
        "SELECT * FROM chat_conversations ORDER BY updated_at DESC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut sessions = Vec::new();

    for c in convos {
        let msgs = sqlx::query_as::<_, super::models::ChatMessage>(
            "SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY timestamp ASC"
        )
        .bind(&c.id)
        .fetch_all(&*pool)
        .await
        .unwrap_or_default();

        let mut message_payloads = Vec::new();
        for m in msgs {
            message_payloads.push(ChatMessagePayload {
                id: Some(m.id),
                role: m.role,
                content: m.content,
                timestamp: Some(m.timestamp),
                is_pinned: Some(m.is_pinned == 1),
                metrics: m.token_usage.and_then(|t| serde_json::from_str(&t).ok()),
                attachments: m.attachments.and_then(|a| serde_json::from_str(&a).ok()),
                model: Some(m.model),
                reasoning: None,
            });
        }

        sessions.push(ChatSessionPayload {
            id: c.id,
            title: c.title,
            messages: message_payloads,
            folder_id: c.folder_id,
            tags: c.tags,
            share_id: c.share_id,
            created_at: Some(c.created_at),
            updated_at: Some(c.updated_at),
            model: Some(c.model),
        });
    }

    Ok(sessions)
}

#[tauri::command]
pub async fn db_save_chat_session(
    pool: State<'_, SqlitePool>,
    session: ChatSessionPayload,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();
    let created = session.created_at.unwrap_or(now);
    let updated = session.updated_at.unwrap_or(now);
    let model = session.model.unwrap_or_else(|| "default".to_string());

    // Upsert conversation
    sqlx::query(
        "INSERT INTO chat_conversations (id, title, model, folder_id, tags, share_id, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET 
            title=excluded.title, model=excluded.model, folder_id=excluded.folder_id, 
            tags=excluded.tags, share_id=excluded.share_id, updated_at=excluded.updated_at"
    )
    .bind(&session.id)
    .bind(&session.title)
    .bind(&model)
    .bind(&session.folder_id)
    .bind(&session.tags)
    .bind(&session.share_id)
    .bind(created)
    .bind(updated)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // We can simply clear all messages and re-insert them, or upsert. 
    // Since the frontend payload has all messages, upserting or clear/insert is fine.
    // However, if we do ON CONFLICT, we need unique IDs. Some frontend messages don't have IDs initially?
    // Wait, the frontend might generate IDs for messages. Let's do a simple delete and reinsert for simplicity,
    // or upsert if IDs are present. For now, since they all have IDs:

    sqlx::query("DELETE FROM chat_messages WHERE conversation_id = ?")
        .bind(&session.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    for msg in session.messages {
        let msg_id = msg.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let is_pinned = if msg.is_pinned.unwrap_or(false) { 1 } else { 0 };
        let msg_model = msg.model.unwrap_or_else(|| "default".to_string());
        
        let attach_str = msg.attachments.map(|a| a.to_string());
        let token_str = msg.metrics.map(|m| m.to_string());

        sqlx::query(
            "INSERT INTO chat_messages (id, conversation_id, parent_id, role, content, model, is_pinned, timestamp, token_usage, attachments, feedback)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&msg_id)
        .bind(&session.id)
        .bind::<Option<String>>(None)
        .bind(&msg.role)
        .bind(&msg.content)
        .bind(&msg_model)
        .bind(is_pinned)
        .bind(msg.timestamp.unwrap_or(now))
        .bind(token_str)
        .bind(attach_str)
        .bind::<Option<i64>>(None)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn db_delete_chat_session(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<(), String> {
    sqlx::query("DELETE FROM chat_conversations WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn db_update_chat_session_meta(
    pool: State<'_, SqlitePool>,
    id: String,
    folder_id: Option<String>,
    tags: Option<String>,
) -> Result<(), String> {
    sqlx::query("UPDATE chat_conversations SET folder_id = ?, tags = ? WHERE id = ?")
        .bind(folder_id)
        .bind(tags)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct ChatFolder {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}

#[tauri::command]
pub async fn db_create_folder(
    pool: State<'_, SqlitePool>,
    id: String,
    name: String,
) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query("INSERT INTO chat_folders (id, name, created_at) VALUES (?, ?, ?)")
        .bind(id)
        .bind(name)
        .bind(now)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn db_delete_folder(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE chat_conversations SET folder_id = NULL WHERE folder_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM chat_folders WHERE id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn db_get_folders(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ChatFolder>, String> {
    let folders = sqlx::query_as::<_, ChatFolder>(
        "SELECT * FROM chat_folders ORDER BY created_at ASC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(folders)
}

#[tauri::command]
pub async fn db_add_memory(
    pool: State<'_, SqlitePool>,
    id: String,
    fact: String,
    category: String,
    embedding: String, // JSON float array
) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        "INSERT INTO long_term_memories (id, fact, category, embedding, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id)
    .bind(fact)
    .bind(category)
    .bind(embedding)
    .bind(now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn db_get_memories(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<LongTermMemory>, String> {
    let memories = sqlx::query_as::<_, LongTermMemory>(
        "SELECT * FROM long_term_memories ORDER BY created_at DESC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(memories)
}

#[tauri::command]
pub async fn db_delete_memory(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<(), String> {
    sqlx::query("DELETE FROM long_term_memories WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct MemorySearchResult {
    pub id: String,
    pub fact: String,
    pub category: String,
    pub created_at: i64,
    pub similarity: f32,
}

#[tauri::command]
pub async fn db_search_memories(
    pool: State<'_, SqlitePool>,
    query_embedding: Vec<f32>,
    top_k: usize,
) -> Result<Vec<MemorySearchResult>, String> {
    let memories = db_get_memories(pool).await?;
    let mut results: Vec<MemorySearchResult> = Vec::new();

    for m in memories {
        let embedding_arr: Vec<f32> = serde_json::from_str(&m.embedding).unwrap_or_default();
        let similarity = if !embedding_arr.is_empty() && embedding_arr.len() == query_embedding.len() {
            let mut dot_product = 0.0;
            let mut norm_a = 0.0;
            let mut norm_b = 0.0;
            for i in 0..query_embedding.len() {
                dot_product += query_embedding[i] * embedding_arr[i];
                norm_a += query_embedding[i] * query_embedding[i];
                norm_b += embedding_arr[i] * embedding_arr[i];
            }
            if norm_a == 0.0 || norm_b == 0.0 {
                0.0
            } else {
                dot_product / (norm_a.sqrt() * norm_b.sqrt())
            }
        } else {
            0.0
        };

        results.push(MemorySearchResult {
            id: m.id,
            fact: m.fact,
            category: m.category,
            created_at: m.created_at,
            similarity,
        });
    }

    // Sort descending by similarity
    results.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal));
    
    // Take top_k
    results.truncate(top_k);

    Ok(results)
}
