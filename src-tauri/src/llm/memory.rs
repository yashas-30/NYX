/// Memory injection and dataset logging for the embedded LLM.
///
/// # Memory Injection
/// Reads `long_term_memories` from the SQLite pool and prepends them to every
/// embedded model system prompt. This gives the embedded Qwen model persistent
/// knowledge of user preferences, project facts, and past decisions without
/// any retraining.
///
/// # Dataset Logging
/// After every successful embedded inference, the (prompt, response) pair is
/// appended to a JSONL file at `.nyx-models/training/interactions.jsonl`.
/// This file accumulates a supervised fine-tuning dataset that can be used with
/// `llama-finetune` (LoRA) once enough data is collected.
use anyhow::Result;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;

// ── Memory types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryFact {
    pub id: String,
    pub fact: String,
    pub category: String,
    pub created_at: i64,
}

// ── Memory retrieval ──────────────────────────────────────────────────────────

/// Fetches the N most-recent long-term memory facts from SQLite.
/// Returns an empty vec if the pool is unavailable or the table doesn't exist.
pub async fn fetch_memories(pool: &sqlx::SqlitePool, limit: i64) -> Vec<MemoryFact> {
    let rows: Vec<(String, String, String, i64)> = sqlx::query_as(
        "SELECT id, fact, category, created_at FROM long_term_memories ORDER BY created_at DESC LIMIT ?"
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    rows.into_iter().map(|(id, fact, category, created_at)| MemoryFact {
        id, fact, category, created_at,
    }).collect()
}

/// Saves a new long-term memory fact to SQLite.
pub async fn save_memory(pool: &sqlx::SqlitePool, fact: &str, category: &str) -> Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        "INSERT OR IGNORE INTO long_term_memories (id, fact, category, embedding, created_at) VALUES (?, ?, ?, '[]', ?)"
    )
    .bind(&id)
    .bind(fact)
    .bind(category)
    .bind(now)
    .execute(pool)
    .await?;
    Ok(())
}

/// Builds the persistent memory block to prepend to every embedded system prompt.
/// Returns an empty string if there are no memories.
pub async fn build_memory_injection(pool: &sqlx::SqlitePool) -> String {
    let facts = fetch_memories(pool, 30).await;
    if facts.is_empty() {
        return String::new();
    }

    let mut block = String::from(
        "\n\n=== YOUR PERSISTENT LONG-TERM MEMORY ===\n\
         The following facts were extracted from your previous conversations.\n\
         Use them to give personalised, context-aware responses:\n",
    );

    // Group by category
    for cat in &["user_preference", "project_fact", "decision", "summary"] {
        let group: Vec<_> = facts.iter().filter(|f| f.category == *cat).collect();
        if !group.is_empty() {
            let label = match *cat {
                "user_preference" => "User Preferences",
                "project_fact"    => "Project Facts",
                "decision"        => "Key Decisions",
                "summary"         => "Recent Accomplishments",
                _                 => "Other",
            };
            block.push_str(&format!("\n[{label}]:\n"));
            for f in group {
                block.push_str(&format!("• {}\n", f.fact));
            }
        }
    }
    block.push_str("=========================================\n\n");
    block
}

// ── Memory extractor (runs after each response) ───────────────────────────────

/// Calls the embedded model itself (non-streaming) to extract semantic memories
/// from the completed (user_prompt, assistant_response) pair.
/// Fires-and-forgets — any failure is logged and ignored.
pub fn spawn_memory_extraction(
    pool: sqlx::SqlitePool,
    user_prompt: String,
    assistant_response: String,
) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = extract_and_save_memories(pool, user_prompt, assistant_response).await {
            tracing::warn!("Memory extraction failed (non-fatal): {}", e);
        }
    });
}

async fn extract_and_save_memories(
    pool: sqlx::SqlitePool,
    user_prompt: String,
    assistant_response: String,
) -> Result<()> {
    use reqwest::Client;

    // Only run if embedded model is ready (avoids a chicken-and-egg at first launch)
    if !crate::llm::embedded::is_embedded_ready().await {
        return Ok(());
    }

    let system = "You are a semantic memory extractor. Given a conversation turn, \
        output ONLY a JSON object with a \"memories\" array. Each item has \"fact\" \
        (string, concise statement) and \"category\" \
        (\"user_preference\" | \"project_fact\" | \"decision\" | \"summary\"). \
        Omit pleasantries and generic content. If nothing notable, return {\"memories\":[]}";

    let user_content = format!(
        "[USER]: {}\n\n[ASSISTANT]: {}",
        &user_prompt[..user_prompt.len().min(800)],
        &assistant_response[..assistant_response.len().min(800)]
    );

    let body = serde_json::json!({
        "model": "local-model",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content}
        ],
        "stream": false,
        "temperature": 0.1,
        "max_tokens": 512,
    });

    let port = crate::llm::embedded::EMBEDDED_PORT;
    let res = Client::new()
        .post(&format!("http://127.0.0.1:{}/v1/chat/completions", port))
        .json(&body)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await?;

    let data: serde_json::Value = res.json().await?;
    let text = data["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // Parse the JSON response
    if let Some(json_str) = text.find('{').and_then(|s| {
        let sub = &text[s..];
        sub.rfind('}').map(|e| &sub[..=e])
    }) {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
            if let Some(arr) = parsed["memories"].as_array() {
                for item in arr {
                    let fact = item["fact"].as_str().unwrap_or("").trim().to_string();
                    let category = item["category"].as_str().unwrap_or("summary").trim().to_string();
                    if !fact.is_empty() {
                        let _ = save_memory(&pool, &fact, &category).await;
                        tracing::info!("[Memory] Saved: [{category}] {fact}");
                    }
                }
            }
        }
    }

    Ok(())
}

// ── Dataset logger ────────────────────────────────────────────────────────────

/// JSONL record format compatible with llama.cpp's fine-tuning input format.
#[derive(Serialize)]
struct TrainingRecord {
    instruction: String,
    response: String,
    timestamp: i64,
}

/// Appends a completed (user_prompt → assistant_response) pair to the JSONL
/// training dataset. The file grows incrementally and can be used directly
/// with llama-finetune for LoRA adaptation.
pub async fn log_training_example(user_prompt: &str, assistant_response: &str) {
    let training_dir = crate::llm::embedded::nyx_models_dir()
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .join("training");

    if let Err(e) = tokio::fs::create_dir_all(&training_dir).await {
        tracing::warn!("Cannot create training dir: {}", e);
        return;
    }

    let file_path = training_dir.join("interactions.jsonl");
    let record = TrainingRecord {
        instruction: user_prompt.to_string(),
        response: assistant_response.to_string(),
        timestamp: chrono::Utc::now().timestamp(),
    };

    let line = match serde_json::to_string(&record) {
        Ok(s) => format!("{}\n", s),
        Err(_) => return,
    };

    if let Ok(mut file) = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file_path)
        .await
    {
        let _ = file.write_all(line.as_bytes()).await;
    }
}

/// Returns the number of training examples logged so far.
pub async fn training_example_count() -> u64 {
    let path = crate::llm::embedded::nyx_models_dir()
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .join("training")
        .join("interactions.jsonl");
    if let Ok(meta) = tokio::fs::metadata(&path).await {
        // Approximate: count newlines via file size / avg record size
        meta.len() / 200
    } else {
        0
    }
}

/// Helper just to keep the counter abstraction clean (though finetune renames the file directly)
pub async fn reset_training_example_count() {
    // Already handled by the file rename in llm_embedded_finetune
}
