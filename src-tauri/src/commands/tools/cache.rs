// ─────────────────────────────────────────────────────────────────────────────
// NYX — Tools Cache & HTTP Infrastructure
// ─────────────────────────────────────────────────────────────────────────────

use std::sync::LazyLock;
use std::time::Duration;

/// Shared HTTP client with connection pool reuse across all tool operations
pub static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0")
        .timeout(Duration::from_secs(15))
        .connect_timeout(Duration::from_secs(8))
        .pool_max_idle_per_host(4)
        .pool_idle_timeout(Duration::from_secs(60))
        .tcp_keepalive(Duration::from_secs(30))
        .http2_keep_alive_interval(Duration::from_secs(20))
        .http2_keep_alive_while_idle(true)
        .http2_keep_alive_timeout(Duration::from_secs(10))
        .connection_verbose(false)
        .build()
        .expect("Failed to build shared HTTP client")
});

pub struct CachedSearchResult {
    pub content: String,
    pub timestamp: std::time::Instant,
}

pub static SEARCH_CACHE: LazyLock<dashmap::DashMap<String, CachedSearchResult>> = LazyLock::new(dashmap::DashMap::new);
pub static PAGE_CACHE: LazyLock<dashmap::DashMap<String, CachedSearchResult>> = LazyLock::new(dashmap::DashMap::new);
pub static PROMPT_RESPONSE_CACHE: LazyLock<dashmap::DashMap<String, CachedSearchResult>> = LazyLock::new(dashmap::DashMap::new);

pub fn insert_bounded_cache(
    map: &dashmap::DashMap<String, CachedSearchResult>,
    key: String,
    val: CachedSearchResult,
    max_len: usize,
) {
    if map.len() >= max_len {
        if let Some(first_key) = map.iter().next().map(|entry| entry.key().clone()) {
            map.remove(&first_key);
        }
    }
    map.insert(key, val);
}

#[tauri::command]
pub async fn check_prompt_cache_command(prompt: String) -> Result<Option<String>, String> {
    let key = prompt.trim().to_lowercase();
    if let Some(cached) = PROMPT_RESPONSE_CACHE.get(&key) {
        if cached.value().timestamp.elapsed().as_secs() < 3600 {
            return Ok(Some(cached.value().content.clone()));
        } else {
            drop(cached);
            PROMPT_RESPONSE_CACHE.remove(&key);
        }
    }
    Ok(None)
}

#[tauri::command]
pub async fn save_prompt_cache_command(prompt: String, response: String) -> Result<(), String> {
    let key = prompt.trim().to_lowercase();
    if !key.is_empty() && !response.trim().is_empty() {
        insert_bounded_cache(&PROMPT_RESPONSE_CACHE, key, CachedSearchResult {
            content: response,
            timestamp: std::time::Instant::now(),
        }, 50);
    }
    Ok(())
}

#[tauri::command]
pub async fn clear_prompt_cache_command() -> Result<usize, String> {
    let count = PROMPT_RESPONSE_CACHE.len() + SEARCH_CACHE.len() + PAGE_CACHE.len();
    PROMPT_RESPONSE_CACHE.clear();
    SEARCH_CACHE.clear();
    PAGE_CACHE.clear();
    Ok(count)
}
