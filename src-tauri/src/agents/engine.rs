use super::memory::AgentMemory;
use super::tools::{execute_tool, get_available_tools};
use crate::rag::scanner::CodebaseScanner;
use reqwest::Client;
use serde_json::Value;
use std::sync::Arc;
use tracing::error;

pub struct AgentEngine {
    client: Client,
    api_key: String,
    base_url: String,
    model: String,
    memory: AgentMemory,
    scanner: Arc<CodebaseScanner>,
}

impl AgentEngine {
    pub fn new(api_key: String, base_url: String, model: String, system_prompt: String, scanner: Arc<CodebaseScanner>) -> Self {
        Self {
            client: Client::new(),
            api_key,
            base_url,
            model,
            memory: AgentMemory::new(&system_prompt),
            scanner,
        }
    }

    pub async fn run(&mut self, user_input: &str, on_event: impl Fn(Value)) -> Result<String, String> {
        self.memory.add_user_message(user_input);
        
        // Emulate streaming/agent loop
        for _turn in 0..15 {
            let messages = self.memory.to_llm_messages();
            let tools = get_available_tools();
            
            let payload = serde_json::json!({
                "model": self.model,
                "messages": messages,
                "tools": tools.iter().map(|t| {
                    serde_json::json!({
                        "type": "function",
                        "function": {
                            "name": t.name,
                            "description": t.description,
                            "parameters": t.parameters
                        }
                    })
                }).collect::<Vec<_>>(),
                "temperature": 0.2
            });

            // If we're using gemini or anthropic via litellm/OpenAI compat, the structure works.
            let res = self.client.post(&format!("{}/chat/completions", self.base_url))
                .header("Authorization", format!("Bearer {}", self.api_key))
                .json(&payload)
                .send()
                .await
                .map_err(|e| e.to_string())?;

            if !res.status().is_success() {
                let err_text = res.text().await.unwrap_or_default();
                error!("LLM Error: {}", err_text);
                return Err(format!("LLM API returned error: {}", err_text));
            }

            let data: Value = res.json().await.map_err(|e| e.to_string())?;
            let choice = &data["choices"][0]["message"];
            
            let content = choice["content"].as_str().unwrap_or_default();
            let tool_calls = choice["tool_calls"].as_array().cloned();

            self.memory.add_assistant_message(content, tool_calls.clone());

            if !content.is_empty() {
                on_event(serde_json::json!({
                    "type": "text",
                    "content": content
                }));
            }

            if let Some(calls) = tool_calls {
                for tc in calls {
                    let id = tc["id"].as_str().unwrap_or("");
                    let name = tc["function"]["name"].as_str().unwrap_or("");
                    let args_str = tc["function"]["arguments"].as_str().unwrap_or("{}");
                    let args: Value = serde_json::from_str(args_str).unwrap_or(serde_json::json!({}));
                    
                    on_event(serde_json::json!({
                        "type": "tool_start",
                        "tool": name,
                        "args": args
                    }));

                    let result = match execute_tool(name, args, &self.scanner).await {
                        Ok(res) => res,
                        Err(e) => format!("Error executing {}: {}", name, e)
                    };

                    on_event(serde_json::json!({
                        "type": "tool_done",
                        "tool": name,
                        "result": result
                    }));

                    self.memory.add_tool_message(id, &result);
                }
            } else {
                // Done!
                return Ok(content.to_string());
            }
        }

        Err("Max turns reached without completion".to_string())
    }
}
