use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{error, info, warn};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct WorkerJob {
    pub id: String,
    pub name: String,
    pub payload: String,
    pub status: String,
    pub retries: i32,
    pub max_retries: i32,
    pub error: Option<String>,
    pub run_at: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn enqueue_job(pool: &SqlitePool, name: &str, payload: &str, run_at: Option<i64>) -> Result<String, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    let run_time = run_at.unwrap_or(now);

    sqlx::query(
        r#"
        INSERT INTO worker_jobs (id, name, payload, status, run_at, created_at, updated_at)
        VALUES (?, ?, ?, 'pending', ?, ?, ?)
        "#
    )
    .bind(id.clone())
    .bind(name)
    .bind(payload)
    .bind(run_time)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(id)
}

pub async fn start_worker_loop(pool: SqlitePool, db_path: std::path::PathBuf) {
    info!("🚀 Background Worker Queue started.");
    
    loop {
        if let Err(e) = process_pending_jobs(&pool, &db_path).await {
            error!("Error processing worker jobs: {}", e);
        }
        sleep(Duration::from_secs(5)).await;
    }
}

async fn process_pending_jobs(pool: &SqlitePool, db_path: &std::path::PathBuf) -> Result<(), sqlx::Error> {
    let now = chrono::Utc::now().timestamp();

    // Find a pending job
    let job = sqlx::query_as::<_, WorkerJob>(
        r#"
        SELECT id, name, payload, status, retries, max_retries, error, run_at, created_at, updated_at
        FROM worker_jobs
        WHERE status = 'pending' AND run_at <= ?
        ORDER BY run_at ASC
        LIMIT 1
        "#
    )
    .bind(now)
    .fetch_optional(pool)
    .await?;

    if let Some(mut job) = job {
        // Mark as processing
        sqlx::query(
            r#"
            UPDATE worker_jobs SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'pending'
            "#
        )
        .bind(now)
        .bind(&job.id)
        .execute(pool)
        .await?;

        info!("⚙️ Processing job {} ({})", job.id, job.name);

        let result = handle_job(&job, db_path).await;

        let end_now = chrono::Utc::now().timestamp();

        match result {
            Ok(_) => {
                info!("✅ Job {} completed successfully.", job.id);
                sqlx::query(
                    r#"
                    UPDATE worker_jobs SET status = 'completed', updated_at = ? WHERE id = ?
                    "#
                )
                .bind(end_now)
                .bind(&job.id)
                .execute(pool)
                .await?;
            }
            Err(e) => {
                warn!("❌ Job {} failed: {}", job.id, e);
                job.retries += 1;
                
                if job.retries >= job.max_retries {
                    sqlx::query(
                        r#"
                        UPDATE worker_jobs SET status = 'failed', error = ?, updated_at = ?, retries = ? WHERE id = ?
                        "#
                    )
                    .bind(&e)
                    .bind(end_now)
                    .bind(job.retries)
                    .bind(&job.id)
                    .execute(pool)
                    .await?;
                } else {
                    // Exponential backoff for retry
                    let next_run = end_now + (2i64.pow(job.retries as u32) * 5);
                    sqlx::query(
                        r#"
                        UPDATE worker_jobs SET status = 'pending', error = ?, updated_at = ?, retries = ?, run_at = ? WHERE id = ?
                        "#
                    )
                    .bind(&e)
                    .bind(end_now)
                    .bind(job.retries)
                    .bind(next_run)
                    .bind(&job.id)
                    .execute(pool)
                    .await?;
                }
            }
        }
    }

    Ok(())
}

async fn handle_job(job: &WorkerJob, db_path: &std::path::PathBuf) -> Result<(), String> {
    match job.name.as_str() {
        "continuous_learning_train" => {
            info!("Running continuous_learning_train job...");
            
            // Call Python script
            let script_path = std::env::current_dir()
                .unwrap_or_default()
                .parent()
                .map(|p| p.join("scripts").join("continuous_learning.py"))
                .unwrap_or_default();

            if script_path.exists() {
                let status = tokio::process::Command::new("python")
                    .arg(script_path.to_string_lossy().to_string())
                    .env("DB_PATH", db_path.to_string_lossy().to_string())
                    .status()
                    .await
                    .map_err(|e| format!("Failed to spawn python: {}", e))?;
                
                if !status.success() {
                    return Err(format!("Python script failed with status {}", status));
                }

                // Handle LoRA hot-reloading by restarting the LLM
                info!("Training complete, reloading embedded model...");
                crate::llm::embedded::stop_embedded_model().await;
                crate::llm::embedded::try_autostart_embedded().await;
            } else {
                warn!("Continuous learning script not found at {:?}", script_path);
            }
            
            Ok(())
        }
        "memory_compaction" => {
            info!("Running memory_compaction job...");
            tokio::time::sleep(Duration::from_secs(1)).await;
            Ok(())
        }
        _ => Err(format!("Unknown job name: {}", job.name)),
    }
}
