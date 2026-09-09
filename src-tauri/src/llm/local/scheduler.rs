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
    let dedicated_avail = if hw.has_dedicated_gpu {
        hw.dedicated_vram_available_mb
    } else {
        hw.vram_available_mb
    };
    let shared_avail = hw.shared_gpu_memory_mb;

    // Windows DWM desktop compositor headroom (512 MB).
    // Primary layer offload budget is strictly physical dedicated VRAM minus compositor headroom.
    // Shared GPU memory is excluded from primary layer offload budget to prevent
    // 15x PCIe WDDM bus thrashing from paging transformer weights every token.
    const DWM_COMPOSITOR_HEADROOM_MB: u64 = 512;
    let gpu_budget = if hw.has_dedicated_gpu {
        dedicated_avail.saturating_sub(DWM_COMPOSITOR_HEADROOM_MB)
    } else {
        if dedicated_avail > 0 {
            dedicated_avail
        } else {
            shared_avail
        }
    };

    if gpu_budget == 0 && dedicated_avail == 0 {
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

    let model_max_ctx = meta.and_then(|m| m.context_length);

    // If user specified an explicit context length (ctx_size > 0), strictly respect it.
    // When layers exceed dedicated VRAM, overflow layers stay in system RAM on CPU
    // rather than thrashing over PCIe via WDDM shared GPU memory.
    let (selected_ctx, selected_ngl, uses_shared_memory) = if ctx_size > 0 {
        let requested_ctx = if let Some(m_ctx) = model_max_ctx {
            ctx_size.min(m_ctx).max(512)
        } else {
            ctx_size.max(512)
        };

        // 1. Check if model + requested_ctx fits 100% in dedicated VRAM
        let needed_dedicated = vram_for_ngl(model_size_gb, meta, total_layers, total_layers, requested_ctx);
        if dedicated_avail > 0 && needed_dedicated <= gpu_budget {
            (requested_ctx, total_layers, false)
        } else {
            // 2. Does not fit 100% in dedicated VRAM:
            // Perform clean partial layer offload so overflow layers stay in system RAM on CPU.
            let candidate_ngl = (0..=total_layers)
                .rev()
                .find(|layers| vram_for_ngl(model_size_gb, meta, total_layers, *layers, requested_ctx) <= gpu_budget)
                .unwrap_or(0);

            if candidate_ngl > 0 {
                (requested_ctx, candidate_ngl, false)
            } else {
                // If even 1 layer cannot fit at requested_ctx, step down candidate contexts
                let mut fit = None;
                for &candidate in &[requested_ctx, 65536, 32768, 16384, 8192, 4096, 2048, 1024] {
                    if candidate > requested_ctx { continue; }
                    let ngl = (0..=total_layers)
                        .rev()
                        .find(|layers| vram_for_ngl(model_size_gb, meta, total_layers, *layers, candidate) <= gpu_budget)
                        .unwrap_or(0);
                    if ngl > 0 {
                        fit = Some((candidate, ngl, false));
                        break;
                    }
                }
                fit.unwrap_or_else(|| {
                    let ngl = (0..=total_layers)
                        .rev()
                        .find(|layers| vram_for_ngl(model_size_gb, meta, total_layers, *layers, 1024) <= gpu_budget)
                        .unwrap_or(0);
                    (1024, ngl, false)
                })
            }
        }
    } else {
        // Auto (ctx_size == 0):
        // Automatically determine largest viable context size up to model max (or 32768)
        let base_candidates = [32768, 16384, 8192, 4096, 2048, 1024];
        let max_ctx = model_max_ctx.unwrap_or(32768);

        // First attempt: fit 100% of layers in dedicated VRAM
        let mut dedicated_fit = None;
        for &c in &base_candidates {
            if c > max_ctx { continue; }
            let req = vram_for_ngl(model_size_gb, meta, total_layers, total_layers, c);
            if req <= gpu_budget {
                dedicated_fit = Some(c);
                break;
            }
        }

        if let Some(c) = dedicated_fit {
            (c, total_layers, false)
        } else {
            // Cannot fit all layers in dedicated VRAM:
            // Perform clean partial layer offload across viable contexts
            let mut partial_fit = None;
            for &c in &[8192, 4096, 2048, 1024] {
                if c > max_ctx { continue; }
                let ngl = (1..=total_layers)
                    .rev()
                    .find(|layers| vram_for_ngl(model_size_gb, meta, total_layers, *layers, c) <= gpu_budget);
                if let Some(n) = ngl {
                    partial_fit = Some((c, n, false));
                    break;
                }
            }
            partial_fit.unwrap_or_else(|| {
                let ngl = (0..=total_layers)
                    .rev()
                    .find(|layers| vram_for_ngl(model_size_gb, meta, total_layers, *layers, 1024) <= gpu_budget)
                    .unwrap_or(0);
                (1024, ngl, false)
            })
        }
    };

    let fully_gpu = selected_ngl >= total_layers;
    let hybrid = !fully_gpu;
    let needed = vram_for_ngl(model_size_gb, meta, total_layers, selected_ngl, selected_ctx);

    let message = if fully_gpu && !uses_shared_memory {
        format!("GPU (Dedicated VRAM) — all {}/{} layers offloaded to {}. Context: {}.", total_layers, total_layers, hw.gpu_name, selected_ctx)
    } else if fully_gpu && uses_shared_memory {
        format!("Dedicated GPU (Shared GPU Memory: {}MB VRAM + shared system memory) — all {}/{} layers offloaded solely to {}. Context: {}.", dedicated_avail, total_layers, total_layers, hw.gpu_name, selected_ctx)
    } else {
        format!("Hybrid — {}/{} layers on GPU ({}MB VRAM) and {} layers in system RAM. Context: {}.", selected_ngl, total_layers, needed.min(gpu_budget), total_layers.saturating_sub(selected_ngl), selected_ctx)
    };

    let strategy = if hw.has_dedicated_gpu {
        if uses_shared_memory {
            "SharedGpuMemory".to_string()
        } else if fully_gpu {
            "FullDedicatedGpu".to_string()
        } else {
            "Hybrid".to_string()
        }
    } else if hw.is_igpu {
        if fully_gpu {
            "IntegratedGpu".to_string()
        } else {
            "Hybrid".to_string()
        }
    } else if fully_gpu {
        "FullDedicatedGpu".to_string()
    } else {
        "Hybrid".to_string()
    };

    let cpu_threads = if hybrid {
        hw.cpu_physical_cores.max(1)
    } else {
        hw.cpu_physical_cores.min(4).max(1)
    };

    info!(
        "[NglScheduler] model={:.1}GB ctx={} ngl={}/{} needed={}MB (dedicated={}MB, shared={}MB, uses_shared={}, strategy={})",
        model_size_gb, selected_ctx, selected_ngl, total_layers, needed, dedicated_avail, shared_avail, uses_shared_memory, strategy
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
pub fn derive_matching_kv_cache_type(model_identifier: &str, meta: Option<&GgufMetadata>) -> String {
    // 1. Check GGUF internal header file_type (llama_ftype enum) first if parsed
    if let Some(m) = meta {
        if let Some(ft) = m.file_type {
            match ft {
                0 => return "f32".to_string(),
                1 | 28 => return "f16".to_string(),
                7 | 18 => return "q8_0".to_string(),
                8 | 9 | 16 | 17 => return "q5_0".to_string(),
                2 | 3 | 10..=15 | 19..=27 | 29..=33 => return "q4_0".to_string(),
                _ => {}
            }
        }

        // 2. Check GGUF metadata tags if available
        for tag in &m.tags {
            let t = tag.to_lowercase();
            if t.contains("q4") || t.contains("iq4") || t.contains("q3") || t.contains("q2") {
                return "q4_0".to_string();
            } else if t.contains("q8") {
                return "q8_0".to_string();
            } else if t.contains("q5") || t.contains("iq5") {
                return "q5_0".to_string();
            } else if t.contains("q6") {
                return "q8_0".to_string();
            } else if t.contains("bf16") || t.contains("f16") {
                return "f16".to_string();
            } else if t.contains("f32") {
                return "f32".to_string();
            }
        }
    }

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

/// Compute the complete set of llama-server parameters for pure GPU inference.
pub fn compute_gpu_inference_config(
    hw: &HardwareSnapshot,
    meta: Option<&GgufMetadata>,
    model_size_gb: f32,
    ctx_size: u32,
    draft_model_path: Option<PathBuf>,
    _is_auto_ctx: bool,
    model_name_or_id: Option<&str>,
) -> Result<HybridInferenceConfig, String> {
    let ngl_decision = compute_ngl_decision(hw, meta, model_size_gb, ctx_size)?;
    let total_layers = estimate_total_layers(meta, model_size_gb);

    let mode = if ngl_decision.hybrid { InferenceMode::Hybrid } else { InferenceMode::FullGpu };

    let kv_cache_type = derive_matching_kv_cache_type(model_name_or_id.unwrap_or(""), meta);

    let (batch_size, ubatch_size) = if ngl_decision.uses_shared_memory {
        (1024u32, 256u32)
    } else if ngl_decision.effective_context_size <= 4096 {
        (1024u32, 512u32)
    } else {
        (2048u32, 512u32)
    };

    // For GPU-only inference, the CPU still handles KV management, sampling, and memory ops.
    // Capping at min(2) was starving the CPU side on machines with 4+ cores, causing
    // extra token generation latency. Use min(physical_cores, 4) which gives the right
    // balance across 4-core, 6-core, and higher consumer laptops.
    let threads_gen = if ngl_decision.hybrid {
        hw.cpu_physical_cores.max(1)
    } else {
        hw.cpu_physical_cores.min(4).max(1)
    };

    // For batch/prompt-processing, use all physical cores for maximum prefill throughput.
    let threads_batch = hw.cpu_physical_cores.max(1);

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
    fn dedicated_gpu_uses_partial_offload_for_large_model() {
        let decision = compute_ngl_decision(&hardware(4096, 6144), None, 8.0, 8192).unwrap();
        assert!(decision.hybrid);
        assert!(!decision.fully_gpu);
        assert!(!decision.uses_shared_memory);
        assert!(decision.ngl > 0);
        assert!(decision.ngl < estimate_total_layers(None, 8.0));
        assert!(decision.estimated_vram_mb <= 4096);
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
        assert_eq!(derive_matching_kv_cache_type("Qwen3.5-9B-Q4_K_M.gguf", None), "q4_0");
        assert_eq!(derive_matching_kv_cache_type("gemma-4-12B-it-qat-UD-Q4_K_XL.gguf", None), "q4_0");
        assert_eq!(derive_matching_kv_cache_type("model-Q8_0.gguf", None), "q8_0");
        assert_eq!(derive_matching_kv_cache_type("Ornith-1.5-9B.BF16.gguf", None), "f16");
        assert_eq!(derive_matching_kv_cache_type("model-q5_k_m.gguf", None), "q5_0");
        assert_eq!(derive_matching_kv_cache_type("model-f32.gguf", None), "f32");

        // GGUF internal header file_type verification
        let mut meta_q4 = GgufMetadata::default();
        meta_q4.file_type = Some(15); // Q4_K_M
        assert_eq!(derive_matching_kv_cache_type("unlabeled_model.gguf", Some(&meta_q4)), "q4_0");

        let mut meta_q8 = GgufMetadata::default();
        meta_q8.file_type = Some(7); // Q8_0
        assert_eq!(derive_matching_kv_cache_type("unlabeled_model.gguf", Some(&meta_q8)), "q8_0");

        // Unlabeled model without metadata defaults to optimal q4_0
        assert_eq!(derive_matching_kv_cache_type("unknown-model", None), "q4_0");
    }

    #[test]
    fn test_explicit_context_size_hybrid_on_dedicated_gpu() {
        // Dedicated GPU with 4096MB VRAM and 8192MB Shared GPU Memory
        let hw = hardware(4096, 8192);
        // User explicitly sets context size to 16384 for a 5.0GB model
        let decision = compute_ngl_decision(&hw, None, 5.0, 16384).unwrap();
        assert_eq!(decision.effective_context_size, 16384);
        assert!(decision.hybrid);
        assert!(!decision.uses_shared_memory);
        assert!(decision.ngl < estimate_total_layers(None, 5.0));
        assert_eq!(decision.strategy, "Hybrid");
    }

    #[test]
    fn test_dedicated_gpu_low_vram_reserves_dwm_headroom() {
        // Dedicated GPU with only 400MB available (< 512MB DWM headroom)
        let hw = hardware(400, 4096);
        let decision = compute_ngl_decision(&hw, None, 4.0, 2048).unwrap();
        // Budget saturates to 0, ensuring DWM compositor memory is preserved
        assert_eq!(decision.ngl, 0);
        assert!(decision.hybrid);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
