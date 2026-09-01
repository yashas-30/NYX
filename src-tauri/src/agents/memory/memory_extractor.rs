// src-tauri/src/agents/memory_extractor.rs
//
// Phase 2: Multi-Tier Memory — Post-Session Extraction
//
// After every complex agent task completes, this module:
//  1. Calls a fast LLM to summarize the session and extract entities
//  2. Embeds the summary and stores it in `episodic_memories`
//  3. Upserts named entities into `memory_entities`
//
// Designed to run as a fire-and-forget background task via tokio::spawn.

use anyhow::{anyhow, Result};
use genai::chat::{ChatMessage, ChatRequest};
use genai::Client;
use sqlx::SqlitePool;
use tracing::{info, warn};

const EXTRACTION_PROMPT: &str = r#"You are a memory extraction assistant. Analyze this conversation and respond with valid JSON only.

Extract:
1. A concise 2-3 sentence summary of what was accomplished
2. Key entities (people, projects, technologies, preferences) mentioned

Respond ONLY with this JSON structure (no markdown, no explanation):
{
  "summary": "2-3 sentence summary here",
  "entities": [
    {"name": "entity name", "type": "technology|project|person|preference", "description": "brief description"}
  ],
  "key_topics": ["topic1", "topic2"]
}

Conversation:
"#;

/// Input message for extraction — mirrors the format used by the orchestrator.
#[derive(Debug, Clone)]
pub struct MessageSnapshot {
    pub role: String,
    pub content: String,
}

/// Main entry point. Called after a complex task succeeds.
/// Runs the extraction LLM call, embeds the summary, writes to DB.
pub async fn extract_and_store(
    pool: &SqlitePool,
    session_id: &str,
    messages: &[MessageSnapshot],
    api_key: &str,
    model: &str,
) -> Result<()> {
    // Only extract if we have a meaningful conversation (>= 2 exchanges)
    let user_messages = messages.iter().filter(|m| m.role == "user").count();
    if user_messages < 2 {
        return Ok(());
    }

    // Build conversation text for the extraction prompt
    let conversation_text = messages
        .iter()
        .map(|m| format!("[{}]: {}", m.role.to_uppercase(), &m.content[..m.content.len().min(1000)]))
        .collect::<Vec<_>>()
        .join("\n\n");

    let full_prompt = format!("{}{}", EXTRACTION_PROMPT, conversation_text);

    let mut summary = String::new();
    let mut key_topics = "[]".to_string();
    let mut entities: Vec<serde_json::Value> = Vec::new();

    // Check environment for API key if empty
    let effective_key = if !api_key.is_empty() {
        api_key.to_string()
    } else {
        std::env::var("GEMINI_API_KEY")
            .or_else(|_| std::env::var("OPENAI_API_KEY"))
            .or_else(|_| std::env::var("ANTHROPIC_API_KEY"))
            .unwrap_or_default()
    };

    if !effective_key.is_empty() {
        let extraction_model = if model.contains("flash") || model.contains("mini") || model.contains("haiku") {
            model.to_string()
        } else {
            "gemini-3.5-flash-lite".to_string()
        };

        let client = Client::builder().build();
        let chat_req = ChatRequest::new(vec![
            ChatMessage::system("You are a memory extraction assistant. Respond with JSON only."),
            ChatMessage::user(&full_prompt),
        ]);

        if let Ok(response) = client.exec_chat(&extraction_model, chat_req, None).await {
            if let Some(raw_json) = response.content_text_into_string() {
                let json_str = raw_json
                    .trim()
                    .trim_start_matches("```json")
                    .trim_start_matches("```")
                    .trim_end_matches("```")
                    .trim();

                if let Ok(extracted) = serde_json::from_str::<serde_json::Value>(json_str) {
                    summary = extracted["summary"].as_str().unwrap_or("").to_string();
                    key_topics = extracted["key_topics"].to_string();
                    entities = extracted["entities"].as_array().cloned().unwrap_or_default();
                }
            }
        }
    }

    // Heuristic fallback if LLM extraction failed or no key available
    if summary.is_empty() {
        let first_user = messages.iter().find(|m| m.role == "user").map(|m| m.content.as_str()).unwrap_or("");
        let first_assistant = messages.iter().find(|m| m.role == "assistant").map(|m| m.content.as_str()).unwrap_or("");

        let u_snippet = if first_user.len() > 120 { &first_user[..120] } else { first_user };
        let a_snippet = if first_assistant.len() > 120 { &first_assistant[..120] } else { first_assistant };

        summary = format!("Session Task: {} | Outcome: {}", u_snippet.trim(), a_snippet.trim());

        // Extract key topics & technologies heuristically
        let mut detected_topics: Vec<String> = Vec::new();
        let mut detected_entities: Vec<serde_json::Value> = Vec::new();

        let known_techs = [
            ("Rust", "technology", "System programming language"),
            ("React", "technology", "Frontend UI library"),
            ("TypeScript", "technology", "Typed JavaScript language"),
            ("Python", "technology", "Data science & AI language"),
            ("SQLite", "technology", "Embedded database engine"),
            ("Tauri", "technology", "Desktop application framework"),
            ("Vite", "technology", "Frontend build tool"),
            ("Docker", "technology", "Containerization platform"),
            ("GraphQL", "technology", "API query language"),
            ("REST API", "technology", "Web API architecture"),
        ];

        let combined_text = conversation_text.to_lowercase();
        for (tech, category, desc) in known_techs {
            if combined_text.contains(&tech.to_lowercase()) {
                detected_topics.push(tech.to_lowercase());
                detected_entities.push(serde_json::json!({
                    "name": tech,
                    "type": category,
                    "description": desc
                }));
            }
        }

        key_topics = serde_json::to_string(&detected_topics).unwrap_or_else(|_| "[]".to_string());
        entities = detected_entities;
    }

    if summary.is_empty() {
        warn!("[MemoryExtractor] Empty summary from extraction, skipping");
        return Ok(());
    }

    // Embed the summary for semantic retrieval
    let embedder = crate::rag::embeddings::Embedder::new()
        .map_err(|e| anyhow!("Failed to create embedder: {}", e))?;
    let embeddings = embedder.embed(vec![summary.clone()]).await
        .map_err(|e| anyhow!("Embedding failed: {}", e))?;
    // Fix #8: encode as LE-f32 BLOB bytes, not JSON string.
    let emb_blob = crate::db::models::encode_embedding(&embeddings[0]);

    // Store episodic memory
    let episodic_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    sqlx::query(
        "INSERT INTO episodic_memories (id, session_id, summary, embedding, key_topics, created_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&episodic_id)
    .bind(session_id)
    .bind(&summary)
    .bind(&emb_blob)
    .bind(&key_topics)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| anyhow!("Failed to store episodic memory: {}", e))?;

    info!("[MemoryExtractor] Stored episodic memory {} for session {}", episodic_id, session_id);

    // Upsert entities
    for entity in &entities {
        let name = match entity["name"].as_str() {
            Some(n) if !n.is_empty() => n,
            _ => continue,
        };
        let entity_type = entity["type"].as_str().unwrap_or("technology");
        let description = entity["description"].as_str().unwrap_or("");

        let entity_id = uuid::Uuid::new_v4().to_string();

        // Upsert: if same name+type exists, update description and last_seen
        sqlx::query(
            r#"INSERT INTO memory_entities (id, entity_name, entity_type, description, confidence, last_seen, created_at)
               VALUES (?, ?, ?, ?, 1.0, ?, ?)
               ON CONFLICT(entity_name, entity_type) DO UPDATE SET
                   description = excluded.description,
                   confidence = MIN(confidence + 0.1, 1.0),
                   last_seen = excluded.last_seen"#,
        )
        .bind(&entity_id)
        .bind(name)
        .bind(entity_type)
        .bind(description)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await
        .ok(); // Best-effort — don't fail extraction if one entity upsert fails
    }

    info!(
        "[MemoryExtractor] Upserted {} entities for session {}",
        entities.len(),
        session_id
    );

    Ok(())
}

