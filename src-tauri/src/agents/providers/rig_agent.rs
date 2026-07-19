use rig::{
    completion::Prompt,
    providers::openai::Client,
};
use rig::client::CompletionClient;

pub struct RigAgent {
    pub model_name: String,
    pub api_key: String,
}

impl RigAgent {
    pub fn new(model_name: String, api_key: String) -> Self {
        Self { model_name, api_key }
    }

    pub async fn execute(&self, prompt: &str, context: &str) -> Result<String, String> {
        let system_prompt = format!(
            "You are a Rig-powered AI Assistant within NYX.\n\nContext Information:\n{}",
            context
        );

        if self.model_name.starts_with("gemini") {
            let client = match rig::providers::gemini::Client::new(&self.api_key) {
                Ok(c) => c,
                Err(e) => return Err(format!("Rig Gemini init Error: {}", e)),
            };
            let agent = client.agent(&self.model_name)
                .preamble(&system_prompt)
                .build();

            match agent.prompt(prompt).await {
                Ok(response) => Ok(response),
                Err(e) => Err(format!("Rig Gemini Execution Error: {}", e)),
            }
        } else {
            // If API key is empty, we assume it's a local model connecting to NYX's local server (e.g. LM Studio / Ollama)
            let (url, actual_key) = if self.api_key.trim().is_empty() {
                ("http://127.0.0.1:8080/v1", "dummy_key")
            } else {
                ("https://api.openai.com/v1", self.api_key.as_str())
            };

            let client = match Client::builder().api_key(actual_key).base_url(url).build() {
                Ok(c) => c,
                Err(e) => return Err(format!("Rig OpenAI/Local init Error: {}", e)),
            };
            let agent = client.agent(&self.model_name)
                .preamble(&system_prompt)
                .build();

            match agent.prompt(prompt).await {
                Ok(response) => Ok(response),
                Err(e) => Err(format!("Rig OpenAI/Local Execution Error: {}", e)),
            }
        }
    }
}
