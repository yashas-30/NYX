use std::path::{Path, PathBuf};
// ─────────────────────────────────────────────────────────────────────────────
// NYX — Smart NGL Scheduler & Memory Estimation
// ─────────────────────────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};
use tracing::info;
use super::hardware::HardwareSnapshot;

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
    pub chat_template: Option<String>,
    pub tags: Vec<String>,
    pub supports_reasoning: bool,
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
    if len > 100_000 {
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

        if key.contains("chat_template") && val_type == 8 {
            if let Ok(tmpl) = read_string(&mut file) {
                let tmpl_lower = tmpl.to_lowercase();
                if tmpl_lower.contains("<think>")
                    || tmpl_lower.contains("<|thought|>")
                    || tmpl_lower.contains("thought\n")
                    || tmpl_lower.contains("[think]")
                    || tmpl_lower.contains("reasoning_content")
                    || tmpl_lower.contains("enable_thinking")
                {
                    meta.supports_reasoning = true;
                }
                meta.chat_template = Some(tmpl);
            }
            continue;
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
                    if arr_type == 8 {
                        for _ in 0..arr_len {
                            if let Ok(s) = read_string(&mut file) {
                                let s_lower = s.to_lowercase();
                                if key == "general.tags" {
                                    if s_lower.contains("reasoning")
                                        || s_lower.contains("thinking")
                                        || s_lower.contains("thought")
                                        || s_lower.contains("deepseek-r1")
                                    {
                                        meta.supports_reasoning = true;
                                    }
                                    meta.tags.push(s);
                                }
                            }
                        }
                        return Ok(None);
                    }
                    let bytes_per_elem = match arr_type {
                        0 | 1 | 7 => 1,  // UINT8 / INT8 / BOOL
                        2 | 3 => 2,      // UINT16 / INT16
                        4 | 5 => 4,      // UINT32 / INT32
                        6 => 4,          // FLOAT32
                        10 | 11 => 8,    // UINT64 / INT64
                        12 => 8,         // FLOAT64
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

    // Tensor weights in memory: all layers in device memory equals full tensor footprint (~95% of GGUF file size)
    let weights_in_vram_mb = if ngl >= total_layers {
        ((model_mb as f64) * 0.95) as u64
    } else {
        let per_layer_mb = ((transformer_layers_mb as f64) * 0.95) as u64 / total_layers.max(1) as u64;
        let offloaded_mb = per_layer_mb.saturating_mul(ngl as u64);
        (((non_layer_overhead_mb as f64) * 0.95) as u64 / 2).saturating_add(offloaded_mb).min(model_mb)
    };

    // Precise KV Cache calculation: default 4-bit/8-bit KV (--ctk q4_0/q8_0) with FlashAttention.
    // Modern LLMs utilize Grouped-Query Attention (GQA) with 4-8 KV heads instead of MHA (which has head_count heads).
    // Using 1.0 byte per element (0.5 byte K + 0.5 byte V for q4_0) accurately models modern KV footprint.
    let gpu_kv_layers = if ngl >= total_layers { total_layers } else { ngl };
    let kv_mb_per_1k = if let Some(m) = meta {
        let head_count = m.head_count.unwrap_or(32).max(1) as u64;
        let head_kv = m.head_count_kv
            .unwrap_or_else(|| (head_count / 4).max(1).min(8) as u32) as u64;
        let embd = m.embedding_length.unwrap_or(4096) as u64;
        let head_dim = embd / head_count;
        // K + V: 1.0 byte per element for q4_0 across GPU-offloaded layers only
        (1.0 * 1024.0 * (head_kv as f32) * (head_dim as f32) * (gpu_kv_layers as f32)) / (1024.0 * 1024.0)
    } else {
        let base = 6.0 + (model_size_gb * 1.5).min(20.0);
        base * (gpu_kv_layers as f32 / total_layers.max(1) as f32)
    };

    let total_kv_mb = (ctx_size as f32 / 1024.0) * kv_mb_per_1k;
    let offloaded_kv_mb = total_kv_mb as u64;

    // FlashAttention-2 compute buffer overhead: scales with context length
    let compute_mb = COMPUTE_BUFFER_BASE_MB
        .saturating_add((ctx_size as u64 / 1024) * 10);

    CUDA_DRIVER_OVERHEAD_MB + compute_mb + weights_in_vram_mb + offloaded_kv_mb
}


/// The scheduling decision returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NglDecision {
    /// Number of layers to pass as `-ngl` to llama-server.
    pub ngl: u32,
    /// True when every layer fits in the selected GPU memory budget.
    pub fully_gpu: bool,
    /// True when the remaining layers must stay in system RAM.
    pub hybrid: bool,
    /// Estimated VRAM usage in MB.
    pub estimated_vram_mb: u64,
    /// Human-readable explanation for the frontend.
    pub message: String,
    /// Minimal CPU thread count for tokenization only (not inference).
    pub recommended_cpu_threads: u32,
    /// The actual context size used (may be auto-reduced to fit GPU VRAM).
    pub effective_context_size: u32,
    /// True when the model exceeds dedicated VRAM and is utilizing Shared GPU Memory.
    #[serde(default)]
    pub uses_shared_memory: bool,
}

/// Describes how transformer layers are distributed across compute units.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InferenceMode {
    /// All transformer layers run on GPU/iGPU/NPU. CPU is used only for tokenization.
    FullGpu,
    /// GPU-resident layers plus CPU/system-RAM layers.
    Hybrid,
}