/// Query episodic memories by semantic similarity to a query embedding.
/// Returns (session_id, summary, key_topics, score) tuples.
pub async fn search_episodic(
    pool: &SqlitePool,
    query_embedding: &[f32],
    top_k: usize,
) -> Result<Vec<(String, String, String, f32)>> {
    let all_episodes = sqlx::query_as::<_, crate::db::models::EpisodicMemory>(
        "SELECT * FROM episodic_memories ORDER BY created_at DESC LIMIT 50",
    )
    .fetch_all(pool)
    .await?;

    let mut scored: Vec<(String, String, String, f32)> = all_episodes
        .into_iter()
        .filter_map(|ep| {
            // Fix #8: decode LE-f32 BLOB instead of parsing JSON.
            let emb = crate::db::models::decode_embedding(&ep.embedding);
            if emb.is_empty() { return None; }
            let score = cosine_similarity(query_embedding, &emb);
            Some((ep.session_id, ep.summary, ep.key_topics, score))
        })
        .collect();

    scored.sort_by(|a, b| b.3.partial_cmp(&a.3).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(top_k);
    Ok(scored)
}

/// Keyword-based entity search — used for quick context injection.
pub async fn search_entities_by_keyword(
    pool: &SqlitePool,
    keywords: &[&str],
) -> Result<Vec<crate::db::models::MemoryEntity>> {
    // Build a WHERE clause for LIKE matching
    if keywords.is_empty() {
        return Ok(vec![]);
    }

    // Simple approach: fetch recent entities and filter in Rust
    let entities = sqlx::query_as::<_, crate::db::models::MemoryEntity>(
        "SELECT * FROM memory_entities ORDER BY last_seen DESC LIMIT 100",
    )
    .fetch_all(pool)
    .await?;

    let matched: Vec<_> = entities
        .into_iter()
        .filter(|e| {
            let name_lower = e.entity_name.to_lowercase();
            let desc_lower = e.description.to_lowercase();
            keywords.iter().any(|kw| {
                let kw_lower = kw.to_lowercase();
                name_lower.contains(&kw_lower) || desc_lower.contains(&kw_lower)
            })
        })
        .collect();

    Ok(matched)
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if na == 0.0 || nb == 0.0 { 0.0 } else { dot / (na * nb) }
}
