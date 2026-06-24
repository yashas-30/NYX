use super::memory::AgentMemory;
use super::tools::get_available_tools;
use crate::rag::scanner::CodebaseScanner;
use genai::chat::{ChatRequest, ChatMessage, Tool, ChatOptions};
use genai::Client as GenaiClient;
use genai::resolver::{AuthResolver, AuthData};
use serde_json::Value;
use std::sync::Arc;
use tracing::error;

pub struct AgentEngine {
    client: GenaiClient,
    model: String,
    memory: AgentMemory,
    scanner: Arc<CodebaseScanner>,
}

impl AgentEngine {
    pub fn new(api_key: String, _base_url: String, model: String, system_prompt: String, messages: Vec<super::memory::Message>, scanner: Arc<CodebaseScanner>) -> Self {
        let mut memory = AgentMemory::new(&system_prompt);
        memory.messages = messages;
        let client = GenaiClient::builder()
            .with_auth_resolver(AuthResolver::from_resolver_fn(move |_kind| {
                Ok(Some(AuthData::from_single(api_key.clone())))
            }))
            .build();
            
        Self {
            client,
            model,
            memory,
            scanner,
        }
    }

    pub async fn run(&mut self, on_event: impl Fn(Value)) -> Result<String, String> {
        // Emulate streaming/agent loop
        for _turn in 0..15 {
            let mut chat_req = ChatRequest::new(vec![]);
            
            chat_req = chat_req.append_message(ChatMessage::system(self.memory.system_prompt.clone()));

            for m in &self.memory.messages {
                if m.role == "user" {
                    chat_req = chat_req.append_message(ChatMessage::user(m.content.clone()));
                } else if m.role == "assistant" {
                    chat_req = chat_req.append_message(ChatMessage::assistant(m.content.clone()));
                } else if m.role == "tool" {
                    // For tool responses
                    // We'll figure out how to add this once we see cargo check
                }
            }
            
            let genai_tools: Vec<Tool> = super::tools::get_available_tools()
                .into_iter()
                .map(|t| {
                    let mut tool = Tool::new(t.name);
                    if !t.description.is_empty() {
                        tool = tool.with_description(t.description);
                    }
                    if !t.parameters.is_null() {
                        tool = tool.with_schema(t.parameters);
                    }
                    tool
                })
                .collect();
            
            chat_req = chat_req.with_tools(genai_tools);

            let options = ChatOptions::default().with_capture_content(true);
            let mut chat_stream = match self.client.exec_chat_stream(&self.model, chat_req.clone(), Some(&options)).await {
                Ok(s) => s,
                Err(e) => {
                    error!("LLM Error: {}", e);
                    return Err(format!("LLM API returned error: {}", e));
                }
            };

            let mut full_content = String::new();
            let mut current_tool_calls: Vec<serde_json::Value> = Vec::new();
            
            use genai::chat::{ChatStreamEvent, StreamChunk, MessageContent};
            use futures_util::StreamExt;
            while let Some(event_res) = chat_stream.stream.next().await {
                match event_res {
                    Ok(event) => match event {
                        ChatStreamEvent::Start => {}
                        ChatStreamEvent::Chunk(StreamChunk { content }) => {
                            full_content.push_str(&content);
                            on_event(serde_json::json!({
                                "type": "text",
                                "content": content
                            }));
                        }
                        ChatStreamEvent::ReasoningChunk(_) => {}
                        ChatStreamEvent::End(end) => {
                            if let Some(content) = end.captured_content {
                                if let MessageContent::ToolCalls(tcs) = content {
                                    for tc in tcs {
                                        current_tool_calls.push(serde_json::json!({
                                            "id": tc.call_id,
                                            "function": {
                                                "name": tc.fn_name,
                                                "arguments": tc.fn_arguments.to_string()
                                            }
                                        }));
                                    }
                                }
                            }
                        }
                        _ => {}
                    },
                    Err(e) => {
                        error!("Event source error: {}", e);
                    }
                }
            }

            self.memory.add_assistant_message(&full_content, if current_tool_calls.is_empty() { None } else { Some(current_tool_calls.clone()) });

            if !current_tool_calls.is_empty() {
                for tc in current_tool_calls {
                    let id = tc["id"].as_str().unwrap_or("");
                    let name = tc["function"]["name"].as_str().unwrap_or("");
                    let args_str = tc["function"]["arguments"].as_str().unwrap_or("{}");
                    let args: Value = serde_json::from_str(args_str).unwrap_or(serde_json::json!({}));
                    
                    on_event(serde_json::json!({
                        "type": "tool_start",
                        "tool_call": {
                            "id": id,
                            "name": name,
                            "args": args
                        }
                    }));

                    let result = match super::tools::execute_tool(name, args, &self.scanner).await {
                        Ok(res) => res,
                        Err(e) => format!("Error executing {}: {}", name, e)
                    };

                    on_event(serde_json::json!({
                        "type": "tool_done",
                        "name": name,
                        "result": result
                    }));

                    self.memory.add_tool_message(id, &result);
                }
            } else {
                // Done!
                return Ok(full_content);
            }
        }

        Err("Max turns reached without completion".to_string())
    }
}
