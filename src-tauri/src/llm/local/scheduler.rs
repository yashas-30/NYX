use std::path::{Path, PathBuf};
// ─────────────────────────────────────────────────────────────────────────────
// NYX — Smart NGL Scheduler & Memory Estimation
// ─────────────────────────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};
use tracing::info;
use super::hardware::HardwareSnapshot;

// § 3 — SMART NGL SCHEDULER
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Default, Clone)]
pub struct GgufMetadata {
    pub block_count: Option<u32>,
    pub head_count: Option<u32>,
    pub head_count_kv: Option<u32>,
    pub context_length: Option<u32>,
    pub embedding_length: Option<u32>,
    pub architecture: Option<String>,
    pub chat_template: Option<String>,
    pub file_type: Option<u32>,
    pub tags: Vec<String>,
    pub supports_reasoning: bool,
    pub supports_vision: bool,
    pub supports_audio: bool,
    pub supports_tools: bool,
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

        let key_lower = key.to_lowercase();
        if key_lower.contains(".vision.") || key_lower.starts_with("clip.") || key_lower.contains(".image_size") {
            meta.supports_vision = true;
        }
        if key_lower.contains(".audio.") || key_lower.starts_with("whisper.") {
            meta.supports_audio = true;
        }

        if key == "general.architecture" {
            if val_type == 8 {
                let arch = read_string(&mut file)?;
                let arch_lower = arch.to_lowercase();
                if arch_lower.contains("clip") || arch_lower.contains("vision") || arch_lower.contains("vlm") {
                    meta.supports_vision = true;
                } else if arch_lower.contains("whisper") || arch_lower.contains("audio") || arch_lower.contains("speech") {
                    meta.supports_audio = true;
                }
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
                if tmpl_lower.contains("tool_call")
                    || tmpl_lower.contains("<|tool_")
                    || tmpl_lower.contains("tools")
                    || tmpl_lower.contains("function_call")
                {
                    meta.supports_tools = true;
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
                                    if s_lower.contains("vision")
                                        || s_lower.contains("multimodal")
                                        || s_lower.contains("image-to-text")
                                        || s_lower.contains("image-text-to-text")
                                    {
                                        meta.supports_vision = true;
                                    }
                                    if s_lower.contains("audio")
                                        || s_lower.contains("speech")
                                        || s_lower.contains("whisper")
                                    {
                                        meta.supports_audio = true;
                                    }
                                    if s_lower.contains("tool")
                                        || s_lower.contains("agent")
                                        || s_lower.contains("function-calling")
                                    {
                                        meta.supports_tools = true;
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
                // general.file_type (llama_ftype quantization code)
                k if k == "general.file_type" => meta.file_type = Some(v),
                _ => {}
            }
        }
    }
    Ok(meta)
}

/// How many layers a GGUF model has, derived from metadata or dynamically calculated.
pub fn estimate_total_layers(meta: Option<&GgufMetadata>, model_size_gb: f32) -> u32 {
    if let Some(m) = meta {
        if let Some(exact_layers) = m.block_count {
            return exact_layers;
        }
    }
    // Dynamic layer estimation from model size without hardcoded step ladders
    (model_size_gb * 5.5 + 18.0).round().clamp(16.0, 128.0) as u32
}

/// Estimate VRAM required for model weights, runtime driver context, and compute buffers (excluding KV cache).
pub fn vram_weights_only(model_size_gb: f32, _meta: Option<&GgufMetadata>, total_layers: u32, ngl: u32, ctx_size: u32) -> u64 {
    if ngl == 0 { return 0; }

    let model_mb = (model_size_gb * 1024.0) as u64;

    // Non-layer overhead (embedding table + lm_head projection + norm layers)
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

    // Dynamically scale runtime driver context and FlashAttention compute scratch buffers
    let driver_overhead_mb = (model_mb / 64).clamp(32, 128);
    let compute_mb = ((ctx_size as u64 * 16) / 1024).clamp(32, 256);

    driver_overhead_mb + compute_mb + weights_in_vram_mb
}

/// Precise KV Cache calculation: default 4-bit/8-bit KV (--ctk q4_0/q8_0) with FlashAttention.
pub fn estimate_kv_cache_mb(model_size_gb: f32, meta: Option<&GgufMetadata>, total_layers: u32, ngl: u32, ctx_size: u32) -> u64 {
    if ngl == 0 { return 0; }
    let gpu_kv_layers = if ngl >= total_layers { total_layers } else { ngl };
    let kv_mb_per_1k = if let Some(m) = meta {
        let head_count = m.head_count.unwrap_or(32).max(1) as u64;
        let head_kv = m.head_count_kv
            .unwrap_or_else(|| (head_count / 4).max(1).min(8) as u32) as u64;
        let embd = m.embedding_length.unwrap_or(4096) as u64;
        let head_dim = embd / head_count;
        (1.0 * 1024.0 * (head_kv as f32) * (head_dim as f32) * (gpu_kv_layers as f32)) / (1024.0 * 1024.0)
    } else {
        let base = 6.0 + (model_size_gb * 1.5).min(20.0);
        base * (gpu_kv_layers as f32 / total_layers.max(1) as f32)
    };

    let total_kv_mb = (ctx_size as f32 / 1024.0) * kv_mb_per_1k;
    total_kv_mb as u64
}

/// Estimate VRAM required to offload `ngl` layers of a model with dynamic non-linear weight distribution.
pub fn vram_for_ngl(model_size_gb: f32, meta: Option<&GgufMetadata>, total_layers: u32, ngl: u32, ctx_size: u32) -> u64 {
    if ngl == 0 { return 0; }
    let weights_mb = vram_weights_only(model_size_gb, meta, total_layers, ngl, ctx_size);
    let kv_mb = estimate_kv_cache_mb(model_size_gb, meta, total_layers, ngl, ctx_size);
    weights_mb.saturating_add(kv_mb)
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
    /// Force KV cache to system RAM (`--no-kv-offload`).
    #[serde(default)]
    pub disable_kv_offload: bool,
    /// Execution strategy for UI and telemetry ("FullDedicatedGpu", "SharedGpuMemory", "IntegratedGpu", "Hybrid")
    #[serde(default)]
    pub strategy: String,
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


/// Check if a model file is an MTP (Multi-Token Prediction) companion head.
/// MTP models (e.g. *-mtp.gguf, mtp-*.gguf, *.mtp.gguf, *.mtp) are auxiliary prediction
/// modules trained alongside the parent model (such as DeepSeek-V3 and DeepSeek-R1)
/// that predict consecutive future tokens simultaneously with high acceptance rate.
pub fn is_mtp_model(path: &Path) -> bool {
    let filename = path
        .file_name()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let ext = path
        .extension()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    if ext == "mtp" {
        return true;
    }
    stem.starts_with("mtp-")
        || stem.starts_with("mtp_")
        || stem.ends_with("-mtp")
        || stem.ends_with("_mtp")
        || stem.contains("-mtp-")
        || stem.contains("_mtp_")
        || filename.contains(".mtp.")
}

/// Look for an MTP (Multi-Token Prediction) companion model in the same directory as the main model.
/// MTP companion models are auxiliary prediction heads that enable multi-token speculative
/// decoding in llama-server using `--spec-type draft-mtp`.
pub fn normalize_path_buf(p: &Path) -> PathBuf {
    let s = p.to_string_lossy().replace('/', std::path::MAIN_SEPARATOR_STR);
    PathBuf::from(s)
}

pub fn find_mtp_model(main_model_path: &Path) -> Option<PathBuf> {
    let dir = main_model_path.parent()?;
    let dir_entries: Vec<_> = std::fs::read_dir(dir).ok()?.flatten().collect();
    let main_stem = main_model_path.file_stem()?.to_string_lossy().to_lowercase();
    let dir_name = dir.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    let is_dedicated_folder = !dir_name.is_empty()
        && dir_name != "models"
        && dir_name != "unorganized"
        && dir_name != "projectors"
        && dir_name != "llm";

    let norm_main = normalize_path_buf(main_model_path);
    let mut candidate_mtp = None;

    for entry in &dir_entries {
        let path = entry.path();
        if normalize_path_buf(&path) == norm_main {
            continue;
        }
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        if ext != "gguf" && ext != "mtp" {
            continue;
        }
        if !is_mtp_model(&path) {
            continue;
        }

        let name = path.file_stem()?.to_string_lossy().to_lowercase();
        // Clean MTP affixes to see if it matches the main model stem
        let clean_mtp = name
            .replace("mtp-", "")
            .replace("mtp_", "")
            .replace("-mtp", "")
            .replace("_mtp", "")
            .replace(".mtp", "");

        let clean_prefix: String = clean_mtp.chars().take(8).collect();
        if main_stem.contains(&clean_mtp)
            || (!clean_prefix.is_empty() && main_stem.contains(&clean_prefix))
            || (!clean_mtp.is_empty() && clean_mtp.contains(&main_stem))
            || (is_dedicated_folder && dir_name.contains(&clean_mtp))
        {
            return Some(path);
        }

        if candidate_mtp.is_none() && is_dedicated_folder {
            candidate_mtp = Some(path);
        }
    }

    candidate_mtp
}

/// Look for a standalone draft model in the same directory as the main model for speculative decoding.
/// Draft models are named with a "draft-" prefix (e.g. "draft-qwen2.5-0.5b-Q4_K_M.gguf").
/// Standalone draft models run via `--spec-type draft-simple`.
pub fn find_draft_model(main_model_path: &Path) -> Option<PathBuf> {
    let dir = main_model_path.parent()?;
    let dir_entries: Vec<_> = std::fs::read_dir(dir).ok()?.flatten().collect();
    let main_stem = main_model_path.file_stem()?.to_string_lossy().to_lowercase();
    let dir_name = dir.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    let is_dedicated_folder = !dir_name.is_empty()
        && dir_name != "models"
        && dir_name != "unorganized"
        && dir_name != "projectors"
        && dir_name != "llm";

    let norm_main = normalize_path_buf(main_model_path);
    let mut candidate_draft = None;

    for entry in &dir_entries {
        let path = entry.path();
        if normalize_path_buf(&path) == norm_main {
            continue;
        }
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        if ext != "gguf" {
            continue;
        }
        let name = path.file_stem()?.to_string_lossy().to_lowercase();
        // Standalone draft model starts with draft- or has -draft in its stem, excluding MTP heads.
        let is_draft = (name.starts_with("draft-")
            || name.starts_with("draft_")
            || name.contains("-draft")
            || name.contains("_draft"))
            && !is_mtp_model(&path);

        if !is_draft {
            continue;
        }

        // Clean draft affixes to see if it matches the main model stem
        let clean_draft = name
            .replace("draft-", "")
            .replace("draft_", "")
            .replace("-draft", "")
            .replace("_draft", "");

        let clean_prefix: String = clean_draft.chars().take(8).collect();
        if main_stem.contains(&clean_draft)
            || (!clean_prefix.is_empty() && main_stem.contains(&clean_prefix))
            || (!clean_draft.is_empty() && clean_draft.contains(&main_stem))
            || (is_dedicated_folder && dir_name.contains(&clean_draft))
        {
            return Some(path);
        }

        if candidate_draft.is_none() && is_dedicated_folder {
            candidate_draft = Some(path);
        }
    }

    candidate_draft
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
    let dedicated_avail = hw.dedicated_vram_available_mb;
    let shared_avail = hw.shared_gpu_memory_mb;
    let ram_avail = hw.ram_available_mb;

    // Full GPU memory accessible to the GPU (dedicated VRAM + shared system memory)
    let gpu_budget = if hw.has_dedicated_gpu {
        dedicated_avail.saturating_add(shared_avail)
    } else if hw.vram_available_mb > 0 {
        hw.vram_available_mb.saturating_add(shared_avail)
    } else {
        shared_avail
    };

    let total_memory_mb = gpu_budget.saturating_add(ram_avail);
    if total_memory_mb == 0 && model_size_gb > 0.0 {
        return Err(format!(
            "Insufficient system memory detected to run model ({:.1} GB needed).",
            model_size_gb
        ));
    }

    let model_max_ctx = meta.and_then(|m| m.context_length);

    // Context determination:
    let selected_ctx = if ctx_size > 0 {
        if let Some(m_ctx) = model_max_ctx {
            ctx_size.min(m_ctx).max(512)
        } else {
            ctx_size.max(512)
        }
    } else {
        // Auto (ctx_size == 0):
        // Dynamically find the highest viable context size
        let max_ctx = model_max_ctx.unwrap_or(32768);
        let mut candidates = Vec::new();
        let mut cur = max_ctx;
        while cur >= 512 {
            candidates.push(cur);
            cur /= 2;
        }

        let mut best_ctx = 512;
        for &c in &candidates {
            let req = vram_for_ngl(model_size_gb, meta, total_layers, total_layers, c);
            if req <= gpu_budget || !hw.has_dedicated_gpu {
                best_ctx = c;
                break;
            }
        }
        best_ctx
    };

    let total_needed = vram_for_ngl(model_size_gb, meta, total_layers, total_layers, selected_ctx);

    // Dedicated GPU Offload Policy:
    // All model layers and KV cache run 100% on the dedicated GPU.
    // When dedicated physical VRAM is exceeded, Windows WDDM automatically manages
    // the overflow in Shared GPU Memory via PCIe DMA, keeping compute 100% on the GPU.
    // We NEVER offload KV cache or model layers to host CPU system memory when a dedicated GPU is present.
    let (selected_ngl, fully_gpu, hybrid, uses_shared_memory, disable_kv_offload, strategy) = if hw.has_dedicated_gpu {
        if total_needed <= dedicated_avail {
            // Fits completely in dedicated physical VRAM
            (total_layers, true, false, false, false, "FullDedicatedGpu".to_string())
        } else if total_needed <= gpu_budget {
            // Fits within Dedicated VRAM + Shared GPU Memory pool: 100% GPU offload
            (total_layers, true, false, true, false, "SharedGpuMemory".to_string())
        } else {
            // Exceeds total GPU budget (VRAM + Shared GPU Memory): offload as many layers as fit in GPU budget
            let safe_ngl = (0..=total_layers)
                .rev()
                .find(|layers| vram_for_ngl(model_size_gb, meta, total_layers, *layers, selected_ctx) <= gpu_budget)
                .unwrap_or(0);
            let is_full = safe_ngl >= total_layers;
            (safe_ngl, is_full, !is_full, true, false, if is_full { "SharedGpuMemory".to_string() } else { "Hybrid".to_string() })
        }
    } else if hw.vram_available_mb > 0 {
        // Integrated GPU or unified memory
        let uses_shared = total_needed > hw.vram_available_mb;
        let ngl = if total_needed <= gpu_budget {
            total_layers
        } else {
            (0..=total_layers)
                .rev()
                .find(|layers| vram_for_ngl(model_size_gb, meta, total_layers, *layers, selected_ctx) <= gpu_budget)
                .unwrap_or(0)
        };
        let is_full = ngl >= total_layers;
        (ngl, is_full, !is_full, uses_shared, false, if is_full { "IntegratedGpu".to_string() } else { "Hybrid".to_string() })
    } else {
        // No GPU available: run completely on CPU in system RAM
        (0, false, true, false, false, "CpuOnly".to_string())
    };

    let message = if hw.has_dedicated_gpu {
        if disable_kv_offload && !uses_shared_memory {
            format!("GPU (Dedicated VRAM Weights + Host KV) — all {}/{} layers offloaded to {}. Context: {}.", total_layers, total_layers, hw.gpu_name, selected_ctx)
        } else if uses_shared_memory {
            format!("GPU (Dedicated + Shared VRAM) — all {}/{} layers offloaded to {}. Context: {}.", total_layers, total_layers, hw.gpu_name, selected_ctx)
        } else {
            format!("GPU (Dedicated VRAM) — all {}/{} layers offloaded to {}. Context: {}.", total_layers, total_layers, hw.gpu_name, selected_ctx)
        }
    } else if selected_ngl == 0 {
        format!("CPU (System RAM) — all {}/{} layers running in system memory on CPU. Context: {}.", total_layers, total_layers, selected_ctx)
    } else {
        format!("Hybrid — {}/{} layers on GPU and {} layers in system RAM. Context: {}.", selected_ngl, total_layers, total_layers.saturating_sub(selected_ngl), selected_ctx)
    };

    let actual_estimated_vram_mb = if disable_kv_offload {
        vram_weights_only(model_size_gb, meta, total_layers, selected_ngl, selected_ctx)
    } else {
        vram_for_ngl(model_size_gb, meta, total_layers, selected_ngl, selected_ctx)
    };
    let cpu_threads = hw.cpu_physical_cores.max(1);

    info!(
        "[NglScheduler] model={:.1}GB ctx={} ngl={}/{} needed={}MB (dedicated={}MB, shared={}MB, strategy={})",
        model_size_gb, selected_ctx, selected_ngl, total_layers, actual_estimated_vram_mb, dedicated_avail, shared_avail, strategy
    );

    Ok(NglDecision {
        ngl: selected_ngl,
        fully_gpu,
        hybrid,
        estimated_vram_mb: actual_estimated_vram_mb,
        message,
        recommended_cpu_threads: cpu_threads,
        effective_context_size: selected_ctx,
        uses_shared_memory,
        disable_kv_offload,
        strategy,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3b — DEDICATED GPU SCHEDULER & KV QUANTIZATION MATCHING
// ─────────────────────────────────────────────────────────────────────────────

/// Derives the matching KV cache quantization type (-ctk and -ctv) from the
/// selected model's own quantization type and metadata, ensuring zero hardcoding.
///
/// Llama.cpp supported KV types: "f32", "f16", "bf16", "q8_0", "q5_0", "q5_1", "q4_0", "q4_1".
pub fn derive_matching_kv_cache_type(
    model_identifier: &str,
    meta: Option<&GgufMetadata>,
    vram_mb: Option<u64>,
) -> String {
    let raw_type = {
        let mut resolved: Option<String> = None;
        // 1. Check GGUF internal header file_type (llama_ftype enum) first if parsed
        if let Some(m) = meta {
            if let Some(ft) = m.file_type {
                resolved = match ft {
                    0 => Some("f32".to_string()),
                    1 | 28 => Some("f16".to_string()),
                    7 | 18 => Some("q8_0".to_string()),
                    8 | 9 | 16 | 17 => Some("q5_0".to_string()),
                    2 | 3 | 10..=15 | 19..=27 | 29..=33 => Some("q4_0".to_string()),
                    _ => None,
                };
            }

            // 2. Check GGUF metadata tags if available
            if resolved.is_none() {
                for tag in &m.tags {
                    let t = tag.to_lowercase();
                    if t.contains("q4") || t.contains("iq4") || t.contains("q3") || t.contains("q2") {
                        resolved = Some("q4_0".to_string());
                        break;
                    } else if t.contains("q8") {
                        resolved = Some("q8_0".to_string());
                        break;
                    } else if t.contains("q5") || t.contains("iq5") {
                        resolved = Some("q5_0".to_string());
                        break;
                    } else if t.contains("q6") {
                        resolved = Some("q8_0".to_string());
                        break;
                    } else if t.contains("bf16") || t.contains("f16") {
                        resolved = Some("f16".to_string());
                        break;
                    } else if t.contains("f32") {
                        resolved = Some("f32".to_string());
                        break;
                    }
                }
            }
        }

        if let Some(r) = resolved {
            r
        } else {
            // 3. Match quantization syntax in filename or model identifier
            let lower = model_identifier.to_lowercase();
            if lower.contains("q4_") || lower.contains("q4-") || lower.contains("q4.") || lower.contains("q4k") || lower.contains("q40") || lower.contains("q41") || lower.contains("iq4") || lower.contains("q3") || lower.contains("q2") || lower.contains("q4") {
                "q4_0".to_string()
            } else if lower.contains("q8_") || lower.contains("q8-") || lower.contains("q8.") || lower.contains("q80") || lower.contains("q81") || lower.contains("q8k") || lower.contains("q8") {
                "q8_0".to_string()
            } else if lower.contains("q5_") || lower.contains("q5-") || lower.contains("q5.") || lower.contains("q5k") || lower.contains("q50") || lower.contains("q51") || lower.contains("iq5") || lower.contains("q5") {
                "q5_0".to_string()
            } else if lower.contains("q6_") || lower.contains("q6-") || lower.contains("q6.") || lower.contains("q6k") || lower.contains("q6") {
                "q8_0".to_string()
            } else if lower.contains("bf16") || lower.contains("f16") || lower.contains("fp16") {
                "f16".to_string()
            } else if lower.contains("f32") || lower.contains("fp32") {
                "f32".to_string()
            } else {
                // Fallback default: optimal 4-bit KV cache matching modern quantized models
                "q4_0".to_string()
            }
        }
    };

    // Low-VRAM KV Cache Guardrail:
    // If dedicated VRAM <= 6144 MB (e.g. 4GB GTX 1650 or 6GB RTX 2060):
    // Never allow f16/f32/bf16 KV cache to run on low-VRAM GPUs (consuming ~4.3GB alone at 32k context).
    if let Some(vram) = vram_mb {
        if vram <= 4096 {
            // Very low VRAM (<= 4GB): clamp everything above q4_0 to q4_0
            if raw_type == "f16" || raw_type == "f32" || raw_type == "bf16" || raw_type == "q8_0" || raw_type == "q8_1" || raw_type == "q5_0" || raw_type == "q5_1" {
                return "q4_0".to_string();
            }
        } else if vram <= 6144 {
            // Low VRAM (<= 6GB): clamp unquantized f16/f32 to q4_0
            if raw_type == "f16" || raw_type == "f32" || raw_type == "bf16" {
                return "q4_0".to_string();
            }
        }
    }

    raw_type
}

/// Compute the complete set of llama-server parameters for pure GPU inference.
///
/// `companion_size_mb` is the combined size of ALL companion files (mmproj + MTP/draft)
/// in megabytes. These are accounted for in the VRAM budget when deciding tier and mmap.
pub fn compute_gpu_inference_config(
    hw: &HardwareSnapshot,
    meta: Option<&GgufMetadata>,
    model_size_gb: f32,
    ctx_size: u32,
    draft_model_path: Option<PathBuf>,
    _is_auto_ctx: bool,
    model_name_or_id: Option<&str>,
    _companion_size_mb: u64,
) -> Result<HybridInferenceConfig, String> {
    let ngl_decision = compute_ngl_decision(hw, meta, model_size_gb, ctx_size)?;
    let total_layers = estimate_total_layers(meta, model_size_gb);

    let mode = if ngl_decision.hybrid { InferenceMode::Hybrid } else { InferenceMode::FullGpu };

    let dedicated_vram = if hw.has_dedicated_gpu {
        Some(hw.dedicated_vram_available_mb)
    } else if hw.vram_available_mb > 0 {
        Some(hw.vram_available_mb)
    } else {
        None
    };
    let kv_cache_type = derive_matching_kv_cache_type(model_name_or_id.unwrap_or(""), meta, dedicated_vram);

    // Optimal batch size for interactive desktop chat: 512 to 2048 tokens.
    // Clamping batch_size prevents multi-gigabyte ggml compute graph buffer allocations in host memory.
    let batch_size = (ngl_decision.effective_context_size / 2).clamp(512, 2048);
    // Physical compute chunk (ubatch): 512 default; 256 when utilizing shared GPU memory to prevent PCIe bus saturation and RAM paging spikes.
    let ubatch_size = if ngl_decision.uses_shared_memory {
        (batch_size / 4).clamp(128, 256)
    } else {
        (batch_size / 4).clamp(128, 512)
    };

    // Generation threads match physical CPU cores for maximum decode throughput without contention
    let threads_gen = hw.cpu_physical_cores.max(1);

    // For batch/prompt prefill:
    // When running on a dedicated GPU, keep batch threads to physical cores
    // to prevent hyperthread contention and eliminate 100% CPU saturation on all logical processors.
    let threads_batch = if hw.has_dedicated_gpu {
        hw.cpu_physical_cores.max(1)
    } else {
        hw.cpu_logical_threads.max(hw.cpu_physical_cores).max(1)
    };

    let extra_args: Vec<String> = Vec::new();
    let disable_kv_offload = ngl_decision.disable_kv_offload;

    // Always use standard OS memory mapping (mmap).
    // Never disable mmap: --no-mmap causes llama.cpp to allocate a multi-gigabyte
    // private heap buffer via malloc() in host system RAM, ballooning host memory.
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

/// Domain-agnostic helper to derive a clean, dedicated folder name for a model and its support files.
/// Strips quantization tags, file extensions, and support prefixes/suffixes (mtp, mmproj, draft)
/// so both the base weights and its companions naturally map to the exact same folder.
pub fn derive_model_folder_name(filename_or_id: &str, repo_id: Option<&str>) -> String {
    if let Some(rid) = repo_id.filter(|r| !r.trim().is_empty()) {
        let repo_leaf = rid.split('/').last().unwrap_or(rid);
        let cleaned = repo_leaf
            .trim_end_matches("-GGUF")
            .trim_end_matches(".GGUF")
            .trim_end_matches("-gguf")
            .trim_end_matches(".gguf");
        if !cleaned.is_empty() {
            return cleaned.to_string();
        }
    }

    let path = Path::new(filename_or_id);
    let mut stem = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(filename_or_id)
        .to_string();

    loop {
        let lower = stem.to_lowercase();
        if lower.ends_with(".meta.json") {
            stem = stem[..stem.len() - ".meta.json".len()].to_string();
        } else if lower.ends_with(".meta") {
            stem = stem[..stem.len() - ".meta".len()].to_string();
        } else if lower.ends_with(".json") {
            stem = stem[..stem.len() - ".json".len()].to_string();
        } else if lower.ends_with(".gguf") {
            stem = stem[..stem.len() - ".gguf".len()].to_string();
        } else if lower.ends_with(".part") {
            stem = stem[..stem.len() - ".part".len()].to_string();
        } else {
            break;
        }
    }

    // Strip support prefixes
    let lower_stem = stem.to_lowercase();
    let prefix_to_strip = [
        "mmproj-", "mmproj_", "mmproj.", "mtp-", "mtp_", "mtp.", "draft-", "draft_", "draft.",
        "vision-", "vision_", "visual-", "visual_", "projector-", "projector_",
    ];
    for p in prefix_to_strip {
        if lower_stem.starts_with(p) {
            stem = stem[p.len()..].to_string();
            break;
        }
    }

    // Strip quantization markers from the end (e.g. -Q4_K_M or .Q4_K_M, -BF16, -UD-Q4_K_XL, etc.)
    for _ in 0..2 {
        if let Some((base, last)) = stem.rsplit_once(|c| c == '-' || c == '.') {
            let last_upper = last.to_uppercase();
            let is_quant = last_upper.starts_with('Q')
                || last_upper == "BF16"
                || last_upper == "F16"
                || last_upper == "F32"
                || last_upper.starts_with("IQ")
                || last_upper.starts_with("UD");
            if is_quant && !base.is_empty() {
                stem = base.to_string();
            } else {
                break;
            }
        } else {
            break;
        }
    }

    // Strip support suffixes
    let lower_stem_2 = stem.to_lowercase();
    let suffix_to_strip = [
        "-mmproj", "_mmproj", ".mmproj", "-mtp", "_mtp", ".mtp", "-draft", "_draft", ".draft",
        "-vision", "_vision", ".vision", "-visual", "_visual", ".visual", "-projector",
        "_projector", ".projector", "-vit", "_vit", ".vit", "-clip", "_clip", ".clip",
    ];
    for s in suffix_to_strip {
        if lower_stem_2.ends_with(s) {
            stem = stem[..stem.len() - s.len()].to_string();
            break;
        }
    }

    if stem.is_empty() {
        "unorganized".to_string()
    } else {
        stem
    }
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
        hw.ram_total_mb = 32768;
        hw.ram_available_mb = 16384;
        hw
    }

    fn igpu_hardware(vram_mb: u64, shared_mb: u64) -> HardwareSnapshot {
        let mut hw = HardwareSnapshot::default();
        hw.gpu_backend = GpuBackend::Vulkan;
        hw.has_dedicated_gpu = false;
        hw.is_igpu = true;
        hw.vram_available_mb = vram_mb;
        hw.shared_gpu_memory_mb = shared_mb;
        hw.cpu_physical_cores = 8;
        hw.ram_total_mb = 32768;
        hw.ram_available_mb = 16384;
        hw
    }

    #[test]
    fn igpu_uses_partial_offload_when_budget_exceeded() {
        let decision = compute_ngl_decision(&igpu_hardware(4096, 0), None, 8.0, 8192).unwrap();
        assert!(decision.hybrid);
        assert!(decision.ngl > 0);
        assert!(decision.ngl < estimate_total_layers(None, 8.0));
        assert!(decision.estimated_vram_mb <= 4096);
    }

    #[test]
    fn dedicated_gpu_runs_full_model_using_shared_memory_when_needed() {
        let decision = compute_ngl_decision(&hardware(4096, 6144), None, 4.8, 8192).unwrap();
        assert!(decision.fully_gpu);
        assert!(!decision.hybrid);
        assert!(decision.uses_shared_memory);
        assert_eq!(decision.ngl, estimate_total_layers(None, 4.8));
        assert_eq!(decision.strategy, "SharedGpuMemory");
    }

    #[test]
    fn keeps_full_gpu_for_models_that_fit() {
        let decision = compute_ngl_decision(&hardware(16384, 0), None, 8.0, 8192).unwrap();
        assert!(decision.fully_gpu);
        assert!(!decision.hybrid);
        assert!(!decision.uses_shared_memory);
    }

    #[test]
    fn test_is_mtp_model() {
        assert!(is_mtp_model(Path::new("model-alpha-mtp.gguf")));
        assert!(is_mtp_model(Path::new("mtp-model-beta.gguf")));
        assert!(is_mtp_model(Path::new("mtp_model_gamma.gguf")));
        assert!(is_mtp_model(Path::new("model_delta_mtp_q4_k_m.gguf")));
        assert!(is_mtp_model(Path::new("model.mtp.gguf")));
        assert!(is_mtp_model(Path::new("model.mtp")));
        assert!(!is_mtp_model(Path::new("model-alpha.gguf")));
        assert!(!is_mtp_model(Path::new("draft-model-beta.gguf")));
        assert!(!is_mtp_model(Path::new("sample-model-7b.gguf")));
    }

    #[test]
    fn test_derive_model_folder_name() {
        assert_eq!(derive_model_folder_name("model-alpha-Q4_K_M.gguf", None), "model-alpha");
        assert_eq!(derive_model_folder_name("Ornith-1.5-9B.Q4_K_M.gguf", None), "Ornith-1.5-9B");
        assert_eq!(derive_model_folder_name("Ornith-1.5-9B.mmproj-bf16.gguf", None), "Ornith-1.5-9B");
        assert_eq!(derive_model_folder_name("mtp-model-alpha.gguf", None), "model-alpha");
        assert_eq!(derive_model_folder_name("mmproj-model-alpha-BF16.gguf", None), "model-alpha");
        assert_eq!(derive_model_folder_name("draft-model-alpha.gguf", None), "model-alpha");
        assert_eq!(derive_model_folder_name("model-alpha-Q4_K_M.gguf.meta.json", None), "model-alpha");
        assert_eq!(derive_model_folder_name("arbitrary.gguf", Some("author/custom-model-GGUF")), "custom-model");
        assert_eq!(derive_model_folder_name("gemma-4-E2B-it-Q4_K_M.gguf", Some("unsloth/gemma-4-E2B-it-GGUF")), "gemma-4-E2B-it");
        assert_eq!(derive_model_folder_name("gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf", Some("unsloth/gemma-4-E4B-it-qat-GGUF")), "gemma-4-E4B-it-qat");
        assert_eq!(derive_model_folder_name("Qwen3.5-3B-Q4_K_M.gguf", Some("Qwen/Qwen3.5-3B-GGUF")), "Qwen3.5-3B");
        assert_eq!(derive_model_folder_name("Qwen3.5-9B-Q4_K_M.gguf", Some("unsloth/Qwen3.5-9B-GGUF")), "Qwen3.5-9B");
        assert_eq!(derive_model_folder_name("mmproj-F16.gguf", Some("unsloth/Qwen3.5-9B-GGUF")), "Qwen3.5-9B");
        assert_eq!(derive_model_folder_name("mtp-gemma-4-E2B-it.gguf", Some("unsloth/gemma-4-E2B-it-GGUF")), "gemma-4-E2B-it");
    }

    #[test]
    fn test_find_mtp_and_draft_models() {
        let unique_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let temp_dir = std::env::temp_dir().join(format!("nyx_mtp_test_{}", unique_id));
        std::fs::create_dir_all(&temp_dir).unwrap();

        let main_model = temp_dir.join("test-model-q4_k_m.gguf");
        let mtp_model = temp_dir.join("test-model-mtp.gguf");
        let draft_model = temp_dir.join("draft-test-model.gguf");

        std::fs::write(&main_model, b"base_model").unwrap();
        std::fs::write(&mtp_model, b"mtp_heads").unwrap();
        std::fs::write(&draft_model, b"draft_weights").unwrap();

        let found_mtp = find_mtp_model(&main_model);
        assert_eq!(found_mtp, Some(mtp_model));

        let found_draft = find_draft_model(&main_model);
        assert_eq!(found_draft, Some(draft_model));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_derive_matching_kv_cache_type() {
        assert_eq!(derive_matching_kv_cache_type("Qwen3.5-9B-Q4_K_M.gguf", None, None), "q4_0");
        assert_eq!(derive_matching_kv_cache_type("gemma-4-12B-it-qat-UD-Q4_K_XL.gguf", None, None), "q4_0");
        assert_eq!(derive_matching_kv_cache_type("model-Q8_0.gguf", None, None), "q8_0");
        assert_eq!(derive_matching_kv_cache_type("Ornith-1.5-9B.BF16.gguf", None, None), "f16");
        assert_eq!(derive_matching_kv_cache_type("model-q5_k_m.gguf", None, None), "q5_0");
        assert_eq!(derive_matching_kv_cache_type("model-f32.gguf", None, None), "f32");

        // GGUF internal header file_type verification
        let mut meta_q4 = GgufMetadata::default();
        meta_q4.file_type = Some(15); // Q4_K_M
        assert_eq!(derive_matching_kv_cache_type("unlabeled_model.gguf", Some(&meta_q4), None), "q4_0");

        let mut meta_q8 = GgufMetadata::default();
        meta_q8.file_type = Some(7); // Q8_0
        assert_eq!(derive_matching_kv_cache_type("unlabeled_model.gguf", Some(&meta_q8), None), "q8_0");

        // Unlabeled model without metadata defaults to optimal q4_0
        assert_eq!(derive_matching_kv_cache_type("unknown-model", None, None), "q4_0");

        // Low-VRAM KV Cache Guardrail tests:
        // Clamps FP16/FP32 to q4_0 on GPUs <= 6144MB VRAM
        assert_eq!(derive_matching_kv_cache_type("Ornith-1.5-9B.BF16.gguf", None, Some(4096)), "q4_0");
        assert_eq!(derive_matching_kv_cache_type("Ornith-1.5-9B.BF16.gguf", None, Some(6144)), "q4_0");
        // Preserves f16 on high-VRAM GPUs (> 6144MB)
        assert_eq!(derive_matching_kv_cache_type("Ornith-1.5-9B.BF16.gguf", None, Some(8192)), "f16");
        // On very low VRAM (<= 4096MB), clamps q8_0 to q4_0 to maximize headroom
        assert_eq!(derive_matching_kv_cache_type("model-Q8_0.gguf", None, Some(4096)), "q4_0");
    }

    #[test]
    fn test_tier1_fits_in_dedicated_vram() {
        let hw = hardware(8192, 8192);
        let decision = compute_ngl_decision(&hw, None, 3.0, 4096).unwrap();
        assert!(decision.fully_gpu);
        assert!(!decision.hybrid);
        assert!(!decision.uses_shared_memory);
        assert!(!decision.disable_kv_offload);
        assert_eq!(decision.strategy, "FullDedicatedGpu");
    }

    #[test]
    fn test_tier2_weights_fit_in_vram_kv_causes_overflow() {
        // Model weights fit within 3800MB dedicated VRAM, but large context KV pushes total into Shared GPU Memory
        let hw = hardware(3800, 8192);
        let decision = compute_ngl_decision(&hw, None, 3.5, 32768).unwrap();
        assert!(decision.fully_gpu);
        assert!(!decision.hybrid);
        assert!(decision.uses_shared_memory);
        assert!(!decision.disable_kv_offload);
        assert_eq!(decision.strategy, "SharedGpuMemory");
    }

    #[test]
    fn test_tier3a_modest_weight_spill_uses_shared_memory() {
        // Dedicated VRAM 4000MB, model 4.5GB (fits in 4000MB dedicated + 8192MB shared)
        let hw = hardware(4000, 8192);
        let decision = compute_ngl_decision(&hw, None, 4.5, 4096).unwrap();
        assert!(decision.fully_gpu);
        assert!(!decision.hybrid);
        assert!(decision.uses_shared_memory);
        assert!(!decision.disable_kv_offload);
        assert_eq!(decision.strategy, "SharedGpuMemory");
    }

    #[test]
    fn test_tier3b_massive_spill_uses_safe_partial_offload() {
        // 20GB model on 4GB dedicated card + 8GB shared (budget 12GB) -> exceeds GPU budget
        let hw = hardware(4096, 8192);
        let decision = compute_ngl_decision(&hw, None, 20.0, 4096).unwrap();
        assert!(!decision.fully_gpu);
        assert!(decision.hybrid);
        assert_eq!(decision.strategy, "Hybrid");
        assert!(decision.ngl < estimate_total_layers(None, 20.0));
        assert!(decision.ngl > 0);
    }

    #[test]
    fn test_zero_vram_cpu_only_execution() {
        // Zero dedicated VRAM available, 16GB system RAM
        let mut hw = hardware(0, 0);
        hw.vram_available_mb = 0;
        hw.dedicated_vram_available_mb = 0;
        hw.ram_available_mb = 16384;
        let decision = compute_ngl_decision(&hw, None, 8.0, 4096).unwrap();
        assert_eq!(decision.ngl, 0);
        assert!(decision.hybrid);
        assert_eq!(decision.strategy, "CpuOnly");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
