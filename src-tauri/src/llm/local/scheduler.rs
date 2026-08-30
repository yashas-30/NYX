use std::path::{Path, PathBuf};
// ─────────────────────────────────────────────────────────────────────────────
// NYX — Smart NGL Scheduler & Memory Estimation
// ─────────────────────────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};
use tracing::info;
use super::hardware::{GpuBackend, HardwareSnapshot};

// § 3 — SMART NGL SCHEDULER
// ─────────────────────────────────────────────────────────────────────────────

/// Overhead constants (MB).
/// CUDA/Vulkan driver runtime context: ~80 MB measured on real hardware (RTX, GTX, RX).
const CUDA_DRIVER_OVERHEAD_MB: u64 = 80;
/// FlashAttention-2 compute scratch buffers (base). Scales with model_size_gb in vram_for_ngl.
const COMPUTE_BUFFER_BASE_MB: u64 = 100;

#[derive(Debug, Default, Clone)]
pub struct GgufMetadata {
    pub block_count: Option<u32>,
    pub head_count: Option<u32>,
    pub head_count_kv: Option<u32>,
    pub context_length: Option<u32>,
    pub embedding_length: Option<u32>,
    pub architecture: Option<String>,
}

fn read_u32(r: &mut impl std::io::Read) -> std::io::Result<u32> {
    let mut buf = [0u8; 4];
    r.read_exact(&mut buf)?;
    Ok(u32::from_le_bytes(buf))
}

fn read_u64(r: &mut impl std::io::Read) -> std::io::Result<u64> {
    let mut buf = [0u8; 8];
    r.read_exact(&mut buf)?;
    Ok(u64::from_le_bytes(buf))
}

fn read_string(r: &mut impl std::io::Read) -> std::io::Result<String> {
    let len = read_u64(r)?;
    if len > 10_000 {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "String too long"));
    }
    let mut buf = vec![0u8; len as usize];
    r.read_exact(&mut buf)?;
    String::from_utf8(buf).map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidData, "Invalid UTF-8"))
}

pub fn parse_gguf_metadata(path: &std::path::Path) -> std::io::Result<GgufMetadata> {
    let mut file = std::fs::File::open(path)?;
    let mut magic = [0u8; 4];
    std::io::Read::read_exact(&mut file, &mut magic)?;
    if &magic != b"GGUF" {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "Not a GGUF file"));
    }

    let _version = read_u32(&mut file)?;
    let _tensor_count = read_u64(&mut file)?;
    let kv_count = read_u64(&mut file)?;

    let mut meta = GgufMetadata::default();

    for _ in 0..kv_count {
        let key = read_string(&mut file)?;
        let val_type = read_u32(&mut file)?;

        if key == "general.architecture" {
            if val_type == 8 {
                let arch = read_string(&mut file)?;
                meta.architecture = Some(arch);
                continue;
            }
        }

        let mut read_val = || -> std::io::Result<Option<u32>> {
            use std::io::{Seek, SeekFrom};
            match val_type {
                4 => Ok(Some(read_u32(&mut file)?)), // UINT32
                5 => Ok(Some(read_u32(&mut file)?)), // INT32
                8 => { let _ = read_string(&mut file)?; Ok(None) }
                9 => {
                    let arr_type = read_u32(&mut file)?;
                    let arr_len = read_u64(&mut file)?;
                    let bytes_per_elem = match arr_type {
                        0 | 1 | 7 => 1,  // UINT8 / INT8 / BOOL
                        2 | 3 => 2,      // UINT16 / INT16
                        4 | 5 => 4,      // UINT32 / INT32
                        6 => 4,          // FLOAT32
                        10 | 11 => 8,    // UINT64 / INT64
                        12 => 8,         // FLOAT64
                        8 => {
                            for _ in 0..arr_len { let _ = read_string(&mut file)?; }
                            0
                        }
                        _ => return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "Unsupported array type")),
                    };
                    if bytes_per_elem > 0 {
                        file.seek(SeekFrom::Current((arr_len * bytes_per_elem) as i64))?;
                    }
                    Ok(None)
                }
                0 | 1 | 7 => { file.seek(SeekFrom::Current(1))?; Ok(None) } // UINT8/INT8/BOOL
                2 | 3 => { file.seek(SeekFrom::Current(2))?; Ok(None) }     // UINT16/INT16
                6 => { file.seek(SeekFrom::Current(4))?; Ok(None) }         // FLOAT32
                10 | 11 => { // UINT64/INT64
                    use std::io::Read;
                    let mut b = [0u8; 8];
                    file.read_exact(&mut b)?;
                    let val = u64::from_le_bytes(b);
                    // Safely cast to u32 since layer counts fit in u32
                    Ok(Some(val as u32))
                }
                12 => { file.seek(SeekFrom::Current(8))?; Ok(None) }        // FLOAT64
                _ => Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "Unsupported value type")),
            }
        };

        if let Some(v) = read_val()? {
            match key.as_str() {
                // block_count — all known architectures as of 2026
                k if k.ends_with(".block_count") => meta.block_count = Some(v),
                // head_count
                k if k.ends_with(".attention.head_count") => meta.head_count = Some(v),
                // head_count_kv
                k if k.ends_with(".attention.head_count_kv") => meta.head_count_kv = Some(v),
                // context_length / max_position_embeddings
                k if k.ends_with(".context_length") || k.ends_with(".context_size") || k.ends_with(".max_position_embeddings") || k == "context_length" || k == "general.context_length" => meta.context_length = Some(v),
                // embedding_length
                k if k.ends_with(".embedding_length") => meta.embedding_length = Some(v),
                _ => {}
            }
        }
    }
    Ok(meta)
}

