use super::blackboard::Blackboard;
use super::protocol::{CognitiveRole, ConductorMessage, DagEvent, DagNodeState, WorkerMessage};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinSet;
use serde::{Deserialize, Serialize};

use super::local_orchestrator::{LocalOrchestrator, EnvironmentState};
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct FuguPlan {
    subtasks: Vec<FuguTask>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct FuguTask {
    pub node_id: String,
    pub description: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub preferred_model: Option<String>,
    #[serde(default)]
    pub tool_filters: Option<Vec<String>>,
}

pub struct ConductorActor {
    pub app_handle: AppHandle,
    pub receiver: mpsc::Receiver<ConductorMessage>,
    pub blackboard: Arc<Blackboard>,
    pub workers: std::collections::HashMap<String, mpsc::Sender<WorkerMessage>>,
    pub reply_to: Option<oneshot::Sender<Result<String, String>>>,
    pub current_event_name: Option<String>,
    pub self_tx: mpsc::Sender<ConductorMessage>,
    
    // DAG Execution State
    pub pending_tasks: Vec<FuguTask>,
    pub completed_nodes: std::collections::HashSet<String>,
    pub failed_nodes: std::collections::HashSet<String>,
    pub node_errors: std::collections::HashMap<String, String>,
    pub local_model_fallback: String,
    pub local_orchestrator: Arc<LocalOrchestrator>,
    pub kanban_board: Option<super::kanban::KanbanBoard>,
}

impl ConductorActor {
    pub fn new(app_handle: AppHandle, receiver: mpsc::Receiver<ConductorMessage>, receiver_tx: mpsc::Sender<ConductorMessage>) -> Self {
        Self {
            app_handle,
            receiver,
            blackboard: Arc::new(Blackboard::new()),
            workers: std::collections::HashMap::new(),
            reply_to: None,
            current_event_name: None,
            self_tx: receiver_tx,
            pending_tasks: Vec::new(),
            completed_nodes: std::collections::HashSet::new(),
            failed_nodes: std::collections::HashSet::new(),
            node_errors: std::collections::HashMap::new(),
            local_model_fallback: "default-local".to_string(),
            local_orchestrator: Arc::new(LocalOrchestrator::new()),
            kanban_board: None,
        }
    }

    pub async fn run(mut self) {
        let mut join_set = JoinSet::new();

        while let Some(msg) = self.receiver.recv().await {
            match msg {
                ConductorMessage::RunTask {
                    prompt,
                    api_key,
                    cloud_model,
                    local_model,
                    reply_to,
                    event_name,
                    is_fast_intent,
                } => {
                    self.reply_to = Some(reply_to);
                    self.current_event_name = event_name;
                    self.handle_run_task(prompt, api_key, cloud_model, local_model, is_fast_intent, &mut join_set).await;
                }
                ConductorMessage::WorkerUpdate { node_id, status } => {
                    self.emit_dag_update(&node_id, CognitiveRole::Worker, &status);
                    if let Some(board) = &mut self.kanban_board {
                        board.mark_in_progress(&node_id);
                    }
                }
                ConductorMessage::WorkerComplete { node_id, result } => {
                    self.emit_dag_update(&node_id, CognitiveRole::Worker, "completed");
                    if let Some(board) = &mut self.kanban_board {
                        board.mark_completed(&node_id);
                    }
                    self.blackboard.write_entry(format!("result_{}", node_id), node_id.clone(), result);
                    self.workers.remove(&node_id);
                    self.completed_nodes.insert(node_id);
                    self.evaluate_dag(&mut join_set).await;
                }
                ConductorMessage::WorkerFailed { node_id, error } => {
                    self.emit_dag_update(&node_id, CognitiveRole::Worker, &format!("failed: {}", error));
                    if let Some(board) = &mut self.kanban_board {
                        board.mark_failed(&node_id, error.clone());
                    }
                    self.workers.remove(&node_id);
                    self.failed_nodes.insert(node_id.clone());
                    self.node_errors.insert(node_id.clone(), error.clone());
                    
                    // Dynamic Re-planning: For now, we will halt the DAG, but ideally we'd re-prompt the Conductor
                    self.pending_tasks.clear(); // FIX: Clear pending tasks so check_completion can trigger successfully and avoid the 5-minute deadlock timeout
                    
                    self.emit_dag_update("conductor", CognitiveRole::Thinker, &format!("DAG halted due to failure in {}", node_id));
                    self.check_completion();
                }
                ConductorMessage::WorkerChunk { node_id: _, content } => {
                    if let Some(en) = &self.current_event_name {
                        let chunk_event = serde_json::json!({
                            "type": "text",
                            "content": content
                        });
                        let _ = self.app_handle.emit(en, chunk_event);
                    }
                }
            }
        }
    }

    async fn handle_run_task(
        &mut self,
        prompt: String,
        api_key: String,
        cloud_model: Option<String>,
        local_model: Option<String>,
        is_fast_intent: bool,
        join_set: &mut JoinSet<()>,
    ) {
        self.emit_dag_update("conductor", CognitiveRole::Thinker, "Analyzing prompt and building Kimi Swarm DAG natively...");
        self.blackboard.write_entry("user_prompt".into(), "user".into(), prompt.clone());

        let model = cloud_model.clone().unwrap_or_else(|| String::new());
        let is_cloud_available = !model.is_empty() && !api_key.trim().is_empty();

        // model may be empty in local-only mode — that is fine, workers will use local_model directly

        // Store the API key in thread-local storage keyed by model prefix.
        // This avoids the std::env::set_var race condition in multi-threaded async contexts
        // where concurrent agent tasks could overwrite each other's keys.
        // DynamicWorkerActor reads from this map when building its genai::Client.
        {
            let mut keys = crate::agents::api_key_store::TASK_API_KEYS.lock().unwrap();
            if model.starts_with("gemini") {
                keys.insert("GEMINI_API_KEY".to_string(), api_key.clone());
            } else if model.starts_with("gpt") || model.starts_with("o1") {
                keys.insert("OPENAI_API_KEY".to_string(), api_key.clone());
            } else if model.starts_with("claude") {
                keys.insert("ANTHROPIC_API_KEY".to_string(), api_key.clone());
            } else if model.starts_with("groq") {
                keys.insert("GROQ_API_KEY".to_string(), api_key.clone());
            }
        }

        let env_state = EnvironmentState {
            available_pipelines: vec!["chat".into(), "rag".into(), "fugu_dag".into()],
            local_models: vec![local_model.clone().unwrap_or_default()],
            cloud_models: vec![cloud_model.clone().unwrap_or_default()],
        };

        // Fetch real long-term memories from SQLite via AppState
        let nyx_memory_context: String = {
            if let Ok(pool) = self.app_handle.try_state::<sqlx::SqlitePool>().map(|p| p.inner().clone()).ok_or(()) {
                match sqlx::query_as::<_, crate::db::models::LongTermMemory>(
                    "SELECT * FROM long_term_memories ORDER BY created_at DESC LIMIT 10"
                )
                .fetch_all(&pool)
                .await
                {
                    Ok(mems) if !mems.is_empty() => {
                        mems.iter().map(|m| format!("- {} ({})", m.fact, m.category)).collect::<Vec<_>>().join("\n")
                    }
                    _ => "No long-term memories found.".to_string(),
                }
            } else {
                "Memory system unavailable.".to_string()
            }
        };

        // Fetch real RAG context from the codebase scanner
        let rag_context: String = {
            if let Ok(scanner) = self.app_handle.try_state::<std::sync::Arc<crate::rag::scanner::CodebaseScanner>>().map(|s| s.inner().clone()).ok_or(()) {
                match scanner.search(&prompt, 5).await {
                    Ok(results) if !results.is_empty() => {
                        results.iter()
                            .map(|(path, chunk, score)| format!("[relevance: {:.2}] {}\n{}", score, path, &chunk[..chunk.len().min(500)]))
                            .collect::<Vec<_>>()
                            .join("\n\n")
                    }
                    Ok(_) => "No relevant documents found in the local workspace.".to_string(),
                    Err(_) => "RAG search failed.".to_string(),
                }
            } else {
                "RAG scanner not initialized. Index a workspace first.".to_string()
            }
        };

        let plan = if is_fast_intent {
            Ok(crate::agents::local_orchestrator::FuguPlan {
                subtasks: vec![
                    crate::agents::local_orchestrator::SubTask {
                        id: "task_1".into(),
                        description: prompt.clone(),
                        depends_on: vec![],
                        preferred_model: model.clone(),
                        role: "Chatbot".into(),
                        tool_filters: None,
                    }
                ]
            })
        } else {
            self.local_orchestrator.generate_swarm_plan(&env_state, &prompt, &nyx_memory_context, &rag_context).await
        };

        match plan {
            Ok(fugu_plan) => {
                // Map local_orchestrator::SubTask to conductor::FuguTask
                let mut subtasks: Vec<FuguTask> = fugu_plan.subtasks.into_iter().map(|t| FuguTask {
                    node_id: t.id,
                    description: t.description,
                    role: t.role,
                    depends_on: t.depends_on,
                    preferred_model: Some(t.preferred_model),
                    tool_filters: t.tool_filters,
                }).collect();

                if subtasks.is_empty() {
                    subtasks.push(FuguTask {
                        node_id: "default-task".to_string(),
                        description: prompt.clone(),
                        role: "Worker".to_string(),
                        depends_on: vec![],
                        preferred_model: None,
                        tool_filters: None,
                    });
                }
                
                // Add Synthesizer Node only when a cloud model + key are both available (skip for fast intents or local-only mode)
                if !is_fast_intent && is_cloud_available {
                    let gemini_key = crate::agents::api_key_store::get_key("GEMINI_API_KEY");
                    let synthesizer_model = if gemini_key.trim().is_empty() && model.starts_with("gemini") {
                        local_model.clone().unwrap_or_else(|| model.clone())
                    } else if api_key.trim().is_empty() {
                        local_model.clone().unwrap_or_else(|| model.clone())
                    } else {
                        model.clone()
                    };

                    let all_node_ids: Vec<String> = subtasks.iter().map(|t| t.node_id.clone()).collect();
                    subtasks.push(FuguTask {
                        node_id: "synthesizer_final".to_string(),
                        description: "Synthesize all raw worker data into a pristine, uncluttered final response for the user.".to_string(),
                        role: "Synthesizer".to_string(),
                        depends_on: all_node_ids,
                        preferred_model: Some(synthesizer_model), // Use local model if no cloud key
                        tool_filters: None,
                    });
                }

                // Topological sort to prevent cycles
                if !self.validate_dag(&subtasks) {
                    let err = "DAG Cycle detected. Halting execution to prevent deadlock.";
                    self.emit_dag_update("conductor", CognitiveRole::Thinker, err);
                    if let Some(reply_to) = self.reply_to.take() {
                        let _ = reply_to.send(Err(err.to_string()));
                    }
                    return;
                }
                
                self.emit_dag_update("conductor", CognitiveRole::Thinker, &format!("Swarm Plan generated: {} tasks natively by Candle", subtasks.len()));
                
                self.pending_tasks = subtasks.clone();
                self.kanban_board = Some(super::kanban::KanbanBoard::new(subtasks));
                self.local_model_fallback = local_model.unwrap_or_else(|| "default-local".to_string());
                self.completed_nodes.clear();
                self.failed_nodes.clear();
                self.node_errors.clear();
                
                self.evaluate_dag(join_set).await;
            }
            Err(e) => {
                self.emit_dag_update("conductor", CognitiveRole::Thinker, &format!("Failed to plan: {}", e));
                if let Some(reply_to) = self.reply_to.take() {
                    let _ = reply_to.send(Err(e.to_string()));
                }
            }
        }
    }

    fn validate_dag(&self, tasks: &[FuguTask]) -> bool {
        // Kahn's algorithm or DFS cycle detection
        let mut in_degree = std::collections::HashMap::new();
        let mut adj = std::collections::HashMap::new();
        
        for task in tasks {
            in_degree.insert(task.node_id.clone(), 0);
            adj.insert(task.node_id.clone(), vec![]);
        }
        
        for task in tasks {
            for dep in &task.depends_on {
                if in_degree.contains_key(&task.node_id) {
                    *in_degree.get_mut(&task.node_id).unwrap() += 1;
                }
                if let Some(edges) = adj.get_mut(dep) {
                    edges.push(task.node_id.clone());
                }
            }
        }
        
        let mut queue = std::collections::VecDeque::new();
        for (node, &deg) in &in_degree {
            if deg == 0 {
                queue.push_back(node.clone());
            }
        }
        
        let mut visited = 0;
        while let Some(node) = queue.pop_front() {
            visited += 1;
            if let Some(edges) = adj.get(&node) {
                for next_node in edges {
                    if let Some(deg) = in_degree.get_mut(next_node) {
                        *deg -= 1;
                        if *deg == 0 {
                            queue.push_back(next_node.clone());
                        }
                    }
                }
            }
        }
        
        visited == tasks.len()
    }

    async fn evaluate_dag(&mut self, join_set: &mut JoinSet<()>) {
        let mut to_spawn = Vec::new();
        
        // Find tasks whose dependencies are met
        self.pending_tasks.retain(|task| {
            let deps_met = task.depends_on.iter().all(|dep| self.completed_nodes.contains(dep));
            if deps_met {
                to_spawn.push(task.clone());
                false // remove from pending
            } else {
                true // keep in pending
            }
        });
        
        if to_spawn.is_empty() && self.workers.is_empty() {
            self.check_completion();
            return;
        }

        let conductor_tx = self.self_tx.clone();
        
        for task in to_spawn {
            let worker_node_id = task.node_id.clone();
            let (worker_tx, worker_rx) = mpsc::channel(32);
            self.workers.insert(worker_node_id.clone(), worker_tx.clone());
            
            let conductor_tx_clone = conductor_tx.clone();
            let local_model_for_worker = task.preferred_model.unwrap_or_else(|| self.local_model_fallback.clone());
            
            let role_enum = match task.role.as_str() {
                "Synthesizer" => CognitiveRole::Synthesizer,
                "Thinker" => CognitiveRole::Thinker,
                "Verifier" => CognitiveRole::Verifier,
                _ => CognitiveRole::Worker,
            };
            self.emit_dag_update(&worker_node_id, role_enum, &format!("Spawning task: {}", task.description));
            
            // Build dependency context — apply Fugu isolation:
            // Only pass verified factual output to downstream workers,
            // not full chain-of-thought, to prevent parroting bias.
            let mut context_refs = Vec::new();
            for dep in &task.depends_on {
                for entry in self.blackboard.read_all() {
                    if entry.id == format!("result_{}", dep) {
                        // Extract only the factual portion:
                        // If the content has a RESULT: or ANSWER: marker, use what follows.
                        // Otherwise, cap at 2000 characters to prevent context flooding.
                        let factual_content = extract_factual_output(&entry.content);
                        context_refs.push(format!(
                            "<dependency_output node_id=\"{}\">
{}
</dependency_output>",
                            dep, factual_content
                        ));
                        break;
                    }
                }
            }

            let task_desc = task.description.clone();
            let role_str = task.role.clone();
            let mcp_manager = self.app_handle.state::<crate::AppState>().mcp_manager.clone();
            let tool_filters_clone = task.tool_filters.clone();
            join_set.spawn(async move {
                let mut worker = super::dynamic_worker::DynamicWorkerActor::new(
                    worker_node_id,
                    worker_rx,
                    conductor_tx_clone,
                    local_model_for_worker,
                    role_str,
                    mcp_manager,
                    tool_filters_clone,
                );
                worker.run().await;
            });

            let _ = worker_tx.send(WorkerMessage::ExecuteTask {
                task_description: task_desc,
                context_refs, // Will be read by the worker
            }).await;
        }
    }

    fn check_completion(&mut self) {
        if self.workers.is_empty() && self.pending_tasks.is_empty() {
            if let Some(reply_to) = self.reply_to.take() {
                // Return the Synthesizer's final result if available, else fallback
                let mut final_result = String::new();
                for entry in self.blackboard.read_all() {
                    if entry.id == "result_synthesizer_final" {
                        final_result = entry.content.clone();
                        break;
                    }
                }
                
                if final_result.is_empty() {
                    if !self.failed_nodes.is_empty() {
                        let err_msg = self.failed_nodes.iter()
                            .find_map(|node| self.node_errors.get(node))
                            .cloned()
                            .unwrap_or_else(|| format!("Task failed at nodes: {:?}", self.failed_nodes));
                        let _ = reply_to.send(Err(err_msg));
                        return;
                    } else {
                        final_result = "Task executed but no final synthesis was generated.".to_string();
                    }
                }
                
                let _ = reply_to.send(Ok(final_result.trim().to_string()));
            }
        }
    }

    fn emit_dag_update(&self, node_id: &str, role: CognitiveRole, status: &str) {
        let state = DagNodeState {
            node_id: node_id.to_string(),
            role,
            status: status.to_string(),
            task_description: "".into(),
        };
        let event = DagEvent::NodeStatusUpdate(state);
        let _ = self.app_handle.emit("dag_update", event);
        
        if let Some(en) = &self.current_event_name {
            let chunk = serde_json::json!({
                "type": "thinking",
                "content": format!("[{}] {}\n", node_id, status)
            });
            let _ = self.app_handle.emit(en, chunk);
        }
    }
}

/// Fugu isolation: strip chain-of-thought reasoning from a worker's output,
/// keeping only the factual/answer portion to prevent downstream agents from
/// parroting upstream reasoning instead of thinking independently.
fn extract_factual_output(content: &str) -> String {
    // If the worker explicitly marked a result, take only that section
    for marker in &["RESULT:", "ANSWER:", "FINAL ANSWER:", "OUTPUT:"] {
        if let Some(idx) = content.find(marker) {
            let factual = &content[idx + marker.len()..];
            return factual.trim()[..factual.trim().len().min(2000)].to_string();
        }
    }
    // Otherwise, trim thinking blocks if present (e.g. <think>...</think>)
    let without_thinking = if let (Some(start), Some(end)) = (content.find("<think>"), content.find("</think>")) {
        if end > start {
            let before = &content[..start];
            let after = &content[end + 8..];
            format!("{}{}", before.trim(), after.trim())
        } else {
            content.to_string()
        }
    } else {
        content.to_string()
    };
    // Cap at 2000 chars to prevent context window flooding
    without_thinking.trim()[..without_thinking.trim().len().min(2000)].to_string()
}
