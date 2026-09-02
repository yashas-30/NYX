// ─────────────────────────────────────────────────────────────────────────────
// NYX — Conductor Supervisor Actor (DAG Planner & Multi-Agent Swarm)
// ─────────────────────────────────────────────────────────────────────────────

use super::react_loop::{AgentExecutionStep, ReActLoopEngine};
use crate::agents::tools::ClineFsTools;
use crate::llm::gateway::{DynamicModelRegistry, LiveQuotaLedger};
use crate::llm::router::{PrimaryIntent, RouteDecision};
use serde::{Deserialize, Serialize};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub step_id: u32,
    pub title: String,
    pub description: String,
    pub status: String, // "pending" | "running" | "completed" | "failed"
    pub result_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConductorPlan {
    pub goal: String,
    pub steps: Vec<PlanStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConductorProgressEvent {
    pub event_type: String, // "plan_created" | "step_started" | "step_finished" | "reflecting" | "finished" | "error"
    pub current_step: Option<u32>,
    pub message: String,
    pub plan: Option<ConductorPlan>,
    pub final_output: Option<String>,
}

pub struct ConductorSupervisor {
    pub cline_fs: Arc<ClineFsTools>,
    pub registry: Arc<DynamicModelRegistry>,
    pub quota_ledger: Arc<LiveQuotaLedger>,
    pub react_engine: Arc<ReActLoopEngine>,
    pub cancel_flag: Arc<AtomicBool>,
}

impl ConductorSupervisor {
    pub fn new(
        cline_fs: Arc<ClineFsTools>,
        registry: Arc<DynamicModelRegistry>,
        quota_ledger: Arc<LiveQuotaLedger>,
        cancel_flag: Arc<AtomicBool>,
    ) -> Self {
        let react_engine = Arc::new(ReActLoopEngine::new(
            cline_fs.clone(),
            registry.clone(),
            quota_ledger.clone(),
            cancel_flag.clone(),
        ));

        Self {
            cline_fs,
            registry,
            quota_ledger,
            react_engine,
            cancel_flag,
        }
    }

    /// Runs the autonomous agent workflow directly through the high-throughput ReAct loop
    pub async fn run_agent_workflow(
        &self,
        app: &AppHandle,
        user_prompt: &str,
        route: &RouteDecision,
        on_progress: Channel<ConductorProgressEvent>,
        on_step: Channel<AgentExecutionStep>,
    ) -> Result<String, String> {
        let plan = build_execution_plan(user_prompt, route);
        let _ = on_progress.send(ConductorProgressEvent {
            event_type: "plan_created".to_string(),
            current_step: Some(1),
            message: format!("Execution plan created for {:?}.", route.intent),
            plan: Some(plan.clone()),
            final_output: None,
        });

        let _ = on_progress.send(ConductorProgressEvent {
            event_type: "started".to_string(),
            current_step: Some(1),
            message: "Running autonomous codebase agent...".to_string(),
            plan: None,
            final_output: None,
        });

        // Direct single-engine ReAct execution (Cline standard: direct streaming & surgical tool application)
        let planned_prompt = format!(
            "Execution intent: {:?}\nWeb search required: {}\nSearch depth: {}\nOutput format: {}\n\nOriginal task: {}",
            route.intent,
            route.needs_web_search,
            route.search_depth,
            route.target_diagram_format.as_deref().unwrap_or("default"),
            user_prompt
        );
        let result = self
            .react_engine
            .execute_task(app, &planned_prompt, 10, on_step.clone())
            .await?;

        let _ = on_progress.send(ConductorProgressEvent {
            event_type: "finished".to_string(),
            current_step: None,
            message: "Autonomous task completed.".to_string(),
            plan: None,
            final_output: Some(result.clone()),
        });

        Ok(result)
    }
}

fn build_execution_plan(goal: &str, route: &RouteDecision) -> ConductorPlan {
    let mut steps = vec![
        PlanStep {
            step_id: 1,
            title: "Understand request".to_string(),
            description: format!("Resolve the {:?} intent and gather required context.", route.intent),
            status: "pending".to_string(),
            result_summary: None,
        },
        PlanStep {
            step_id: 2,
            title: "Execute and verify".to_string(),
            description: "Perform permitted actions and verify the resulting output.".to_string(),
            status: "pending".to_string(),
            result_summary: None,
        },
    ];

    if matches!(route.intent, PrimaryIntent::DeepResearch) || route.needs_web_search {
        steps[0].description.push_str(" Use web-grounded sources with bounded retrieval.");
    }

    ConductorPlan { goal: goal.to_string(), steps }
}
