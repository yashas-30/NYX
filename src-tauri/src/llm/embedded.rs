/// Embedded LLM sidecar — spawns the pre-built `llama-server.exe` from
/// `.nyx-models/bin/` and exposes an OpenAI-compatible endpoint on port 11435.
///
/// No native Rust/C++ bindings required; the inference engine is already compiled.
use crate::commands::llm::{UnifiedRequest, StreamChunkPayload};
use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    path::PathBuf,
    process::{Child, Command},
    sync::Arc,
    time::Duration,
};
use tokio::sync::Mutex;

// ── Constants ──────────────────────────────────────────────────────────────────

/// Port for the embedded llama-server (one above Ollama's default 11434).
pub const EMBEDDED_PORT: u16 = 11435;
/// Maximum seconds to wait for llama-server to become ready.
const HEALTH_TIMEOUT_SECS: u64 = 30;
/// Model filename that will be auto-downloaded on first launch.
pub const DEFAULT_MODEL_FILENAME: &str = "qwen2.5-1.5b-instruct-q4_k_m.gguf";
/// HuggingFace download URL for Qwen2.5-1.5B Q4_K_M.
pub const DEFAULT_MODEL_URL: &str =
    "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf";

// ── State ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EmbeddedState {
    NotStarted,
    Starting,
    Ready,
    Failed,
    ModelMissing,
}

pub struct EmbeddedEngine {
    pub state: EmbeddedState,
    pub error: Option<String>,
    /// The live child process handle — kept alive for the app lifetime.
    child: Option<Child>,
}

impl EmbeddedEngine {
    fn new() -> Self {
        Self {
            state: EmbeddedState::NotStarted,
            error: None,
            child: None,
        }
    }
}

lazy_static::lazy_static! {
    pub static ref EMBEDDED_ENGINE: Arc<Mutex<EmbeddedEngine>> =
        Arc::new(Mutex::new(EmbeddedEngine::new()));
}

// ── Path helpers ───────────────────────────────────────────────────────────────

/// Returns the absolute path to the `.nyx-models/bin/` directory
/// by walking up from the executable until the folder is found,
/// or falling back to a path relative to the cwd.
pub fn nyx_models_bin_dir() -> PathBuf {
    // In dev/tauri dev, the exe sits at target/debug/nyx.exe
    // so walk to the workspace root.
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().unwrap_or(std::path::Path::new(".")).to_path_buf();
        for _ in 0..6 {
            let candidate = dir.join(".nyx-models").join("bin");
            if candidate.exists() {
                return candidate;
            }
            if let Some(parent) = dir.parent() {
                dir = parent.to_path_buf();
            } else {
                break;
            }
        }
    }
    // Absolute fallback for the NYX project layout
    PathBuf::from(r"e:\NYX\.nyx-models\bin")
}

pub fn nyx_models_dir() -> PathBuf {
    nyx_models_bin_dir()
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .join("models")
}

pub fn default_model_path() -> PathBuf {
    nyx_models_dir().join(DEFAULT_MODEL_FILENAME)
}

// ── Public API ─────────────────────────────────────────────────────────────────

/// Called on app startup. If the model file exists, starts llama-server.
/// If the model file is missing, sets state to `ModelMissing` so the
/// frontend can offer a download prompt.
pub async fn try_autostart_embedded() {
    let model_path = default_model_path();
    if !model_path.exists() {
        let mut eng = EMBEDDED_ENGINE.lock().await;
        eng.state = EmbeddedState::ModelMissing;
        tracing::info!(
            "🤖 Embedded model not found at {}. Download required.",
            model_path.display()
        );
        return;
    }
    if let Err(e) = load_embedded_model(model_path.to_str().unwrap_or("")).await {
        tracing::error!("❌ Embedded model failed to start: {}", e);
    }
}

