// src-tauri/src/db/traces.rs
//
// Phase 1: LLM Observability
//
// Provides fire-and-forget trace recording for every LLM inference call.
// Called from agent_orchestrator.rs and dynamic_worker.rs after each
// streaming completion, injecting latency, token counts, and error info
// into the `llm_traces` SQLite table without blocking the hot path.

use crate::db::models::{LlmTrace, ModelStats};
use anyhow::Result;
use sqlx::SqlitePool;

/// Lightweight input struct — callers build this from timing + response metadata.


/// Fetch the N most recent trace rows for a given session (or all sessions).
pub async fn get_traces(
    pool: &SqlitePool,
    session_id: Option<&str>,
    limit: i64,
) -> Result<Vec<LlmTrace>> {
    let rows = if let Some(sid) = session_id {
        sqlx::query_as::<_, LlmTrace>(
            "SELECT * FROM llm_traces WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
        )
        .bind(sid)
        .bind(limit)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, LlmTrace>(
            "SELECT * FROM llm_traces ORDER BY created_at DESC LIMIT ?",
        )
        .bind(limit)
        .fetch_all(pool)
        .await?
    };
    Ok(rows)
}

/// Aggregate per-model statistics for the observability dashboard.
pub async fn get_model_stats(pool: &SqlitePool) -> Result<Vec<ModelStats>> {
    // SQLite doesn't have a native AVG on integers returning float, but sqlx handles it.
    let rows = sqlx::query_as::<_, (String, String, i64, f64, i64, i64, i64, i64)>(
        r#"SELECT
               model,
               provider,
               COUNT(*)                              AS total_calls,
               AVG(latency_ms)                       AS avg_latency_ms,
               COALESCE(SUM(prompt_tokens), 0)       AS total_prompt_tokens,
               COALESCE(SUM(completion_tokens), 0)   AS total_completion_tokens,
               SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS error_count,
               SUM(cached)                           AS cache_hits
           FROM llm_traces
           GROUP BY model, provider
           ORDER BY total_calls DESC"#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(model, provider, total_calls, avg_latency_ms, total_prompt_tokens, total_completion_tokens, error_count, cache_hits)| {
            ModelStats {
                model,
                provider,
                total_calls,
                avg_latency_ms,
                total_prompt_tokens,
                total_completion_tokens,
                error_count,
                cache_hits,
            }
        })
        .collect())
}

/// Delete traces older than `days` days to keep the DB lean.
pub async fn prune_old_traces(pool: &SqlitePool, days: i64) -> Result<u64> {
    let cutoff = chrono::Utc::now().timestamp() - (days * 86400);
    let result = sqlx::query("DELETE FROM llm_traces WHERE created_at < ?")
        .bind(cutoff)
        .execute(pool)
        .await?;
    Ok(result.rows_affected())
}
