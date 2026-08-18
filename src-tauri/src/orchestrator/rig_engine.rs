// ─────────────────────────────────────────────────────────────────────────────
// NYX — Unified Rig-Core Lucifer Agent Engine (Qwen 2.5 1.5B GPU Embodiment)
// ─────────────────────────────────────────────────────────────────────────────
// The Qwen 2.5 1.5B model running 100% in GPU VRAM IS the Lucifer Agent.
// Unifies: Agentic RAG, TurboVec Vector Memory, Live Web Search, Media Engine,
// Model Fleet Management, Reflexion, and Code Engineering in a single runtime.

use std::sync::Arc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tracing::info;

use crate::llm::types::{StreamChunkPayload, UnifiedRequest, UnifiedMessage};
use crate::llm::local_orchestrator::SERVER_PORT;
use crate::rag::turbovec_store::TurbovecStore;

pub const DEFAULT_LOCAL_OPENAI_URL: &str = "http://127.0.0.1:8080/v1";
pub const DEFAULT_QWEN_MODEL_NAME: &str = "qwen2.5-1.5b-instruct";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RigEngineConfig {
    pub base_url: String,
    pub model_name: String,
    pub temperature: f64,
    pub max_tokens: u64,
    pub enable_gpu: bool,
}

impl Default for RigEngineConfig {
    fn default() -> Self {
        Self {
            base_url: DEFAULT_LOCAL_OPENAI_URL.to_string(),
            model_name: DEFAULT_QWEN_MODEL_NAME.to_string(),
            temperature: 0.7,
            max_tokens: 4096,
            enable_gpu: true,
        }
    }
}

/// The Embodied Lucifer Agent Engine powered by Qwen 2.5 1.5B on GPU
pub struct RigLuciferEngine {
    pub config: RigEngineConfig,
    pub client: reqwest::Client,
}

impl RigLuciferEngine {
    pub fn new(config: Option<RigEngineConfig>) -> Self {
        let cfg = config.unwrap_or_default();
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .tcp_nodelay(true)
            .build()
            .unwrap_or_default();

        Self {
            config: cfg,
            client,
        }
    }

    /// Ensures the GPU inference server is running and warm for Qwen 2.5 1.5B.
    pub async fn ensure_gpu_server_ready(&self, app: &AppHandle) -> Result<u16, String> {
        let active_port = SERVER_PORT.load(std::sync::atomic::Ordering::Relaxed);
        if active_port > 0 {
            let health_url = format!("http://127.0.0.1:{}/health", active_port);
            if let Ok(resp) = self.client.get(&health_url).send().await {
                if resp.status().is_success() {
                    return Ok(active_port);
                }
            }
        }

        // Auto-boot Qwen 2.5 1.5B with 100% GPU offload if not active
        if let Ok(app_dir) = app.path().app_data_dir() {
            let target_model = "qwen2.5-1.5b-instruct-q4_k_m.gguf".to_string();
            let model_path = app_dir.join("models").join(&target_model);
            if model_path.exists() {
                info!("[RigLuciferEngine] Auto-booting Lucifer Qwen 2.5 1.5B on GPU...");
                if let Some(manager) = app.try_state::<Arc<crate::llm::local_orchestrator::LlamaManager>>() {
                    let _ = crate::llm::local_orchestrator::start_local_server(
                        app.clone(),
                        manager,
                        target_model,
                        Some(8192),
                        Some(99), // 100% GPU VRAM offload
                        None,
                        Some(true),
                        None,
                        None,
                        Some(512),
                        None,
                        None,
                        None,
                        None,
                    ).await;
                }
            }
        }

        let port = SERVER_PORT.load(std::sync::atomic::Ordering::Relaxed);
        if port == 0 {
            return Err("Lucifer Qwen 2.5 1.5B model is not yet downloaded. Please run install-qwen-model.bat or use Settings.".to_string());
        }
        Ok(port)
    }

    /// Performs Deep Agentic RAG: queries TurboVec (LanceDB) & SQLite Memory for factual grounding.
    pub async fn retrieve_agentic_memory(&self, app: &AppHandle, query: &str) -> Vec<String> {
        let mut facts = Vec::new();
        let clean_q = query.trim();
        if clean_q.is_empty() || clean_q.len() < 10 {
            return facts;
        }

        // 1. Query TurboVec LanceDB semantic vector store
        if let Some(tv_store) = app.try_state::<Arc<TurbovecStore>>() {
            let tv_results = tv_store.search_memory(clean_q, 5).await;
            for (_id, text) in tv_results {
                let t = text.trim().to_string();
                if !t.is_empty() && !facts.contains(&t) {
                    facts.push(t);
                }
            }
        }

        // 2. Query SQLite memory facts
        let pool = app.state::<sqlx::SqlitePool>();
        let query_vector = match crate::rag::embeddings::Embedder::new() {
            Ok(embedder) => embedder.embed(vec![clean_q.to_string()]).await.ok().and_then(|mut v| v.pop()),
            Err(_) => None,
        };

        if let Ok(memories) = crate::commands::db::db_search_memories(pool, Some(clean_q.to_string()), query_vector, Some(4)).await {
            for m in memories {
                let fact = m.fact.trim().to_string();
                if !fact.is_empty() && !facts.contains(&fact) {
                    facts.push(fact);
                }
            }
        }

        facts
    }

