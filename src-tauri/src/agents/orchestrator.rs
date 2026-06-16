use anyhow::Result;
use std::sync::Arc;
use crate::commands::mcp::McpManager;
use tauri::AppHandle;

pub enum AgentTask {
    CodeAnalysis(crate::commands::agent_orchestrator::StreamContext, Vec<serde_json::Value>),
    ChatQuery(crate::commands::agent_orchestrator::StreamContext, Vec<serde_json::Value>),
    SystemTask(crate::commands::agent_orchestrator::StreamContext, Vec<serde_json::Value>),
    SwarmEpic(crate::commands::agent_orchestrator::StreamContext, Vec<serde_json::Value>),
    PlanTask(crate::commands::agent_orchestrator::StreamContext, Vec<serde_json::Value>),
}

pub struct Orchestrator {
    pub mcp_manager: Arc<McpManager>,
}

impl Orchestrator {
    pub fn new(mcp_manager: Arc<McpManager>) -> Self {
        Self { mcp_manager }
    }

    pub async fn dispatch(&self, task: AgentTask, app: AppHandle, event_name: String) -> Result<String> {
        match task {
            AgentTask::ChatQuery(context, messages) => {
                crate::agents::chat::run_chat_agent(context, messages, app, event_name).await
            }
            AgentTask::CodeAnalysis(context, messages) => {
                crate::agents::opencode::run_opencode_agent(context, messages, app, event_name).await
            }
            AgentTask::SystemTask(context, messages) => {
                crate::agents::cline::run_cline_agent(context, messages, app, event_name).await
            }
            AgentTask::SwarmEpic(context, messages) => {
                crate::agents::swarm::run_swarm_manager(context, messages, self.mcp_manager.clone(), app, event_name).await
            }
            AgentTask::PlanTask(context, messages) => {
                crate::agents::planner::run_planner_agent(context, messages, app, event_name).await
            }
        }
    }
}
