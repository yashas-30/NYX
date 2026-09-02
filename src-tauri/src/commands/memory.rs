use sqlx::SqlitePool;
use tauri::{State, Manager};
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
        "SELECT id, session_id, summary, key_topics, created_at FROM episodic_memories WHERE summary NOT LIKE '%Session Task: hi%' AND summary NOT LIKE '%Session Task: hello%' AND summary NOT LIKE '%Session Task: hey%' ORDER BY created_at DESC LIMIT ?"
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

#[tauri::command]
pub async fn extract_session_memory(
    pool: State<'_, SqlitePool>,
    session_id: String,
) -> Result<(), String> {
    let msgs = sqlx::query_as::<_, crate::db::models::ChatMessage>(
        "SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY timestamp ASC"
    )
    .bind(&session_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let snapshots: Vec<crate::agents::memory::memory_extractor::MessageSnapshot> = msgs
        .into_iter()
        .map(|m| crate::agents::memory::memory_extractor::MessageSnapshot {
            role: m.role,
            content: m.content,
        })
        .collect();

    crate::agents::memory::memory_extractor::extract_and_store(
        pool.inner(),
        &session_id,
        &snapshots,
        "",
        "gemini-3.5-flash-lite",
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Lightweight post-turn memory extraction: called immediately after each chat turn
/// with the raw user prompt and assistant response. Runs via tokio::spawn (non-blocking).
#[tauri::command]
pub async fn extract_turn_memory(
    pool: State<'_, SqlitePool>,
    conversation_id: String,
    user_turn: String,
    assistant_turn: String,
) -> Result<(), String> {
    let snapshots = vec![
        crate::agents::memory::memory_extractor::MessageSnapshot {
            role: "user".to_string(),
            content: user_turn.chars().take(4000).collect(),
        },
        crate::agents::memory::memory_extractor::MessageSnapshot {
            role: "assistant".to_string(),
            content: assistant_turn.chars().take(8000).collect(),
        },
    ];

    // Spawn as background task so we don't block the response
    let pool_clone = pool.inner().clone();
    tokio::spawn(async move {
        let _ = crate::agents::memory::memory_extractor::extract_and_store(
            &pool_clone,
            &conversation_id,
            &snapshots,
            "",
            "gemini-3.5-flash-lite",
        )
        .await;
    });

    Ok(())
}


#[derive(Serialize, Deserialize)]
pub struct TurbovecSearchResult {
    pub text: String,
    pub metadata: String,
}

#[tauri::command]
pub async fn turbovec_add_memory(
    app: tauri::AppHandle,
    text: String,
    metadata: Option<String>,
) -> Result<(), String> {
    if let Some(tv_store) = app.try_state::<std::sync::Arc<crate::rag::turbovec_store::TurbovecStore>>() {
        let meta = metadata.unwrap_or_else(|| "web-research".to_string());
        tv_store.add_document_chunks(&text, &meta).await;
        Ok(())
    } else {
        Err("TurboVec memory store not initialized".to_string())
    }
}

#[tauri::command]
pub async fn turbovec_search_memory(
    app: tauri::AppHandle,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<TurbovecSearchResult>, String> {
    if let Some(tv_store) = app.try_state::<std::sync::Arc<crate::rag::turbovec_store::TurbovecStore>>() {
        let limit_val = limit.unwrap_or(10);
        let results = tv_store.search_memory(&query, limit_val).await;
        let mapped = results
            .into_iter()
            .map(|(text, metadata)| TurbovecSearchResult { text, metadata })
            .collect();
        Ok(mapped)
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub async fn turbovec_search_chat_history(
    app: tauri::AppHandle,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<TurbovecSearchResult>, String> {
    if let Some(tv_store) = app.try_state::<std::sync::Arc<crate::rag::turbovec_store::TurbovecStore>>() {
        let limit_val = limit.unwrap_or(10);
        let results = tv_store.search_chat_memory(&query, limit_val).await;
        let mapped = results
            .into_iter()
            .map(|(_id, text, metadata)| TurbovecSearchResult { text, metadata })
            .collect();
        Ok(mapped)
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub async fn turbovec_sync_chat_session(
    app: tauri::AppHandle,
    session: crate::commands::db::ChatSessionPayload,
) -> Result<(), String> {
    if let Some(tv_store) = app.try_state::<std::sync::Arc<crate::rag::turbovec_store::TurbovecStore>>() {
        tv_store.sync_session_messages(&session.id, &session.title, &session.messages).await;
        Ok(())
    } else {
        Err("TurboVec memory store not initialized".to_string())
    }
}



/// Called internally after each chat turn completes to persist episodic memory.
/// Non-blocking: spawns a tokio task so it never blocks the response stream.
#[allow(dead_code)]
pub fn trigger_memory_extraction_async(
    app: tauri::AppHandle,
    conversation_id: String,
    user_turn: String,
    assistant_turn: String,
) {
    tokio::spawn(async move {
        let pool = match app.try_state::<SqlitePool>() {
            Some(p) => p.inner().clone(),
            None => {
                eprintln!("[memory] SqlitePool not available for memory extraction");
                return;
            }
        };

        let messages = vec![
            crate::agents::memory::memory_extractor::MessageSnapshot {
                role: "user".to_string(),
                content: user_turn,
            },
            crate::agents::memory::memory_extractor::MessageSnapshot {
                role: "assistant".to_string(),
                content: assistant_turn,
            },
        ];

        if let Err(e) = crate::agents::memory::memory_extractor::extract_and_store(
            &pool,
            &conversation_id,
            &messages,
            "",
            "gemini-3.5-flash-lite",
        )
        .await
        {
            eprintln!("[memory] Memory extraction failed (non-critical): {}", e);
        }
    });
}
