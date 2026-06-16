use tauri::State;
use sqlx::SqlitePool;
use super::models::{ChatConversation, ChatMessage, DbSession, DbMessage, SwarmContextPool};

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
