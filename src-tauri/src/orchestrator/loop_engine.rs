use tauri::{AppHandle, Manager};
use serde_json::{json, Value};
use crate::llm::cloud_orchestrator::{
    UnifiedRequest, UnifiedMessage, StreamChunkPayload, execute_cloud_stream
};
use crate::orchestrator::tools::Tool;
use std::collections::HashMap;
use std::sync::Arc;

/// Maximum number of LLM → tool → LLM iterations before aborting.
/// Prevents infinite loops when a local model keeps emitting tool calls.
const MAX_ORCHESTRATOR_ITERATIONS: usize = 12;

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
        // Bounded to MAX_ORCHESTRATOR_ITERATIONS to prevent runaway tool loops.
        let mut iteration = 0usize;
        loop {
            iteration += 1;
            if iteration > MAX_ORCHESTRATOR_ITERATIONS {
                let msg = format!(
                    "Orchestrator stopped after {} iterations to prevent an infinite loop.",
                    MAX_ORCHESTRATOR_ITERATIONS
                );
                let _ = tx.send(StreamChunkPayload::error(msg.clone()));
                return Err(msg);
            }
            let provider = request.provider.clone();
            let model = request.model_id.clone();
            let prompt_len: usize = request.system_instruction.as_ref().map(|s| s.len()).unwrap_or(0)
                + request.messages.iter().map(|m| m.content.as_str().map(|s| s.len()).unwrap_or_else(|| m.content.to_string().len())).sum::<usize>();
            let prompt_tokens = (prompt_len / 4) as i64;
            let start_time = std::time::Instant::now();
            let mut completion_chars = 0;
            let mut final_error: Option<String> = None;

            // Fix #13: execute_cloud_stream takes &UnifiedRequest — no need to clone
            // the entire request (including the full message history) on every iteration.
            // request is mutated in place after tool calls; we just borrow it here.
            let mut inner_rx = match execute_cloud_stream(&request).await {
                Ok(rx) => rx,
                Err(e) => {
                    let _ = tx.send(StreamChunkPayload::error(e.clone()));
                    return Err(e);
                }
            };

            struct PendingToolCall {
                id: String,
                name: String,
                args_raw: String,
            }
            let mut pending_tools: Vec<PendingToolCall> = Vec::new();
            let mut requires_another_turn = false;

            while let Some(res) = inner_rx.recv().await {
                match res {
                    Ok(payload) => {
                        if let Some(text) = &payload.content {
                            completion_chars += text.len();
                        }

                        // Forward text events to the frontend
                        if payload.event_type == "text" || payload.event_type == "thinking" {
                            let _ = tx.send(payload.clone());
                        } else if payload.event_type == "tool_start" {
                            let mut new_tool = PendingToolCall {
                                id: String::new(),
                                name: String::new(),
                                args_raw: String::new(),
                            };
                            if let Some(name) = &payload.name {
                                new_tool.name = name.clone();
                            }
                            if let Some(tool_call) = &payload.tool_call {
                                if let Some(id) = tool_call.get("id").and_then(|v| v.as_str()) {
                                    new_tool.id = id.to_string();
                                }
                            }
                            pending_tools.push(new_tool);
                            // Notify UI that a tool started
                            let _ = tx.send(payload.clone());
                        } else if payload.event_type == "tool_call" {
                            if let Some(content) = &payload.content {
                                if let Some(last_tool) = pending_tools.last_mut() {
                                    last_tool.args_raw.push_str(content);
                                }
                            }
                        } else if payload.event_type == "tool_call_complete" {
                            requires_another_turn = true;
                        } else if payload.event_type == "done" && !requires_another_turn {
                            let _ = tx.send(payload.clone());
                            
                            // Write success trace for this iteration
                            let pool = app.state::<sqlx::SqlitePool>();
                            crate::db::traces::record_trace(pool.inner().clone(), crate::db::traces::TraceInput {
                                session_id: None,
                                provider,
                                model,
                                prompt_tokens,
                                completion_tokens: (completion_chars / 4) as i64,
                                latency_ms: start_time.elapsed().as_millis() as i64,
                                cached: false,
                                error: None,
                                agent_node_id: None,
                            });
                            
                            return Ok(());
                        } else if payload.event_type == "error" {
                            final_error = payload.error.clone();
                            let _ = tx.send(payload.clone());
                            
                            let pool = app.state::<sqlx::SqlitePool>();
                            crate::db::traces::record_trace(pool.inner().clone(), crate::db::traces::TraceInput {
                                session_id: None,
                                provider,
                                model,
                                prompt_tokens,
                                completion_tokens: (completion_chars / 4) as i64,
                                latency_ms: start_time.elapsed().as_millis() as i64,
                                cached: false,
                                error: final_error.clone(),
                                agent_node_id: None,
                            });

                            return Err(payload.error.unwrap_or_default());
                        }
                    }
                    Err(e) => {
                        final_error = Some(e.clone());
                        let _ = tx.send(StreamChunkPayload::error(e.clone()));
                        
                        let pool = app.state::<sqlx::SqlitePool>();
                        crate::db::traces::record_trace(pool.inner().clone(), crate::db::traces::TraceInput {
                            session_id: None,
                            provider,
                            model,
                            prompt_tokens,
                            completion_tokens: (completion_chars / 4) as i64,
                            latency_ms: start_time.elapsed().as_millis() as i64,
                            cached: false,
                            error: final_error,
                            agent_node_id: None,
                        });

                        return Err(e);
                    }
                }
            }

            if requires_another_turn && !pending_tools.is_empty() {
                // Iteration ended (tool calls pending), write trace for this turn
                let pool = app.state::<sqlx::SqlitePool>();
                crate::db::traces::record_trace(pool.inner().clone(), crate::db::traces::TraceInput {
                    session_id: None,
                    provider: provider.clone(),
                    model: model.clone(),
                    prompt_tokens,
                    completion_tokens: (completion_chars / 4) as i64,
                    latency_ms: start_time.elapsed().as_millis() as i64,
                    cached: false,
                    error: final_error,
                    agent_node_id: None,
                });

                let mut assistant_tool_calls = Vec::new();
                let mut tool_results = Vec::new();

                for current_tool in pending_tools {
                    // Parse arguments
                    let args_json: Value = serde_json::from_str(&current_tool.args_raw).unwrap_or(json!({}));
                    
                    // Execute the tool
                    let app_for_tool = app.clone();
                    let tool_result_str = if let Some(tool) = self.tools.get(&current_tool.name) {
                        match tool.execute(&app_for_tool, args_json.clone()).await {
                            Ok(res) => res.to_string(),
                            Err(e) => format!("Error executing tool: {}", e),
                        }
                    } else {
                        format!("Tool not found: {}", current_tool.name)
                    };

                    // Notify UI that tool completed.
                    let _ = tx.send(StreamChunkPayload {
                        event_type: "tool_result".to_string(),
                        content: Some(tool_result_str.clone()),
                        done: Some(false),
                        error: None,
                        tool_call: Some(json!({"id": current_tool.id})),
                        name: Some(current_tool.name.clone()),
                        result: None,
                        metadata: None,
                    });
                    tracing::info!("[Orchestrator] Tool '{}' complete (iteration {}/{})",
                        current_tool.name, iteration, MAX_ORCHESTRATOR_ITERATIONS);

                    assistant_tool_calls.push(json!({
                        "type": "tool_call",
                        "id": current_tool.id,
                        "function": {
                            "name": current_tool.name,
                            "arguments": current_tool.args_raw
                        }
                    }));

                    tool_results.push(UnifiedMessage {
                        role: "tool".to_string(),
                        content: json!([
                            {
                                "type": "tool_result",
                                "tool_call_id": current_tool.id,
                                "name": current_tool.name,
                                "content": tool_result_str
                            }
                        ]),
                    });
                }

                // Append assistant's tool calls to history
                request.messages.push(UnifiedMessage {
                    role: "assistant".to_string(),
                    content: Value::Array(assistant_tool_calls),
                });

                // Append tool results to history
                request.messages.extend(tool_results);
            } else {
                break;
            }
        }
        
        Ok(())
    }
}
