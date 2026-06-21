use sqlx::sqlite::{SqlitePoolOptions, SqliteConnectOptions, SqliteJournalMode, SqliteSynchronous};
use sqlx::SqlitePool;
use std::path::PathBuf;
use std::str::FromStr;
use std::time::Duration;
use tracing::info;

/// Initialize the SQLite connection pool at the given path.
/// The caller is responsible for providing the correct platform-appropriate
/// path (use Tauri's `app.path().app_data_dir()` rather than guessing).
pub async fn init_db_pool(db_path: PathBuf) -> Result<SqlitePool, sqlx::Error> {
    // Ensure the parent directory exists
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    info!("Initializing SQLite connection pool at: {:?}", db_path);

    let db_url = format!("sqlite:{}", db_path.to_string_lossy());

    let options = SqliteConnectOptions::from_str(&db_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        // NORMAL sync is safe with WAL and ~3x faster than FULL
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_millis(5000));

    let pool = SqlitePoolOptions::new()
        // More connections for concurrent Tauri commands
        .max_connections(8)
        .min_connections(2)
        .idle_timeout(Duration::from_secs(120))
        .connect_with(options)
        .await?;

    // Apply performance PRAGMAs
    sqlx::query("PRAGMA cache_size = -32000").execute(&pool).await.ok(); // 32 MB page cache
    sqlx::query("PRAGMA mmap_size = 67108864").execute(&pool).await.ok(); // 64 MB mmap
    sqlx::query("PRAGMA temp_store = MEMORY").execute(&pool).await.ok();
    sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.ok();

    // Initialize schema
    let schema = r#"
        CREATE TABLE IF NOT EXISTS chat_conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            model TEXT NOT NULL,
            folder_id TEXT,
            tags TEXT,
            share_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            parent_id TEXT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            model TEXT NOT NULL,
            is_pinned INTEGER NOT NULL DEFAULT 0,
            timestamp INTEGER NOT NULL,
            token_usage TEXT,
            attachments TEXT,
            feedback INTEGER,
            FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS db_sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            model_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            created_at INTEGER,
            updated_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS db_messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            status TEXT,
            latency_ms INTEGER,
            tokens INTEGER,
            tps REAL,
            timestamp INTEGER,
            FOREIGN KEY (session_id) REFERENCES db_sessions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS swarm_context_pool (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at INTEGER,
            FOREIGN KEY (session_id) REFERENCES db_sessions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS long_term_memories (
            id TEXT PRIMARY KEY,
            fact TEXT NOT NULL,
            category TEXT NOT NULL,
            embedding TEXT NOT NULL, -- JSON float array
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS worker_jobs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            retries INTEGER NOT NULL DEFAULT 0,
            max_retries INTEGER NOT NULL DEFAULT 3,
            error TEXT,
            run_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        -- Performance indexes (IF NOT EXISTS so safe to re-run)
        CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at
            ON chat_conversations(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_chat_conversations_folder_id
            ON chat_conversations(folder_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_ts
            ON chat_messages(conversation_id, timestamp ASC);
        CREATE INDEX IF NOT EXISTS idx_db_sessions_updated_at
            ON db_sessions(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_db_messages_session_ts
            ON db_messages(session_id, timestamp ASC);
        CREATE INDEX IF NOT EXISTS idx_swarm_context_session_ts
            ON swarm_context_pool(session_id, created_at ASC);
        CREATE INDEX IF NOT EXISTS idx_long_term_memories_category
            ON long_term_memories(category);
        CREATE INDEX IF NOT EXISTS idx_worker_jobs_status_run_at
            ON worker_jobs(status, run_at ASC);
    "#;

    sqlx::query(schema).execute(&pool).await?;

    info!("SQLite connection pool established and schema initialized.");
    Ok(pool)
}
