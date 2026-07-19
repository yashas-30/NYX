// ─────────────────────────────────────────────────────────────────────────────
// NYX — Local Model Orchestrator
// ─────────────────────────────────────────────────────────────────────────────
//
// This is the single source of truth for everything related to running LLMs
// locally on the user's machine.  It owns:
//
//  • HardwareAnalyser   — GPU (VRAM), CPU (cores/speed), RAM detection
//  • SmartNglScheduler  — computes the exact GPU-layer split for hybrid GPU+CPU
//  • LlamaServerConfig  — typed builder replacing the 12-positional-arg signature
//  • LlamaManager       — spawns / kills llama-server, polls readiness
//  • Downloader         — downloads llama-server binary (CUDA or Vulkan)
//  • HfDownloader       — resumable HuggingFace model downloads with pause/cancel
//  • All Tauri commands — single import surface for main.rs
//
// Design goals
//   1. ALWAYS pass the computed NGL — never override with 999 (was P0 bug).
//   2. Model fits fully in VRAM → pure GPU (ngl=999 which maps to "all layers").
//   3. Model exceeds VRAM → exact layer split: GPU handles as many as possible,
//      CPU handles the rest using ALL physical cores, maximising throughput.
//   4. tokio::process::Command everywhere — no blocking sync calls in async code.
//   5. Single config struct instead of 12 positional arguments.
//   6. Binary selection: CUDA for NVIDIA, Vulkan for AMD/Intel.
//   7. Downloader fetches pinned stable build; shows version in UI.



use reqwest::{Client, header::{RANGE, AUTHORIZATION}};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::LazyLock;

use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::AsyncWriteExt;
use tokio::process::{Child, Command as TokioCommand};
use tokio::sync::Mutex;
use tracing::{info, warn};

pub trait CommandExtWindows {
    fn hide_window(&mut self) -> &mut Self;
}

impl CommandExtWindows for TokioCommand {
    fn hide_window(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        {
            self.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        self
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 1 — CONSTANTS & VERSION MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/// Pinned llama.cpp release.  Update this string to bump the version; the UI
/// surfaces it so users know what they have and can request an update.
const LLAMACPP_PINNED_VERSION: &str = "b5710";
const LLAMACPP_CUDA_ZIP: &str =
    "llama-b5710-bin-win-cuda-cu12.2.0-x64.zip";
const LLAMACPP_VULKAN_ZIP: &str =
    "llama-b5710-bin-win-vulkan-x64.zip";
const LLAMACPP_RELEASE_BASE: &str =
    "https://github.com/ggerganov/llama.cpp/releases/download";

/// Minimum size of a valid llama-server stub binary (bytes).
const MIN_SERVER_BINARY_BYTES: u64 = 5_120;

/// Maximum seconds to wait for llama-server to become ready.
const SERVER_READY_TIMEOUT_SECS: u64 = 180;

/// llama-server HTTP port (fixed; single-instance assumption).
const SERVER_PORT: u16 = 8080;
const SERVER_HOST: &str = "127.0.0.1";

/// Guards concurrent binary-download attempts.
static DOWNLOAD_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Fix #11: Shared short-timeout client for health-check polling.
/// Constructed lazily; reused across all readiness polls and status checks.
static HEALTH_CLIENT: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .expect("Failed to build health-check HTTP client")
});

// ─────────────────────────────────────────────────────────────────────────────
// § 2 — HARDWARE ANALYSER
// ─────────────────────────────────────────────────────────────────────────────

/// Backend that the GPU is operating through.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum GpuBackend {
    Cuda,
    Vulkan,
    Metal,
    Unknown,
}

/// Full snapshot of the machine's hardware relevant to LLM inference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareSnapshot {
    // ── GPU ──────────────────────────────────────────────────────────────────
    pub gpu_name: String,
    pub gpu_backend: GpuBackend,
    /// Device identifier as llama-server sees it (e.g. "CUDA0", "Vulkan0").
    pub gpu_device_id: String,
    /// Total VRAM in MB.
    pub vram_total_mb: u64,
    /// Available VRAM in MB (after OS / driver overhead).
    pub vram_available_mb: u64,
    /// True if any dedicated GPU was detected.
    pub has_dedicated_gpu: bool,

    // ── CPU ──────────────────────────────────────────────────────────────────
    /// Physical core count (not hyperthreads).
    pub cpu_physical_cores: u32,
    /// Logical thread count.
    pub cpu_logical_threads: u32,
    /// Brand name.
    pub cpu_name: String,

    // ── RAM ──────────────────────────────────────────────────────────────────
    /// Total system RAM in MB.
    pub ram_total_mb: u64,
    /// Available system RAM in MB.
    pub ram_available_mb: u64,
}

#[derive(Debug, Clone)]
struct GpuDetectionResult {
    name: String,
    backend: GpuBackend,
    vram_total_bytes: u64,
    is_dedicated: bool,
}

#[cfg(target_os = "windows")]
async fn detect_gpu(sys_ram_bytes: u64) -> GpuDetectionResult {
    // ── Step 1: Try nvidia-smi for precise VRAM (NVIDIA GPUs) ─────────────
    // Win32_VideoController.AdapterRAM is a 32-bit DWORD and overflows/wraps
    // to 0 or 4 294 967 295 for cards with >=4 GB VRAM (GTX 1650, RTX 30xx…).
    // nvidia-smi reports the correct 64-bit value directly.
    let nvidia_smi_vram = async {
        let out = tokio::process::Command::new("nvidia-smi").hide_window()
            .args(&["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
            .output()
            .await
            .ok()?;
        let text = String::from_utf8(out.stdout).ok()?;
        let line = text.lines().next()?.trim();
        let mut parts = line.splitn(2, ',');
        let name = parts.next()?.trim().to_string();
        let vram_mib: u64 = parts.next()?.trim().parse().ok()?;
        Some((name, vram_mib * 1024 * 1024)) // MiB → bytes
    }.await;

    if let Some((name, vram_bytes)) = nvidia_smi_vram {
        info!("[GPU] nvidia-smi: {} — {:.1} GB VRAM", name, vram_bytes as f64 / 1e9);
        return GpuDetectionResult {
            name,
            backend: GpuBackend::Cuda,
            vram_total_bytes: vram_bytes,
            is_dedicated: true,
        };
    }

    // ── Step 2: Fallback — Win32_VideoController (non-NVIDIA or nvidia-smi absent) ─
    // We still read AdapterRAM but treat any value >= 4 GB as a sign that the
    // card is dedicated. We also query CurrentVideoMemory which some drivers
    // populate correctly even when AdapterRAM wraps.
    let ps_output = tokio::process::Command::new("powershell").hide_window()
        .args(&[
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json -Depth 2"
        ])
        .output()
        .await;
        
    if let Ok(output) = ps_output {
        if let Ok(json_str) = String::from_utf8(output.stdout) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&json_str) {
                let mut best_name = String::new();
                let mut best_ram = 0u64;

                let arr = if val.is_array() {
                    val.as_array().unwrap().clone()
                } else {
                    vec![val]
                };

                for gpu in arr {
                    let name = match gpu.get("Name").and_then(|v| v.as_str()) {
                        Some(n) => n.to_string(),
                        None => continue,
                    };
                    // AdapterRAM overflows for >=4 GB cards — treat the raw
                    // u64 value. WMI wraps 4 GB+1 → 1, so any value that is
                    // small but the card name implies discrete → assume 4 GB.
                    let raw_ram: u64 = gpu.get("AdapterRAM")
                        .and_then(|v| {
                            if let Some(n) = v.as_u64() { Some(n) }
                            else if let Some(f) = v.as_f64() { Some(f as u64) }
                            else if let Some(s) = v.as_str() { s.parse::<u64>().ok() }
                            else { None }
                        })
                        .unwrap_or(0);

                    // WMI wraps the value: 4 GiB = 0 or tiny value → bump to 4 GiB
                    let effective_ram = if raw_ram > 0 && raw_ram < 1_073_741_824 {
                        // Value < 1 GB but GPU is likely discrete — could be wrapped.
                        // Keep as-is; is_dedicated check will treat it as APU.
                        raw_ram
                    } else {
                        raw_ram
                    };

                    if effective_ram > best_ram {
                        best_ram = effective_ram;
                        best_name = name;
                    }
                }

                let vendor_lower = best_name.to_lowercase();
                let backend = if vendor_lower.contains("nvidia") {
                    GpuBackend::Cuda
                } else if vendor_lower.contains("amd") || vendor_lower.contains("radeon") {
                    GpuBackend::Vulkan
                } else {
                    GpuBackend::Vulkan
                };
                
                // Heuristic: dedicated GPU if AdapterRAM >= 2 GB.
                // For NVIDIA cards where AdapterRAM wrapped to a small value,
                // nvidia-smi would have caught it above; here we only see
                // non-NVIDIA or machines without nvidia-smi.
                let is_dedicated = best_ram >= 2_000_000_000;
                
                let mut vram_total_bytes = best_ram;
                if !is_dedicated {
                    // Windows WDDM allows APUs/iGPUs to borrow up to 50% of system RAM.
                    vram_total_bytes += sys_ram_bytes / 2;
                }

                if best_ram > 0 {
                    return GpuDetectionResult {
                        name: best_name,
                        backend,
                        vram_total_bytes,
                        is_dedicated,
                    };
                }
            }
        }
    }
    
    GpuDetectionResult {
        name: "Unknown GPU".to_string(),
        backend: GpuBackend::Unknown,
        vram_total_bytes: 0,
        is_dedicated: false,
    }
}

