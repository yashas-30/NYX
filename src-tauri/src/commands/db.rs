use tauri::State;
use sqlx::SqlitePool;
use crate::db::models::{ChatConversation, ChatMessage, DbSession, DbMessage, SwarmContextPool, LongTermMemory, ExperienceLedgerEntry, LocalModel, decode_embedding, encode_embedding};

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
    let convos = sqlx::query_as::<_, crate::db::models::ChatConversation>(
        "SELECT * FROM chat_conversations ORDER BY updated_at DESC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let all_msgs = sqlx::query_as::<_, crate::db::models::ChatMessage>(
        "SELECT * FROM chat_messages ORDER BY timestamp ASC"
    )
    .fetch_all(&*pool)
    .await
    .unwrap_or_default();

    let mut msgs_by_convo: std::collections::HashMap<String, Vec<ChatMessagePayload>> = std::collections::HashMap::new();
    
    for m in all_msgs {
        let payload = ChatMessagePayload {
            id: Some(m.id),
            role: m.role,
            content: m.content,
            timestamp: Some(m.timestamp),
            is_pinned: Some(m.is_pinned == 1),
            metrics: m.token_usage.and_then(|t| serde_json::from_str(&t).ok()),
            attachments: m.attachments.and_then(|a| serde_json::from_str(&a).ok()),
            model: Some(m.model),
            reasoning: None,
        };
        msgs_by_convo.entry(m.conversation_id).or_default().push(payload);
    }

    let mut sessions = Vec::with_capacity(convos.len());

    for c in convos {
        let message_payloads = msgs_by_convo.remove(&c.id).unwrap_or_default();

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

    for msg in &session.messages {
        let msg_id = msg.id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let is_pinned = if msg.is_pinned.unwrap_or(false) { 1 } else { 0 };
        let msg_model = msg.model.clone().unwrap_or_else(|| "default".to_string());
        
        let attach_str = msg.attachments.as_ref().map(|a| a.to_string());
        let token_str = msg.metrics.as_ref().map(|m| m.to_string());

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

    // Trigger background multi-tier memory extraction for non-trivial sessions
    if session.messages.len() >= 2 {
        let pool_clone = pool.inner().clone();
        let session_id = session.id.clone();
        let snapshots: Vec<crate::agents::memory::memory_extractor::MessageSnapshot> = session
            .messages
            .into_iter()
            .map(|m| crate::agents::memory::memory_extractor::MessageSnapshot {
                role: m.role,
                content: m.content,
            })
            .collect();

        tokio::spawn(async move {
            let _ = crate::agents::memory::memory_extractor::extract_and_store(
                &pool_clone,
                &session_id,
                &snapshots,
                "",
                "gemini-2.0-flash",
            )
            .await;
        });
    }

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
    id: Option<String>,
    fact: String,
    category: Option<String>,
    embedding: Option<serde_json::Value>,
) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();
    let mem_id = id.filter(|s| !s.is_empty()).unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let mem_category = category.filter(|s| !s.is_empty()).unwrap_or_else(|| "Preference".to_string());

    let mut final_bytes: Vec<u8> = Vec::new();

    if let Some(val) = embedding {
        if let Some(arr) = val.as_array() {
            let floats: Vec<f32> = arr.iter().filter_map(|v| v.as_f64().map(|f| f as f32)).collect();
            if !floats.is_empty() {
                final_bytes = encode_embedding(&floats);
            } else {
                let bytes: Vec<u8> = arr.iter().filter_map(|v| v.as_u64().map(|u| u as u8)).collect();
                final_bytes = bytes;
            }
        }
    }

    if final_bytes.is_empty() && !fact.trim().is_empty() {
        if let Ok(embedder) = crate::rag::embeddings::Embedder::new() {
            if let Ok(vecs) = embedder.embed(vec![fact.clone()]).await {
                if let Some(first_vec) = vecs.into_iter().next() {
                    final_bytes = encode_embedding(&first_vec);
                }
            }
        }
    }

    sqlx::query(
        "INSERT INTO long_term_memories (id, fact, category, embedding, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(mem_id)
    .bind(fact)
    .bind(mem_category)
    .bind(final_bytes)
    .bind(now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // Auto-prune to keep only the newest 2000 memories
    let _ = sqlx::query(
        "DELETE FROM long_term_memories WHERE id NOT IN (SELECT id FROM long_term_memories ORDER BY created_at DESC LIMIT 2000)"
    )
    .execute(&*pool)
    .await;

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
pub async fn db_insert_experience_ledger(
    pool: State<'_, SqlitePool>,
    prompt: String,
    failure_type: String,
    assertion_error: String,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    sqlx::query(
        "INSERT INTO experience_ledger (id, prompt, failure_type, assertion_error, timestamp) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(prompt)
    .bind(failure_type)
    .bind(assertion_error)
    .bind(timestamp)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub async fn db_get_recent_experience_ledger(
    pool: State<'_, SqlitePool>,
    limit: i64,
) -> Result<Vec<ExperienceLedgerEntry>, String> {
    let entries = sqlx::query_as::<_, ExperienceLedgerEntry>(
        "SELECT * FROM experience_ledger ORDER BY timestamp DESC LIMIT ?"
    )
    .bind(limit)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(entries)
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

#[tauri::command]
pub async fn db_clear_memories(
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("DELETE FROM long_term_memories")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn db_prune_memories(
    pool: State<'_, SqlitePool>,
    limit: i64,
) -> Result<u64, String> {
    let result = sqlx::query(
        "DELETE FROM long_term_memories WHERE id NOT IN (SELECT id FROM long_term_memories ORDER BY created_at DESC LIMIT ?)"
    )
    .bind(limit)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(result.rows_affected())
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
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
    query: Option<String>,
    query_embedding: Option<Vec<f32>>,
    top_k: Option<usize>,
) -> Result<Vec<MemorySearchResult>, String> {
    let limit = top_k.unwrap_or(5);
    let query_text = query.unwrap_or_default();
    let mut vec_to_search: Vec<f32> = query_embedding.unwrap_or_default();

    if vec_to_search.is_empty() && !query_text.trim().is_empty() {
        if let Ok(embedder) = crate::rag::embeddings::Embedder::new() {
            if let Ok(vecs) = embedder.embed(vec![query_text.trim().to_string()]).await {
                if let Some(first_vec) = vecs.into_iter().next() {
                    vec_to_search = first_vec;
                }
            }
        }
    }

    if vec_to_search.is_empty() {
        let q_lower = query_text.to_lowercase();
        let query_sql = if q_lower.is_empty() {
            "SELECT * FROM long_term_memories ORDER BY created_at DESC LIMIT ?"
        } else {
            "SELECT * FROM long_term_memories WHERE LOWER(fact) LIKE ? OR LOWER(category) LIKE ? ORDER BY created_at DESC LIMIT ?"
        };

        let rows = if q_lower.is_empty() {
            sqlx::query_as::<_, LongTermMemory>(query_sql)
                .bind(limit as i64)
                .fetch_all(&*pool)
                .await
                .map_err(|e| e.to_string())?
        } else {
            let pattern = format!("%{}%", q_lower);
            sqlx::query_as::<_, LongTermMemory>(query_sql)
                .bind(&pattern)
                .bind(&pattern)
                .bind(limit as i64)
                .fetch_all(&*pool)
                .await
                .map_err(|e| e.to_string())?
        };

        let matched: Vec<MemorySearchResult> = rows
            .into_iter()
            .map(|m| MemorySearchResult {
                id: m.id,
                fact: m.fact,
                category: m.category,
                created_at: m.created_at,
                similarity: 1.0,
            })
            .collect();
        return Ok(matched);
    }

    let rows = sqlx::query_as::<_, LongTermMemory>(
        "SELECT * FROM long_term_memories ORDER BY created_at DESC LIMIT 1000"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut scored: Vec<MemorySearchResult> = rows
        .into_iter()
        .filter_map(|m| {
            let emb = decode_embedding(&m.embedding);
            let score = if !emb.is_empty() && emb.len() == vec_to_search.len() {
                cosine_similarity(&vec_to_search, &emb)
            } else if !query_text.is_empty() && m.fact.to_lowercase().contains(&query_text.to_lowercase()) {
                0.8
            } else {
                return None;
            };
            Some(MemorySearchResult {
                id: m.id,
                fact: m.fact,
                category: m.category,
                created_at: m.created_at,
                similarity: score,
            })
        })
        .collect();

    scored.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);
    Ok(scored)
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 { 0.0 } else { dot / (norm_a * norm_b) }
}

#[tauri::command]
pub async fn db_get_local_models(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<LocalModel>, String> {
    let models = sqlx::query_as::<_, LocalModel>(
        "SELECT * FROM local_models ORDER BY downloaded_at DESC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(models)
}

#[tauri::command]
pub async fn db_upsert_local_model(
    pool: State<'_, SqlitePool>,
    model: LocalModel,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO local_models (id, name, repo_id, filename, file_path, size_bytes, model_type, architecture, context_length, has_mmproj, downloaded_at, last_used_at, use_count, rating, is_favorite, tags, preset_config)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,
            repo_id=excluded.repo_id,
            filename=excluded.filename,
            file_path=excluded.file_path,
            size_bytes=excluded.size_bytes,
            model_type=excluded.model_type,
            architecture=excluded.architecture,
            context_length=excluded.context_length,
            has_mmproj=excluded.has_mmproj,
            downloaded_at=excluded.downloaded_at,
            last_used_at=excluded.last_used_at,
            use_count=excluded.use_count,
            rating=excluded.rating,
            is_favorite=excluded.is_favorite,
            tags=excluded.tags,
            preset_config=excluded.preset_config"
    )
    .bind(model.id)
    .bind(model.name)
    .bind(model.repo_id)
    .bind(model.filename)
    .bind(model.file_path)
    .bind(model.size_bytes)
    .bind(model.model_type)
    .bind(model.architecture)
    .bind(model.context_length)
    .bind(model.has_mmproj)
    .bind(model.downloaded_at)
    .bind(model.last_used_at)
    .bind(model.use_count)
    .bind(model.rating)
    .bind(model.is_favorite)
    .bind(model.tags)
    .bind(model.preset_config)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn db_update_model_preset(
    pool: State<'_, SqlitePool>,
    id: String,
    preset_config: String,
) -> Result<(), String> {
    sqlx::query("UPDATE local_models SET preset_config = ? WHERE id = ?")
        .bind(preset_config)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn db_update_model_metadata(
    pool: State<'_, SqlitePool>,
    id: String,
    rating: i32,
    is_favorite: i32,
    tags: String,
) -> Result<(), String> {
    sqlx::query("UPDATE local_models SET rating = ?, is_favorite = ?, tags = ? WHERE id = ?")
        .bind(rating)
        .bind(is_favorite)
        .bind(tags)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn db_delete_local_model(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<(), String> {
    sqlx::query("DELETE FROM local_models WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
