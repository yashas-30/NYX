use std::path::PathBuf;
use crate::rag::lancedb_store::LanceDbStore;
use crate::commands::db::ChatMessagePayload;

/// High-performance vector memory store bridging chat and coder RAG spaces.
#[derive(Clone)]
pub struct TurbovecStore {
    pub inner: LanceDbStore,
    pub db_path: PathBuf,
    pub mode: String,
}

impl TurbovecStore {
    pub async fn new(app_data_dir: &PathBuf, mode: &str) -> Self {
        let db_name = match mode {
            "coder" => "coder_rag.lance",
            _ => "chat_rag.lance",
        };
        let db_path = app_data_dir.join(db_name);
        let inner = LanceDbStore::new();
        let _ = inner.init(&db_path.to_string_lossy()).await;

        Self {
            inner,
            db_path,
            mode: mode.to_string(),
        }
    }
    
    pub async fn add_memory(&self, text: &str) {
        self.add_memory_with_meta(text, &format!("memory-{}", self.mode)).await;
    }

    pub async fn add_memory_with_meta(&self, text: &str, metadata: &str) {
        let doc_id = uuid::Uuid::new_v4().to_string();
        if let Ok(embedder) = crate::rag::embeddings::Embedder::new() {
            if let Ok(vecs) = embedder.embed(vec![text.to_string()]).await {
                if let Some(vector) = vecs.into_iter().next() {
                    let _ = self.inner.insert(doc_id, text.to_string(), vector, metadata.to_string()).await;
                }
            }
        }
    }

    /// Stores a scraped web document into LanceDB vector memory for model context and future retrieval
    pub async fn add_scraped_document(&self, url: &str, title: &str, content: &str) {
        let clean_content = content.trim();
        if clean_content.len() < 50 {
            return;
        }

        const CHUNK_SIZE: usize = 1500;
        let chars: Vec<char> = clean_content.chars().collect();
        let total = chars.len();
        let mut start = 0;
        let mut chunk_idx = 1;

        while start < total {
            let end = usize::min(start + CHUNK_SIZE, total);
            let chunk: String = chars[start..end].iter().collect();

            let structured = format!(
                "### Web Source: \"{}\" ({}) [Part {}]\n{}",
                title, url, chunk_idx, chunk
            );
            let meta = format!("web_scrape|url:{}|title:{}|chunk:{}", url, title, chunk_idx);

            self.add_memory_with_meta(&structured, &meta).await;

            if end >= total {
                break;
            }
            start += CHUNK_SIZE.saturating_sub(200);
            chunk_idx += 1;
        }
    }

    /// Stores a single structured conversation turn (User Prompt + Model Response) into vector memory.
    pub async fn add_structured_turn(
        &self,
        session_id: &str,
        session_title: &str,
        turn_index: usize,
        user_prompt: &str,
        assistant_response: &str,
        model: &str,
        timestamp: i64,
    ) {
        let user_text = user_prompt.trim();
        let assistant_text = assistant_response.trim();
        if user_text.is_empty() && assistant_text.is_empty() {
            return;
        }

        let title_clean = if session_title.trim().is_empty() { "Untitled Session" } else { session_title.trim() };
        let model_clean = if model.trim().is_empty() { "default" } else { model.trim() };

        // If the assistant response is large (> 1500 chars), split it into contextual chunks with the user prompt header
        const MAX_CHUNK_LEN: usize = 1500;
        if assistant_text.len() > MAX_CHUNK_LEN {
            let response_chars: Vec<char> = assistant_text.chars().collect();
            let mut start = 0;
            let total = response_chars.len();
            let mut chunk_idx = 1;

            while start < total {
                let end = usize::min(start + MAX_CHUNK_LEN, total);
                let part: String = response_chars[start..end].iter().collect();

                let structured_text = format!(
                    "### Conversation: \"{}\" [Session: {} | Turn #{}.{} | Model: {}]\n**User Prompt**:\n{}\n\n**Assistant Response (Part {})**:\n{}",
                    title_clean, session_id, turn_index, chunk_idx, model_clean, user_text, chunk_idx, part
                );

                let meta = format!(
                    "chat_turn|session_id:{}|title:{}|turn:{}.{}|model:{}|ts:{}",
                    session_id, title_clean, turn_index, chunk_idx, model_clean, timestamp
                );

                self.add_memory_with_meta(&structured_text, &meta).await;

                if end >= total {
                    break;
                }
                start += MAX_CHUNK_LEN.saturating_sub(200); // 200 chars overlap
                chunk_idx += 1;
            }
        } else {
            let structured_text = format!(
                "### Conversation: \"{}\" [Session: {} | Turn #{} | Model: {}]\n**User Prompt**:\n{}\n\n**Assistant Response**:\n{}",
                title_clean, session_id, turn_index, model_clean, user_text, assistant_text
            );

            let meta = format!(
                "chat_turn|session_id:{}|title:{}|turn:{}|model:{}|ts:{}",
                session_id, title_clean, turn_index, model_clean, timestamp
            );

            self.add_memory_with_meta(&structured_text, &meta).await;
        }
    }