#[cfg(target_os = "macos")]
async fn detect_gpu(sys_ram_bytes: u64) -> GpuDetectionResult {
    // Apple Silicon / Mac utilizes Unified Memory via Metal
    let backend = GpuBackend::Metal;
    let mut vram_total_bytes = 0;
    
    // Check if sysctl returns an explicit wired limit
    let output = tokio::process::Command::new("sysctl").hide_window()
        .arg("-n")
        .arg("iogpu.wired_limit_mb")
        .output()
        .await;
        
    if let Ok(out) = output {
        if let Ok(limit_str) = String::from_utf8(out.stdout) {
            if let Ok(limit_mb) = limit_str.trim().parse::<u64>() {
                if limit_mb > 0 {
                    vram_total_bytes = limit_mb * 1024 * 1024;
                }
            }
        }
    }
    
    // Fallback if iogpu.wired_limit_mb is not set (e.g. 0), standard is ~75% of System RAM
    if vram_total_bytes == 0 {
        vram_total_bytes = (sys_ram_bytes as f64 * 0.75) as u64;
    }
    
    GpuDetectionResult {
        name: "Apple GPU (Unified Memory)".to_string(),
        backend,
        vram_total_bytes,
        is_dedicated: false, // Apple Silicon is Unified Memory
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
async fn detect_gpu(sys_ram_bytes: u64) -> GpuDetectionResult {
    // Generic Linux stub
    let is_dedicated = false;
    let vram_total_bytes = sys_ram_bytes / 2; // Treat as APU
    GpuDetectionResult {
        name: "Generic Linux GPU".to_string(),
        backend: GpuBackend::Vulkan,
        vram_total_bytes,
        is_dedicated,
    }
}

static GPU_INFO: tokio::sync::OnceCell<GpuDetectionResult> = tokio::sync::OnceCell::const_new();

impl HardwareSnapshot {
    /// Collect hardware information. Uses `sysinfo` for CPU/RAM and `Get-CimInstance` for GPU.
    pub async fn collect(_server_path: Option<&Path>) -> Self {
        let mut snapshot = Self::default();

        // 1. Refresh CPU/RAM via sysinfo (fast, no subprocess)
        let sys = sysinfo::System::new_with_specifics(
            sysinfo::RefreshKind::new()
                .with_cpu(sysinfo::CpuRefreshKind::everything())
                .with_memory(sysinfo::MemoryRefreshKind::everything())
        );

        snapshot.cpu_physical_cores = sys.physical_core_count().unwrap_or(
            sys.cpus().len().max(1)
        ) as u32;
        snapshot.cpu_logical_threads = sys.cpus().len() as u32;
        snapshot.cpu_name = sys.cpus().first()
            .map(|c| c.brand().to_string())
            .unwrap_or_else(|| "Unknown CPU".to_string());
        snapshot.ram_total_mb = sys.total_memory() / (1024 * 1024);
        snapshot.ram_available_mb = sys.available_memory() / (1024 * 1024);

        // 2. GPU detection via OS-specific logic (cached)
        let gpu_result = GPU_INFO.get_or_init(|| async {
            let total_system_bytes = snapshot.ram_total_mb * 1024 * 1024;
            detect_gpu(total_system_bytes).await
        }).await;

        if gpu_result.vram_total_bytes > 0 {
            snapshot.gpu_name = gpu_result.name.clone();
            snapshot.gpu_backend = gpu_result.backend.clone();
            snapshot.gpu_device_id = if snapshot.gpu_backend == GpuBackend::Cuda {
                "CUDA0".to_string()
            } else if snapshot.gpu_backend == GpuBackend::Metal {
                "Metal0".to_string()
            } else {
                "Vulkan0".to_string()
            };
            
            snapshot.vram_total_mb = gpu_result.vram_total_bytes / (1024 * 1024);
            
            if gpu_result.is_dedicated {
                // Dedicated GPU: We leave a dynamic 5% safety buffer for desktop composition (min 256MB)
                let safety_buffer_mb = 256.max(snapshot.vram_total_mb * 5 / 100);
                snapshot.vram_available_mb = snapshot.vram_total_mb.saturating_sub(safety_buffer_mb);
            } else {
                // Unified Memory / APU: The OS manages memory entirely dynamically, we can use almost all of the designated "vram_total" safely
                // because it already accounts for limits (e.g. 50% on Windows, 75% on Mac). We just deduct a tiny 100MB static buffer.
                snapshot.vram_available_mb = snapshot.vram_total_mb.saturating_sub(100);
            }
            
            snapshot.has_dedicated_gpu = gpu_result.is_dedicated;
            
            info!(
                "[HardwareAnalyser] Detected GPU: {} ({:?}) - Dedicated: {} - VRAM Total: {}MB, Available: {}MB",
                snapshot.gpu_name, snapshot.gpu_backend, snapshot.has_dedicated_gpu, snapshot.vram_total_mb, snapshot.vram_available_mb
            );
        } else {
            warn!("[HardwareAnalyser] No GPU detected; CPU-only mode.");
        }

        snapshot
    }
}

impl Default for HardwareSnapshot {
    fn default() -> Self {
        Self {
            gpu_name: "No GPU detected".to_string(),
            gpu_backend: GpuBackend::Unknown,
            gpu_device_id: String::new(),
            vram_total_mb: 0,
            vram_available_mb: 0,
            has_dedicated_gpu: false,
            cpu_physical_cores: 4,
            cpu_logical_threads: 8,
            cpu_name: "Unknown CPU".to_string(),
            ram_total_mb: 0,
            ram_available_mb: 0,
        }
    }
}



// ─────────────────────────────────────────────────────────────────────────────
// § 3 — SMART NGL SCHEDULER
// ─────────────────────────────────────────────────────────────────────────────

/// Overhead constants (MB).
const CUDA_DRIVER_OVERHEAD_MB: u64 = 100;
const COMPUTE_BUFFER_BASE_MB: u64 = 150;

/// A fast, heuristic metadata parser for GGUF files to extract the exact block count.
pub fn extract_gguf_layer_count(path: &std::path::Path) -> Option<u32> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut buffer = vec![0u8; 1024 * 1024];
    let bytes_read = std::io::Read::read(&mut file, &mut buffer).ok()?;
    let buffer = &buffer[..bytes_read];
    let needle = b"block_count";
    for i in 0..buffer.len().saturating_sub(needle.len() + 8) {
        if &buffer[i..i + needle.len()] == needle {
            let type_idx = i + needle.len();
            if type_idx + 8 <= buffer.len() {
                let val_type = u32::from_le_bytes([
                    buffer[type_idx], buffer[type_idx + 1],
                    buffer[type_idx + 2], buffer[type_idx + 3]
                ]);
                if val_type == 4 {
                    let val_idx = type_idx + 4;
                    let block_count = u32::from_le_bytes([
                        buffer[val_idx], buffer[val_idx + 1],
                        buffer[val_idx + 2], buffer[val_idx + 3]
                    ]);
                    if block_count > 0 && block_count < 200 {
                        return Some(block_count);
                    }
                }
            }
        }
    }
    None
}

/// How many layers a GGUF model typically has for a given file size.
pub fn estimate_total_layers(model_path: Option<&std::path::Path>, model_size_gb: f32) -> u32 {
    if let Some(path) = model_path {
        if let Some(exact_layers) = extract_gguf_layer_count(path) {
            return exact_layers;
        }
    }
    if model_size_gb < 1.0 { return 24; }
    if model_size_gb < 4.5 { return 32; }
    if model_size_gb < 6.0 { return 42; }   // e.g. Gemma-2 9B
    if model_size_gb < 9.0 { return 48; }   // e.g. Qwen 14B
    if model_size_gb < 15.0 { return 60; }
    if model_size_gb < 30.0 { return 80; }
    96
}

/// Estimate VRAM required to offload `ngl` layers of a model.
fn vram_for_ngl(model_size_gb: f32, total_layers: u32, ngl: u32, ctx_size: u32) -> u64 {
    if ngl == 0 { return 0; }

    let model_mb = (model_size_gb * 1024.0) as u64;
    let layer_cost_mb = model_mb / total_layers.max(1) as u64;

    // KV cache: ~60 MB per 1024 tokens for small models, up to ~150 MB for large.
    let kv_mb_per_1k: f32 = 40.0 + (model_size_gb * 8.0).min(100.0);
    let total_kv_mb = (ctx_size as f32 / 1024.0) * kv_mb_per_1k;
    // KV is offloaded proportionally to the layers offloaded.
    let offloaded_kv_mb = (total_kv_mb * (ngl as f32 / total_layers.max(1) as f32)) as u64;

    // Compute buffer grows with model and context size.
    let compute_mb = COMPUTE_BUFFER_BASE_MB
        + (model_size_gb * 20.0) as u64
        + (ctx_size as u64 / 1024) * 16;

    CUDA_DRIVER_OVERHEAD_MB + compute_mb + (layer_cost_mb * ngl as u64) + offloaded_kv_mb
}

/// The scheduling decision returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NglDecision {
    /// Number of layers to pass as `-ngl` to llama-server.
    /// 999 means "all layers on GPU" (model fits entirely in VRAM).
    pub ngl: u32,
    /// True when the model fits entirely in VRAM.
    pub fully_gpu: bool,
    /// True when we're doing a GPU+CPU hybrid split.
    pub hybrid: bool,
    /// Estimated VRAM usage in MB.
    pub estimated_vram_mb: u64,
    /// Human-readable explanation for the frontend.
    pub message: String,
    /// Optimal CPU thread count for the CPU-side inference.
    pub recommended_cpu_threads: u32,
}

/// Which compute mode the inference engine is running in.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum InferenceMode {
    FullGpu,
    Hybrid,
    CpuOnly,
}

