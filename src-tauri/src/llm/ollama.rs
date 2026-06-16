use crate::llm::provider::{LlmProvider, Message};
use anyhow::Result;
use async_trait::async_trait;
use reqwest::Client;
use serde_json::json;

pub struct OllamaProvider {
    pub base_url: String,
    pub model: String,
    pub client: Client,
}

impl OllamaProvider {
    pub fn new(base_url: Option<String>, model: String) -> Self {
        Self {
            base_url: base_url.unwrap_or_else(|| "http://localhost:11434".to_string()),
            model,
            client: Client::new(),
        }
    }
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    async fn generate(&self, messages: &[Message]) -> Result<String> {
        let url = format!("{}/api/chat", self.base_url);
        
        let body = json!({
            "model": self.model,
            "messages": messages,
            "stream": false
        });

        let res = self.client.post(&url)
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json::<serde_json::Value>()
            .await?;
            
        let text = res["message"]["content"].as_str().unwrap_or("").to_string();
        Ok(text)
    }

    async fn generate_stream(&self, _messages: &[Message]) -> Result<tokio::sync::mpsc::Receiver<String>> {
        let (tx, rx) = tokio::sync::mpsc::channel(100);
        let _ = tx.send("Ollama streaming is mocked for now".to_string()).await;
        Ok(rx)
    }
}
