use sqlx::sqlite::{SqlitePoolOptions, SqliteConnectOptions, SqliteJournalMode};
use sqlx::SqlitePool;
use std::path::PathBuf;
use std::str::FromStr;
use std::time::Duration;
use tracing::{info, error};

fn get_db_path() -> PathBuf {
    // Basic logic matching Node.js paths.ts
    // Assuming development for now or read from env.
    let mut path = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    
    // Simplistic check for dev vs prod (could be improved)
    if path.join("package.json").exists() || path.join("Cargo.toml").exists() {
        // We are likely in dev workspace
        // Usually, Cargo workspace is in `src-tauri`, so project root is `..`
        if path.ends_with("src-tauri") {
            path = path.parent().unwrap().to_path_buf();
        }
        path.push(".nyx-state");
    } else {
        // Prod: ~/.nyx
        if let Some(home) = dirs::home_dir() {
            path = home;
            path.push(".nyx");
        }
    }
    
    path.push("nyx.db");
    path
}

pub async fn init_db_pool() -> Result<SqlitePool, sqlx::Error> {
    let db_path = get_db_path();
    info!("Initializing SQLite connection pool for: {:?}", db_path);

    let db_url = format!("sqlite:{}", db_path.to_string_lossy());
    
    // Set connection options matching Drizzle's concurrent requirements
    let options = SqliteConnectOptions::from_str(&db_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_millis(5000));

    let pool = SqlitePoolOptions::new()
        .max_connections(5) // Don't overwhelm SQLite, but allow concurrent access
        .idle_timeout(Duration::from_secs(60))
        .connect_with(options)
        .await?;

    info!("SQLite connection pool established.");
    Ok(pool)
}