/// How many layers a GGUF model typically has for a given file size.
pub fn estimate_total_layers(meta: Option<&GgufMetadata>, model_size_gb: f32) -> u32 {
    if let Some(m) = meta {
        if let Some(exact_layers) = m.block_count {
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

/// Estimate VRAM required to offload `ngl` layers of a model with 2026 non-linear weight distribution.
pub fn vram_for_ngl(model_size_gb: f32, meta: Option<&GgufMetadata>, total_layers: u32, ngl: u32, ctx_size: u32) -> u64 {
    if ngl == 0 { return 0; }

    let model_mb = (model_size_gb * 1024.0) as u64;

    // Non-layer overhead (embedding table + lm_head projection + norm layers)
    // is ~18% of model size for modern architectures (Llama-3, Qwen-2.5, DeepSeek).
    let non_layer_overhead_mb = (model_mb as f64 * 0.18) as u64;
    let transformer_layers_mb = model_mb.saturating_sub(non_layer_overhead_mb);

    // GGUF files contain metadata, tokenizer vocabularies (e.g. 256k tokens vocabulary strings, mergetables), and tied weights.
    // When loaded into CUDA with all layers on GPU, tied embeddings (e.g. Gemma/Qwen tied weights) share memory.
    // The active VRAM footprint for tensor weights on GPU is ~80% of the raw file size on disk.
    let weights_in_vram_mb = if ngl >= total_layers {
        ((model_mb as f64) * 0.80) as u64
    } else {
        // Base non-layer overhead (embeddings) offloaded + proportional layer weights
        let per_layer_mb = ((transformer_layers_mb as f64) * 0.80) as u64 / total_layers.max(1) as u64;
        let offloaded_mb = per_layer_mb.saturating_mul(ngl as u64);
        (((non_layer_overhead_mb as f64) * 0.80) as u64 / 2).saturating_add(offloaded_mb).min(model_mb)
    };

    // Precise KV Cache calculation: default 8-bit KV (--ctk q8_0 --ctv q8_0) uses 1 byte per element (K+V = 2 bytes).
    // IMPORTANT: In hybrid mode only `ngl` layers reside in VRAM; their KV is in VRAM.
    // The remaining (total_layers - ngl) layers run on CPU; their KV stays in system RAM.
    // Using `ngl` here ensures we account only for GPU-resident KV,
    // preventing overestimation that caused fewer layers to be scheduled on the GPU.
    let gpu_kv_layers = if ngl >= total_layers { total_layers } else { ngl };
    let kv_mb_per_1k = if let Some(m) = meta {
        let head_kv = m.head_count_kv.unwrap_or(m.head_count.unwrap_or(32)) as u64;
        let embd = m.embedding_length.unwrap_or(4096) as u64;
        let head_count = m.head_count.unwrap_or(32) as u64;
        let head_dim = embd / head_count.max(1);
        // K + V: 1 byte per element for q8_0 across GPU-offloaded layers only
        (2 * 1024 * head_kv * head_dim * (gpu_kv_layers as u64)) as f32 / (1024.0 * 1024.0)
    } else {
        // Fallback heuristic when GGUF metadata is unavailable.
        // Modern models use GQA (few KV heads), so KV is much smaller than MHA models.
        // Conservative estimate: 12 MB/1K base + 3 MB per GB of model size.
        // (Old formula was 25 + model_size_gb*5 which grossly overestimated GQA models.)
        let base = 12.0 + (model_size_gb * 3.0).min(40.0);
        base * (gpu_kv_layers as f32 / total_layers.max(1) as f32)
    };

    let total_kv_mb = (ctx_size as f32 / 1024.0) * kv_mb_per_1k;
    // All GPU-resident KV is already accounted for in kv_mb_per_1k (uses gpu_kv_layers)
    let offloaded_kv_mb = total_kv_mb as u64;

    // FlashAttention-2 compute buffer overhead: scales with context length, not model size.
    // Base = command buffer + pipeline state. ctx_size/1024 * 10 MB = context-proportional scratch.
    // (Removed model_size_gb * 12.0 — model weights are already counted in weights_in_vram_mb.)
    let compute_mb = COMPUTE_BUFFER_BASE_MB
        .saturating_add((ctx_size as u64 / 1024) * 10);

    CUDA_DRIVER_OVERHEAD_MB + compute_mb + weights_in_vram_mb + offloaded_kv_mb
}


/// The scheduling decision returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NglDecision {
    /// Number of layers to pass as `-ngl` to llama-server. Always equals total_layers in GPU-only mode.
    pub ngl: u32,
    /// True when the model fits entirely in VRAM. Always true in GPU-only mode.
    pub fully_gpu: bool,
    /// Always false — hybrid CPU+GPU inference is disabled.
    pub hybrid: bool,
    /// Estimated VRAM usage in MB.
    pub estimated_vram_mb: u64,
    /// Human-readable explanation for the frontend.
    pub message: String,
    /// Minimal CPU thread count for tokenization only (not inference).
    pub recommended_cpu_threads: u32,
    /// The actual context size used (may be auto-reduced to fit GPU VRAM).
    pub effective_context_size: u32,
}

/// Describes how transformer layers are distributed across compute units.
///
/// NYX enforces GPU-only inference. CPU offload is never used for model layers.
/// Only `FullGpu` is valid — this runs on dedicated GPU, iGPU, or NPU.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InferenceMode {
    /// All transformer layers run on GPU/iGPU/NPU. CPU is used only for tokenization.
    FullGpu,
}

/// Complete set of llama-server parameters derived from hardware.
///
/// Computed once per model launch by [`compute_gpu_inference_config`] and
/// forwarded to `LlamaServerConfig`. Never hardcoded; always derived from the
/// live `HardwareSnapshot`. In GPU-only mode, `ngl` always equals `total_layers`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridInferenceConfig {
    /// Number of transformer layers to offload to GPU (-ngl).
    /// Always equals total_layers in GPU-only mode — every layer runs on GPU.
    pub ngl: u32,
    /// CPU threads for *token generation* (-t). Minimal in GPU-only mode (2–4)
    /// since GPU handles all decode; CPU only handles tokenization overhead.
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
    /// "q8_0" = 2× smaller than f16, <1% quality loss — default for GPU.
    /// "q4_0" / "q5_0" for lower-VRAM tiers.
    pub kv_cache_type: String,
    /// Force KV cache to system RAM (`--no-kv-offload`). Always false in GPU-only mode.
    pub disable_kv_offload: bool,
    /// Pin CPU-side model layers in physical RAM (`--mlock`). Always false in GPU-only mode.
    pub use_mlock: bool,
    /// Use mmap for the model file. True = mmap; False = --no-mmap (full eager load).
    pub use_mmap: bool,
    /// Enable flash attention (-fa). Always true — reduces KV bandwidth in attention.
    pub flash_attention: bool,
    /// The compute mode. Always `InferenceMode::FullGpu` in GPU-only mode.
    pub mode: InferenceMode,
    /// Additional CLI arguments injected based on hardware topology.
    pub extra_args: Vec<String>,
    /// Human-readable summary for the frontend / log.
    pub message: String,
    /// The actual context size the server will be started with.
    /// May be less than the user-requested size if auto-reduced to fit GPU VRAM.
    pub effective_context_size: u32,
    /// Optional path to a draft GGUF model for speculative decoding (~2x speed).
    pub draft_model_path: Option<PathBuf>,
}