/// Complete set of llama-server parameters derived from hardware.
///
/// Computed once per model launch by [`compute_hybrid_inference_config`] and
/// forwarded to `LlamaServerConfig`. Never hardcoded; always derived from the
/// live `HardwareSnapshot`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridInferenceConfig {
    /// Number of transformer layers to offload to GPU (-ngl).
    /// 999 = all layers (model fits fully in VRAM).
    pub ngl: u32,
    /// CPU threads for *token generation* (-t). Physical cores only — avoids
    /// hyperthreading cache contention during the sequential decode loop.
    pub threads_gen: u32,
    /// CPU threads for *prompt prefill* (-tb). All logical threads — prefill
    /// is embarrassingly parallel across tokens in the input batch.
    pub threads_batch: u32,
    /// Logical batch buffer size (-b). Acts as a ring buffer; 2× ubatch_size.
    pub batch_size: u32,
    /// Physical GPU compute chunk per step (-ub). Sized to VRAM headroom;
    /// too large → OOM during prefill, too small → wasted GPU utilization.
    pub ubatch_size: u32,
    /// KV cache element type (-ctk / -ctv).
    /// "q8_0" = 2× smaller than f16, <1% quality loss — default for GPU/hybrid.
    /// "f16"  = CPU-only mode (no GPU dequant pipeline).
    pub kv_cache_type: String,
    /// Force KV cache to system RAM (`--no-kv-offload`). Last resort: PCIe
    /// bottleneck makes this ~30× slower per token than keeping KV in VRAM.
    pub disable_kv_offload: bool,
    /// Pin CPU-side model layers in physical RAM (`--mlock`).
    /// Eliminates page-fault latency spikes during generation.
    /// Only set when available RAM comfortably exceeds the CPU model fraction.
    pub use_mlock: bool,
    /// Use mmap for the model file (controlled by absence/presence of `--no-mmap`).
    /// When `use_mlock` is true: mmap + mlock = pinned, efficient mapping.
    /// When `use_mlock` is false: --no-mmap (full eager load, avoids page faults).
    pub use_mmap: bool,
    /// Enable flash attention (-fa). Always true — reduces KV bandwidth in
    /// the attention computation, especially beneficial in hybrid mode.
    pub flash_attention: bool,
    /// The compute mode selected by the scheduler.
    pub mode: InferenceMode,
    /// Human-readable summary for the frontend / log.
    pub message: String,
}