/// Loads and starts the embedded llama-server for the given `.gguf` model path.
/// Idempotent — does nothing if already in `Ready` state.
pub async fn load_embedded_model(model_path: &str) -> Result<()> {
    let mut eng = EMBEDDED_ENGINE.lock().await;

    // Already running — nothing to do.
    if eng.state == EmbeddedState::Ready {
        return Ok(());
    }

    let model = PathBuf::from(model_path);
    if !model.exists() {
        eng.state = EmbeddedState::ModelMissing;
        return Err(anyhow!("model_not_found: {}", model_path));
    }

    let bin_dir = nyx_models_bin_dir();
    let server_exe = bin_dir.join("llama-server.exe");
    if !server_exe.exists() {
        let msg = format!("llama-server.exe not found at {}", server_exe.display());
        eng.state = EmbeddedState::Failed;
        eng.error = Some(msg.clone());
        return Err(anyhow!(msg));
    }

    eng.state = EmbeddedState::Starting;
    tracing::info!(
        "🚀 Starting embedded llama-server: model={} port={}",
        model_path, EMBEDDED_PORT
    );

    // Spawn llama-server with Vulkan/GPU acceleration if available,
    // falling back gracefully to CPU. --n-gpu-layers 99 is harmless on CPU-only.
    let child = Command::new(&server_exe)
        .current_dir(&bin_dir) // DLLs are in the same dir
        .args([
            "--model",        model_path,
            "--port",         &EMBEDDED_PORT.to_string(),
            "--ctx-size",     "4096",
            "--threads",      "4",
            "--n-gpu-layers", "99",
            "--log-disable",
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| anyhow!("Failed to spawn llama-server: {}", e))?;

    eng.child = Some(child);

    // Release the lock while we poll for health — otherwise the app blocks.
    drop(eng);

    wait_for_ready().await?;

    let mut eng = EMBEDDED_ENGINE.lock().await;
    eng.state = EmbeddedState::Ready;
    tracing::info!("✅ Embedded llama-server is ready on port {}", EMBEDDED_PORT);
    Ok(())
}

/// Returns the current state of the embedded engine (for the frontend status API).
pub async fn embedded_status() -> (EmbeddedState, Option<String>) {
    let eng = EMBEDDED_ENGINE.lock().await;
    (eng.state.clone(), eng.error.clone())
}

/// Kills the llama-server child process on app exit.
pub async fn stop_embedded_model() {
    let mut eng = EMBEDDED_ENGINE.lock().await;
    if let Some(mut child) = eng.child.take() {
        let _ = child.kill();
        tracing::info!("🛑 Embedded llama-server stopped.");
    }
    eng.state = EmbeddedState::NotStarted;
}

/// Returns `true` if the embedded model is ready to serve requests.
pub async fn is_embedded_ready() -> bool {
    let eng = EMBEDDED_ENGINE.lock().await;
    eng.state == EmbeddedState::Ready
}

// ── Streaming inference ────────────────────────────────────────────────────────

/// Routes the request to the local llama-server's OpenAI-compatible endpoint.
/// Enriches the system prompt with long-term memories from SQLite.
/// After inference, asynchronously extracts new memories and logs the interaction.
pub async fn execute_embedded_stream(
    req: &UnifiedRequest,
) -> Result<tokio::sync::mpsc::Receiver<Result<StreamChunkPayload, String>>, String> {
    // Verify server is ready before attempting a request.
    {
        let eng = EMBEDDED_ENGINE.lock().await;
        if eng.state != EmbeddedState::Ready {
            return Err(format!(
                "Embedded model is not ready (state: {:?}). \
                 Call llm_load_embedded first or wait for auto-start.",
                eng.state
            ));
        }
    }

    // ── Memory injection placeholder ────────────────────────────────────────
    // Memory facts are injected via the system prompt. The pool-based injection
    // is handled at the command layer (execute_llm_call_auto) which has pool access.
    let memory_block = String::new();

    // Build an OpenAI-compatible messages array.
    let mut msgs = vec![];
    let base_system = req.system_instruction.clone().unwrap_or_default();
    // We append the memory block to the system prompt
    let enriched_system = if !memory_block.is_empty() {
        format!("{base_system}{memory_block}")
    } else {
        base_system
    };
    if !enriched_system.is_empty() {
        msgs.push(json!({"role": "system", "content": enriched_system}));
    }
    for m in &req.messages {
        let content_str = match &m.content {
            serde_json::Value::String(s) => s.clone(),
            other => other.to_string(),
        };
        msgs.push(json!({"role": m.role, "content": content_str}));
    }

    // Extract user prompt for post-inference logging
    let user_prompt: String = req.messages.iter()
        .filter(|m| m.role == "user")
        .last()
        .map(|m| match &m.content {
            serde_json::Value::String(s) => s.clone(),
            other => other.to_string(),
        })
        .unwrap_or_default();

    let body = json!({
        "model": "local-model",   // llama-server ignores this field
        "messages": msgs,
        "temperature": req.temperature.unwrap_or(0.3),
        "max_tokens": req.max_tokens.unwrap_or(2048),
        "stream": true,
    });

    let url = format!("http://127.0.0.1:{}/v1/chat/completions", EMBEDDED_PORT);

    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach embedded llama-server: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("llama-server error ({}): {}", status, text));
    }

    // Delegate SSE parsing to the shared openai parser via a re-implementation
    // of the streaming loop (same logic as the openai branch in execute_llm_stream).
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio_util::io::StreamReader;
    use futures_util::TryStreamExt;

    let (tx, rx) = tokio::sync::mpsc::channel(100);

    tauri::async_runtime::spawn(async move {
        let byte_stream = res.bytes_stream().map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, e)
        });
        let stream_reader = StreamReader::new(byte_stream);
        let mut lines = BufReader::new(stream_reader).lines();
        let mut buffer = String::new();
        let mut full_response = String::new(); // accumulate for post-inference hooks

        loop {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    if line.is_empty() {
                        if !buffer.is_empty() {
                            let data = buffer.trim().to_string();
                            buffer.clear();

                            if data == "[DONE]" {
                                // ── Post-inference hooks ─────────────────────
                                let resp_clone = full_response.clone();
                                let prompt_clone = user_prompt.clone();
                                tauri::async_runtime::spawn(async move {
                                    // Log training example
                                    crate::llm::memory::log_training_example(
                                        &prompt_clone, &resp_clone
                                    ).await;
                                    tracing::debug!(
                                        "[Memory] Logged training example ({} chars)",
                                        resp_clone.len()
                                    );
                                });
                                let _ = tx.send(Ok(done_chunk())).await;
                                break;
                            }

                            for event in crate::commands::llm::extract_stream_event(&data, "openai") {
                                match event {
                                    crate::commands::llm::StreamEventParse::Text(t) => {
                                        if !t.is_empty() {
                                            full_response.push_str(&t);
                                            let _ = tx.send(Ok(text_chunk(t))).await;
                                        }
                                    }
                                    crate::commands::llm::StreamEventParse::ToolCallStart { id, name } => {
                                        let _ = tx.send(Ok(StreamChunkPayload {
                                            event_type: "tool_start".to_string(),
                                            content: None,
                                            done: Some(false),
                                            error: None,
                                            tool_call: Some(json!({"id": id})),
                                            name: Some(name),
                                            result: None,
                                            metadata: None,
                                        })).await;
                                    }
                                    crate::commands::llm::StreamEventParse::ToolCallArgs { args } => {
                                        let _ = tx.send(Ok(StreamChunkPayload {
                                            event_type: "tool_call".to_string(),
                                            content: Some(args),
                                            done: Some(false),
                                            error: None,
                                            tool_call: None,
                                            name: None,
                                            result: None,
                                            metadata: None,
                                        })).await;
                                    }
                                    crate::commands::llm::StreamEventParse::None => {}
                                }
                            }
                        }
                        continue;
                    }

                    if let Some(payload) = line.strip_prefix("data: ") {
                        if payload == "[DONE]" {
                            let resp_clone = full_response.clone();
                            let prompt_clone = user_prompt.clone();
                            tauri::async_runtime::spawn(async move {
                                crate::llm::memory::log_training_example(
                                    &prompt_clone, &resp_clone
                                ).await;
                            });
                            let _ = tx.send(Ok(done_chunk())).await;
                            break;
                        }
                        buffer = payload.to_string();
                    } else if line.starts_with("data:") {
                        buffer = line[5..].trim().to_string();
                    }
                }
                Ok(None) => {
                    let _ = tx.send(Ok(done_chunk())).await;
                    break;
                }
                Err(e) => {
                    let _ = tx.send(Err(e.to_string())).await;
                    break;
                }
            }
        }
    });

    Ok(rx)
}

