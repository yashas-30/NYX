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

    // Register sqlite-vec extension globally for all SQLite connections in this process.
    // This allows sqlx to use sqlite-vec natively.
    unsafe {
        rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(
            sqlite_vec::sqlite3_vec_init as *const (),
        )));
    }

    info!("Initializing SQLite connection pool at: {:?}", db_path);

    let db_url = format!("sqlite:{}", db_path.to_string_lossy());

    let options = SqliteConnectOptions::from_str(&db_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_millis(5000));

    let pool = SqlitePoolOptions::new()
        .max_connections(10)
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
            agent_id TEXT NOT NULL,
            task TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (session_id) REFERENCES db_sessions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS long_term_memories (
            id TEXT PRIMARY KEY,
            fact TEXT NOT NULL,
            category TEXT NOT NULL,
            embedding BLOB NOT NULL, -- raw little-endian f32 bytes (Vec<u8>)
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS experience_ledger (
            id TEXT PRIMARY KEY,
            prompt TEXT NOT NULL,
            failure_type TEXT NOT NULL,
            assertion_error TEXT NOT NULL,
            timestamp INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS swarm_cache (
            id TEXT PRIMARY KEY,
            prompt TEXT NOT NULL,
            result TEXT NOT NULL,
            embedding TEXT NOT NULL, -- JSON float array
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_memory (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            content TEXT NOT NULL,
            embedding TEXT NOT NULL, -- JSON float array
            created_at INTEGER NOT NULL
        );

        -- Phase 1: LLM Observability — trace every inference call
        CREATE TABLE IF NOT EXISTS llm_traces (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            latency_ms INTEGER NOT NULL DEFAULT 0,
            cached INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            agent_node_id TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_llm_traces_session ON llm_traces(session_id);
        CREATE INDEX IF NOT EXISTS idx_llm_traces_model ON llm_traces(model);
        CREATE INDEX IF NOT EXISTS idx_llm_traces_created ON llm_traces(created_at);

        -- Phase 2: Multi-tier memory — episodic session summaries
        CREATE TABLE IF NOT EXISTS episodic_memories (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            summary TEXT NOT NULL,
            embedding BLOB NOT NULL, -- raw little-endian f32 bytes (Vec<u8>)
            key_topics TEXT NOT NULL DEFAULT '[]',
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_episodic_session ON episodic_memories(session_id);

        -- Phase 2: Multi-tier memory — entity knowledge graph
        CREATE TABLE IF NOT EXISTS memory_entities (
            id TEXT PRIMARY KEY,
            entity_name TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            description TEXT NOT NULL,
            confidence REAL NOT NULL DEFAULT 1.0,
            last_seen INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_name_type ON memory_entities(entity_name, entity_type);
    "#;

    sqlx::query(schema).execute(&pool).await?;

    info!("SQLite connection pool established and schema initialized.");
    Ok(pool)
}