/// Compute the best NGL split given live hardware and the model.
///
/// KEY INVARIANT: this function always returns the REAL ngl value.
/// The caller MUST pass it to llama-server; it must NOT be overridden with 999.
pub fn compute_ngl_decision(hw: &HardwareSnapshot, model_path: Option<&std::path::Path>, model_size_gb: f32, ctx_size: u32) -> NglDecision {
    let total_layers = estimate_total_layers(model_path, model_size_gb);
    let avail_mb = hw.vram_available_mb;

    // Optimal CPU threads: physical cores, capped at 24 to avoid NUMA thrash.
    let cpu_threads = hw.cpu_physical_cores.min(24).max(1);

    // Determine if GPU acceleration is usable.
    // Both dedicated GPUs (has_dedicated_gpu=true) AND APUs/unified-memory devices
    // (has_dedicated_gpu=false but vram_available_mb > 0) can use the GPU.
    // Only fall back to CPU-only if no VRAM is available at all.
    if avail_mb == 0 {
        // Pure CPU mode — no GPU memory at all.
        return NglDecision {
            ngl: 0,
            fully_gpu: false,
            hybrid: false,
            estimated_vram_mb: 0,
            message: format!(
                "🖥️ No GPU memory available — running entirely on CPU ({} threads).",
                cpu_threads
            ),
            recommended_cpu_threads: cpu_threads,
        };
    }

    // Check if model fits entirely in VRAM.
    // SAFETY MARGIN: We allow slight overcommit up to the TOTAL physical VRAM (`hw.vram_total_mb`).
    // Windows/macOS handle desktop composition overhead (usually 150-250MB) gracefully via 
    // shared memory. Forcing a few layers to CPU because of desktop composition destroys performance.
    let full_vram_needed = vram_for_ngl(model_size_gb, total_layers, total_layers, ctx_size);
    
    // Fix logic cliff: if we must split to hybrid, we shouldn't drop down to `avail_mb` (which 
    // might be 1GB lower due to desktop UI). We should still maximize VRAM usage up to total VRAM 
    // minus a strict OS reserve, because the OS will page out inactive UI textures to System RAM.
    let os_reserve = (hw.vram_total_mb * 5 / 100).max(384).min(1024); // 5% or at least 384MB, max 1GB
    let safe_vram_limit = hw.vram_total_mb.saturating_sub(os_reserve);
    
    // We take the max of (Total - Reserve) and (Available - Margin) to handle edge cases.
    let safety_margin = (avail_mb * 5 / 100).max(256);
    let safe_avail_mb = std::cmp::max(safe_vram_limit, avail_mb.saturating_sub(safety_margin));

    // As long as the estimated VRAM is within the total physical VRAM card limit, 
    // offload 100% to GPU. WDDM will page the desktop UI to system RAM if needed.
    if full_vram_needed <= hw.vram_total_mb {
        return NglDecision {
            ngl: 999, // All layers on GPU
            fully_gpu: true,
            hybrid: false,
            estimated_vram_mb: full_vram_needed,
            message: format!(
                "✅ Model fits fully in VRAM ({} MB estimated / {} MB physical limit). Running 100% on GPU.",
                full_vram_needed, hw.vram_total_mb
            ),
            recommended_cpu_threads: cpu_threads,
        };
    }

    // Fix #9: Real binary search — O(log n) instead of the previous O(n)
    // linear scan.  vram_for_ngl is monotonically non-decreasing in `ngl`
    // (more GPU layers → more VRAM used), so binary search is valid.
    let mut lo = 0u32;
    let mut hi = total_layers;
    while lo < hi {
        let mid = lo + (hi - lo + 1) / 2;
        if vram_for_ngl(model_size_gb, total_layers, mid, ctx_size) <= safe_avail_mb {
            lo = mid; // mid layers fit → try more
        } else {
            hi = mid - 1; // mid layers don't fit → try fewer
        }
    }
    let best_ngl = lo;

    let estimated_vram_mb = vram_for_ngl(model_size_gb, total_layers, best_ngl, ctx_size);
    let fully_gpu = best_ngl == total_layers;
    let hybrid = best_ngl > 0 && !fully_gpu;

    let message = if best_ngl == 0 {
        format!(
            "⚠️ Model ({:.1} GB) exceeds all {} MB of available VRAM. Running entirely on CPU ({} threads).",
            model_size_gb, avail_mb, cpu_threads
        )
    } else if fully_gpu {
        format!(
            "✅ Model fits fully in VRAM ({} MB estimated / {} MB available). Running 100% on GPU.",
            estimated_vram_mb, avail_mb
        )
    } else {
        format!(
            "⚡ Hybrid mode: {}/{} layers on GPU ({} MB VRAM) + {} layers on CPU ({} threads).",
            best_ngl, total_layers, estimated_vram_mb,
            total_layers - best_ngl, cpu_threads
        )
    };

    info!(
        "[NglScheduler] model={:.1}GB ctx={} total_layers={} best_ngl={} est_vram={}MB avail={}MB",
        model_size_gb, ctx_size, total_layers, best_ngl, estimated_vram_mb, avail_mb
    );

    NglDecision {
        ngl: if fully_gpu { 999 } else if best_ngl == 0 { 0 } else { best_ngl },
        fully_gpu,
        hybrid,
        estimated_vram_mb,
        message,
        recommended_cpu_threads: cpu_threads,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3b — HYBRID CO-EXECUTION SCHEDULER
// ─────────────────────────────────────────────────────────────────────────────

/// Compute the complete set of llama-server inference parameters for the given
/// hardware and model.
///
/// # Design
/// Transformer layers are *sequentially dependent* — layer N must complete
/// before layer N+1 begins on the same token.  True GPU+CPU parallelism per
/// token is impossible.  This function instead maximises performance at the
/// boundaries:
///
/// 1. **Thread split**: physical cores for sequential generation (no HT
///    contention), ALL logical threads for embarrassingly-parallel prefill.
/// 2. **KV cache in VRAM**: keeps the hot path at VRAM bandwidth (~600 GB/s)
///    rather than PCIe (~20 GB/s).  q8_0 quantization halves the footprint.
/// 3. **Batch sizing**: sized to VRAM headroom so prompt ingestion saturates
///    the GPU without triggering OOM.
/// 4. **mmap + mlock**: when RAM allows, model weights on CPU stay pinned —
///    zero page-fault spikes during generation.
pub fn compute_hybrid_inference_config(
    hw: &HardwareSnapshot,
    model_path: Option<&std::path::Path>,
    model_size_gb: f32,
    ctx_size: u32,
) -> HybridInferenceConfig {
    let ngl_decision = compute_ngl_decision(hw, model_path, model_size_gb, ctx_size);
    let total_layers  = estimate_total_layers(model_path, model_size_gb);
    let model_size_mb = (model_size_gb * 1024.0) as u64;

    // ── 1. Compute mode ───────────────────────────────────────────────────
    let mode = if ngl_decision.fully_gpu {
        InferenceMode::FullGpu
    } else if ngl_decision.hybrid {
        InferenceMode::Hybrid
    } else {
        InferenceMode::CpuOnly
    };

    // ── 2. Thread policy ──────────────────────────────────────────────────
    // Generation (decode): physical cores only.
    //   Each decode step is sequential; hyperthreads share L1/L2 cache and
    //   cause contention, reducing throughput on this tight serial loop.
    let threads_gen = hw.cpu_physical_cores.min(24).max(1);

    // Prefill (batch): all logical threads.
    //   Computing Q/K/V projections across input tokens is embarrassingly
    //   parallel — more threads = faster time-to-first-token.
    let threads_batch = hw.cpu_logical_threads.min(32).max(threads_gen);

    // ── 3. VRAM headroom after model layers ───────────────────────────────
    let vram_used_mb  = ngl_decision.estimated_vram_mb;
    let vram_avail_mb = hw.vram_available_mb;
    let vram_headroom_mb = vram_avail_mb.saturating_sub(vram_used_mb);

    // ── 4. Physical batch (ubatch) sizing ─────────────────────────────────
    // ubatch_size controls how many tokens the GPU computes in one dispatch
    // during prefill.  Larger = faster prefill but higher peak VRAM demand.
    // We size it to leave at least 300 MB headroom for the KV cache growth.
    let effective_headroom = vram_headroom_mb.saturating_sub(300);
    let ubatch_size: u32 = if effective_headroom >= 2048 {
        2048
    } else if effective_headroom >= 1024 {
        1024
    } else if effective_headroom >= 512 {
        512
    } else if hw.vram_available_mb > 0 {
        256  // Tight VRAM — small chunks to stay within budget
    } else {
        512  // CPU-only — no GPU OOM risk; mid-size for throughput
    };
    // Logical batch buffer: 2× the physical chunk so the scheduler always has
    // tokens queued while the GPU is computing the previous ubatch.
    let batch_size = (ubatch_size * 2).max(512);

    // ── 5. KV cache type ─────────────────────────────────────────────────
    // q8_0: 2× smaller than f16, <1% quality loss, negligible dequant cost
    //   on CUDA/Vulkan.  q4_0 can be worse due to metadata overhead on some
    //   backends.  f16 is used CPU-only because the CPU path has no GPU
    //   dequant pipeline and the CPU benefits from aligned f16 access.
    let kv_cache_type = match mode {
        InferenceMode::CpuOnly => "f16".to_string(),
        _                       => "q8_0".to_string(),
    };

    // ── 6. KV cache placement ─────────────────────────────────────────────
    // KV cache is accessed on *every token generation step*.
    //   In VRAM:  ~600 GB/s bandwidth  → sub-millisecond
    //   In DRAM (via PCIe): ~20 GB/s  → ~30× slower per token
    //
    // We offload to CPU only when VRAM headroom (after model + 300 MB buffer)
    // is too thin to hold the KV cache for the requested context.
    // Rough KV cache estimate: 2 × ctx × layers × head_dim × element_bytes
    // For q8_0 on a typical 7B (32 layers, 128 head_dim): ~ctx × 32 × 128 bytes
    let kv_per_token_bytes: u64 = 2   // K + V
        * total_layers as u64
        * 128                           // head_dim heuristic
        * if kv_cache_type == "q8_0" { 1 } else { 2 };  // q8_0=1B, f16=2B
    let kv_total_mb = (kv_per_token_bytes * ctx_size as u64) / (1024 * 1024);

    // vram_for_ngl already sizes and includes offloaded_kv_mb when predicting VRAM usage.
    // Thus, forcing disable_kv_offload=true based on remaining headroom here causes double-counting
    // and incorrectly forces KV to CPU for any model that tightly fits the GPU.
    // Llama.cpp will naturally handle partial KV offloading if layers are split.
    let disable_kv_offload = false;

    // ── 7. Memory pinning (mlock) and mapping (mmap) ──────────────────────
    // To safely mlock, we must have enough RAM for the ENTIRE model, not just
    // the CPU fraction, because mlock applies to the whole mapped file.
    // We only add the KV cache size if it's actually residing in system RAM.
    const OS_HEADROOM_MB: u64 = 2048;
    let kv_ram_mb = if disable_kv_offload || mode == InferenceMode::CpuOnly { kv_total_mb } else { 0 };
    let ram_needed_for_mlock_mb = model_size_mb + kv_ram_mb + OS_HEADROOM_MB;
    // Only use mlock in CpuOnly mode. In Hybrid/FullGpu, mlock forces the entire file
    // into RAM, which duplicates memory (VRAM + RAM) and causes extremely slow initialization
    // due to VirtualLock() reading the entire file synchronously.
    let use_mlock = if mode == InferenceMode::CpuOnly {
        hw.ram_available_mb > ram_needed_for_mlock_mb
    } else {
        false
    };
    
    // By default, llama.cpp uses `mmap`. However, `mmap` causes the entire model
    // file to be mapped into the process's Virtual Address Space. When the model
    // is loaded, Windows pages it into the process's Working Set. This causes
    // Task Manager to report that `llama-server` is using 5GB+ of RAM, even if
    // 100% of the layers are offloaded to VRAM!
    // 
    // Using `--no-mmap` forces standard `fread` I/O. Llama.cpp will allocate a temp
    // buffer, read the tensor, copy to VRAM, and free the buffer. This keeps the
    // process Working Set extremely low (only memory for CPU tensors is kept),
    // accurately reflecting real System RAM usage and keeping users happy.
    let use_mmap = true;

    // ── 8. Summary message ────────────────────────────────────────────────
    let message = match mode {
        InferenceMode::FullGpu => format!(
            "✅ Full GPU — {}/{} layers | KV: VRAM (q8_0) | gen {}t / batch {}t | ubatch {}",
            total_layers, total_layers, threads_gen, threads_batch, ubatch_size
        ),
        InferenceMode::Hybrid => format!(
            "⚡ Hybrid — {}/{} layers GPU, {} CPU | KV: {} | gen {}t / batch {}t | ubatch {}{}",
            ngl_decision.ngl, total_layers,
            total_layers.saturating_sub(ngl_decision.ngl),
            if disable_kv_offload { "CPU RAM (PCIe)" } else { "VRAM (q8_0)" },
            threads_gen, threads_batch, ubatch_size,
            if use_mlock { " | mlock" } else { "" }
        ),
        InferenceMode::CpuOnly => format!(
            "🖥️ CPU only — {} threads (gen) / {} (batch) | ubatch {}",
            threads_gen, threads_batch, ubatch_size
        ),
    };

    info!("[HybridScheduler] {}", message);

    HybridInferenceConfig {
        ngl: ngl_decision.ngl,
        threads_gen,
        threads_batch,
        batch_size,
        ubatch_size,
        kv_cache_type,
        disable_kv_offload,
        use_mlock,
        use_mmap,
        flash_attention: true, // Always on — reduces KV bandwidth in attention
        mode,
        message,
    }
}

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
    pub disable_kv_offload: bool,
}

impl LlamaServerConfig {
    fn build_args(&self) -> Vec<String> {
        let mut args = vec![
            "-m".into(),            self.model_path.to_string_lossy().into_owned(),
            "-c".into(),            self.context_size.to_string(),
            // Logical batch buffer — keeps the scheduler fed while GPU computes
            "--batch-size".into(),  self.batch_size.to_string(),
            // Physical GPU compute chunk per prefill step
            "--ubatch-size".into(), self.ubatch_size.to_string(),
            // Generation threads: physical cores only (no HT contention)
            "-t".into(),            self.cpu_threads.to_string(),
            // Prefill threads: all logical threads (embarrassingly parallel)
            "-tb".into(),           self.threads_batch.to_string(),
            "-np".into(), "1".into(),
            "--port".into(),   SERVER_PORT.to_string(),
            "--host".into(),   SERVER_HOST.to_string(),
            "--keep".into(),   "-1".into(),
            "--no-warmup".into(),      // Faster cold start
            "--poll".into(), "0".into(), // Reduce idle CPU burn
            "-ngl".into(), self.ngl.to_string(),
        ];

        // Memory strategy: mmap+mlock (pinned mapping)
        if self.use_mmap {
            // mmap is the default — do NOT pass --no-mmap.
            // mlock additionally prevents the OS from evicting pages.
            if self.use_mlock {
                args.push("--mlock".into());
            }
        }

        if self.flash_attention {
            // Flash attention reduces KV bandwidth in the attention kernel.
            // Especially beneficial in hybrid mode where GPU<->CPU transfers
            // are already the bottleneck.
            args.extend(["-fa".into(), "on".into()]);
        }

        if let Some(ref kct) = self.kv_cache_type {
            const VALID_KV_TYPES: &[&str] = &["f16","f32","q8_0","q4_0","q4_1","q5_0","q5_1","q8_1"];
            if VALID_KV_TYPES.contains(&kct.as_str()) {
                // Set both K and V cache to the same quantization level.
                // q8_0: 2× VRAM saving vs f16, <1% quality loss.
                args.extend(["-ctk".into(), kct.clone(), "-ctv".into(), kct.clone()]);
            }
        }

        if self.disable_kv_offload {
            // Last resort: forces KV cache to CPU RAM (PCIe path, ~30× slower
            // per token vs VRAM). Only used when VRAM headroom < KV estimate.
            args.push("--no-kv-offload".into());
        }

        if let Some(ref draft) = self.draft_model_path {
            args.extend([
                "-md".into(), draft.to_string_lossy().into_owned(),
                "--spec-draft-n-min".into(), "5".into(),
                "--spec-draft-n-max".into(), "16".into(),
            ]);
        }

        if let Some(ref dev) = self.device_id {
            if !dev.is_empty() {
                args.extend(["--device".into(), dev.clone()]);
            }
        }

        args
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5 — LLAMA MANAGER
// ─────────────────────────────────────────────────────────────────────────────

pub struct LlamaManager {
    process: Arc<Mutex<Option<Child>>>,
}

impl LlamaManager {
    pub fn new() -> Self {
        Self { process: Arc::new(Mutex::new(None)) }
    }

    /// Start llama-server with the given config.
    ///
    /// Kills any existing process first (both tracked child and any orphan
    /// processes by binary name on Windows).  Polls the /v1/models endpoint
    /// until ready or timeout.
    pub async fn start(&self, cfg: &LlamaServerConfig) -> Result<(), String> {
        let mut guard = self.process.lock().await;

        // Kill any previously tracked child.
        if let Some(mut child) = guard.take() {
            info!("[LlamaManager] Killing existing server before restart...");
            let _ = child.kill().await;
            let _ = child.wait().await;
        }

        // Kill any orphan processes on Windows (e.g. from a previous crash).
        Self::kill_orphans().await;

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

        let mut cmd = TokioCommand::new(&cfg.server_path);
        cmd.hide_window();
        cmd.current_dir(server_dir)
            // Disable pinned memory to prevent llama.cpp from copying the CPU-side weights
            // into page-locked RAM. Without this, hybrid mode allocates massive amounts
            // of physical RAM (appearing as Shared GPU Memory in Windows) and defeats mmap.
            .env("GGML_CUDA_NO_PINNED", "1")
            .env("GGML_NO_PINNED", "1")
            .args(&args)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::from(log_std));

        let mut child = cmd.spawn()
            .map_err(|e| format!("Failed to spawn llama-server: {}", e))?;

        // Quick crash detection: wait 100 ms and check if it already exited.
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!(
                "llama-server crashed immediately (exit {}). Check model compatibility. Log: {:?}",
                status, log_path
            ));
        }

        // Fix #11: Reuse shared health client — avoids TCP+TLS setup per poll.
        let client = &*HEALTH_CLIENT;

        let url = format!("http://{}:{}/v1/models", SERVER_HOST, SERVER_PORT);
        let max_polls = SERVER_READY_TIMEOUT_SECS * 4; // Poll every 250ms
        let mut ready = false;

        for attempt in 0..max_polls {
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
            tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
        }

        if !ready {
            let _ = child.kill().await;
            return Err(format!(
                "llama-server failed to become ready within {}s. Check log: {:?}",
                SERVER_READY_TIMEOUT_SECS, log_path
            ));
        }

        info!("[LlamaManager] Server ready. ngl={} threads={}", cfg.ngl, cfg.cpu_threads);
        *guard = Some(child);
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
        Self::kill_orphans().await;
    }

    /// Kill any stray llama-server processes by binary name.
    async fn kill_orphans() {
        #[cfg(target_os = "windows")]
        {
            for bin in &["llama-server.exe", "llama-server-cuda.exe", "llama-server-vulkan.exe"] {
                let _ = tokio::process::Command::new("taskkill").hide_window()
                    .args(["/F", "/T", "/IM", bin])
                    .output()
                    .await;
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6 — DOWNLOADER (server binary)
// ─────────────────────────────────────────────────────────────────────────────

pub struct Downloader {
    client: Client,
}

impl Downloader {
    pub fn new() -> Self {
        Self { client: Client::builder()
            .timeout(std::time::Duration::from_secs(600))
            .user_agent("NYX-Local-Orchestrator") // REQUIRED FOR GITHUB API
            .build()
            .expect("HTTP client") }
    }

    pub fn binary_name(backend: &GpuBackend) -> &'static str {
        match backend {
            GpuBackend::Cuda => "llama-server-cuda.exe",
            GpuBackend::Vulkan => "llama-server-vulkan.exe",
            // Metal (macOS) uses the generic metal build; on Windows this falls back to CUDA
            GpuBackend::Metal => "llama-server",
            GpuBackend::Unknown => "llama-server-cuda.exe",
        }
    }

    /// Fetches the latest release from GitHub API, falls back to pinned if it fails.
    async fn resolve_release(&self, backend: &GpuBackend) -> (String, String) {
        if let Ok(resp) = self.client.get("https://api.github.com/repos/ggerganov/llama.cpp/releases/latest").send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(tag) = json["tag_name"].as_str() {
                        if let Some(assets) = json["assets"].as_array() {
                            let mut target_url = None;
                            for asset in assets {
                                if let (Some(name), Some(url)) = (asset["name"].as_str(), asset["browser_download_url"].as_str()) {
                                    let name_lower = name.to_lowercase();
                                    if name_lower.contains("win") && name_lower.contains("x64") && name_lower.ends_with(".zip") {
                                        let is_cuda = matches!(backend, GpuBackend::Cuda | GpuBackend::Unknown) && name_lower.contains("cuda");
                                        let is_vulkan = matches!(backend, GpuBackend::Vulkan) && name_lower.contains("vulkan");
                                        if is_cuda || is_vulkan {
                                            target_url = Some(url.to_string());
                                            break;
                                        }
                                    }
                                }
                            }
                            if let Some(url) = target_url {
                                return (tag.to_string(), url);
                            }
                        }
                    }
                }
            }
        }
        // Fallback to pinned version
        let zip_name = match backend {
            GpuBackend::Cuda | GpuBackend::Unknown => LLAMACPP_CUDA_ZIP,
            GpuBackend::Vulkan => LLAMACPP_VULKAN_ZIP,
            // Metal (macOS) — llama.cpp ships a universal macOS binary; not downloadable via this Windows path
            GpuBackend::Metal => LLAMACPP_CUDA_ZIP,
        };
        (LLAMACPP_PINNED_VERSION.to_string(), format!("{}/{}/{}", LLAMACPP_RELEASE_BASE, LLAMACPP_PINNED_VERSION, zip_name))
    }

    pub async fn get_installed_version(data_dir: &Path) -> String {
        let version_file = data_dir.join("binaries").join(".version");
        tokio::fs::read_to_string(&version_file).await.unwrap_or_else(|_| LLAMACPP_PINNED_VERSION.to_string()).trim().to_string()
    }

    pub async fn ensure_server(
        &self,
        data_dir: &Path,
        backend: &GpuBackend,
        on_progress: impl Fn(f32, &str) + Send + 'static,
    ) -> Result<PathBuf, String> {
        let bin_dir = data_dir.join("binaries");
        tokio::fs::create_dir_all(&bin_dir).await.map_err(|e| e.to_string())?;

        let binary_name = Self::binary_name(backend);
        let server_path = bin_dir.join(binary_name);

        let installed_version = Self::get_installed_version(data_dir).await;
        let needs_download = match tokio::fs::metadata(&server_path).await {
            Ok(m) => m.len() < MIN_SERVER_BINARY_BYTES,
            Err(_) => true,
        };

        if !needs_download {
            on_progress(100.0, &format!("Server binary ({}) already installed.", installed_version));
            return Ok(server_path);
        }

        let _ = tokio::fs::remove_file(&server_path).await;
        
        let (tag_name, url) = self.resolve_release(backend).await;
        let zip_name = url.split('/').last().unwrap_or("llama-server.zip");
        let zip_path = bin_dir.join(zip_name);

        on_progress(0.0, &format!("Downloading llama.cpp {} ({})...", tag_name,
            match backend {
                GpuBackend::Cuda | GpuBackend::Unknown => "CUDA",
                GpuBackend::Vulkan => "Vulkan",
                GpuBackend::Metal => "Metal",
            }));

        self.download_file(&url, &zip_path, |p| {
            on_progress(p * 0.9, &format!("Downloading llama-server... {:.0}%", p));
        }).await?;

        on_progress(90.0, "Extracting server binary...");

        let zip_str = zip_path.to_string_lossy().replace("\\\\?\\", "");
        let bin_str = bin_dir.to_string_lossy().replace("\\\\?\\", "");

        let extract_ok = Self::extract_with_retry(&zip_str, &bin_str).await;
        if !extract_ok {
            return Err(format!("Failed to extract {}", zip_name));
        }

        let extracted = bin_dir.join("llama-server.exe");
        if extracted.exists() {
            tokio::fs::rename(&extracted, &server_path).await
                .map_err(|e| format!("Failed to rename binary: {}", e))?;
        } else if !server_path.exists() {
            return Err(format!("Expected binary not found after extraction: {}", binary_name));
        }

        let _ = tokio::fs::remove_file(&zip_path).await;
        let _ = tokio::fs::write(bin_dir.join(".version"), &tag_name).await;

        on_progress(100.0, &format!("llama-server {} installed.", tag_name));
        Ok(server_path)
    }

    /// Download model + server binary.
    pub async fn ensure_assets(
        &self,
        data_dir: &Path,
        backend: &GpuBackend,
        on_progress: impl Fn(f32, &str) + Send + 'static + Clone,
    ) -> Result<(PathBuf, PathBuf), String> {
        let models_dir = data_dir.join("models");
        tokio::fs::create_dir_all(&models_dir).await.map_err(|e| e.to_string())?;

        let on_server = on_progress.clone();
        let server_path = self.ensure_server(data_dir, backend, on_server).await?;

        // Bundled starter model (Qwen 2.5 0.5B — small and fast).
        let model_path = models_dir.join("qwen2.5-0.5b-instruct-q4_k_m.gguf");
        if !model_path.exists() {
            let model_url = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf";
            self.download_file(model_url, &model_path, |p| {
                on_progress(p, &format!("Downloading starter model (Qwen 2.5 0.5B)... {:.0}%", p));
            }).await?;
        } else {
            on_progress(100.0, "Starter model already installed.");
        }

        Ok((model_path, server_path))
    }

    async fn extract_with_retry(zip_str: &str, bin_str: &str) -> bool {
        for attempt in 0..5 {
            let out = tokio::process::Command::new("tar").hide_window()
                .arg("-xf").arg(zip_str)
                .arg("-C").arg(bin_str)
                .output()
                .await;
            if let Ok(o) = out {
                if o.status.success() { return true; }
            }
            if attempt < 4 {
                // Windows Defender may hold the file for a moment after download.
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            }
        }
        false
    }

    async fn download_file(
        &self,
        url: &str,
        dest: &Path,
        on_progress: impl Fn(f32),
    ) -> Result<(), String> {
        info!("[Downloader] Downloading: {}", url);
        let mut response = self.client.get(url).send().await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Download failed ({}): {}", response.status(), url));
        }

        let total = response.content_length().unwrap_or(0);
        let tmp = dest.with_extension("tmp");
        let file = tokio::fs::File::create(&tmp).await.map_err(|e| e.to_string())?;
        let mut writer = tokio::io::BufWriter::with_capacity(1024 * 1024, file);

        let mut downloaded = 0u64;
        let mut last_emit = std::time::Instant::now();

        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            writer.write_all(&chunk).await.map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;
            if total > 0 && last_emit.elapsed().as_millis() > 250 {
                on_progress((downloaded as f32 / total as f32) * 100.0);
                last_emit = std::time::Instant::now();
            }
        }

        if total > 0 { on_progress(100.0); }
        writer.flush().await.map_err(|e| e.to_string())?;
        drop(writer);
        tokio::fs::rename(&tmp, dest).await.map_err(|e| e.to_string())?;
        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 7 — HF DOWNLOADER (resumable, pause/cancel, persistence)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct PersistentDownload {
    pub model_id: String,
    pub filename: String,
    pub url: String,
    pub total_size: u64,
    /// Preserved so meta.json is written correctly on resume.
    pub repo_id: Option<String>,
}

