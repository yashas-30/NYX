// ─────────────────────────────────────────────────────────────────────────────
// NYX — Agent Pipeline Commands (Tauri IPC Bridge)
// ─────────────────────────────────────────────────────────────────────────────

use crate::agents::core::{
    AgentExecutionStep, ConductorProgressEvent, ConductorSupervisor,
};
use crate::agents::tools::{ClineFsTools, WorkspaceSandbox};
use crate::llm::gateway::{DynamicModelSpec, ProviderQuotaState};
use crate::llm::router::{classify_intent_dynamically, RouteDecision};
use crate::AppState;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

/// Runs the full autonomous multi-agent workflow inside the sandboxed project directory
#[tauri::command]
pub async fn nyx_run_agent_pipeline(
    app: AppHandle,
    prompt: String,
    workspace_root: Option<String>,
    on_progress: Channel<ConductorProgressEvent>,
    on_step: Channel<AgentExecutionStep>,
) -> Result<String, String> {
    let validated_prompt = crate::guardrails::validate_agent_input(&prompt);
    if !validated_prompt.allowed {
        return Err(validated_prompt.violation.unwrap_or_else(|| "Prompt rejected by guardrails".to_string()));
    }

    let state = app.state::<AppState>();
    state.agent_cancel.store(false, Ordering::Relaxed);

    // Determine sandbox root (defaults to current dir or user-provided workspace path)
    let root_path = if let Some(ws) = workspace_root {
        std::path::PathBuf::from(ws)
    } else {
        std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
    };

    let sandbox = WorkspaceSandbox::new(root_path);
    let cline_fs = Arc::new(ClineFsTools::new(sandbox));

    let supervisor = ConductorSupervisor::new(
        cline_fs,
        state.model_registry.clone(),
        state.quota_ledger.clone(),
        state.agent_cancel.clone(),
    );

    let route = crate::llm::router::classify_intent_dynamically(
        &app,
        &validated_prompt.sanitized.unwrap_or(prompt.clone()),
        &state.model_registry,
        &state.quota_ledger,
        None,
    )
    .await
    .unwrap_or_default();

    supervisor
        .run_agent_workflow(&app, &prompt, &route, on_progress, on_step)
        .await
}

/// Classifies user prompt intent dynamically
#[tauri::command]
pub async fn nyx_classify_intent(
    app: AppHandle,
    prompt: String,
    api_key_override: Option<String>,
) -> Result<RouteDecision, String> {
    let state = app.state::<AppState>();
    classify_intent_dynamically(
        &app,
        &prompt,
        &state.model_registry,
        &state.quota_ledger,
        api_key_override.as_deref(),
    )
    .await
}

/// Fetches live quota and rate-limit states across all providers for UI badges
#[tauri::command]
pub async fn nyx_get_live_quota_states(app: AppHandle) -> Result<Vec<ProviderQuotaState>, String> {
    let state = app.state::<AppState>();
    Ok(state.quota_ledger.get_all_states().await)
}

/// Synchronizes available models dynamically from provider `/models` endpoints
#[tauri::command]
pub async fn nyx_sync_dynamic_models(
    app: AppHandle,
    provider: String,
    api_key: String,
) -> Result<Vec<DynamicModelSpec>, String> {
    let state = app.state::<AppState>();
    state
        .model_registry
        .sync_provider_models(&provider, &api_key)
        .await
}

/// Cancels the currently active agent pipeline run
#[tauri::command]
pub async fn nyx_cancel_agent(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    state.agent_cancel.store(true, Ordering::Relaxed);
    Ok(())
}

/// Runs the official Google Antigravity Python SDK bridge with live streaming
#[tauri::command]
pub async fn run_antigravity_python_agent(
    req: serde_json::Value,
    on_event: Channel<serde_json::Value>,
) -> Result<String, String> {
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::process::Command;

    let script_path = std::env::current_dir()
        .map(|p| {
            let in_root = p.join("src-tauri").join("scripts").join("antigravity_bridge.py");
            if in_root.exists() {
                in_root
            } else {
                p.join("scripts").join("antigravity_bridge.py")
            }
        })
        .unwrap_or_else(|_| std::path::PathBuf::from("src-tauri/scripts/antigravity_bridge.py"));

    let mut child = Command::new("python")
        .arg("-u")
        .arg(&script_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Python process: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        let req_str = req.to_string();
        let _ = stdin.write_all(req_str.as_bytes()).await;
        let _ = stdin.shutdown().await;
    }

    let mut final_text = String::new();
    if let Some(stdout) = child.stdout.take() {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                let _ = on_event.send(val.clone());
                if val.get("event").and_then(|e| e.as_str()) == Some("done") {
                    if let Some(d) = val.get("data").and_then(|s| s.as_str()) {
                        final_text = d.to_string();
                    }
                }
            }
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("Python Antigravity SDK process exited with status {}", status));
    }

    Ok(final_text)
}

/// Runs the LangGraph ReAct agent workflow via Python subprocess
#[tauri::command]
pub async fn run_langgraph_python_agent(
    prompt: String,
    mode: Option<String>,
    api_key: Option<String>,
    on_event: Channel<serde_json::Value>,
) -> Result<String, String> {
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

    let script_path = std::env::current_dir()
        .map(|p| {
            let in_root = p.join("scripts").join("antigravity_agent_workflow.py");
            if in_root.exists() {
                in_root
            } else {
                p.join("..").join("scripts").join("antigravity_agent_workflow.py")
            }
        })
        .unwrap_or_else(|_| std::path::PathBuf::from("scripts/antigravity_agent_workflow.py"));

    let mut cmd = Command::new("python");
    cmd.arg("-u")
        .arg(&script_path)
        .arg("--prompt")
        .arg(&prompt)
        .arg("--mode")
        .arg(mode.unwrap_or_else(|| "langgraph".to_string()));

    if let Some(key) = api_key {
        cmd.env("GEMINI_API_KEY", key);
    }

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn LangGraph workflow: {}", e))?;

    let mut final_text = String::new();
    if let Some(stdout) = child.stdout.take() {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = on_event.send(serde_json::json!({
                "event": "token",
                "data": line
            }));
            final_text.push_str(&line);
            final_text.push('\n');
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("LangGraph workflow exited with status {}", status));
    }

    let _ = on_event.send(serde_json::json!({
        "event": "done",
        "data": final_text.trim()
    }));

    Ok(final_text.trim().to_string())
}
