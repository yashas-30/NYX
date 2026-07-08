use sqlx::SqlitePool;
use tauri::State;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct EpisodicMemory {
    pub id: String,
    pub session_id: String,
    pub summary: String,
    pub key_topics: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct MemoryEntity {
    pub id: String,
    pub entity_name: String,
    pub entity_type: String,
    pub description: String,
    pub confidence: f64,
    pub last_seen: i64,
    pub created_at: i64,
}

#[tauri::command]
pub async fn get_episodic_memories(
    pool: State<'_, SqlitePool>,
    limit: Option<i64>,
) -> Result<Vec<EpisodicMemory>, String> {
    let limit_val = limit.unwrap_or(50);
    let memories = sqlx::query_as::<_, EpisodicMemory>(
        "SELECT id, session_id, summary, key_topics, created_at FROM episodic_memories ORDER BY created_at DESC LIMIT ?"
    )
    .bind(limit_val)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(memories)
}

#[tauri::command]
pub async fn get_memory_entities(
    pool: State<'_, SqlitePool>,
    limit: Option<i64>,
) -> Result<Vec<MemoryEntity>, String> {
    let limit_val = limit.unwrap_or(100);
    let entities = sqlx::query_as::<_, MemoryEntity>(
        "SELECT id, entity_name, entity_type, description, confidence, last_seen, created_at FROM memory_entities ORDER BY last_seen DESC LIMIT ?"
    )
    .bind(limit_val)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(entities)
}

#[tauri::command]
pub async fn delete_entity(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<(), String> {
    sqlx::query("DELETE FROM memory_entities WHERE id = ?")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
