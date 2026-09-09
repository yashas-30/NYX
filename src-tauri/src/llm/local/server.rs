use std::path::{Path, PathBuf};
use std::sync::Arc;
// ─────────────────────────────────────────────────────────────────────────────
// NYX — Llama Server Manager & Configuration
// ─────────────────────────────────────────────────────────────────────────────

use reqwest::Client;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::LazyLock;
use tauri::Emitter;
use tokio::process::{Child, Command as TokioCommand};
use tokio::sync::Mutex;
use tracing::info;

use super::scheduler::parse_gguf_metadata;

pub trait CommandExtWindows {
    fn hide_window(&mut self) -> &mut Self;
}

impl CommandExtWindows for TokioCommand {
    fn hide_window(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        {
            // CREATE_NO_WINDOW (0x08000000) | ABOVE_NORMAL_PRIORITY_CLASS (0x00008000)
            self.creation_flags(0x08000000 | 0x00008000);
        }
        self
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 1 — CONSTANTS & VERSION MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/// Pinned llama.cpp release. Update this string to bump the version; the UI
/// surfaces it so users know what they have and can request an update.
pub const LLAMACPP_PINNED_VERSION: &str = "b10798";
pub const LLAMACPP_CUDA_ZIP: &str =
    "llama-b10798-bin-win-cuda-12.4-x64.zip";
pub const LLAMACPP_VULKAN_ZIP: &str =
    "llama-b10798-bin-win-vulkan-x64.zip";
pub const LLAMACPP_CUDART_ZIP: &str =
    "cudart-llama-bin-win-cuda-12.4-x64.zip";
pub const LLAMACPP_RELEASE_BASE: &str =
    "https://github.com/ggml-org/llama.cpp/releases/download";

/// Minimum size of a valid llama-server stub binary (bytes).
pub const MIN_SERVER_BINARY_BYTES: u64 = 5_120;

/// Maximum seconds to wait for llama-server to become ready.
pub const SERVER_READY_TIMEOUT_SECS: u64 = 180;

/// llama-server HTTP port (dynamic).
pub static SERVER_PORT: std::sync::atomic::AtomicU16 = std::sync::atomic::AtomicU16::new(8080);
pub const SERVER_HOST: &str = "127.0.0.1";

pub fn find_free_port() -> u16 {
    for port in 8080..8100 {
        if std::net::TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return port;
        }
    }
    8080
}

/// Guards concurrent binary-download attempts.
pub static DOWNLOAD_SEMAPHORE: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);

/// Fix #11: Shared short-timeout client for health-check polling.
/// Constructed lazily; reused across all readiness polls and status checks.
pub static HEALTH_CLIENT: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .expect("Failed to build health-check HTTP client")
});

// ─────────────────────────────────────────────────────────────────────────────

// § 4 — LLAMA SERVER CONFIG (replaces 12-arg signature)
// ─────────────────────────────────────────────────────────────────────────────

/// All parameters needed to spawn llama-server.
/// Constructed by `start_local_server` from a `HybridInferenceConfig` and
/// passed as a single unit to `LlamaManager::start`.
#[derive(Debug, Clone)]
pub struct LlamaServerConfig {
    pub server_path: PathBuf,
    pub model_path: PathBuf,
    pub context_size: u32,
    /// GPU layer count from the hybrid scheduler; never hard-coded 999 unless
    /// the model truly fits in VRAM or the user manually overrides the slider.
    pub ngl: u32,
    /// CPU threads for *token generation* (-t). Physical cores only.
    pub cpu_threads: u32,
    /// CPU threads for *prompt prefill* (-tb). All logical threads.
    pub threads_batch: u32,
    /// Physical GPU compute chunk per step (-ub).
    pub ubatch_size: u32,
    pub device_id: Option<String>,
    pub flash_attention: bool,
    pub kv_cache_type: Option<String>,
    pub use_mlock: bool,
    /// Controls --no-mmap vs mmap.  True = mmap (used with mlock); False = --no-mmap.
    pub use_mmap: bool,
    pub batch_size: u32,
    pub draft_model_path: Option<PathBuf>,
    pub spec_type: Option<String>,
    pub spec_draft_min: Option<u32>,
    pub spec_draft_max: Option<u32>,
    pub ngl_draft: Option<u32>,
    pub disable_kv_offload: bool,
    pub prompt_cache_path: Option<PathBuf>,
    pub mmproj_path: Option<PathBuf>,
    pub mmproj_offload: bool,
    pub port: u16,
    pub split_mode: Option<String>,
    pub tensor_split: Option<String>,
    pub reasoning: Option<bool>,
    pub reasoning_budget: Option<i32>,
    pub extra_args: Vec<String>,
}