    /// Iterates through ALL messages across an entire chat session, organizes them into
    /// structured prompt-response dialogue turns, and indexes every turn into TurboVec vector memory.
    pub async fn sync_session_messages(
        &self,
        session_id: &str,
        session_title: &str,
        messages: &[ChatMessagePayload],
    ) {
        if messages.is_empty() {
            return;
        }

        let now = chrono::Utc::now().timestamp();
        let mut turn_index = 1;
        let mut i = 0;

        while i < messages.len() {
            let msg = &messages[i];
            let role = msg.role.to_lowercase();

            if role == "user" {
                let user_prompt = msg.content.clone();
                let user_ts = msg.timestamp.unwrap_or(now);
                let model_name = msg.model.clone().unwrap_or_else(|| "default".to_string());

                // Check if the next message is the corresponding assistant response
                if i + 1 < messages.len() && messages[i + 1].role.to_lowercase() == "assistant" {
                    let assistant_msg = &messages[i + 1];
                    let assistant_response = assistant_msg.content.clone();
                    let effective_model = assistant_msg.model.clone().unwrap_or(model_name);

                    self.add_structured_turn(
                        session_id,
                        session_title,
                        turn_index,
                        &user_prompt,
                        &assistant_response,
                        &effective_model,
                        user_ts,
                    ).await;

                    turn_index += 1;
                    i += 2;
                } else {
                    // Standalone user prompt without response yet
                    let title_clean = if session_title.trim().is_empty() { "Untitled Session" } else { session_title.trim() };
                    let structured_text = format!(
                        "### Conversation: \"{}\" [Session: {} | Turn #{} (User Query)]\n**User Prompt**:\n{}",
                        title_clean, session_id, turn_index, user_prompt.trim()
                    );
                    let meta = format!(
                        "chat_prompt|session_id:{}|title:{}|turn:{}|model:{}|ts:{}",
                        session_id, title_clean, turn_index, model_name, user_ts
                    );
                    self.add_memory_with_meta(&structured_text, &meta).await;

                    turn_index += 1;
                    i += 1;
                }
            } else if role == "assistant" {
                // Standalone assistant message
                let title_clean = if session_title.trim().is_empty() { "Untitled Session" } else { session_title.trim() };
                let model_name = msg.model.clone().unwrap_or_else(|| "default".to_string());
                let ts = msg.timestamp.unwrap_or(now);

                let structured_text = format!(
                    "### Conversation: \"{}\" [Session: {} | Turn #{} (Assistant Output)]\n**Assistant ({})**:\n{}",
                    title_clean, session_id, turn_index, model_name, msg.content.trim()
                );
                let meta = format!(
                    "chat_response|session_id:{}|title:{}|turn:{}|model:{}|ts:{}",
                    session_id, title_clean, turn_index, model_name, ts
                );
                self.add_memory_with_meta(&structured_text, &meta).await;

                turn_index += 1;
                i += 1;
            } else {
                i += 1;
            }
        }
    }

