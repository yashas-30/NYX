use anyhow::Result;
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::task::JoinSet;
use crate::commands::mcp::McpManager;
use crate::commands::agent_orchestrator::StreamContext;
use crate::commands::llm::{execute_llm_call_auto, UnifiedMessage};
use tauri::{AppHandle, Emitter, Manager};

/// Represents the memory and state of an agent session
#[derive(Clone)]
pub struct AgentContext {
    pub branch_id: String,
    pub history: Vec<String>,
    pub current_goal: String,
    pub mcp_manager: Arc<McpManager>,
    pub app: AppHandle,
    pub event_name: String,
    pub provider: String,
    pub model: String,
    pub api_key: String,
}

impl AgentContext {
    /// Creates a base context
    pub fn new(
        goal: String,
        mcp_manager: Arc<McpManager>,
        app: AppHandle,
        event_name: String,
        provider: String,
        model: String,
        api_key: String,
    ) -> Self {
        Self {
            branch_id: "main".to_string(),
            history: vec![format!("Initialized with goal: {}", goal)],
            current_goal: goal,
            mcp_manager,
            app,
            event_name,
            provider,
            model,
            api_key,
        }
    }

    /// Implements 'Context Forking' by cloning the state and assigning a new branch
    pub fn fork(&self, new_branch_id: &str, sub_goal: &str) -> Self {
        let mut new_history = self.history.clone();
        new_history.push(format!("Forked from {} to {} for sub-goal: {}", self.branch_id, new_branch_id, sub_goal));
        
        Self {
            branch_id: new_branch_id.to_string(),
            history: new_history,
            current_goal: sub_goal.to_string(),
            mcp_manager: self.mcp_manager.clone(),
            app: self.app.clone(),
            event_name: self.event_name.clone(),
            provider: self.provider.clone(),
            model: self.model.clone(),
            api_key: self.api_key.clone(),
        }
    }
}

/// Simulates a Kimi-style Agent Swarm with a Manager-Worker pattern
pub async fn run_swarm_manager(
    context: StreamContext,
    messages: Vec<Value>,
    mcp_manager: Arc<McpManager>,
    app: AppHandle,
    event_name: String
) -> Result<String> {
    let epic = messages.last().and_then(|m| m["content"].as_str()).unwrap_or("").to_string();
    let _ = app.emit(&event_name, json!({
        "type": "thinking",
        "content": format!("\n🚀 [Swarm Manager] Initializing Swarm for task: {}\n", epic)
    }));

    // Step 1: Decompose the task using LLM
    let _ = app.emit(&event_name, json!({
        "type": "thinking",
        "content": "Decomposing task into subtasks using LLM...\n"
    }));

    let system_instruction = Some("You are an expert project manager. Break down the user's task into 3-5 parallel subtasks, each assigned to a specialized agent (planner, researcher, coder, reviewer, writer, or tester).".to_string());
    
    let prompt = format!(
        "Decompose the following task into 3-5 parallel subtasks. Return ONLY a valid JSON array of objects (do NOT wrap it in markdown block, do not include backticks, just the raw JSON text), where each object has these exact fields:
- name: String (e.g. 'Researcher', 'Backend Developer', 'Reviewer')
- role: String (one of: 'planner', 'researcher', 'coder', 'reviewer', 'writer', 'tester')
- task: String (the specific instruction for this agent)
- tools: Array of Strings (e.g. ['read_file', 'web_search'])

Task:
{}", epic
    );

    let messages_decom = vec![UnifiedMessage {
        role: "user".to_string(),
        content: json!(prompt),
    }];

    let decomposition_raw = match execute_llm_call_auto(
        &context.provider,
        &context.model,
        &context.api_key,
        system_instruction,
        messages_decom,
    ).await {
        Ok(res) => res,
        Err(e) => {
            let err_msg = format!("Task decomposition failed: {}", e);
            let _ = app.emit(&event_name, json!({ "type": "error", "content": &err_msg }));
            return Err(anyhow::anyhow!(err_msg));
        }
    };

    // Clean JSON string from potential markdown wrappers
    let cleaned_json = decomposition_raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string();

    let subtasks_json: Value = match serde_json::from_str(&cleaned_json) {
        Ok(v) => v,
        Err(_) => {
            // Fallback default decomposition if JSON parsing fails
            json!([
                { "name": "Researcher", "role": "researcher", "task": format!("Search for relevant context and files for: {}", epic), "tools": vec!["web_search"] },
                { "name": "Coder", "role": "coder", "task": format!("Implement the core request for: {}", epic), "tools": vec!["read_file", "write_file"] },
                { "name": "Reviewer", "role": "reviewer", "task": format!("Review code changes and verify correctness for: {}", epic), "tools": vec!["read_file"] }
            ])
        }
    };

    let mut agents_list = vec![];
    if let Some(arr) = subtasks_json.as_array() {
        for (idx, item) in arr.iter().enumerate() {
            let name = item["name"].as_str().unwrap_or("Worker").to_string();
            let role = item["role"].as_str().unwrap_or("coder").to_string();
            let task = item["task"].as_str().unwrap_or("Execute subtask").to_string();
            let tools: Vec<String> = item["tools"].as_array().map_or(vec![], |t_arr| {
                t_arr.iter().map(|t| t.as_str().unwrap_or("").to_string()).collect()
            });

            agents_list.push(json!({
                "id": format!("agent-{}", idx + 1),
                "name": name,
                "role": role,
                "status": "idle",
                "progress": 0,
                "task": task,
                "result": "",
                "tools": tools,
            }));
        }
    }

    // Emit the decomposition to the UI
    let _ = app.emit(&event_name, json!({
        "type": "swarm_decomposition",
        "agents": agents_list
    }));

    // Step 2: Spawn parallel agents using JoinSet
    let _ = app.emit(&event_name, json!({
        "type": "thinking",
        "content": "Spawning sub-agents in parallel...\n"
    }));

    let base_context = AgentContext::new(
        epic.clone(),
        mcp_manager,
        app.clone(),
        event_name.clone(),
        context.provider.clone(),
        context.model.clone(),
        context.api_key.clone(),
    );

    let mut set = JoinSet::new();

    for agent_val in &agents_list {
        let agent_id = agent_val["id"].as_str().unwrap_or("").to_string();
        let name = agent_val["name"].as_str().unwrap_or("").to_string();
        let role = agent_val["role"].as_str().unwrap_or("").to_string();
        let task = agent_val["task"].as_str().unwrap_or("").to_string();
        
        let forked_context = base_context.fork(&agent_id, &task);

        set.spawn(async move {
            run_worker_agent_loop(forked_context, agent_id, name, role, task).await
        });
    }

    let mut reports = vec![];
    while let Some(res) = set.join_next().await {
        if let Ok(worker_res) = res {
            reports.push(worker_res);
        }
    }

    // Step 3: Result Aggregation
    let _ = app.emit(&event_name, json!({
        "type": "thinking",
        "content": "Consolidating all sub-agent results...\n"
    }));

    let mut reports_text = String::new();
    for r in &reports {
        reports_text.push_str(&format!("Agent: {} ({})\nTask: {}\nResult: {}\n\n", r.name, r.role, r.task, r.result));
    }

    let aggregator_sys = Some("You are the Swarm Result Aggregator. Consolidate parallel agent outputs into a comprehensive and coherent final response.".to_string());
    let aggregator_prompt = format!(
        "The parallel agents have finished executing their subtasks. Consolidate their reports into a single cohesive response answering the user's initial request.

Initial User Request:
{}

Agent Reports:
{}

Final Consolidated Response:", epic, reports_text
    );

    let messages_agg = vec![UnifiedMessage {
        role: "user".to_string(),
        content: json!(aggregator_prompt),
    }];

    let final_result = match execute_llm_call_auto(
        &context.provider,
        &context.model,
        &context.api_key,
        aggregator_sys,
        messages_agg,
    ).await {
        Ok(res) => res,
        Err(e) => format!("Consolidation failed: {}. Raw report summary:\n{}", e, reports_text),
    };

    // Emit consolidated result to UI
    let _ = app.emit(&event_name, json!({
        "type": "swarm_aggregated_result",
        "result": final_result
    }));

    Ok(final_result)
}

