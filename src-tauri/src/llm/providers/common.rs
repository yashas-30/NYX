// ─────────────────────────────────────────────────────────────────────────────
// NYX — LLM Providers Shared Utilities
// ─────────────────────────────────────────────────────────────────────────────

use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use std::sync::LazyLock;
use crate::llm::types::UnifiedMessage;

pub const MAX_TOKENS_DEFAULT: u32 = 8_192;
pub const CONTEXT_BUDGET_CHARS: usize = 128_000 * 4; // ≈ 512k chars
pub const GEMINI_CONTEXT_BUDGET_CHARS: usize = 256_000 * 4; // ≈ 1M chars

/// Shared API Key validation response structure
#[derive(Serialize, Clone, Debug)]
pub struct QuotaResponse {
    pub status: String,
    pub valid: bool,
    pub provider: String,
    pub message: String,
}

/// Shared reachability response structure
#[derive(Serialize, Clone, Debug)]
pub struct ReachableResponse {
    pub reachable: bool,
    pub message: String,
}

/// In-memory validation cache (provider:key -> (valid, timestamp)) to avoid repeated quota burns
pub static KEY_VALIDATION_CACHE: LazyLock<std::sync::Mutex<std::collections::HashMap<String, (bool, std::time::Instant)>>> =
    LazyLock::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));

/// Clears cached validation results for all or a specific provider
pub fn clear_validation_cache(provider: Option<&str>) {
    if let Ok(mut cache) = KEY_VALIDATION_CACHE.lock() {
        if let Some(p) = provider {
            let prefix = format!("{}:", p);
            cache.retain(|k, _| !k.starts_with(&prefix));
        } else {
            cache.clear();
        }
    }
}

/// Builds an optimized HTTP client with TCP_NODELAY, HTTP/2 multiplexing, connection pooling, and fast keep-alive
pub fn build_fast_http_client(max_idle: usize, keepalive_secs: u64) -> Client {
    Client::builder()
        .http2_keep_alive_interval(std::time::Duration::from_secs(15))
        .http2_keep_alive_timeout(std::time::Duration::from_secs(5))
        .http2_adaptive_window(true)
        .http2_initial_stream_window_size(Some(2 * 1024 * 1024))
        .http2_initial_connection_window_size(Some(4 * 1024 * 1024))
        .tcp_nodelay(true)
        .tcp_keepalive(std::time::Duration::from_secs(keepalive_secs))
        .pool_max_idle_per_host(max_idle)
        .pool_idle_timeout(std::time::Duration::from_secs(300))
        .connect_timeout(std::time::Duration::from_secs(8))
        .gzip(true)
        .build()
        .expect("Failed to build high-speed HTTP client")
}

/// Extracts text string from a JSON message content Value (handles string or multimodal array)
pub fn get_content_string(val: &Value) -> String {
    match val {
        Value::String(s) => s.clone(),
        Value::Array(arr) => {
            arr.iter()
               .filter_map(|item| item.get("text").and_then(|v| v.as_str()))
               .collect::<Vec<_>>()
               .join("")
        }
        other => other.to_string(),
    }
}

/// Slice a message list to stay within context character budget
pub fn budget_messages(messages: &[UnifiedMessage], budget_chars: usize) -> Vec<UnifiedMessage> {
    if messages.is_empty() {
        return Vec::new();
    }
    let mut total = 0usize;
    let mut start_idx = messages.len();

    for (i, m) in messages.iter().enumerate().rev() {
        let chars = get_content_string(&m.content).len();
        if total + chars > budget_chars && start_idx < messages.len() {
            break;
        }
        total += chars;
        start_idx = i;
    }
    messages[start_idx..].to_vec()
}

pub fn validate_key_format(provider: &str, key: &str) -> Option<String> {
    let key = key.trim();
    if key.is_empty() {
        return Some("API key is empty.".to_string());
    }
    match provider {
        "gemini" | "gemma" => {
            if key.len() < 10 {
                return Some("Google API keys should be at least 10 characters.".to_string());
            }
        }
        "openrouter" => {
            if key.len() < 10 {
                return Some("OpenRouter keys should be at least 10 characters.".to_string());
            }
        }
        "groq" => {
            if key.len() < 10 {
                return Some("Groq keys should be at least 10 characters.".to_string());
            }
        }
        "nvidia-nim" | "nvidia" => {
            if key.len() < 10 {
                return Some("NVIDIA NIM keys should be at least 10 characters.".to_string());
            }
        }
        "mistral" => {
            if key.len() < 10 {
                return Some("Mistral keys should be at least 10 characters.".to_string());
            }
        }
        _ => {}
    }
    None
}