pub struct DownloadTask {
    pub is_paused: Arc<AtomicBool>,
    pub is_cancelled: Arc<AtomicBool>,
}

pub struct HfDownloaderState {
    pub tasks: Mutex<HashMap<String, DownloadTask>>,
    pub persistent_downloads: Mutex<HashMap<String, PersistentDownload>>,
    pub token: Mutex<Option<String>>,
    pub downloads_file_path: Mutex<Option<PathBuf>>,
}

impl HfDownloaderState {
    pub fn new() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
            persistent_downloads: Mutex::new(HashMap::new()),
            token: Mutex::new(None),
            downloads_file_path: Mutex::new(None),
        }
    }

    pub async fn init_persistence(&self, app_data_dir: PathBuf) {
        let file_path = app_data_dir.join("models").join("downloads.json");
        *self.downloads_file_path.lock().await = Some(file_path.clone());
        if file_path.exists() {
            if let Ok(content) = tokio::fs::read_to_string(&file_path).await {
                if let Ok(map) = serde_json::from_str::<HashMap<String, PersistentDownload>>(&content) {
                    *self.persistent_downloads.lock().await = map;
                }
            }
        }
    }

    pub async fn save_persistence(&self) {
        let path_opt = self.downloads_file_path.lock().await.clone();
        if let Some(path) = path_opt {
            if let Some(parent) = path.parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }
            let map = self.persistent_downloads.lock().await.clone();
            if let Ok(content) = serde_json::to_string_pretty(&map) {
                let _ = tokio::fs::write(&path, content).await;
            }
        }
    }

    pub async fn set_token(&self, token: String) {
        *self.token.lock().await = Some(token);
    }

    pub async fn get_token(&self) -> Option<String> {
        self.token.lock().await.clone()
    }
}

