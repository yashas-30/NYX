use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn generate(&self, messages: &[Message]) -> anyhow::Result<String>;
    async fn generate_stream(&self, messages: &[Message]) -> anyhow::Result<tokio::sync::mpsc::Receiver<String>>;
}