struct WorkerResult {
    name: String,
    role: String,
    task: String,
    result: String,
}

async fn run_worker_agent_loop(
    ctx: AgentContext,
    agent_id: String,
    name: String,
    role: String,
    task: String,
) -> WorkerResult {
    // Notify UI that this agent is running
    let _ = ctx.app.emit(&ctx.event_name, json!({
        "type": "swarm_agent_update",
        "agent_id": agent_id,
        "status": "running",
        "progress": 10,
        "task": &task,
        "result": "",
        "tools": vec!["read_file", "web_search"],
    }));

    // Simulate Agent loop - 1st turn reasoning/planning
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    let _ = ctx.app.emit(&ctx.event_name, json!({
        "type": "swarm_agent_update",
        "agent_id": agent_id,
        "status": "running",
        "progress": 40,
        "task": "Executing task and gathering context...",
    }));

    // Call the LLM to execute the task
    let system_instruction = Some(format!(
        "You are the specialized agent '{}' with role '{}'. Your task is: '{}'. Achieve this task, explain your reasoning, and summarize your final findings.",
        name, role, task
    ));

    let messages = vec![UnifiedMessage {
        role: "user".to_string(),
        content: json!(task),
    }];

    let result = match execute_llm_call_auto(
        &ctx.provider,
        &ctx.model,
        &ctx.api_key,
        system_instruction,
        messages,
    ).await {
        Ok(res) => res,
        Err(e) => format!("Execution failed: {}", e),
    };

    // Notify UI that this agent has completed
    let _ = ctx.app.emit(&ctx.event_name, json!({
        "type": "swarm_agent_update",
        "agent_id": agent_id,
        "status": "completed",
        "progress": 100,
        "task": &task,
        "result": &result,
    }));

    // Save context to database
    let db_pool = ctx.app.try_state::<sqlx::SqlitePool>();
    if let Some(pool) = db_pool.as_deref() {
        let _ = crate::db::commands::write_swarm_context_internal(
            pool,
            &ctx.event_name,
            &agent_id,
            &task,
            &result,
        ).await;
    }

    WorkerResult {
        name,
        role,
        task,
        result,
    }
}