    /// Formats messages with Lucifer's native persona and dynamic RAG grounding.
    pub fn build_agent_payload(
        &self,
        system_instruction: Option<&str>,
        messages: &[UnifiedMessage],
        rag_facts: &[String],
    ) -> Vec<Value> {
        let mut out = Vec::new();

        let mut sys_text = system_instruction.unwrap_or(
            "You are Lucifer, the autonomous executive AI intelligence of NYX powered directly by Qwen 2.5 1.5B on GPU."
        ).to_string();

        if !rag_facts.is_empty() {
            let memory_block = rag_facts.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n");
            sys_text.push_str(&format!(
                "\n\n<supplemental_background_memory label=\"TURBOVEC VECTOR RAG GROUNDING\">\n{}\n</supplemental_background_memory>",
                memory_block
            ));
        }

        out.push(json!({
            "role": "system",
            "content": sys_text
        }));

        for msg in messages {
            let content_str = match &msg.content {
                Value::String(s) => s.clone(),
                Value::Array(arr) => arr.iter()
                    .filter_map(|v| v.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>().join(" "),
                other => other.to_string(),
            };

            out.push(json!({
                "role": msg.role,
                "content": content_str
            }));
        }

        out
    }

    /// Executes an agent turn with Qwen 2.5 1.5B over local streaming SSE.
    pub async fn execute_turn(
        &self,
        app: AppHandle,
        request: UnifiedRequest,
        tx: tokio::sync::mpsc::UnboundedSender<StreamChunkPayload>,
    ) -> Result<(), String> {
        let port = self.ensure_gpu_server_ready(&app).await?;

        let last_user_text = request.messages.iter().rev()
            .find(|m| m.role == "user")
            .map(|m| match &m.content {
                Value::String(s) => s.clone(),
                Value::Array(arr) => arr.iter().filter_map(|v| v.get("text").and_then(|t| t.as_str())).collect::<Vec<_>>().join(" "),
                _ => String::new(),
            })
            .unwrap_or_default();

        // 1. Retrieve dynamic TurboVec RAG memory
        let rag_facts = self.retrieve_agentic_memory(&app, &last_user_text).await;

        let payload_messages = self.build_agent_payload(
            request.system_instruction.as_deref(),
            &request.messages,
            &rag_facts,
        );

        let request_body = json!({
            "model": self.config.model_name,
            "messages": payload_messages,
            "temperature": request.temperature.unwrap_or(self.config.temperature as f32),
            "max_tokens": request.max_tokens.map(|t| t as u64).unwrap_or(self.config.max_tokens),
            "stream": true,
            "stop": ["<|im_end|>", "<|endoftext|>", "\nUser:"]
        });

        let endpoint = format!("http://127.0.0.1:{}/v1/chat/completions", port);
        let resp = self.client.post(&endpoint)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Lucifer GPU Engine: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!("Lucifer GPU Engine returned HTTP {}: {}", status, err_body));
        }

        use futures_util::StreamExt;
        let mut byte_stream = resp.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk_res) = byte_stream.next().await {
            let chunk = match chunk_res {
                Ok(bytes) => bytes,
                Err(e) => {
                    let _ = tx.send(StreamChunkPayload::error(format!("Stream error: {}", e)));
                    return Err(e.to_string());
                }
            };

            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(line_end) = buffer.find('\n') {
                let line = buffer[..line_end].trim().to_string();
                buffer.drain(..=line_end);

                if line.is_empty() || line.starts_with(':') {
                    continue;
                }

                if line.starts_with("data: ") {
                    let json_data = line.trim_start_matches("data: ").trim();
                    if json_data == "[DONE]" {
                        let _ = tx.send(StreamChunkPayload::done());
                        return Ok(());
                    }

                    if let Ok(parsed) = serde_json::from_str::<Value>(json_data) {
                        if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
                            if let Some(first_choice) = choices.first() {
                                if let Some(delta) = first_choice.get("delta") {
                                    if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                        if !content.is_empty() {
                                            let _ = tx.send(StreamChunkPayload::text(content.to_string()));
                                        }
                                    }
                                    if let Some(reasoning) = delta.get("reasoning_content").and_then(|c| c.as_str()) {
                                        if !reasoning.is_empty() {
                                            let _ = tx.send(StreamChunkPayload::thinking(reasoning.to_string()));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let _ = tx.send(StreamChunkPayload::done());
        Ok(())
    }
}
