use tauri::{AppHandle, Listener, Manager};
use serde_json::{json, Value};
use crate::llm::types::{
    UnifiedRequest, UnifiedMessage, StreamChunkPayload
};
use crate::llm::cloud_orchestrator::execute_cloud_stream;
use crate::llm::local_inference::execute_local_stream;
use crate::orchestrator::tools::Tool;
use std::collections::HashMap;
use std::sync::Arc;
use serde::{Deserialize, Serialize};

/// Maximum number of LLM → tool → LLM iterations before aborting.
/// Prevents infinite loops when a local model keeps emitting tool calls.
const MAX_ORCHESTRATOR_ITERATIONS: usize = 12;

#[derive(Debug, Clone, PartialEq)]
pub enum OrchestratorState {
    Init,
    Thinking,
    ExecuteTools,
    Done,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingToolCall {
    pub id: String,
    pub name: String,
    pub args_raw: String,
}

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

    pub fn register_tool_arc(&mut self, name: String, tool: Arc<dyn Tool>) {
        self.tools.insert(name, tool);
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

        // Set up cancellation listener so the frontend's Stop button works
        // during agentic mode. Without this, the orchestrator loop runs until
        // the LLM finishes or hits the 12-iteration cap, ignoring user abort.
        let cancel_name = format!("cancel_{}", request.event_name.clone().unwrap_or_default());
        let (cancel_tx, mut cancel_rx) = tokio::sync::mpsc::channel::<()>(1);
        let cancel_id = app.listen(cancel_name.clone(), move |_| {
            let _ = cancel_tx.try_send(());
        });

        // Bounded to MAX_ORCHESTRATOR_ITERATIONS to prevent runaway tool loops.
        let mut iteration = 0usize;
        let mut state = OrchestratorState::Init;
        let mut pending_tools: Vec<PendingToolCall> = Vec::new();
        let mut completion_chars = 0;

        loop {
            match state.clone() {
                OrchestratorState::Init => {
                    tracing::info!(span = "OrchestratorState::Init", "Initializing orchestrator run");
                    state = OrchestratorState::Thinking;
                }
                OrchestratorState::Thinking => {
                    tracing::info!(span = "state_thinking", iteration, "Entering Thinking state");
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
                    let mut final_error: Option<String> = None;

                    let mut inner_rx = if request.provider == "nyx-native" {
                        use futures_util::StreamExt;
                        match execute_local_stream(&app, &request).await {
                            Ok(stream) => {
                                let (itx, irx) = tokio::sync::mpsc::channel(256);
                                tauri::async_runtime::spawn(async move {
                                    tokio::pin!(stream);
                                    while let Some(res) = stream.next().await {
                                        if itx.send(res).await.is_err() {
                                            break;
                                        }
                                    }
                                });
                                irx
                            },
                            Err(e) => {
                                let _ = tx.send(StreamChunkPayload::error(e.clone()));
                                state = OrchestratorState::Error(e);
                                continue;
                            }
                        }
                    } else {
                        match execute_cloud_stream(&request).await {
                            Ok(rx) => rx,
                            Err(e) => {
                                let _ = tx.send(StreamChunkPayload::error(e.clone()));
                                state = OrchestratorState::Error(e);
                                continue;
                            }
                        }
                    };

                    let mut requires_another_turn = false;
                    let mut accumulated_text = String::new();

                    loop {
                        let res = tokio::select! {
                            _ = cancel_rx.recv() => {
                                let _ = tx.send(StreamChunkPayload::done());
                                app.unlisten(cancel_id);
                                return Ok(());
                            }
                            msg = inner_rx.recv() => match msg {
                                Some(r) => r,
                                None => break,
                            }
                        };
                        match res {
                            Ok(payload) => {
                                if let Some(text) = &payload.content {
                                    completion_chars += text.len();
                                    accumulated_text.push_str(text);
                                }

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
                                    
                                    let pool = app.state::<sqlx::SqlitePool>();
                                    crate::db::traces::record_trace(pool.inner().clone(), crate::db::traces::TraceInput {
                                        session_id: None,
                                        provider: provider.clone(),
                                        model: model.clone(),
                                        prompt_tokens,
                                        completion_tokens: (completion_chars / 4) as i64,
                                        latency_ms: start_time.elapsed().as_millis() as i64,
                                        cached: false,
                                        error: None,
                                        agent_node_id: None,
                                    });
                                    
                                    state = OrchestratorState::Done;
                                    break;
                                } else if payload.event_type == "error" {
                                    final_error = payload.error.clone();
                                    let _ = tx.send(payload.clone());
                                    
                                    let pool = app.state::<sqlx::SqlitePool>();
                                    crate::db::traces::record_trace(pool.inner().clone(), crate::db::traces::TraceInput {
                                        session_id: None,
                                        provider: provider.clone(),
                                        model: model.clone(),
                                        prompt_tokens,
                                        completion_tokens: (completion_chars / 4) as i64,
                                        latency_ms: start_time.elapsed().as_millis() as i64,
                                        cached: false,
                                        error: final_error.clone(),
                                        agent_node_id: None,
                                    });

                                    state = OrchestratorState::Error(payload.error.unwrap_or_default());
                                    break;
                                }
                            }
                            Err(e) => {
                                final_error = Some(e.clone());
                                let _ = tx.send(StreamChunkPayload::error(e.clone()));
                                
                                let pool = app.state::<sqlx::SqlitePool>();
                                crate::db::traces::record_trace(pool.inner().clone(), crate::db::traces::TraceInput {
                                    session_id: None,
                                    provider: provider.clone(),
                                    model: model.clone(),
                                    prompt_tokens,
                                    completion_tokens: (completion_chars / 4) as i64,
                                    latency_ms: start_time.elapsed().as_millis() as i64,
                                    cached: false,
                                    error: final_error.clone(),
                                    agent_node_id: None,
                                });

                                state = OrchestratorState::Error(e);
                                break;
                            }
                        }
                    }

                    // Fallback parser: if no native tool calls were emitted, attempt text tool parsing (for local GGUF models)
                    if pending_tools.is_empty() {
                        if let Some((tool_name, args)) = crate::orchestrator::lucifer::parse_tool_call_from_text(&accumulated_text) {
                            let call_id = format!("call_{}", &tool_name);
                            pending_tools.push(PendingToolCall {
                                id: call_id,
                                name: tool_name,
                                args_raw: serde_json::to_string(&args).unwrap_or_default(),
                            });
                            requires_another_turn = true;
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
                            error: final_error.clone(),
                            agent_node_id: None,
                        });
                        state = OrchestratorState::ExecuteTools;
                    }
                }
                OrchestratorState::ExecuteTools => {
                    tracing::info!(span = "state_execute_tools", num_tools = pending_tools.len(), "Entering ExecuteTools state");
                    let mut assistant_tool_calls = Vec::new();
                    let mut tool_results = Vec::new();

                    // Take pending_tools to clear it for the next iteration
                    let tools_to_execute = std::mem::take(&mut pending_tools);

                    for current_tool in tools_to_execute {
                        let args_json: Value = serde_json::from_str(&current_tool.args_raw).unwrap_or(json!({}));
                        
                        if let Err(violation) = crate::orchestrator::safety_guard::SafetyGuard::validate_tool_call(&current_tool.name, &args_json) {
                            tracing::warn!("[Orchestrator] SafetyGuard blocked tool '{}': {}", current_tool.name, violation);
                            
                            let _ = tx.send(StreamChunkPayload {
                                event_type: "tool_result".to_string(),
                                content: Some(violation.clone()),
                                done: Some(false),
                                error: None,
                                tool_call: Some(json!({"id": current_tool.id})),
                                name: Some(current_tool.name.clone()),
                                result: None,
                                metadata: None,
                            });

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
                                        "content": violation
                                    }
                                ]),
                            });
                            continue;
                        }
                        
                        let app_for_tool = app.clone();
                        let tool_result_str = if let Some(tool) = self.tools.get(&current_tool.name) {
                            match tool.execute(&app_for_tool, args_json.clone()).await {
                                Ok(res) => res.to_string(),
                                Err(e) => format!("Error executing tool: {}", e),
                            }
                        } else {
                            format!("Tool not found: {}", current_tool.name)
                        };

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

                        // Emit visual thinking box chunk for front-end collapsible thinking UI
                        let tool_thinking = format!("> 🛠️ **Executed Tool (`{}`)**:\n> Arguments: {}\n\n{}\n\n", current_tool.name, current_tool.args_raw, tool_result_str);
                        let _ = tx.send(StreamChunkPayload::thinking(tool_thinking));

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

                    request.messages.push(UnifiedMessage {
                        role: "assistant".to_string(),
                        content: Value::Array(assistant_tool_calls),
                    });

                    request.messages.extend(tool_results);
                    
                    state = OrchestratorState::Thinking;
                }
                OrchestratorState::Done => {
                    tracing::info!(span = "OrchestratorState::Done", "Orchestrator finished successfully");
                    app.unlisten(cancel_id);
                    return Ok(());
                }
                OrchestratorState::Error(err) => {
                    tracing::error!(span = "OrchestratorState::Error", error = %err, "Orchestrator failed");
                    app.unlisten(cancel_id);
                    return Err(err);
                }
            }
        }
    }
}