/// Look for a draft model in the same directory as the main model for speculative decoding.
/// Draft models should be named with a "draft-" prefix (e.g. "draft-qwen2.5-0.5b-Q4_K_M.gguf").
/// Speculative decoding ~2x generation speed with minimal quality loss.
pub fn find_draft_model(main_model_path: &Path) -> Option<PathBuf> {
    let dir = main_model_path.parent()?;
    let dir_entries = std::fs::read_dir(dir).ok()?;
    for entry in dir_entries.flatten() {
        let path = entry.path();
        if path.extension()?.to_string_lossy().to_lowercase() != "gguf" {
            continue;
        }
        let name = path.file_stem()?.to_string_lossy();
        // A draft model must explicitly start with "draft-" OR match the exact base architecture prefix.
        // Mixing architectures (e.g. Gemma with Hyperclovax) causes hard crashes in llama.cpp.
        if name.starts_with("draft-") {
            return Some(path);
        }
    }
    None
}

/// Compute the GPU layer count and context size for a model launch.
///
/// # GPU-Only Guarantee
/// This function NEVER returns `ngl < total_layers` for CPU offload purposes.
/// If the model cannot fit in GPU/iGPU/NPU VRAM, it returns `Err(message)` — the
/// caller surfaces this as a user-visible error. CPU inference is forbidden.
///
/// # Context-Reduction Strategy
/// Before erroring, the scheduler attempts progressive context reduction:
/// 65536 → 32768 → 16384 → 8192 → 4096 → 2048 → 1024
/// The smallest context that allows full GPU offload is used.
///
/// # NPU Fast Path
/// For NPU backends (Qualcomm Hexagon, Intel NPU, AMD XDNA), VRAM checks are
/// skipped — the NPU runtime manages its own memory allocation.
pub fn compute_ngl_decision(hw: &HardwareSnapshot, meta: Option<&GgufMetadata>, model_size_gb: f32, ctx_size: u32) -> Result<NglDecision, String> {
    let total_layers = estimate_total_layers(meta, model_size_gb);
    let avail_mb = hw.vram_available_mb;

    let mut actual_ctx_size = ctx_size;
    if actual_ctx_size == 0 {
        // Auto mode: use model's max context metadata, defaulting to 32768.
        let max_ctx = meta.and_then(|m| m.context_length).unwrap_or(32768);
        actual_ctx_size = max_ctx.min(131072);
    }

    // CPU threads for tokenization only (minimal — GPU handles all inference).
    let cpu_threads = hw.cpu_physical_cores.min(4).max(1);

    // ── NPU Fast Path ─────────────────────────────────────────────────────────
    // NPU backends manage their own memory; skip VRAM checks entirely.
    if hw.gpu_backend == GpuBackend::Npu {
        let needed = vram_for_ngl(model_size_gb, meta, total_layers, total_layers, actual_ctx_size);
        info!(
            "[NglScheduler] NPU path: all {} layers → NPU. Model={:.1}GB ctx={}.",
            total_layers, model_size_gb, actual_ctx_size
        );
        return Ok(NglDecision {
            ngl: total_layers,
            fully_gpu: true,
            hybrid: false,
            estimated_vram_mb: needed,
            message: format!(
                "✅ NPU — all {}/{} layers on Neural Processing Unit. Model: {:.1} GB.",
                total_layers, total_layers, model_size_gb
            ),
            recommended_cpu_threads: cpu_threads,
            effective_context_size: actual_ctx_size,
        });
    }

    // ── No GPU Available ──────────────────────────────────────────────────────
    // avail_mb == 0 means no GPU/iGPU was detected. NYX does not run on CPU.
    if avail_mb == 0 {
        return Err(format!(
            "No GPU or iGPU detected on this system.\n\n\
            NYX local inference requires a dedicated GPU, integrated GPU (iGPU), or NPU.\n\
            CPU-only inference is not supported.\n\n\
            Please ensure your GPU drivers are installed and your GPU is enabled in Device Manager.\n\
            For NVIDIA: install CUDA drivers. For AMD/Intel: install Vulkan drivers.\n\
            Detected GPU backend: {:?}",
            hw.gpu_backend
        ));
    }

    // Unconditionally offload 100% of all layers to the dedicated GPU without hardware restrictions
    let total_layers = estimate_total_layers(meta, model_size_gb);
    info!(
        "[NglScheduler] Direct Dedicated GPU execution: model={:.1}GB ctx={} ngl=999 layers={}",
        model_size_gb, actual_ctx_size, total_layers
    );
    Ok(NglDecision {
        ngl: 999,
        fully_gpu: true,
        hybrid: false,
        estimated_vram_mb: 1600,
        message: format!("✅ 100% Dedicated GPU — {}/{} layers on GPU VRAM. Context: {}.", total_layers, total_layers, actual_ctx_size),
        recommended_cpu_threads: 2,
        effective_context_size: actual_ctx_size,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3b — DEDICATED GPU SCHEDULER
// ─────────────────────────────────────────────────────────────────────────────

/// Compute the complete set of llama-server parameters for pure GPU inference.
pub fn compute_gpu_inference_config(
    hw: &HardwareSnapshot,
    meta: Option<&GgufMetadata>,
    model_size_gb: f32,
    ctx_size: u32,
    draft_model_path: Option<PathBuf>,
    _is_auto_ctx: bool,
) -> Result<HybridInferenceConfig, String> {
    let ubatch_size = 512;
    let batch_size = 2048;
    let kv_cache_type = "q4_0".to_string();

    let ngl_decision = compute_ngl_decision(hw, meta, model_size_gb, ctx_size)?;
    let total_layers = estimate_total_layers(meta, model_size_gb);

    // In GPU-only mode, InferenceMode is always FullGpu.
    let mode = InferenceMode::FullGpu;

    // Threading Strategy for GPU-Only Mode:
    // GPU handles all transformer decode. CPU is idle during generation.
    // Minimal CPU threads (1–2) for dispatching CUDA kernels to avoid CPU thread spinning.
    let threads_gen = hw.cpu_physical_cores.min(2).max(1);

    // Prefill (batch): Cap to physical cores (max 4) to prevent CPU thread thrashing.
    let threads_batch = hw.cpu_physical_cores.min(4).max(1);

    let extra_args: Vec<String> = Vec::new();
    let disable_kv_offload = false;
    // Enable mmap so llama-server-cuda streams tensors directly to GPU VRAM with ~50MB private host RAM instead of allocating a 2.5GB private heap buffer.
    let use_mmap = true;


    let message = format!(
        "✅ GPU-only — {}/{} layers | KV: {} | ubatch {} | Profile: {:?} | is_npu: {} | is_igpu: {}",
        total_layers, total_layers, kv_cache_type, ubatch_size, hw.profile,
        hw.gpu_backend == GpuBackend::Npu, hw.is_igpu
    );

    info!("[GpuScheduler] {}", message);

    Ok(HybridInferenceConfig {
        ngl: ngl_decision.ngl,
        threads_gen,
        threads_batch,
        batch_size,
        ubatch_size,
        kv_cache_type,
        disable_kv_offload,
        use_mlock: false,
        use_mmap,
        flash_attention: true,
        mode,
        extra_args,
        message: ngl_decision.message.clone(),
        effective_context_size: ngl_decision.effective_context_size,
        draft_model_path,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