impl LlamaServerConfig {
    fn build_args(&self) -> Vec<String> {
        let actual_ubatch = self.ubatch_size.min(self.batch_size);
        let mut args = vec![
            "-m".into(),            self.model_path.to_string_lossy().into_owned(),
            "-c".into(),            self.context_size.to_string(),
            "--batch-size".into(),  self.batch_size.to_string(),
            "--ubatch-size".into(), actual_ubatch.to_string(),
            "--port".into(),   self.port.to_string(),
            "--host".into(),   SERVER_HOST.to_string(),
            "-ngl".into(), self.ngl.to_string(),
        ];

        if self.cpu_threads > 0 {
            args.extend(["-t".into(), self.cpu_threads.to_string()]);
        }

        if self.threads_batch > 0 {
            args.extend(["-tb".into(), self.threads_batch.to_string()]);
        }

        if let Some(mmproj) = &self.mmproj_path {
            args.extend(["--mmproj".into(), mmproj.to_string_lossy().into_owned()]);
            if self.mmproj_offload {
                args.push("--mmproj-offload".into());
                if let Some(ref dev) = self.device_id {
                    if !dev.is_empty() {
                        args.extend(["--mmproj-device".into(), dev.clone()]);
                    }
                }
            } else {
                args.push("--no-mmproj-offload".into());
            }
        }

        if self.use_mmap {
            args.extend(["--load-mode".into(), "mmap".into()]);
            #[cfg(not(target_os = "windows"))]
            if self.use_mlock {
                args.push("--mlock".into());
            }
        }

        if self.flash_attention {
            args.extend(["--flash-attn".into(), "on".into()]);
        } else {
            args.extend(["--flash-attn".into(), "off".into()]);
        }

        if let Some(ref kct) = self.kv_cache_type {
            const VALID_KV_TYPES: &[&str] = &["f16","f32","q8_0","q5_0","q5_1","q4_0","q4_1","q8_1"];
            if VALID_KV_TYPES.contains(&kct.as_str()) {
                args.extend(["-ctk".into(), kct.clone()]);
                args.extend(["-ctv".into(), kct.clone()]);
                // Quantize draft model KV cache to match target model, saving VRAM and boosting speculative decoding throughput
                args.extend(["-ctkd".into(), kct.clone()]);
                args.extend(["-ctvd".into(), kct.clone()]);
            }
        }

        if self.disable_kv_offload {
            args.push("--no-kv-offload".into());
        }

        if let Some(ref draft) = self.draft_model_path {
            let is_mtp = self.spec_type.as_deref() == Some("draft-mtp")
                || crate::llm::local::scheduler::is_mtp_model(draft);
            let spec_type_str = self.spec_type.clone().unwrap_or_else(|| {
                if is_mtp {
                    "draft-mtp".into()
                } else {
                    "draft-simple".into()
                }
            });

            args.extend([
                "--spec-type".into(),
                spec_type_str,
                "-md".into(),
                draft.to_string_lossy().into_owned(),
            ]);

            // Multi-Token Prediction (MTP) companion heads:
            // When dedicated VRAM headroom exists, ngl_draft is Some(total_layers); when headroom is tight or unspecified,
            // default to 0 so MTP runs on CPU in system RAM to prevent CUDA OOM.
            let ngld_val = self.ngl_draft.unwrap_or(if is_mtp {
                0
            } else {
                self.ngl
            });

            if is_mtp {
                // Multi-token prediction (MTP) heads: draft up to 5 consecutive tokens for accelerated generation.
                let draft_min = self.spec_draft_min.unwrap_or(1);
                let draft_max = self.spec_draft_max.unwrap_or(5);
                args.extend([
                    "--spec-draft-n-min".into(),
                    draft_min.to_string(),
                    "--spec-draft-n-max".into(),
                    draft_max.to_string(),
                    "-ngld".into(),
                    ngld_val.to_string(),
                ]);
            } else {
                // Standalone draft model (e.g. 0.5B/1B draft)
                let draft_min = self.spec_draft_min.unwrap_or(5);
                let draft_max = self.spec_draft_max.unwrap_or(16);
                args.extend([
                    "--spec-draft-n-min".into(),
                    draft_min.to_string(),
                    "--spec-draft-n-max".into(),
                    draft_max.to_string(),
                    "-ngld".into(),
                    ngld_val.to_string(),
                ]);
            }

            if ngld_val > 0 && !is_mtp {
                if let Some(ref dev) = self.device_id {
                    if !dev.is_empty() {
                        args.extend(["--spec-draft-device".into(), dev.clone()]);
                    }
                }
            }
        }

        if let Some(ref dev) = self.device_id {
            if !dev.is_empty() {
                args.extend(["--device".into(), dev.clone()]);
            }
        }

        if let Some(ref sm) = self.split_mode {
            if !sm.is_empty() {
                args.extend(["--split-mode".into(), sm.clone()]);
            }
        }

        if let Some(ref ts) = self.tensor_split {
            if !ts.is_empty() {
                args.extend(["--tensor-split".into(), ts.clone()]);
            }
        }

        // Single slot execution for desktop client (prevents allocating concurrent slots in memory)
        args.extend(["-np".into(), "1".into()]);

        // Single-slot desktop client: disable host RAM prompt cache allocation (--cache-ram 0).
        // Active slot prompt caching in VRAM is fully handled by --cache-prompt.
        // Disabling the secondary host-RAM checkpoint cache eliminates multi-gigabyte host RAM bloat
        // while preserving full KV prompt caching inside the active GPU context.
        args.extend(["--cache-ram".into(), "0".into()]);
        args.push("--no-cache-idle-slots".into());

        // Enable chunk cache reuse via KV shifting (minimum 256 tokens)
        args.extend(["--cache-reuse".into(), "256".into()]);

        // Slot prompt similarity threshold: reuse active slot if prefix matches by at least 5%
        args.extend(["--slot-prompt-similarity".into(), "0.05".into()]);

        // Prevent premature connection and generation aborts on long runs:
        // Set server read/write timeout to 86400 seconds (24 hours) instead of default 3600 (1 hour).
        args.extend(["--timeout".into(), "86400".into()]);

        // Keep-alive SSE ping interval to keep intermediate HTTP and TCP sockets alive
        args.extend(["--sse-ping-interval".into(), "15".into()]);

        // Reasoning format support in llama-server:
        // 'deepseek' extracts reasoning into message.reasoning_content.
        // 'none' leaves thoughts in message.content without extraction.
        // Only activate deepseek formatting when reasoning is explicitly requested or enabled.
        if let Some(true) = self.reasoning {
            args.extend(["--reasoning-format".into(), "deepseek".into()]);
        } else {
            args.extend(["--reasoning-format".into(), "none".into()]);
        }

        // Enable KV prompt caching unconditionally in memory for instant first-token generation
        args.push("--cache-prompt".into());

        // 2026 Dynamic Context Management: Enable context shifting so context auto-expands & shifts on demand
        args.push("--context-shift".into());

        // Continuous batching: server immediately starts processing the next token
        // without waiting for a full batch to accumulate — eliminates the inter-token
        // stall that causes GPU/CPU to drop to 50% utilization after ~2 minutes.
        args.push("--cont-batching".into());

        // Metrics endpoint: expose /metrics so performance can be monitored.
        args.push("--metrics".into());

        // Disable empty warmup run on startup to eliminate unnecessary model initialization latency
        args.push("--no-warmup".into());

        // Filter out any invalid extra_args
        for extra in &self.extra_args {
            if extra != "--override-tensor" && extra != "-fit" {
                args.push(extra.clone());
            }
        }

        args
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5 — LLAMA MANAGER
// ─────────────────────────────────────────────────────────────────────────────

pub fn trim_process_working_set(_pid: u32) {
    // Intentionally no-op: K32EmptyWorkingSet unpages active mmap weight tensors and pinned CUDA buffers,
    // causing hard page faults, PCIe bus thrashing, and severe UI stutter.
}

pub fn trim_current_process_working_set() {
    // Intentionally no-op: K32EmptyWorkingSet unpages active mmap weight tensors and pinned CUDA buffers,
    // causing hard page faults, PCIe bus thrashing, and severe UI stutter.
}

pub struct LlamaManager {
    process: Arc<Mutex<Option<Child>>>,
    last_activity: Arc<AtomicU64>,
    keep_alive_secs: Arc<AtomicU64>,
    app_handle: Arc<std::sync::Mutex<Option<tauri::AppHandle>>>,
}

impl LlamaManager {
    pub fn new() -> Self {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        Self {
            process: Arc::new(Mutex::new(None)),
            last_activity: Arc::new(AtomicU64::new(now)),
            keep_alive_secs: Arc::new(AtomicU64::new(300)), // Default 5 minutes (300 seconds)
            app_handle: Arc::new(std::sync::Mutex::new(None)),
        }
    }

    /// Update the last activity timestamp (resets the inactivity timer).
    pub fn touch(&self) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        self.last_activity.store(now, Ordering::Relaxed);
    }

    /// Set keep-alive duration in seconds (0 = disabled).
    pub fn set_keep_alive_secs(&self, secs: u64) {
        self.keep_alive_secs.store(secs, Ordering::Relaxed);
    }

    /// Get current keep-alive duration in seconds.
    pub fn get_keep_alive_secs(&self) -> u64 {
        self.keep_alive_secs.load(Ordering::Relaxed)
    }

    /// Set app handle for emitting lifecycle events.
    pub fn set_app_handle(&self, app: tauri::AppHandle) {
        if let Ok(mut guard) = self.app_handle.lock() {
            *guard = Some(app);
        }
    }

    fn spawn_inactivity_watchdog(&self, active_pid: Option<u32>) {
        let weak_process = Arc::downgrade(&self.process);
        let last_activity_clone = Arc::clone(&self.last_activity);
        let keep_alive_clone = Arc::clone(&self.keep_alive_secs);
        let app_handle_clone = Arc::clone(&self.app_handle);

        tauri::async_runtime::spawn(async move {
            let mut tick_count = 0u64;
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
                tick_count += 1;

                if let Some(process_arc) = weak_process.upgrade() {
                    let mut guard = process_arc.lock().await;
                    let current_pid = guard.as_ref().and_then(|c| c.id());
                    if current_pid != active_pid {
                        break; // Process changed or ended; terminate watchdog task
                    }

                    // Check keep-alive inactivity timeout
                    let timeout = keep_alive_clone.load(Ordering::Relaxed);
                    if timeout > 0 {
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs())
                            .unwrap_or(0);
                        let last = last_activity_clone.load(Ordering::Relaxed);
                        let idle_secs = now.saturating_sub(last);

                        if idle_secs >= timeout {
                            info!(
                                "[LlamaManager] Inactivity keep-alive watchdog: server idle for {}s (timeout {}s). Auto-unloading model and freeing GPU & host RAM.",
                                idle_secs, timeout
                            );
                            if let Some(mut child) = guard.take() {
                                let _ = child.kill().await;
                                let _ = child.wait().await;
                            }
                            SERVER_PORT.store(0, Ordering::Relaxed);
                            crate::llm::local::commands::clear_active_local_server_state();
                            drop(guard);
                            LlamaManager::kill_orphans(None).await;

                            if let Ok(app_guard) = app_handle_clone.lock() {
                                if let Some(ref app) = *app_guard {
                                    let _ = app.emit("local-model-unloaded", serde_json::json!({
                                        "reason": "inactivity_timeout",
                                        "idle_seconds": idle_secs
                                    }));
                                    let _ = app.emit("llm-server-stopped", serde_json::json!({
                                        "reason": "inactivity_timeout"
                                    }));
                                }
                            }
                            break;
                        }
                    }

                    drop(guard);

                    // Check for external orphans every 30 seconds
                    if tick_count % 3 == 0 {
                        LlamaManager::kill_orphans(current_pid).await;
                    }
                } else {
                    break; // Manager was dropped / process released
                }
            }
        });
    }

    /// Start llama-server with the given config.
    ///
    /// Kills any existing process first (both tracked child and any orphan
    /// processes by binary name on Windows).  Polls the /v1/models endpoint
    /// until ready or timeout.
    pub async fn start(&self, cfg: &LlamaServerConfig, on_progress: Option<impl Fn(u32, &str) + Send + 'static>) -> Result<(), String> {
        let mut guard = self.process.lock().await;

        // Kill any previously tracked child.
        if let Some(mut child) = guard.take() {
            info!("[LlamaManager] Killing existing server before restart...");
            let _ = child.kill().await;
            let _ = child.wait().await;
        }

        // Kill any orphan processes on Windows (e.g. from a previous crash).
        Self::kill_orphans(None).await;

        let server_dir = cfg.server_path.parent()
            .ok_or("Cannot determine llama-server directory")?;

        // Create log file in the binaries directory.
        let log_path = server_dir.join("server_log.txt");
        let log_file = tokio::fs::File::create(&log_path).await
            .unwrap_or_else(|_| panic!("Cannot create log file at {:?}", log_path));
        let log_std = log_file.into_std().await;

        let args = cfg.build_args();
        info!(
            "[LlamaManager] Starting: {} {}",
            cfg.server_path.display(),
            args.join(" ")
        );
        
        // DEBUG: Write args to a file
        let debug_args_path = cfg.server_path.parent().unwrap().join("server_args.txt");
        let _ = std::fs::write(&debug_args_path, format!("{:?}", args));

        let mut cmd = TokioCommand::new(&cfg.server_path);
        cmd.hide_window();
        cmd.current_dir(server_dir)
            .args(&args)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::from(log_std));

        let mut child = cmd
            .kill_on_drop(true) // Fix #6: ensure process doesn't leak if cancelled
            .spawn()
            .map_err(|e| format!("Failed to spawn llama-server: {}", e))?;

        if let Some(ref progress) = on_progress {
            progress(10, "llama-server started, waiting for model load...");
        }

        // Quick crash detection: wait 50 ms and check if it already exited.
        // Reduced from 100ms — small models load in <1s, every ms counts for UX.
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!(
                "llama-server crashed immediately (exit {}). Check model compatibility. Log: {:?}",
                status, log_path
            ));
        }

        // Fix #11: Reuse shared health client — avoids TCP+TLS setup per poll.
        let client = &*HEALTH_CLIENT;

        let port = cfg.port;
        SERVER_PORT.store(port, std::sync::atomic::Ordering::Relaxed);
        let url = format!("http://{}:{}/health", SERVER_HOST, port);
        let max_polls = SERVER_READY_TIMEOUT_SECS * 4; // Poll every 250ms (backing off)
        let mut ready = false;

        for attempt in 0..max_polls {
            if attempt % 40 == 0 && attempt > 0 {
                if let Some(ref progress) = on_progress {
                    let pct = 10 + ((attempt as f32 / max_polls as f32) * 80.0) as u32;
                    progress(pct, &format!("Loading model... ({}s)", attempt / 4));
                }
            }
            if let Ok(res) = client.get(&url).send().await {
                if res.status().is_success() {
                    ready = true;
                    break;
                }
            }
            if let Ok(Some(status)) = child.try_wait() {
                return Err(format!(
                    "llama-server crashed while loading model (exit {}). Log: {:?}",
                    status, log_path
                ));
            }
            if attempt % 20 == 0 {
                info!("[LlamaManager] Waiting for server... ({}/{}s)", attempt / 4, SERVER_READY_TIMEOUT_SECS);
            }
            let interval = if attempt < 20 { 100 } else { 250 };
            tokio::time::sleep(tokio::time::Duration::from_millis(interval)).await;
        }

        if !ready {
            let _ = child.kill().await;
            return Err(format!(
                "llama-server failed to become ready within {}s. Check log: {:?}",
                SERVER_READY_TIMEOUT_SECS, log_path
            ));
        }

        info!("[LlamaManager] Server ready. ngl={} threads={}", cfg.ngl, cfg.cpu_threads);
        if let Some(ref progress) = on_progress {
            progress(100, "Model loaded and ready.");
        }

        let active_pid = child.id();
        *guard = Some(child);

        self.touch();
        self.spawn_inactivity_watchdog(active_pid);

        Ok(())
    }

    /// Start sd-server with the GGUF image model.
    pub async fn start_sd_server(
        &self,
        binary_path: &Path,
        model_path: &Path,
        port: u16,
        threads: u32,
        _is_low_vram: bool,
        on_progress: Option<impl Fn(u32, &str) + Send + 'static>,
    ) -> Result<(), String> {
        let mut guard = self.process.lock().await;

        // Kill any previously tracked child.
        if let Some(mut child) = guard.take() {
            info!("[LlamaManager] Killing existing server before restart...");
            let _ = child.kill().await;
            let _ = child.wait().await;
        }

        // Kill any orphan processes on Windows.
        Self::kill_orphans(None).await;

        let server_dir = binary_path.parent()
            .ok_or("Cannot determine sd-server directory")?;

        let log_path = server_dir.join("sd_server_log.txt");
        let log_file = tokio::fs::File::create(&log_path).await
            .unwrap_or_else(|_| panic!("Cannot create log file at {:?}", log_path));
        let log_std = log_file.into_std().await;

        let mut cmd = TokioCommand::new(&binary_path);
        cmd.hide_window();
        cmd.current_dir(server_dir)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::from(log_std));

        let models_dir = model_path.parent().unwrap_or(Path::new(""));

        // Detect whether the GGUF is a diffusion-only file (needs --diffusion-model)
        // or a full self-contained model (uses -m). Diffusion-only GGUFs have architectures
        // like 'flux', 'sd3', 'sdxl', 'sd1', 'sdxl-refiner', etc. and cannot be loaded
        // with -m because they contain only the UNet/DiT weights without the VAE/encoder.
        let model_ext = model_path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        let gguf_arch = if model_ext == "gguf" {
            let path_clone = model_path.to_path_buf();
            tokio::task::spawn_blocking(move || {
                parse_gguf_metadata(&path_clone).ok().and_then(|m| m.architecture)
            }).await.unwrap_or(None)
        } else {
            None
        };
        let is_diffusion_only_gguf = gguf_arch.as_deref().map(|a| {
            let al = a.to_lowercase();
            // These architectures are diffusion-model-only weights; always need companions
            al == "flux" || al == "flux2" || al == "sd3" || al == "sdxl"
                || al == "sd1" || al == "sd2" || al == "sdxl-refiner"
        }).unwrap_or(false);

        let model_name_lower = model_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();
        let is_flux2 = model_name_lower.contains("flux2")
            || model_name_lower.contains("flux-2")
            || model_name_lower.contains("flux.2")
            || model_name_lower.contains("klein");

        let find_companion = |prefixes: &[&str], extensions: &[&str], preferred_term: Option<&str>| -> Option<PathBuf> {
            if let Ok(entries) = std::fs::read_dir(models_dir) {
                let mut candidates = Vec::new();
                for entry in entries.filter_map(Result::ok) {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                            let name_lower = name.to_lowercase();
                            // Skip the model file itself
                            if path == model_path { continue; }
                            let matches_prefix = prefixes.iter().any(|&p| name_lower.contains(p));
                            let matches_ext = extensions.iter().any(|&ext| name_lower.ends_with(ext));
                            if matches_prefix && matches_ext && !name_lower.ends_with(".part") {
                                candidates.push((name_lower, path));
                            }
                        }
                    }
                }
                if let Some(pref) = preferred_term {
                    for (name_lower, path) in &candidates {
                        if name_lower.contains(pref) {
                            return Some(path.clone());
                        }
                    }
                }
                if !candidates.is_empty() {
                    return Some(candidates[0].1.clone());
                }
            }
            None
        };

        let vae_pref = if is_flux2 { Some("flux2") } else { None };
        let vae_path = find_companion(&["vae", "ae."], &["safetensors", "gguf", "bin", "ckpt"], vae_pref);
        let clip_path = find_companion(&["clip_l", "clip-l", "vi-l"], &["safetensors", "gguf", "bin", "ckpt"], None);
        let t5_path = find_companion(&["t5xxl", "t5-xxl"], &["safetensors", "gguf", "bin", "ckpt"], None);

        let has_companion = vae_path.is_some() || clip_path.is_some() || t5_path.is_some();

        if is_diffusion_only_gguf && !has_companion {
            // Diffusion-only GGUFs MUST have companions (VAE + text encoders). Without them
            // sd-server crashes immediately with 'get sd version from file failed'.
            let arch_name = gguf_arch.as_deref().unwrap_or("unknown").to_uppercase();
            let models_path_str = models_dir.display().to_string();
            
            let vae_url_line = if is_flux2 {
                "① ae.safetensors (or flux2-vae.safetensors) — FLUX.2 VAE\n\
                 → https://huggingface.co/black-forest-labs/FLUX.2-klein-9B/resolve/main/ae.safetensors"
            } else {
                "① ae.safetensors — Flux VAE (AutoEncoder)\n\
                 → https://huggingface.co/black-forest-labs/FLUX.1-schnell/blob/main/ae.safetensors"
            };

            return Err(format!(
                "Missing companion models for {arch_name} GGUF.\n\n\
                This is a diffusion-only model (the transformer/UNet weights only). \
                It requires separate VAE and text encoder files to run.\n\n\
                Please download and place the following files in:\n\
                  {models_path_str}\n\n\
                {vae_url_line}\n\n\
                ② clip_l.safetensors — CLIP-L text encoder\n\
                   → https://huggingface.co/comfyanonymous/flux_text_encoders/blob/main/clip_l.safetensors\n\n\
                ③ t5xxl_fp8_e4m3fn.safetensors — T5-XXL text encoder (fp8, smaller)\n\
                   → https://huggingface.co/comfyanonymous/flux_text_encoders/blob/main/t5xxl_fp8_e4m3fn.safetensors\n\n\
                Once downloaded, reload the model and NYX will automatically detect and use the companion files.",
                arch_name = arch_name,
                models_path_str = models_path_str,
                vae_url_line = vae_url_line,
            ));
        }

        // Use --diffusion-model for diffusion-only GGUFs (or when companions are present),
        // and -m for full self-contained models.
        if is_diffusion_only_gguf || has_companion {
            cmd.arg("--diffusion-model").arg(model_path);
            if let Some(ref path) = vae_path {
                cmd.arg("--vae").arg(path);
                info!("[LlamaManager] Found companion VAE: {:?}", path);
            }
            if let Some(ref path) = clip_path {
                cmd.arg("--clip_l").arg(path);
                info!("[LlamaManager] Found companion CLIP-L: {:?}", path);
            }
            if let Some(ref path) = t5_path {
                cmd.arg("--t5xxl").arg(path);
                info!("[LlamaManager] Found companion T5: {:?}", path);
            }
        } else {
            cmd.arg("-m").arg(model_path);
        }

        cmd.arg("--listen-ip").arg("127.0.0.1");
        cmd.arg("--listen-port").arg(port.to_string());
        cmd.arg("-t").arg(threads.to_string());

        // GPU-only inference: enable VAE tiling to optimize VRAM headroom without CPU offloading
        cmd.arg("--vae-tiling");

        if let Some(ref progress) = on_progress {
            progress(10, "sd-server starting, loading weights into GPU VRAM...");
        }

        info!("[LlamaManager] Starting sd-server: {} (is_diffusion_only_gguf={}, has_companion={})", binary_path.display(), is_diffusion_only_gguf, has_companion);
        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn sd-server: {}", e))?;

        let format_sd_error = |status: std::process::ExitStatus, err_log: &str| -> String {
            let last_lines: String = err_log.lines().rev().take(15).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
            
            let has_wrong_shape = err_log.contains("wrong shape in model metadata") || err_log.contains("has wrong shape");
            
            if has_wrong_shape && err_log.contains("VAE") && is_flux2 {
                "Incompatible VAE shape detected! This appears to be a FLUX.2 model (which requires a 32-channel VAE), but the VAE file you provided has 16 channels (standard FLUX.1 VAE).\n\n\
                To load this model successfully:\n\
                1. Download the FLUX.2 VAE ('ae.safetensors') from Hugging Face:\n\
                   → https://huggingface.co/black-forest-labs/FLUX.2-klein-9B/resolve/main/ae.safetensors\n\n\
                2. Rename/save it as 'flux2-vae.safetensors' in your models folder (this prevents collision with FLUX.1 VAEs).\n\n\
                Once downloaded, reload the model and NYX will automatically prioritize the FLUX.2 VAE for this model.".to_string()
            } else if err_log.contains("not in model metadata") && (err_log.contains("first_stage_model") || err_log.contains("VAE")) {
                "Compatible VAE not found! This appears to be a standalone Flux model requiring external CLIP and VAE components.\n\n\
                To load this model successfully:\n\
                1. Download 'ae.safetensors' (VAE) and place it in your models folder.\n\
                2. Download 'clip_l.safetensors' (CLIP-L text encoder) and place it in your models folder.\n\
                3. Download 't5xxl.safetensors' or a quantized T5 encoder (like 't5xxl-Q4_K.gguf') and place it in your models folder.\n\n\
                The application will automatically detect these companion files and pass them to the inference engine.".to_string()
            } else {
                format!("sd-server crashed/exited (exit {}). Details:\n{}", status, last_lines)
            }
        };

        // Wait a tiny bit to check if it crashed immediately
        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
        if let Ok(Some(status)) = child.try_wait() {
            let err_log = tokio::fs::read_to_string(&log_path).await.unwrap_or_default();
            return Err(format_sd_error(status, &err_log));
        }

        // Poll the server port until it becomes ready
        let client = &*HEALTH_CLIENT;
        let url = format!("http://127.0.0.1:{}/v1/models", port);
        let mut ready = false;

        for attempt in 0..120 {
            if attempt % 10 == 0 && attempt > 0 {
                if let Some(ref progress) = on_progress {
                    let pct = 10 + ((attempt as f32 / 120.0) * 80.0) as u32;
                    progress(pct, &format!("Loading model weights... ({}s)", attempt / 2));
                }
            }
            if let Ok(res) = client.get(&url).send().await {
                if res.status().is_success() {
                    ready = true;
                    break;
                }
            }
            if let Ok(Some(status)) = child.try_wait() {
                let err_log = tokio::fs::read_to_string(&log_path).await.unwrap_or_default();
                return Err(format_sd_error(status, &err_log));
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        if !ready {
            let _ = child.kill().await;
            let err_log = tokio::fs::read_to_string(&log_path).await.unwrap_or_default();
            let last_lines: String = err_log.lines().rev().take(15).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
            return Err(format!("sd-server failed to become ready on port {} within 60s.\n{}", port, last_lines));
        }

        info!("[LlamaManager] sd-server ready on port {}.", port);
        if let Some(ref progress) = on_progress {
            progress(100, "Image model loaded and ready in memory.");
        }

        let active_pid = child.id();
        *guard = Some(child);

        self.touch();
        self.spawn_inactivity_watchdog(active_pid);

        Ok(())
    }

    /// Stop the server gracefully, then kill orphans.
    pub async fn stop(&self) {
        let mut guard = self.process.lock().await;
        if let Some(mut child) = guard.take() {
            info!("[LlamaManager] Stopping server...");
            let _ = child.kill().await;
            let _ = child.wait().await;
        }
        SERVER_PORT.store(0, std::sync::atomic::Ordering::Relaxed);
        Self::kill_orphans(None).await;
    }

    /// Start Python native server for non-GGUF text models (Safetensors / PyTorch / ONNX).
    pub async fn start_native_python_server(
        &self,
        model_path: &Path,
        port: u16,
        script_path: &Path,
        gpu_layers: Option<u32>,
        cpu_threads: Option<u32>,
        repo_id: Option<&str>,
        on_progress: Option<impl Fn(u32, &str) + Send + 'static>,
    ) -> Result<(), String> {
        let mut guard = self.process.lock().await;

        if let Some(mut child) = guard.take() {
            info!("[LlamaManager] Stopping existing server process...");
            let _ = child.kill().await;
            let _ = child.wait().await;
        }

        Self::kill_orphans(None).await;

        let python_cmd = if cfg!(target_os = "windows") { "python" } else { "python3" };

        let server_dir = script_path.parent().unwrap_or(model_path);
        let log_path = server_dir.join("nyx_native_server.log");
        let log_file = tokio::fs::File::create(&log_path).await
            .unwrap_or_else(|_| panic!("Cannot create log file at {:?}", log_path));
        let log_std = log_file.into_std().await;

        let ngl = gpu_layers.unwrap_or(99);
        let threads = cpu_threads.unwrap_or(4);

        info!(
            "[LlamaManager] Spawning Python native server: {} {} --model_path {} --port {} --gpu_layers {} --cpu_threads {} repo_id={:?}",
            python_cmd,
            script_path.display(),
            model_path.display(),
            port,
            ngl,
            threads,
            repo_id
        );

        if let Some(ref progress) = on_progress {
            progress(10, "Launching Python Native Engine server...");
        }

        let mut cmd = TokioCommand::new(python_cmd);
        cmd.hide_window();
        cmd.arg(script_path)
            .arg("--model_path")
            .arg(model_path)
            .arg("--port")
            .arg(port.to_string())
            .arg("--gpu_layers")
            .arg(ngl.to_string())
            .arg("--cpu_threads")
            .arg(threads.to_string());

        if let Some(rid) = repo_id {
            if !rid.trim().is_empty() {
                cmd.arg("--repo_id").arg(rid);
            }
        }

        cmd.stdout(std::process::Stdio::from(log_std.try_clone().unwrap()))
            .stderr(std::process::Stdio::from(log_std));

        let mut child = cmd
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Failed to spawn Python native server: {}", e))?;

        let client = &*HEALTH_CLIENT;
        let url = format!("http://127.0.0.1:{}/v1/models", port);
        let mut ready = false;

        for attempt in 0..120 {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            if let Ok(res) = client.get(&url).send().await {
                if res.status().is_success() {
                    ready = true;
                    break;
                }
            }
            if let Ok(Some(status)) = child.try_wait() {
                let err_log = tokio::fs::read_to_string(&log_path).await.unwrap_or_default();
                let last_lines: String = err_log.lines().rev().take(10).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
                return Err(format!("Python native server exited prematurely (exit {}). Details:\n{}", status, last_lines));
            }
            if attempt % 10 == 0 {
                if let Some(ref progress) = on_progress {
                    let pct = 10 + ((attempt as f32 / 120.0) * 80.0) as u32;
                    progress(pct, &format!("Loading weights into memory... ({}s)", attempt / 2));
                }
            }
        }

        if !ready {
            let _ = child.kill().await;
            let err_log = tokio::fs::read_to_string(&log_path).await.unwrap_or_default();
            let last_lines: String = err_log.lines().rev().take(10).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
            return Err(format!("Python native server failed to become ready on port {} within 60s.\n{}", port, last_lines));
        }

        info!("[LlamaManager] Python native server ready on port {}.", port);
        if let Some(ref progress) = on_progress {
            progress(100, "Model loaded and ready.");
        }

        let active_pid = child.id();
        *guard = Some(child);
        self.touch();
        self.spawn_inactivity_watchdog(active_pid);
        Ok(())
    }

    pub async fn kill_orphans(exclude_pid: Option<u32>) {
        let pids_to_kill = tokio::task::spawn_blocking(move || {
            let sys = sysinfo::System::new_with_specifics(
                sysinfo::RefreshKind::new().with_processes(sysinfo::ProcessRefreshKind::everything())
            );
            let mut pids = Vec::new();
            for (pid, process) in sys.processes() {
                let name = process.name().to_lowercase();
                let is_python_nyx = name.contains("python") && process.cmd().iter().any(|arg| arg.to_string().contains("nyx_native_server"));
                if name.contains("llama-server") || name.contains("nyx_native_server") || name.contains("sd-server") || name.contains("sd-cli") || is_python_nyx {
                    let p = pid.as_u32();
                    if Some(p) != exclude_pid {
                        pids.push(p);
                    }
                }
            }
            pids
        }).await.unwrap_or_default();

        #[cfg(target_os = "windows")]
        for pid in pids_to_kill {
            let _ = tokio::process::Command::new("taskkill").hide_window()
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output()
                .await;
        }
        #[cfg(not(target_os = "windows"))]
        for pid in pids_to_kill {
            let _ = tokio::process::Command::new("kill")
                .args(["-9", &pid.to_string()])
                .output()
                .await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_llama_manager_keep_alive_defaults() {
        let manager = LlamaManager::new();
        assert_eq!(manager.get_keep_alive_secs(), 300);
        manager.set_keep_alive_secs(600);
        assert_eq!(manager.get_keep_alive_secs(), 600);
    }

    #[test]
    fn test_llama_manager_touch_updates_activity() {
        let manager = LlamaManager::new();
        let initial = manager.last_activity.load(Ordering::Relaxed);
        std::thread::sleep(std::time::Duration::from_millis(10));
        manager.touch();
        let updated = manager.last_activity.load(Ordering::Relaxed);
        assert!(updated >= initial);
    }

    #[test]
    fn test_clear_active_local_server_state() {
        {
            let mut g = crate::llm::local::commands::ACTIVE_LOCAL_LLM_MODEL.lock().unwrap();
            *g = Some("test-model".to_string());
        }
        crate::llm::local::commands::clear_active_local_server_state();
        let g = crate::llm::local::commands::ACTIVE_LOCAL_LLM_MODEL.lock().unwrap();
        assert!(g.is_none());
    }
}
