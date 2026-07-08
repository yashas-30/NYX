use tauri::AppHandle;
use serde_json::{json, Value};
use crate::commands::llm::{UnifiedRequest, UnifiedMessage, StreamChunkPayload, execute_llm_stream};
use crate::orchestrator::tools::Tool;
use std::collections::HashMap;
use std::sync::Arc;

pub struct Orchestrator {
    tools: HashMap<String, Arc<dyn Tool>>,
}

impl Orchestrator {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    pub fn register_tool<T: Tool + 'static>(&mut self, tool: T) {
        self.tools.insert(tool.name().to_string(), Arc::new(tool));
    }

    pub async fn run_turn(
        &self,
        app: AppHandle,
        mut request: UnifiedRequest,
        tx: tauri::ipc::Channel<StreamChunkPayload>,
    ) -> Result<(), String> {
        // Construct tool schemas for the LLM
        let mut tool_schemas = Vec::new();
        for (_, tool) in &self.tools {
            tool_schemas.push(json!({
                "type": "function",
                "function": {
                    "name": tool.name(),
                    "description": tool.description(),
                    "parameters": tool.parameters_schema()
                }
            }));
        }

        if !tool_schemas.is_empty() {
            request.tools = Some(json!(tool_schemas));
        }

        // Loop handles LLM -> Tool Call -> Tool Result -> LLM -> Done
        loop {
            // Execute LLM Stream for this turn
            let req_clone = UnifiedRequest {
                provider: request.provider.clone(),
                endpoint_override: request.endpoint_override.clone(),
                model_id: request.model_id.clone(),
                messages: request.messages.clone(),
                system_instruction: request.system_instruction.clone(),
                api_key: request.api_key.clone(),
                temperature: request.temperature,
                max_tokens: request.max_tokens,
                event_name: request.event_name.clone(),
                tools: request.tools.clone(),
            };
            
            let mut inner_rx = match execute_llm_stream(&req_clone).await {
                Ok(rx) => rx,
                Err(e) => {
                    let _ = tx.send(StreamChunkPayload {
                        event_type: "error".to_string(),
                        content: None,
                        done: Some(true),
                        error: Some(e.clone()),
                        tool_call: None,
                        name: None,
                        result: None,
                        metadata: None,
                    });
                    return Err(e);
                }
            };

            let mut current_tool_call_id = String::new();
            let mut current_tool_name = String::new();
            let mut current_tool_args_raw = String::new();
            let mut requires_another_turn = false;

            while let Some(res) = inner_rx.recv().await {
                match res {
                    Ok(payload) => {
                        // Forward text events to the frontend
                        if payload.event_type == "text" || payload.event_type == "thinking" {
                            let _ = tx.send(payload.clone());
                        } else if payload.event_type == "tool_start" {
                            if let Some(name) = &payload.name {
                                current_tool_name = name.clone();
                            }
                            if let Some(tool_call) = &payload.tool_call {
                                if let Some(id) = tool_call.get("id").and_then(|v| v.as_str()) {
                                    current_tool_call_id = id.to_string();
                                }
                            }
                            // Notify UI that a tool started
                            let _ = tx.send(payload.clone());
                        } else if payload.event_type == "tool_call" {
                            if let Some(content) = &payload.content {
                                current_tool_args_raw.push_str(content);
                            }
                        } else if payload.event_type == "tool_call_complete" {
                            requires_another_turn = true;
                        } else if payload.event_type == "done" && !requires_another_turn {
                            let _ = tx.send(payload.clone());
                            return Ok(());
                        } else if payload.event_type == "error" {
                            let _ = tx.send(payload.clone());
                            return Err(payload.error.unwrap_or_default());
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(StreamChunkPayload {
                            event_type: "error".to_string(),
                            content: None,
                            done: Some(true),
                            error: Some(e.clone()),
                            tool_call: None,
                            name: None,
                            result: None,
                            metadata: None,
                        });
                        return Err(e);
                    }
                }
            }

            if requires_another_turn {
                // Parse arguments
                let args_json: Value = serde_json::from_str(&current_tool_args_raw).unwrap_or(json!({}));
                
                // Execute the tool
                let app_for_tool = app.clone();
                let tool_result_str = if let Some(tool) = self.tools.get(&current_tool_name) {
                    match tool.execute(&app_for_tool, args_json.clone()).await {
                        Ok(res) => res.to_string(),
                        Err(e) => format!("Error executing tool: {}", e),
                    }
                } else {
                    format!("Tool not found: {}", current_tool_name)
                };

                // Notify UI that tool completed
                let _ = tx.send(StreamChunkPayload {
                    event_type: "tool_result".to_string(),
                    content: Some(tool_result_str.clone()),
                    done: Some(false),
                    error: None,
                    tool_call: Some(json!({"id": current_tool_call_id})),
                    name: Some(current_tool_name.clone()),
                    result: None,
                    metadata: None,
                });

                // Append assistant's tool call to history
                request.messages.push(UnifiedMessage {
                    role: "assistant".to_string(),
                    content: json!([
                        {
                            "type": "tool_call",
                            "id": current_tool_call_id,
                            "function": {
                                "name": current_tool_name,
                                "arguments": current_tool_args_raw
                            }
                        }
                    ]),
                });

                // Append tool result to history
                request.messages.push(UnifiedMessage {
                    role: "tool".to_string(),
                    content: json!([
                        {
                            "type": "tool_result",
                            "tool_call_id": current_tool_call_id,
                            "name": current_tool_name,
                            "content": tool_result_str
                        }
                    ]),
                });
            } else {
                break;
            }
        }
        
        Ok(())
    }
}