// ── Internal helpers ───────────────────────────────────────────────────────────

/// Polls `GET /health` until llama-server reports ready or timeout.
async fn wait_for_ready() -> Result<()> {
    let client = Client::builder()
        .timeout(Duration::from_secs(3))
        .build()?;
    let url = format!("http://127.0.0.1:{}/health", EMBEDDED_PORT);
    let deadline = std::time::Instant::now() + Duration::from_secs(HEALTH_TIMEOUT_SECS);

    loop {
        if std::time::Instant::now() > deadline {
            return Err(anyhow!(
                "llama-server did not become ready within {}s",
                HEALTH_TIMEOUT_SECS
            ));
        }
        if let Ok(resp) = client.get(&url).send().await {
            if resp.status().is_success() {
                return Ok(());
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

fn text_chunk(t: String) -> StreamChunkPayload {
    StreamChunkPayload {
        event_type: "text".to_string(),
        content: Some(t),
        done: Some(false),
        error: None,
        tool_call: None,
        name: None,
        result: None,
        metadata: None,
    }
}

fn done_chunk() -> StreamChunkPayload {
    StreamChunkPayload {
        event_type: "done".to_string(),
        content: None,
        done: Some(true),
        error: None,
        tool_call: None,
        name: None,
        result: None,
        metadata: None,
    }
}