    /// Chunks large documents (e.g. scraped webpages or full session logs) into ~1000 char segments
    /// with overlapping context and stores each chunk into LanceDB with metadata tags.
    pub async fn add_document_chunks(&self, full_text: &str, metadata_tag: &str) {
        let text = full_text.trim();
        if text.is_empty() {
            return;
        }

        const CHUNK_SIZE: usize = 1000;
        const OVERLAP: usize = 200;

        let chars: Vec<char> = text.chars().collect();
        let mut start = 0;
        let total = chars.len();

        let mut chunks = Vec::new();
        while start < total {
            let end = usize::min(start + CHUNK_SIZE, total);
            let chunk_str: String = chars[start..end].iter().collect();
            if chunk_str.trim().len() >= 30 {
                chunks.push(chunk_str);
            }
            if end >= total {
                break;
            }
            start += CHUNK_SIZE.saturating_sub(OVERLAP);
        }

        if chunks.is_empty() {
            return;
        }

        if let Ok(embedder) = crate::rag::embeddings::Embedder::new() {
            if let Ok(vecs) = embedder.embed(chunks.clone()).await {
                for (chunk_text, vector) in chunks.into_iter().zip(vecs.into_iter()) {
                    let doc_id = uuid::Uuid::new_v4().to_string();
                    let _ = self.inner.insert(doc_id, chunk_text, vector, metadata_tag.to_string()).await;
                }
            }
        }
    }

    pub async fn search_memory(&self, query: &str, limit: usize) -> Vec<(String, String)> {
        if let Ok(embedder) = crate::rag::embeddings::Embedder::new() {
            if let Ok(vecs) = embedder.embed(vec![query.to_string()]).await {
                if let Some(vector) = vecs.into_iter().next() {
                    if let Ok(results) = self.inner.search_hybrid(query, vector, limit).await {
                        return results;
                    }
                }
            }
        }
        Vec::new()
    }

    /// Search past chat conversations and prompt-response pairs matching a query.
    pub async fn search_chat_memory(&self, query: &str, limit: usize) -> Vec<(String, String, String)> {
        let raw_results = self.search_memory(query, limit * 2).await;
        let mut chat_results = Vec::new();

        for (doc_id, text) in raw_results {
            if text.contains("Conversation:") || text.contains("User Prompt") || text.contains("Assistant Response") {
                chat_results.push((doc_id, text, "chat_dialogue".to_string()));
                if chat_results.len() >= limit {
                    break;
                }
            }
        }

        chat_results
    }

    /// Store a generated image asset in TurboVec vector memory with rich prompt IR metadata
    pub async fn add_image_memory(&self, prompt: &str, image_path: &str, aspect_ratio: &str, engine: &str, seed: Option<u64>) {
        let meta = format!("image_gen|path:{}|ratio:{}|engine:{}|seed:{}", 
            image_path, 
            aspect_ratio, 
            engine, 
            seed.map(|s| s.to_string()).unwrap_or_else(|| "random".to_string())
        );
        let memory_text = format!("Image Generation Asset: prompt='{}', path='{}', aspect_ratio='{}', engine='{}'", prompt, image_path, aspect_ratio, engine);
        self.add_memory_with_meta(&memory_text, &meta).await;
    }

    /// Search visual memories matching a semantic query
    pub async fn search_image_memory(&self, query: &str, limit: usize) -> Vec<(String, String, String)> {
        let mut results = Vec::new();
        let memories = self.search_memory(&format!("Image Generation Asset: {}", query), limit).await;
        for (doc_id, text) in memories {
            if text.contains("Image Generation Asset:") {
                results.push((doc_id, text.clone(), "image_asset".to_string()));
            }
        }
        results
    }
}