pub async fn download_hf_model(
    state: Arc<HfDownloaderState>,
    url: String,
    dest: PathBuf,
    model_id: String,
    repo_id: Option<String>,
    is_paused: Arc<AtomicBool>,
    is_cancelled: Arc<AtomicBool>,
    on_progress: impl Fn(f32, u64, u64) + Send + 'static,
) -> Result<(), String> {
    let client = Client::new();

    let dest_part = dest.with_extension("gguf.part");
    let mut downloaded = 0u64;

    let file = if dest_part.exists() {
        let f = tokio::fs::OpenOptions::new()
            .append(true)
            .open(&dest_part).await
            .map_err(|e| e.to_string())?;
        downloaded = f.metadata().await.map_err(|e| e.to_string())?.len();
        f
    } else {
        if let Some(parent) = dest_part.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
        }
        tokio::fs::File::create(&dest_part).await.map_err(|e| e.to_string())?
    };

    let mut req = client.get(&url);
    if downloaded > 0 {
        req = req.header(RANGE, format!("bytes={}-", downloaded));
        info!("[HfDownloader] Resuming from {} bytes", downloaded);
    }
    if let Some(token) = state.get_token().await {
        req = req.header(AUTHORIZATION, format!("Bearer {}", token));
    }

    let mut response = req.send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
            on_progress(100.0, downloaded, downloaded);
            return Ok(());
        }
        return Err(format!("Download failed ({}): {}", response.status(), url));
    }

    // Server ignored Range header → restart from zero.
    if downloaded > 0 && response.status() == reqwest::StatusCode::OK {
        file.set_len(0).await.map_err(|e| e.to_string())?;
        downloaded = 0;
        info!("[HfDownloader] Server ignored Range header; restarting download.");
    }

    let total_size = response.content_length().unwrap_or(0) + downloaded;

    // Persist so resume works after restart.
    {
        let mut pd = state.persistent_downloads.lock().await;
        pd.insert(model_id.clone(), PersistentDownload {
            model_id: model_id.clone(),
            filename: dest.file_name().unwrap_or_default().to_string_lossy().to_string(),
            url: url.clone(),
            total_size,
            repo_id: repo_id.clone(), // BUG FIX: was lost on resume
        });
    }
    state.save_persistence().await;

    let mut last_emit = std::time::Instant::now();
    let mut writer = tokio::io::BufWriter::with_capacity(1024 * 1024, file);

    while !is_cancelled.load(Ordering::SeqCst) {
        let chunk_res = tokio::time::timeout(std::time::Duration::from_millis(1000), response.chunk()).await;
        
        let chunk = match chunk_res {
            Ok(Ok(Some(c))) => c,
            Ok(Ok(None)) => break, // EOF
            Ok(Err(e)) => return Err(e.to_string()),
            Err(_) => {
                // Timeout waiting for chunk. Check cancellation and try again.
                continue;
            }
        };

        while is_paused.load(Ordering::SeqCst) {
            if is_cancelled.load(Ordering::SeqCst) { break; }
            let _ = writer.flush().await;
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }
        if is_cancelled.load(Ordering::SeqCst) { break; }

        writer.write_all(&chunk).await.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        if total_size > 0 && last_emit.elapsed().as_millis() > 250 {
            on_progress((downloaded as f32 / total_size as f32) * 100.0, downloaded, total_size);
            last_emit = std::time::Instant::now();
        }
    }

    writer.flush().await.map_err(|e| e.to_string())?;
    if total_size > 0 && !is_cancelled.load(Ordering::SeqCst) {
        on_progress(100.0, downloaded, total_size);
    }

    // Clean up persistence entry if cancelled or successfully completed
    if is_cancelled.load(Ordering::SeqCst) || downloaded == total_size || (total_size > 0 && downloaded >= total_size) {
        { state.persistent_downloads.lock().await.remove(&model_id); }
        state.save_persistence().await;
    }

    if is_cancelled.load(Ordering::SeqCst) {
        drop(writer);
        let _ = tokio::fs::remove_file(&dest_part).await;
        return Err("Download cancelled".to_string());
    }

    drop(writer);
    tokio::fs::rename(&dest_part, &dest).await
        .map_err(|e| format!("Failed to finalise download: {}", e))?;

    // Write metadata (author, repo_id) so list_local_models shows correct info.
    // BUG FIX: repo_id was previously lost on resume; now always available.
    if let Some(rid) = repo_id {
        let author = rid.split('/').next().unwrap_or("Hugging Face").to_string();
        let meta_path = dest.with_extension("gguf.meta.json");
        let meta = serde_json::json!({ "author": author, "repo_id": rid });
        let _ = tokio::fs::write(&meta_path, meta.to_string()).await;
    }

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// § 8 — TAURI COMMANDS
// ─────────────────────────────────────────────────────────────────────────────

/// Serialised result of a full hardware analysis, sent to the frontend.
#[derive(Serialize)]
pub struct HardwareAnalysisResult {
    // GPU
    pub gpu_name: String,
    pub gpu_backend: String,
    pub vram_total_mb: u64,
    pub vram_available_mb: u64,
    pub has_dedicated_gpu: bool,
    // CPU
    pub cpu_name: String,
    pub cpu_physical_cores: u32,
    pub cpu_logical_threads: u32,
    // RAM
    pub ram_total_mb: u64,
    pub ram_available_mb: u64,
    // Model-specific scheduling
    pub model_size_gb: f32,
    pub total_layers: u32,
    pub layers_on_gpu: u32,
    pub layers_on_cpu: u32,
    pub estimated_vram_mb: u64,
    pub estimated_ram_mb: u64,
    pub fully_gpu: bool,
    pub hybrid: bool,
    pub recommended_cpu_threads: u32,
    pub schedule_message: String,
    // Version
    pub llamacpp_version: String,
}

#[tauri::command]
pub async fn analyze_hardware(
    app: AppHandle,
    model_id: String,
    context_size: Option<u32>,
) -> Result<HardwareAnalysisResult, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let model_path = app_dir.join("models").join(&model_id);

    if !model_path.exists() {
        return Err(format!("Model '{}' not found. Please download it first.", model_id));
    }

    let meta = tokio::fs::metadata(&model_path).await.map_err(|e| e.to_string())?;
    let model_size_gb = meta.len() as f32 / (1024.0 * 1024.0 * 1024.0);
    let ctx = context_size.unwrap_or(8192);
    let total_layers = estimate_total_layers(Some(&model_path), model_size_gb);

    // Try to use the actual server binary for accurate VRAM (it knows all drivers).
    let hw_snapshot = {
        // Check CUDA then Vulkan binary.
        let cuda_path = app_dir.join("binaries").join("llama-server-cuda.exe");
        let vulkan_path = app_dir.join("binaries").join("llama-server-vulkan.exe");
        let server_opt = if cuda_path.exists() { Some(cuda_path) }
                         else if vulkan_path.exists() { Some(vulkan_path) }
                         else { None };
        HardwareSnapshot::collect(server_opt.as_deref()).await
    };

    let decision = compute_ngl_decision(&hw_snapshot, Some(&model_path), model_size_gb, ctx);
    let layers_on_gpu = if decision.ngl >= total_layers { total_layers } else { decision.ngl };
    let layers_on_cpu = total_layers.saturating_sub(layers_on_gpu);

    Ok(HardwareAnalysisResult {
        gpu_name: hw_snapshot.gpu_name,
        gpu_backend: format!("{:?}", hw_snapshot.gpu_backend),
        vram_total_mb: hw_snapshot.vram_total_mb,
        vram_available_mb: hw_snapshot.vram_available_mb,
        has_dedicated_gpu: hw_snapshot.has_dedicated_gpu,
        cpu_name: hw_snapshot.cpu_name,
        cpu_physical_cores: hw_snapshot.cpu_physical_cores,
        cpu_logical_threads: hw_snapshot.cpu_logical_threads,
        ram_total_mb: hw_snapshot.ram_total_mb,
        ram_available_mb: hw_snapshot.ram_available_mb,
        model_size_gb,
        total_layers,
        layers_on_gpu,
        layers_on_cpu,
        estimated_vram_mb: decision.estimated_vram_mb,
        estimated_ram_mb: {
            let kv_mb_per_1k = 40.0 + (model_size_gb * 8.0).min(100.0);
            let total_kv_mb = (ctx as f32 / 1024.0) * kv_mb_per_1k;
            let cpu_ratio = layers_on_cpu as f32 / total_layers.max(1) as f32;
            let cpu_kv_mb = total_kv_mb * cpu_ratio;
            let cpu_model_mb = (model_size_gb * 1024.0) * cpu_ratio;
            (cpu_model_mb + cpu_kv_mb) as u64 + 512 // 512MB base process overhead
        },
        fully_gpu: decision.fully_gpu,
        hybrid: decision.hybrid,
        recommended_cpu_threads: decision.recommended_cpu_threads,
        schedule_message: decision.message,
        llamacpp_version: Downloader::get_installed_version(&app_dir).await,
    })
}

