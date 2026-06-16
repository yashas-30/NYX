use sqlx::sqlite::{SqlitePoolOptions, SqliteConnectOptions, SqliteJournalMode};
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
        .busy_timeout(Duration::from_millis(5000));

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .idle_timeout(Duration::from_secs(60))
        .connect_with(options)
        .await?;

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
    "#;

    sqlx::query(schema).execute(&pool).await?;

    info!("SQLite connection pool established and schema initialized.");
    Ok(pool)
}
