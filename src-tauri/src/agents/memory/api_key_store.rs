/// Thread-safe API key store for the agent orchestrator.
///
/// Replaces the unsafe `std::env::set_var` pattern. When the Conductor
/// receives a RunTask command, it inserts the provider API key here.
/// DynamicWorkerActors read from this map when constructing their genai::Client,
/// eliminating the race condition where parallel tasks overwrite each other's keys.
use std::collections::HashMap;
use std::sync::Mutex;

lazy_static::lazy_static! {
    pub static ref TASK_API_KEYS: Mutex<HashMap<String, String>> = Mutex::new(HashMap::new());
}

/// Retrieve a key by environment variable name (e.g. "GEMINI_API_KEY").
/// Falls back to the actual env var if not set in the store, for backwards compatibility.
pub fn get_key(env_var_name: &str) -> String {
    // First try the in-memory store (set by Conductor per-task)
    if let Ok(keys) = TASK_API_KEYS.lock() {
        if let Some(val) = keys.get(env_var_name) {
            return val.clone();
        }
    }
    // Fallback: real environment variable (for dev / manual configuration)
    std::env::var(env_var_name).unwrap_or_default()
}