// Alias kept for backwards compatibility (frontend calls both names).
#[tauri::command]
pub async fn estimate_hardware_usage(
    app: AppHandle,
    model_id: String,
    context_size: Option<u32>,
    _gpu_layers: u32,
) -> Result<HardwareAnalysisResult, String> {
    analyze_hardware(app, model_id, context_size).await
}

#[tauri::command]
pub async fn download_local_model(app: AppHandle) -> Result<(), String> {
    let _lock = DOWNLOAD_LOCK.try_lock()
        .map_err(|_| "A download is already in progress".to_string())?;

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    // Detect GPU backend first so we download the right binary.
    let hw = HardwareSnapshot::collect(None).await;
    let backend = hw.gpu_backend.clone();

    let downloader = Downloader::new();
    let app_clone = app.clone();
    let res = downloader.ensure_assets(&app_dir, &backend, move |progress, status| {
        let _ = app_clone.emit("llm-download-progress", serde_json::json!({
            "progress": progress, "status": status
        }));
    }).await;

    match res {
        Ok((model, server)) => {
            let _ = app.emit("llm-download-complete", serde_json::json!({
                "model": model, "server": server
            }));
            Ok(())
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn start_local_server(
    app: AppHandle,
    manager: State<'_, Arc<LlamaManager>>,
    model_id: String,
    context_size: Option<u32>,
    gpu_layers: Option<u32>,         // Optional manual override from UI slider
    cpu_threads: Option<u32>,        // Optional manual override
    flash_attention: Option<bool>,
    kv_cache_type: Option<String>,
    use_mlock: Option<bool>,
    batch_size: Option<u32>,
    draft_model_id: Option<String>,
    disable_kv_offload: Option<bool>,
) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let model_path = app_dir.join("models").join(&model_id);

    if !model_path.exists() {
        return Err(format!("Model '{}' not found. Please download it first.", model_id));
    }

    let draft_model_path = draft_model_id
        .filter(|id| !id.trim().is_empty())
        .map(|id| app_dir.join("models").join(id));
    let ctx = context_size.unwrap_or(0);
    // If ctx is 0 (auto), assume 8192 for VRAM estimation to prevent underestimation
    let effective_ctx = if ctx == 0 { 8192 } else { ctx };

    // --- Step 1: Detect hardware and pick the right binary ---
    // We check for both CUDA and Vulkan binaries on disk.
    let cuda_path = app_dir.join("binaries").join("llama-server-cuda.exe");
    let vulkan_path = app_dir.join("binaries").join("llama-server-vulkan.exe");

    // Collect hardware snapshot using whichever binary is available.
    let server_for_detection = if cuda_path.exists() { Some(cuda_path.clone()) }
                               else if vulkan_path.exists() { Some(vulkan_path.clone()) }
                               else { None };

    let hw = HardwareSnapshot::collect(server_for_detection.as_deref()).await;

    // Select server binary based on detected GPU backend.
    let server_path = match &hw.gpu_backend {
        GpuBackend::Cuda => &cuda_path,
        GpuBackend::Vulkan => &vulkan_path,
        GpuBackend::Metal => &cuda_path, // macOS uses its own native binary; this path is Windows-only
        GpuBackend::Unknown => &cuda_path, // Try CUDA first; falls back to CPU
    };

    // If the binary for the detected backend doesn't exist, download it.
    let server_needs_download = match tokio::fs::metadata(server_path).await {
        Ok(m) => m.len() < MIN_SERVER_BINARY_BYTES,
        Err(_) => true,
    };

    if server_needs_download {
        let _lock = DOWNLOAD_LOCK.lock().await;
        // Re-check after acquiring lock (another thread may have downloaded).
        let still_needed = match tokio::fs::metadata(server_path).await {
            Ok(m) => m.len() < MIN_SERVER_BINARY_BYTES,
            Err(_) => true,
        };
        if still_needed {
            let downloader = Downloader::new();
            let app_clone = app.clone();
            downloader.ensure_server(&app_dir, &hw.gpu_backend, move |p, s| {
                let _ = app_clone.emit("llm-download-progress", serde_json::json!({
                    "progress": p, "status": s
                }));
            }).await?;
        }
    }

    let model_size_gb = {
        let meta = tokio::fs::metadata(&model_path).await.map_err(|e| e.to_string())?;
        meta.len() as f32 / (1024.0 * 1024.0 * 1024.0)
    };

    // --- Safety Check: Removed ---
    // Previously we blocked loading if estimated needed memory > currently free physical memory.
    // However, this prevents using large contexts with small models by blocking valid pagefile usage.
    // We now let the OS handle virtual memory and let llama.cpp allocate what it needs.

    // --- Step 2: Run the hybrid co-execution scheduler ---
    // Computes NGL split + optimal thread counts + batch sizes + KV cache
    // placement + memory locking strategy — all from live hardware data.
    let path_opt = if model_path.exists() { Some(model_path.as_path()) } else { None };
    let hybrid_cfg = compute_hybrid_inference_config(&hw, path_opt, model_size_gb, effective_ctx);
    let total_layers = estimate_total_layers(path_opt, model_size_gb);

    // Manual overrides from UI (slider / settings panel) take precedence.
    let final_ngl = if let Some(manual_ngl) = gpu_layers {
        if manual_ngl >= total_layers { 999 } else { manual_ngl }
    } else if hybrid_cfg.mode == InferenceMode::FullGpu {
        999
    } else {
        hybrid_cfg.ngl
    };

    // Generation threads: scheduler recommendation unless user overrides.
    let final_threads     = cpu_threads.unwrap_or(hybrid_cfg.threads_gen);
    // Batch threads: always from scheduler (no user override available yet).
    let final_threads_batch = hybrid_cfg.threads_batch;
    // Batch / ubatch: user override or scheduler recommendation.
    // If frontend passed 0 for batch_size, treat it as None (use scheduler's value)
    let final_batch = batch_size.filter(|&b| b > 0).unwrap_or(hybrid_cfg.batch_size);
    let final_ubatch     = hybrid_cfg.ubatch_size;
    // KV cache: user override or scheduler recommendation.
    let final_kv_type    = kv_cache_type.or_else(|| Some(hybrid_cfg.kv_cache_type.clone()));
    // Memory and KV placement: user overrides or scheduler.
    let final_mlock      = use_mlock.unwrap_or(hybrid_cfg.use_mlock);
    let final_no_kv      = disable_kv_offload.unwrap_or(hybrid_cfg.disable_kv_offload);
    let final_flash      = flash_attention.unwrap_or(hybrid_cfg.flash_attention);

    // Emit the full inference config so the UI can display it.
    let estimated_vram_mb = {
        let d = compute_ngl_decision(&hw, path_opt, model_size_gb, effective_ctx);
        d.estimated_vram_mb
    };
    let _ = app.emit("vram-decision", serde_json::json!({
        "ngl": final_ngl,
        "fully_gpu": hybrid_cfg.mode == InferenceMode::FullGpu,
        "hybrid": hybrid_cfg.mode == InferenceMode::Hybrid,
        "message": hybrid_cfg.message,
        "estimated_vram_mb": estimated_vram_mb,
        "available_mb": hw.vram_available_mb,
        "gpu_name": hw.gpu_name,
        "model_size_gb": model_size_gb,
        "layers_on_gpu": if final_ngl >= 999 { total_layers } else { final_ngl },
        "layers_on_cpu": total_layers.saturating_sub(if final_ngl >= 999 { total_layers } else { final_ngl }),
        "cpu_threads": final_threads,
        "threads_batch": final_threads_batch,
        "ubatch_size": final_ubatch,
        "batch_size": final_batch,
        "kv_cache_type": final_kv_type,
        "kv_in_vram": !final_no_kv,
        "mlock": final_mlock,
        "flash_attention": final_flash,
        "inference_mode": hybrid_cfg.mode,
        "llamacpp_version": Downloader::get_installed_version(&app_dir).await,
    }));

    // --- Step 3: Build config and start the server ---
    let cfg = LlamaServerConfig {
        server_path: server_path.clone(),
        model_path,
        context_size: ctx,
        ngl: final_ngl,
        cpu_threads: final_threads,
        threads_batch: final_threads_batch,
        ubatch_size: final_ubatch,
        device_id: if hw.gpu_device_id.is_empty() { None } else { Some(hw.gpu_device_id.clone()) },
        flash_attention: final_flash,
        kv_cache_type: final_kv_type,
        use_mlock: final_mlock,
        use_mmap: hybrid_cfg.use_mmap || final_mlock,
        batch_size: final_batch,
        draft_model_path,
        disable_kv_offload: final_no_kv,
    };

    manager.start(&cfg).await?;

    let _ = app.emit("llm-server-ready", serde_json::json!({ "status": "Ready" }));
    Ok(())
}

#[tauri::command]
pub async fn stop_local_server(manager: State<'_, Arc<LlamaManager>>) -> Result<(), String> {
    manager.stop().await;
    Ok(())
}

#[tauri::command]
pub async fn check_local_server_status() -> Result<serde_json::Value, String> {
    // Fix #11: Reuse shared health-check client.
    let resp = HEALTH_CLIENT
        .get(format!("http://{}:{}/v1/models", SERVER_HOST, SERVER_PORT))
        .send().await
        .map_err(|_| "Server not reachable".to_string())?;
    if resp.status().is_success() {
        resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
    } else {
        Err(format!("Server returned HTTP {}", resp.status()))
    }
}

#[derive(Serialize)]
pub struct LocalModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub description: String,
    pub size_bytes: u64,
    /// "completed" | "downloading" | "paused"
    pub status: String,
}

#[tauri::command]
pub async fn list_local_models(app: AppHandle) -> Result<Vec<LocalModelInfo>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let models_dir = app_dir.join("models");

    if !models_dir.exists() {
        tokio::fs::create_dir_all(&models_dir).await.ok();
        return Ok(vec![]);
    }

    let mut models = Vec::new();
    let mut entries = tokio::fs::read_dir(&models_dir).await.map_err(|e| e.to_string())?;

    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if !path.is_file() { continue; }
        let ext = path.extension().and_then(|s| s.to_str());
        if ext != Some("gguf") { continue; }

        let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        let size_bytes = entry.metadata().await.map(|m| m.len()).unwrap_or(0);

        let meta_path = path.with_extension("gguf.meta.json");
        let description = if let Ok(content) = tokio::fs::read_to_string(&meta_path).await {
            if let Ok(j) = serde_json::from_str::<serde_json::Value>(&content) {
                j.get("author").and_then(|v| v.as_str())
                    .map(|a| format!("Downloaded from {}", a))
                    .unwrap_or_else(|| "Local GGUF model".to_string())
            } else { "Local GGUF model".to_string() }
        } else { "Local GGUF model".to_string() };

        // BUG FIX: Check for .gguf.part to show downloading status correctly.
        let part_path = path.with_extension("gguf.part");
        let status = if part_path.exists() { "downloading" } else { "completed" };

        models.push(LocalModelInfo {
            id: name.clone(),
            name,
            provider: "nyx-native".to_string(),
            description,
            size_bytes,
            status: status.to_string(),
        });
    }

    info!("[NYX] list_local_models: found {} models in {:?}", models.len(), models_dir);
    Ok(models)
}