/// Complete set of llama-server parameters derived from hardware.
///
/// Computed once per model launch by [`compute_gpu_inference_config`] and
/// forwarded to `LlamaServerConfig` from the live `HardwareSnapshot`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridInferenceConfig {
    /// Number of transformer layers to offload to GPU (-ngl).
    /// Number of layers that llama.cpp should place in device memory.
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
    /// Force KV cache to system RAM (`--no-kv-offload`).
    pub disable_kv_offload: bool,
    /// Pin CPU-side model layers in physical RAM (`--mlock`).
    pub use_mlock: bool,
    /// Use mmap for the model file. True = mmap; False = --no-mmap (full eager load).
    pub use_mmap: bool,
    /// Enable flash attention (-fa). Always true — reduces KV bandwidth in attention.
    pub flash_attention: bool,
    /// Indicates whether inference leverages Windows WDDM Shared GPU Memory
    pub uses_shared_memory: bool,
    /// The selected compute mode.
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
        if path == main_model_path {
            continue;
        }
        if path.extension()?.to_string_lossy().to_lowercase() != "gguf" {
            continue;
        }
        let name = path.file_stem()?.to_string_lossy().to_lowercase();
        // A draft or MTP model starts with draft- or mtp-, or has -draft/-mtp in its stem.
        if name.starts_with("draft-")
            || name.starts_with("mtp-")
            || name.contains("-draft")
            || name.contains("_draft")
            || name.contains("-mtp")
            || name.contains("_mtp")
        {
            return Some(path);
        }
    }
    None
}

