// src-tauri/src/commands/observability.rs
//
// Phase 1: LLM Observability — Tauri commands
//
// Exposes trace data and model statistics to the frontend via invoke().

use crate::db::{models::{LlmTrace, ModelStats}, traces};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

/// Response for the observability dashboard overview card.
#[derive(Debug, Serialize, Deserialize)]
pub struct ObservabilitySummary {
    pub total_calls: i64,
    pub avg_latency_ms: f64,
    pub total_tokens: i64,
    pub error_rate: f64,   // 0.0 – 1.0
    pub cache_hit_rate: f64,
    pub model_stats: Vec<ModelStats>,
}

/// Fetch recent LLM traces for the trace table view.
#[tauri::command]
pub async fn get_llm_traces(
    pool: State<'_, SqlitePool>,
    session_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<LlmTrace>, String> {
    traces::get_traces(pool.inner(), session_id.as_deref(), limit.unwrap_or(100))
        .await
        .map_err(|e| e.to_string())
}

/// Fetch aggregated per-model statistics for the latency chart.
#[tauri::command]
pub async fn get_observability_summary(
    pool: State<'_, SqlitePool>,
) -> Result<ObservabilitySummary, String> {
    let model_stats = traces::get_model_stats(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let total_calls: i64 = model_stats.iter().map(|s| s.total_calls).sum();
    let total_errors: i64 = model_stats.iter().map(|s| s.error_count).sum();
    let total_cache_hits: i64 = model_stats.iter().map(|s| s.cache_hits).sum();
    let total_tokens: i64 = model_stats
        .iter()
        .map(|s| s.total_prompt_tokens + s.total_completion_tokens)
        .sum();

    // Weighted average latency across all models
    let avg_latency_ms = if total_calls == 0 {
        0.0
    } else {
        model_stats
            .iter()
            .map(|s| s.avg_latency_ms * s.total_calls as f64)
            .sum::<f64>()
            / total_calls as f64
    };

    let error_rate = if total_calls == 0 {
        0.0
    } else {
        total_errors as f64 / total_calls as f64
    };

    let cache_hit_rate = if total_calls == 0 {
        0.0
    } else {
        total_cache_hits as f64 / total_calls as f64
    };

    Ok(ObservabilitySummary {
        total_calls,
        avg_latency_ms,
        total_tokens,
        error_rate,
        cache_hit_rate,
        model_stats,
    })
}

/// Prune traces older than N days to keep the DB lean.
#[tauri::command]
pub async fn prune_llm_traces(
    pool: State<'_, SqlitePool>,
    days: Option<i64>,
) -> Result<u64, String> {
    traces::prune_old_traces(pool.inner(), days.unwrap_or(30))
        .await
        .map_err(|e| e.to_string())
}