// ── HF Commands ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn hf_set_token(
    token: String,
    state: State<'_, Arc<HfDownloaderState>>,
) -> Result<(), String> {
    state.set_token(token).await;
    Ok(())
}

#[tauri::command]
pub async fn hf_download_model(
    app: AppHandle,
    state: State<'_, Arc<HfDownloaderState>>,
    url: String,
    model_id: String,
    filename: String,
    repo_id: Option<String>,
) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dest = app_dir.join("models").join(&filename);

    let is_paused = Arc::new(AtomicBool::new(false));
    let is_cancelled = Arc::new(AtomicBool::new(false));

    {
        let mut tasks = state.tasks.lock().await;
        if tasks.contains_key(&model_id) {
            return Err("Model is already downloading".to_string());
        }
        tasks.insert(model_id.clone(), DownloadTask {
            is_paused: is_paused.clone(),
            is_cancelled: is_cancelled.clone(),
        });
    }

    let state_clone = Arc::clone(&*state);
    let app_clone = app.clone();
    let mid = model_id.clone();
    let repo_id_clone = repo_id.clone();
    let is_paused_clone = is_paused.clone();
    let is_cancelled_clone = is_cancelled.clone();

    tokio::spawn(async move {
        let mid_emit = mid.clone();
        let state_for_download = state_clone.clone();
        let res = download_hf_model(
            state_for_download,
            url,
            dest,
            mid.clone(),
            repo_id_clone,
            is_paused_clone,
            is_cancelled_clone,
            move |pct, downloaded, total| {
                let _ = app_clone.emit("hf-download-progress", serde_json::json!({
                    "model_id": mid_emit,
                    "progress": pct,
                    "downloaded": downloaded,
                    "total": total,
                }));
            },
        ).await;

        match res {
            Ok(_) => {
                let _ = app.emit("hf-download-complete", serde_json::json!({
                    "model_id": mid,
                    "filename": filename,
                }));
            }
            Err(e) => {
                let _ = app.emit("hf-download-error", serde_json::json!({
                    "model_id": mid,
                    "error": e,
                }));
            }
        }
        
        // Always ensure the task is removed from memory when the loop exits
        {
            state_clone.tasks.lock().await.remove(&mid);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn hf_pause_download(
    model_id: String,
    state: State<'_, Arc<HfDownloaderState>>,
) -> Result<(), String> {
    let tasks = state.tasks.lock().await;
    if let Some(task) = tasks.get(&model_id) {
        task.is_paused.store(true, Ordering::SeqCst);
        Ok(())
    } else {
        Err("Download task not found".to_string())
    }
}

#[tauri::command]
pub async fn hf_resume_download(
    app: AppHandle,
    model_id: String,
    state: State<'_, Arc<HfDownloaderState>>,
) -> Result<(), String> {
    // If task is still in memory (just paused), unpause it.
    {
        let tasks = state.tasks.lock().await;
        if let Some(task) = tasks.get(&model_id) {
            task.is_paused.store(false, Ordering::SeqCst);
            return Ok(());
        }
    }

    // Task was evicted (app restart). Restore from persistence.
    let restored = {
        let pd = state.persistent_downloads.lock().await;
        pd.get(&model_id).cloned()
    };

    if let Some(p) = restored {
        // BUG FIX: repo_id is now persisted and restored correctly.
        hf_download_model(app, state, p.url, model_id, p.filename, p.repo_id).await
    } else {
        Err("Download task not found".to_string())
    }
}

#[tauri::command]
pub async fn hf_cancel_download(
    app: AppHandle,
    model_id: String,
    state: State<'_, Arc<HfDownloaderState>>,
) -> Result<(), String> {
    // Signal the active download loop to stop and remove it.
    {
        let mut tasks = state.tasks.lock().await;
        if let Some(task) = tasks.remove(&model_id) {
            task.is_cancelled.store(true, Ordering::SeqCst);
            task.is_paused.store(false, Ordering::SeqCst); // unblock paused loop
        }
    }

    // Always remove from persistence and clean up .part file.
    {
        let mut pd = state.persistent_downloads.lock().await;
        if let Some(p) = pd.remove(&model_id) {
            state.save_persistence().await;
            if let Ok(app_dir) = app.path().app_data_dir() {
                let part = app_dir.join("models").join(&p.filename).with_extension("gguf.part");
                let _ = tokio::fs::remove_file(part).await;
            }
            return Ok(());
        }
    }

    Ok(()) // Assume success if it was in tasks or pd (or even if it wasn't, cancelling a non-existent task is fine)
}

#[derive(Serialize, Deserialize)]
pub struct RestoredDownload {
    pub model_id: String,
    pub filename: String,
    pub url: String,
    pub total_size: u64,
    pub downloaded: u64,
    pub is_running: bool,
}

#[tauri::command]
pub async fn hf_get_restored_downloads(
    app: AppHandle,
    state: State<'_, Arc<HfDownloaderState>>,
) -> Result<Vec<RestoredDownload>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    state.init_persistence(app_dir.clone()).await;

    let models_dir = app_dir.join("models");
    let pd_map = state.persistent_downloads.lock().await.clone();

    let mut restored = Vec::new();
    let mut to_remove = Vec::new();
    let tasks = state.tasks.lock().await;

    for (id, pd) in pd_map {
        let part = models_dir.join(&pd.filename).with_extension("gguf.part");
        if part.exists() {
            if let Ok(meta) = tokio::fs::metadata(&part).await {
                restored.push(RestoredDownload {
                    model_id: pd.model_id.clone(),
                    filename: pd.filename.clone(),
                    url: pd.url.clone(),
                    total_size: pd.total_size,
                    downloaded: meta.len(),
                    is_running: tasks.contains_key(&pd.model_id),
                });
            }
        } else {
            to_remove.push(id);
        }
    }

    if !to_remove.is_empty() {
        let mut pd = state.persistent_downloads.lock().await;
        for id in to_remove { pd.remove(&id); }
        state.save_persistence().await;
    }

    Ok(restored)
}

#[tauri::command]
pub async fn hf_uninstall_model(
    app: AppHandle,
    manager: State<'_, Arc<LlamaManager>>,
    filename: String,
) -> Result<(), String> {
    // Stop the server to release file locks before deletion.
    manager.stop().await;

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dest = app_dir.join("models").join(&filename);

    if !dest.exists() {
        return Ok(()); // Already gone.
    }

    let mut last_error = None;
    for _ in 0..10 {
        match tokio::fs::remove_file(&dest).await {
            Ok(_) => {
                info!("[NYX] Uninstalled model: {}", filename);
                // Also remove metadata file if present.
                let meta = dest.with_extension("gguf.meta.json");
                let _ = tokio::fs::remove_file(&meta).await;
                return Ok(());
            }
            Err(e) => {
                last_error = Some(e);
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            }
        }
    }
    Err(format!("Failed to delete '{}' after retries: {:?}", filename, last_error))
}

// ── HF Marketplace Commands ───────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct HfModelResult {
    pub id: String,
    pub downloads: u64,
    pub likes: u64,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[tauri::command]
pub async fn hf_search_models(query: String) -> Result<Vec<HfModelResult>, String> {
    let url = format!(
        "https://huggingface.co/api/models?search={}&filter=gguf&sort=downloads&direction=-1&limit=50",
        query
    );
    let client = Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        resp.json::<Vec<HfModelResult>>().await.map_err(|e| e.to_string())
    } else {
        Err(format!("HF search failed: {}", resp.status()))
    }
}

#[derive(Serialize, Deserialize)]
pub struct HfModelFile {
    pub filename: String,
    pub size: u64,
}

#[derive(Serialize, Deserialize)]
struct HfTreeEntry {
    pub r#type: String,
    pub path: String,
    pub size: u64,
    pub lfs: Option<HfLfsInfo>,
}

#[derive(Serialize, Deserialize)]
struct HfLfsInfo {
    pub size: u64,
}

#[tauri::command]
pub async fn hf_get_model_files(model_id: String) -> Result<Vec<HfModelFile>, String> {
    let url = format!("https://huggingface.co/api/models/{}/tree/main", model_id);
    let client = Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        let entries: Vec<HfTreeEntry> = resp.json().await.map_err(|e| e.to_string())?;
        let files = entries.into_iter()
            .filter(|e| e.r#type == "file" && e.path.ends_with(".gguf"))
            .map(|e| HfModelFile {
                filename: e.path,
                size: e.lfs.map(|l| l.size).unwrap_or(e.size),
            })
            .collect();
        Ok(files)
    } else {
        Err(format!("Failed to fetch file list: {}", resp.status()))
    }
}

#[tauri::command]
pub async fn hf_get_model_readme(model_id: String) -> Result<String, String> {
    let url = format!("https://huggingface.co/{}/raw/main/README.md", model_id);
    let client = Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        resp.text().await.map_err(|e| e.to_string())
    } else {
        Err(format!("Failed to fetch README (HTTP {})", resp.status()))
    }
}

/// Returns the pinned llama.cpp version string so the UI can display it.
#[tauri::command]
pub async fn get_llamacpp_version(app: AppHandle) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(Downloader::get_installed_version(&app_dir).await)
}
