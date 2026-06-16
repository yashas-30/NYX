use anyhow::Result;
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::task::JoinSet;
use crate::commands::mcp::McpManager;
use crate::commands::agent_orchestrator::StreamContext;
use tauri::{AppHandle, Emitter};

/// Represents the memory and state of an agent session
#[derive(Clone)]
pub struct AgentContext {
    pub branch_id: String,
    pub history: Vec<String>,
    pub current_goal: String,
    pub mcp_manager: Arc<McpManager>,
    pub app: AppHandle,
    pub event_name: String,
}

impl AgentContext {
    /// Creates a base context
    pub fn new(goal: String, mcp_manager: Arc<McpManager>, app: AppHandle, event_name: String) -> Self {
        Self {
            branch_id: "main".to_string(),
            history: vec![format!("Initialized with goal: {}", goal)],
            current_goal: goal,
            mcp_manager,
            app,
            event_name,
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
        "content": format!("\n🚀 [Swarm Manager] Initializing Epic: {}\n", epic)
    }));
    
    // Create the base context for the manager
    let base_context = AgentContext::new(epic.clone(), mcp_manager, app.clone(), event_name.clone());
    
    // Manager breaks down the epic into sub-tasks
    let sub_tasks = vec![
        ("frontend_worker", "Frontend Layer"),
        ("backend_worker", "Backend API"),
        ("db_worker", "Database Schema"),
        ("qa_worker", "QA Tests"),
    ];
    
    let _ = app.emit(&event_name, json!({"type": "thinking", "content": format!("Manager: Spawning {} parallel sub-agents via Context Forking...\n", sub_tasks.len())}));
    
    let mut set = JoinSet::new();
    
    // Spawn multiple agents in parallel by forking the context
    for (branch_name, task) in sub_tasks {
        let forked_context = base_context.fork(branch_name, &format!("{} - {}", epic, task));
        
        set.spawn(async move {
            run_worker_agent(forked_context).await
        });
    }
    
    let mut combined_report = String::from("Swarm Execution Report:\n");
    let mut i = 1;
    while let Some(res) = set.join_next().await {
        if let Ok(worker_res) = res {
            combined_report.push_str(&format!("Agent {}:\n{}\n", i, worker_res));
            i += 1;
        }
    }
    
    let _ = app.emit(&event_name, json!({"type": "content", "content": format!("{}\n", combined_report)}));
    
    Ok(combined_report)
}

async fn run_worker_agent(ctx: AgentContext) -> String {
    // Worker logic utilizing its forked context
    let _ = ctx.app.emit(&ctx.event_name, json!({"type": "thinking", "content": format!("Worker [{}] started. Goal: {}\n", ctx.branch_id, ctx.current_goal)}));
    
    // Simulate thinking/execution time
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    
    // Read MCP Servers lock to count active servers
    let server_count = ctx.mcp_manager.servers.lock().await.len();

    // Format the worker's report based on its context history
    let report = format!(
        "  Branch: {}\n  Goal: {}\n  History Logs: {} events processed\n  Active MCP Servers Available: {}",
        ctx.branch_id,
        ctx.current_goal,
        ctx.history.len(),
        server_count
    );
    
    report
}
