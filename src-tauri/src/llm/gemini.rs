use crate::llm::provider::{LlmProvider, Message};
use anyhow::Result;
use async_trait::async_trait;
use reqwest::Client;
use serde_json::json;

pub struct GeminiProvider {
    pub api_key: String,
    pub model: String,
    pub client: Client,
}

impl GeminiProvider {
    pub fn new(api_key: String, model: Option<String>) -> Self {
        Self {
            api_key,
            model: model.unwrap_or_default(),
            client: Client::new(),
        }
    }
}

#[async_trait]
impl LlmProvider for GeminiProvider {
    async fn generate(&self, messages: &[Message]) -> Result<String> {
        let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}", self.model, self.api_key);
        
        let contents: Vec<serde_json::Value> = messages.iter().map(|m| {
            let role = if m.role == "user" { "user" } else { "model" };
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

    async fn generate_stream(&self, _messages: &[Message]) -> Result<tokio::sync::mpsc::Receiver<String>> {
        let (tx, rx) = tokio::sync::mpsc::channel(100);
        let _ = tx.send("Gemini streaming is mocked for now".to_string()).await;
        Ok(rx)
    }
}
