// ─────────────────────────────────────────────────────────────────────────────
// NYX — Modular LLM Providers Router & Orchestrator Hub
// ─────────────────────────────────────────────────────────────────────────────

pub mod common;
pub mod gemini;
pub mod openrouter;
pub mod groq;
pub mod nvidia;
pub mod mistral;

pub use common::{QuotaResponse, ReachableResponse};
use crate::llm::types::{UnifiedRequest, StreamChunkPayload};
use tauri::{AppHandle, Emitter, Listener, Manager, ipc::Channel};

/// Routes and executes a streaming LLM request on its dedicated provider orchestrator
pub async fn execute_cloud_stream(
    req: &UnifiedRequest,
) -> Result<tokio::sync::mpsc::Receiver<Result<StreamChunkPayload, String>>, String> {
    match req.provider.as_str() {
        "gemini" | "gemma" => gemini::execute_stream(req).await,
        "openrouter" => openrouter::execute_stream(req).await,
        "groq" => groq::execute_stream(req).await,
        "nvidia-nim" | "nvidia" => nvidia::execute_stream(req).await,
        "mistral" => mistral::execute_stream(req).await,
        "nyx-native" => Err("Local models must use the local orchestrator, not cloud provider orchestrators.".to_string()),
        other => Err(format!("Unsupported provider: '{}'. Supported providers: gemini, openrouter, groq, nvidia-nim, mistral.", other)),
    }
}

/// Dispatches quota check to the dedicated provider module
#[tauri::command]
pub async fn get_models_quota(provider: String, api_key: Option<String>) -> Result<QuotaResponse, String> {
    match provider.as_str() {
        "gemini" | "gemma" => gemini::check_quota(api_key).await,
        "openrouter" => openrouter::check_quota(api_key).await,
        "groq" => groq::check_quota(api_key).await,
        "nvidia-nim" | "nvidia" => nvidia::check_quota(api_key).await,
        "mistral" => mistral::check_quota(api_key).await,
        other => Ok(QuotaResponse {
            status: "ok".into(),
            valid: true,
            provider: other.into(),
            message: "Provider active".into(),
        }),
    }
}

/// Checks network reachability for the given provider
#[tauri::command]
pub async fn check_provider_reachable(provider: String, api_key: Option<String>) -> Result<ReachableResponse, String> {
    let quota = get_models_quota(provider.clone(), api_key).await?;
    Ok(ReachableResponse {
        reachable: quota.valid,
        message: quota.message,
    })
}

/// Clears provider in-memory validation cache (e.g. on key update or user request)
#[tauri::command]
pub async fn clear_provider_cache(provider: Option<String>) -> Result<bool, String> {
    common::clear_validation_cache(provider.as_deref());
    Ok(true)
}

/// IPC command for frontend streaming requests across cloud providers
#[tauri::command]
pub async fn llm_stream_request(
    app: AppHandle,
    req: UnifiedRequest,
    on_event: Channel<StreamChunkPayload>,
) -> Result<(), String> {
    let event_name = req.event_name.clone();
    let provider = req.provider.clone();
    let model = req.model_id.clone();
    let prompt_len: usize = req.system_instruction.as_ref().map(|s| s.len()).unwrap_or(0)
        + req.messages.iter().map(|m| m.content.as_str().map(|s| s.len()).unwrap_or_else(|| m.content.to_string().len())).sum::<usize>();
    let prompt_tokens = (prompt_len / 4) as i64;

    let start_time = std::time::Instant::now();
    let mut completion_chars = 0;
    let mut final_error: Option<String> = None;

    let mut rx = if req.provider == "nyx-native" {
        return Err("llm_stream_request cannot be used for local models. Use llm_local_stream_request instead.".into());
    } else {
        execute_cloud_stream(&req).await?
    };

    // Listen for a cancel event from the frontend
    let cancel_name = format!("cancel_{}", event_name.clone().unwrap_or_default());
    let (cancel_tx, mut cancel_rx) = tokio::sync::mpsc::channel::<()>(1);
    let cancel_id = app.listen(cancel_name, move |_| {
        let _ = cancel_tx.try_send(());
    });

    loop {
        tokio::select! {
            msg = rx.recv() => {
                match msg {
                    Some(Ok(payload)) => {
                        if let Some(text) = &payload.content {
                            completion_chars += text.len();
                        }
                        if payload.event_type == "error" {
                            final_error = payload.error.clone();
                        }
                        if on_event.send(payload.clone()).is_err() {
                            if let Some(ref ev) = event_name {
                                let _ = app.emit(ev, payload);
                            }
                        }
                    }
                    Some(Err(e)) => {
                        final_error = Some(e.clone());
                        let err = StreamChunkPayload::error(e);
                        if on_event.send(err.clone()).is_err() {
                            if let Some(ref ev) = event_name {
                                let _ = app.emit(ev, err);
                            }
                        }
                    }
                    None => break,
                }
            }
            _ = cancel_rx.recv() => {
                break;
            }
        }
    }

    app.unlisten(cancel_id);

    // Record observability trace
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

    Ok(())
}
