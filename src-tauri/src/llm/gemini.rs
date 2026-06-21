use crate::llm::provider::{LlmProvider, Message};
use anyhow::Result;
use async_trait::async_trait;
use reqwest::Client;
use serde_json::json;
use eventsource_stream::Eventsource;
use futures_util::stream::StreamExt;

pub struct GeminiProvider {
    pub api_key: String,
    pub model: String,
    pub client: Client,
}

impl GeminiProvider {
    pub fn new(api_key: String, model: Option<String>) -> Self {
        Self {
            api_key,
            model: model.unwrap_or_else(|| "gemini-1.5-pro".to_string()),
            client: Client::new(),
        }
    }
}

#[async_trait]
impl LlmProvider for GeminiProvider {
    async fn generate(&self, messages: &[Message]) -> Result<String> {
        let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}", self.model, self.api_key);
        
        let contents: Vec<serde_json::Value> = messages.iter().map(|m| {
            let role = if m.role == "user" || m.role == "system" { "user" } else { "model" };
            json!({
                "role": role,
                "parts": [{"text": &m.content}]
            })
        }).collect();
        
        let body = json!({ "contents": contents });

        let res = self.client.post(&url)
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json::<serde_json::Value>()
            .await?;
            
        let text = res["candidates"][0]["content"]["parts"][0]["text"].as_str().unwrap_or("").to_string();
        Ok(text)
    }

    async fn generate_stream(&self, messages: &[Message]) -> Result<tokio::sync::mpsc::Receiver<String>> {
        let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?key={}&alt=sse", self.model, self.api_key);
        
        let contents: Vec<serde_json::Value> = messages.iter().map(|m| {
            let role = if m.role == "user" || m.role == "system" { "user" } else { "model" };
            json!({
                "role": role,
                "parts": [{"text": &m.content}]
            })
        }).collect();
        
        let body = json!({ "contents": contents });

        let res = self.client.post(&url)
            .json(&body)
            .send()
            .await?
            .error_for_status()?;

        let (tx, rx) = tokio::sync::mpsc::channel(100);
        let mut stream = res.bytes_stream().eventsource();
        
        tokio::spawn(async move {
            while let Some(event) = stream.next().await {
                match event {
                    Ok(ev) => {
                        if ev.data == "[DONE]" {
                            break;
                        }
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&ev.data) {
                            if let Some(candidates) = json.get("candidates") {
                                if let Some(candidate) = candidates.get(0) {
                                    if let Some(content) = candidate.get("content") {
                                        if let Some(parts) = content.get("parts") {
                                            if let Some(part) = parts.get(0) {
                                                if let Some(text) = part.get("text") {
                                                    if let Some(s) = text.as_str() {
                                                        let _ = tx.send(s.to_string()).await;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!("Gemini SSE stream error: {}", e);
                        break;
                    }
                }
            }
        });
        
        Ok(rx)
    }
}