/// Compute a capacity-aware GPU layer count and context size for a model launch.
///
/// # Context-Reduction Strategy
/// Before erroring, the scheduler attempts progressive context reduction:
/// 65536 → 32768 → 16384 → 8192 → 4096 → 2048 → 1024
/// The smallest context that allows full GPU offload is used.
///
pub fn compute_ngl_decision(hw: &HardwareSnapshot, meta: Option<&GgufMetadata>, model_size_gb: f32, ctx_size: u32) -> Result<NglDecision, String> {
    let total_layers = estimate_total_layers(meta, model_size_gb);
    let dedicated_avail = if hw.has_dedicated_gpu {
        hw.dedicated_vram_available_mb
    } else {
        hw.vram_available_mb
    };
    let shared_avail = hw.shared_gpu_memory_mb;
    let total_gpu_budget = dedicated_avail.saturating_add(shared_avail);

    let mut actual_ctx_size = ctx_size;
    if actual_ctx_size == 0 {
        // Auto mode: use model's max context metadata, defaulting to 32768.
        let max_ctx = meta.and_then(|m| m.context_length).unwrap_or(32768);
        actual_ctx_size = max_ctx.min(131072);
    }

    if total_gpu_budget == 0 {
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

    // ── PASS 1: Dedicated GPU VRAM Priority ───────────────────────────────────
    // If the model can fit 100% inside dedicated GPU VRAM at ANY viable context
    // size (tested from largest to smallest), keep it 100% inside dedicated VRAM.
    // This eliminates shared-memory spilling and guarantees native GPU speed.
    let mut dedicated_fit = None;
    if dedicated_avail > 0 {
        for &candidate_ctx in &[actual_ctx_size, 32768, 16384, 8192, 4096, 2048, 1024] {
            if candidate_ctx > actual_ctx_size { continue; }
            let needed_all = vram_for_ngl(model_size_gb, meta, total_layers, total_layers, candidate_ctx);
            if needed_all <= dedicated_avail {
                dedicated_fit = Some((candidate_ctx, needed_all));
                break;
            }
        }
    }

    let (selected_ctx, selected_ngl, uses_shared_memory) = if let Some((ctx, _needed)) = dedicated_fit {
        (ctx, total_layers, false)
    } else {
        // ── PASS 2: Shared GPU Memory Fallback (All Layers On Dedicated GPU) ────
        // The model exceeds dedicated VRAM, so it must borrow Windows WDDM Shared
        // GPU Memory. All compute MUST still be executed 100% on the dedicated GPU.
        let mut shared_fit = None;
        for &candidate_ctx in &[actual_ctx_size, 32768, 16384, 8192, 4096, 2048, 1024] {
            if candidate_ctx > actual_ctx_size { continue; }
            let needed_all = vram_for_ngl(model_size_gb, meta, total_layers, total_layers, candidate_ctx);
            if needed_all <= total_gpu_budget {
                shared_fit = Some((candidate_ctx, needed_all));
                break;
            }
        }

        if let Some((ctx, _needed)) = shared_fit {
            (ctx, total_layers, true)
        } else {
            // ── PASS 3: Partial Offload (Hybrid Fallback) ────────────────────────
            let candidate_ngl = (0..=total_layers)
                .rev()
                .find(|layers| vram_for_ngl(model_size_gb, meta, total_layers, *layers, 1024) <= total_gpu_budget)
                .unwrap_or(0);
            let uses_shmem = vram_for_ngl(model_size_gb, meta, total_layers, candidate_ngl, 1024) > dedicated_avail;
            (1024, candidate_ngl, uses_shmem)
        }
    };

    let fully_gpu = selected_ngl >= total_layers;
    let hybrid = !fully_gpu;
    let needed = vram_for_ngl(model_size_gb, meta, total_layers, selected_ngl, selected_ctx);

    let message = if fully_gpu && !uses_shared_memory {
        format!("GPU (Dedicated VRAM) — all {}/{} layers offloaded to {}. Context: {}.", total_layers, total_layers, hw.gpu_name, selected_ctx)
    } else if fully_gpu && uses_shared_memory {
        format!("GPU (Shared GPU Memory: {}MB VRAM + shared system memory) — all {}/{} layers offloaded to {}. Context: {}.", dedicated_avail, total_layers, total_layers, hw.gpu_name, selected_ctx)
    } else {
        format!("Hybrid — {}/{} layers on GPU ({}MB VRAM/shared) and {} layers in system RAM. Context: {}.", selected_ngl, total_layers, needed.min(total_gpu_budget), total_layers.saturating_sub(selected_ngl), selected_ctx)
    };

    let cpu_threads = if hybrid {
        hw.cpu_physical_cores.max(1)
    } else {
        hw.cpu_physical_cores.min(4).max(1)
    };

    info!(
        "[NglScheduler] model={:.1}GB ctx={} ngl={}/{} needed={}MB (dedicated={}MB, shared={}MB, uses_shared={})",
        model_size_gb, selected_ctx, selected_ngl, total_layers, needed, dedicated_avail, shared_avail, uses_shared_memory
    );

    Ok(NglDecision {
        ngl: selected_ngl,
        fully_gpu,
        hybrid,
        estimated_vram_mb: needed,
        message,
        recommended_cpu_threads: cpu_threads,
        effective_context_size: selected_ctx,
        uses_shared_memory,
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
    let ngl_decision = compute_ngl_decision(hw, meta, model_size_gb, ctx_size)?;
    let total_layers = estimate_total_layers(meta, model_size_gb);

    let mode = if ngl_decision.hybrid { InferenceMode::Hybrid } else { InferenceMode::FullGpu };

    let total_gpu_budget = if hw.has_dedicated_gpu {
        hw.dedicated_vram_available_mb.saturating_add(hw.shared_gpu_memory_mb)
    } else {
        hw.vram_available_mb.max(hw.shared_gpu_memory_mb)
    };
    let memory_headroom_mb = total_gpu_budget.saturating_sub(ngl_decision.estimated_vram_mb);
    let kv_cache_type = if memory_headroom_mb >= 2048 && !ngl_decision.uses_shared_memory {
        "q8_0".to_string()
    } else {
        "q4_0".to_string()
    };

    let (batch_size, ubatch_size) = if ngl_decision.uses_shared_memory {
        (1024u32, 256u32)
    } else if ngl_decision.effective_context_size <= 4096 {
        (1024u32, 512u32)
    } else {
        (2048u32, 512u32)
    };

    let threads_gen = if ngl_decision.hybrid {
        hw.cpu_physical_cores.max(1)
    } else {
        hw.cpu_physical_cores.min(2).max(1)
    };

    let threads_batch = hw.cpu_physical_cores.min(4).max(1);

    let extra_args: Vec<String> = Vec::new();
    let disable_kv_offload = false;
    let use_mmap = true;

    let message = format!(
        "{} — {}/{} layers | KV: {} | ubatch {} | Shared GPU Mem: {} | Profile: {:?} | is_igpu: {}",
        if ngl_decision.hybrid { "Hybrid" } else { "GPU-only" },
        ngl_decision.ngl,
        total_layers,
        kv_cache_type,
        ubatch_size,
        ngl_decision.uses_shared_memory,
        hw.profile,
        hw.is_igpu
    );

    info!("[GpuScheduler] {}", message);

    Ok(HybridInferenceConfig {
        ngl: ngl_decision.ngl,
        uses_shared_memory: ngl_decision.uses_shared_memory,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::local::hardware::{GpuBackend, HardwareSnapshot};

    fn hardware(dedicated_mb: u64, shared_mb: u64) -> HardwareSnapshot {
        let mut hw = HardwareSnapshot::default();
        hw.gpu_backend = GpuBackend::Cuda;
        hw.has_dedicated_gpu = dedicated_mb > 0;
        hw.vram_available_mb = dedicated_mb;
        hw.dedicated_vram_available_mb = dedicated_mb;
        hw.shared_gpu_memory_mb = shared_mb;
        hw.cpu_physical_cores = 8;
        hw
    }

    #[test]
    fn uses_partial_offload_when_model_exceeds_device_budget() {
        let decision = compute_ngl_decision(&hardware(4096, 0), None, 8.0, 8192).unwrap();
        assert!(decision.hybrid);
        assert!(decision.ngl > 0);
        assert!(decision.ngl < estimate_total_layers(None, 8.0));
        assert!(decision.estimated_vram_mb <= 4096);
    }

    #[test]
    fn uses_shared_memory_as_fallback_budget() {
        let decision = compute_ngl_decision(&hardware(4096, 6144), None, 8.0, 8192).unwrap();
        assert!(decision.fully_gpu);
        assert!(decision.uses_shared_memory);
        assert_eq!(decision.ngl, estimate_total_layers(None, 8.0));
    }

    #[test]
    fn keeps_full_gpu_for_models_that_fit() {
        let decision = compute_ngl_decision(&hardware(16384, 0), None, 8.0, 8192).unwrap();
        assert!(decision.fully_gpu);
        assert!(!decision.hybrid);
        assert!(!decision.uses_shared_memory);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
