// src-tauri/src/llm/vram_scheduler.rs
//
// Phase 3: VRAM-Aware Model Scheduler
//
// Computes the optimal -ngl (GPU layers) value based on live VRAM availability.
// Called by LlamaManager before spawning llama-server to prevent OOM crashes
// and to give users clear feedback when a model is too large for their GPU.

use serde::{Deserialize, Serialize};
use tracing::info;

/// Live VRAM snapshot from sysinfo.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VramInfo {
    pub total_mb: u64,
    pub used_mb: u64,
    pub available_mb: u64,
    pub gpu_name: String,
}

/// Decision returned to the caller about how to launch a model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpawnDecision {
    /// How many layers to offload to GPU (-ngl flag).
    pub ngl: u32,
    /// Whether the model fits entirely in VRAM.
    pub fully_gpu: bool,
    /// Whether we should fall back to cloud (VRAM critically low).
    pub suggest_cloud_fallback: bool,
    /// Human-readable explanation for the frontend warning.
    pub message: String,
    /// Estimated VRAM usage in MB for the requested ngl.
    pub estimated_vram_mb: u64,
}

/// Typical layer counts for common model sizes (approximate).
/// Used when we can't parse the GGUF header directly.
pub fn estimate_total_layers(model_size_gb: f32) -> u32 {
    if model_size_gb < 1.0 { return 24; }
    if model_size_gb < 4.5 { return 32; }
    if model_size_gb < 6.0 { return 42; } // e.g., Gemma 2 9B
    if model_size_gb < 9.0 { return 48; } // e.g., Qwen 2.5 14B
    if model_size_gb < 15.0 { return 60; }
    80
}

/// Baseline constant VRAM cost for CUDA/Vulkan driver + context (in MB)
const BASE_VRAM_OVERHEAD_MB: u64 = 150;

/// Estimates VRAM required if we offload `ngl` layers.
pub fn vram_for_ngl(model_size_gb: f32, total_layers: u32, ngl: u32, context_size: u32) -> u64 {
    if ngl == 0 {
        return 0; // Pure CPU mode doesn't allocate huge VRAM buffers
    }

    // Rough heuristic: model size in MB
    let model_mb = (model_size_gb * 1024.0) as u64;
    
    // Assume linear distribution of memory across layers for weights
    let layer_cost = model_mb / total_layers as u64;
    
    // KV Cache Heuristic:
    // ~10MB to 30MB per 1024 tokens depending on model size proxy
    let kv_mb_per_1k = 10.0 + (model_size_gb * 2.0).min(30.0);
    let total_kv_mb = (context_size as f32 / 1024.0) * kv_mb_per_1k;
    // KV Cache is offloaded proportionally to the layers offloaded
    let offloaded_kv_mb = (total_kv_mb * (ngl as f32 / total_layers as f32)) as u64;
    
    // Compute Buffer Heuristic:
    // llama.cpp requires a compute buffer for intermediate tensor evaluations (e.g. logits).
    // Models with large vocabularies (like Qwen) require massive compute buffers.
    // Qwen 3.5 9B needs ~1.05 GB just for its compute buffer.
    let compute_buffer_mb = 400 
        + (model_size_gb * 100.0) as u64 
        + (context_size as u64 / 1024) * 32;
    
    // Total VRAM = Overhead + Compute Buffer + (Layers offloaded * Cost per layer) + Offloaded KV Cache
    BASE_VRAM_OVERHEAD_MB + compute_buffer_mb + (layer_cost * ngl as u64) + offloaded_kv_mb
}

/// Core scheduling logic — pure function, no I/O.
///
/// # Arguments
/// * `vram` - Live VRAM snapshot from `query_vram()`
/// * `model_size_gb` - GGUF file size in GB (proxy for parameter memory)
///
/// # Returns
/// A `SpawnDecision` with the recommended -ngl and a human message.
pub fn compute_spawn_decision(vram: &VramInfo, model_size_gb: f32, context_size: u32) -> SpawnDecision {
    let _total_layers = estimate_total_layers(model_size_gb);
    
    // We enforce 100% GPU processing by always passing -ngl 999.
    // If the model exceeds dedicated VRAM, the graphics driver will automatically 
    // allocate the overflow in system memory and access it via PCIe paging.
    let best_ngl = 999;
    
    // Calculate the estimated size of the model (without KV cache, as we use --no-kv-offload)
    let model_mb = (model_size_gb * 1024.0) as u64;
    let compute_buffer_mb = 400 
        + (model_size_gb * 100.0) as u64 
        + (context_size as u64 / 1024) * 32;
    let estimated_vram_mb = BASE_VRAM_OVERHEAD_MB + compute_buffer_mb + model_mb;

    let fully_gpu = estimated_vram_mb <= vram.available_mb;
    let suggest_cloud_fallback = false;

    let message = if fully_gpu {
        format!(
            "✅ Model fits fully in Dedicated VRAM ({} MB estimated / {} MB available). \
             KV cache is in system memory. Running 100% on GPU.",
            estimated_vram_mb, vram.available_mb
        )
    } else {
        format!(
            "⚡ Model exceeds Dedicated VRAM ({} MB estimated / {} MB available). \
             Completely filling GPU; remaining layers & KV cache are in system memory. \
             Processing entirely on GPU via PCIe.",
            estimated_vram_mb, vram.available_mb
        )
    };

    info!(
        "[VramScheduler] model={:.1}GB estimated_vram={}MB vram_available={}MB fully_gpu={} suggest_cloud={}",
        model_size_gb, estimated_vram_mb, vram.available_mb, fully_gpu, suggest_cloud_fallback
    );

    SpawnDecision {
        ngl: best_ngl,
        fully_gpu,
        suggest_cloud_fallback,
        message,
        estimated_vram_mb,
    }
}

/// Query live VRAM from sysinfo.
/// Falls back gracefully if the GPU can't be queried.
pub fn query_vram() -> Option<VramInfo> {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_all();

    // sysinfo 0.30+ uses Components for GPU on some platforms
    // Use the GPU manager APIs if available
    #[cfg(target_os = "windows")]
    {
        return query_vram_windows();
    }

    #[allow(unreachable_code)]
    None
}

#[cfg(target_os = "windows")]
fn query_vram_windows() -> Option<VramInfo> {
    // 1. Try nvidia-smi for accurate VRAM (WMI AdapterRAM is capped at 4GB due to uint32 limits)
    if let Ok(output) = std::process::Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total,memory.used",
            "--format=csv,noheader,nounits",
        ])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut best_gpu: Option<VramInfo> = None;
            for line in stdout.lines() {
                let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
                if parts.len() >= 3 {
                    let name = parts[0].to_string();
                    if let (Ok(total_mb), Ok(used_mb)) = (parts[1].parse::<u64>(), parts[2].parse::<u64>()) {
                        let available_mb = total_mb.saturating_sub(used_mb);
                        if best_gpu.as_ref().map_or(true, |g| total_mb > g.total_mb) {
                            best_gpu = Some(VramInfo {
                                total_mb,
                                used_mb,
                                available_mb,
                                gpu_name: name,
                            });
                        }
                    }
                }
            }
            if best_gpu.is_some() { return best_gpu; }
        }
    }

    // 2. Fallback to WMI if nvidia-smi fails
    let output = std::process::Command::new("powershell")
        .args([
            "-NonInteractive",
            "-Command",
            r#"Get-WmiObject Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json"#,
        ])
        .output()
        .ok()?;

    let json_str = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(json_str.trim()).ok()?;

    let gpu = if let Some(arr) = parsed.as_array() {
        arr.iter().max_by_key(|g| g["AdapterRAM"].as_u64().unwrap_or(0)).cloned().unwrap_or(parsed.clone())
    } else {
        parsed
    };

    let name = gpu["Name"].as_str().unwrap_or("Unknown GPU").to_string();
    let mut total_bytes = gpu["AdapterRAM"].as_u64().unwrap_or(0);
    
    // WMI AdapterRAM is 32-bit uint. If it's maxed out (4294967296 bytes) or close, 
    // it's highly likely to be a modern GPU with 8GB+. We assume 8GB minimum for these cases.
    if total_bytes >= 4_000_000_000 {
        total_bytes = 8_589_934_592; // 8GB fallback
    }

    let total_mb = total_bytes / (1024 * 1024);

    let used_mb = 640; // Assume 640MB OS/Desktop overhead for WMI fallback
    let available_mb = total_mb.saturating_sub(used_mb);

    if total_mb == 0 {
        return None;
    }

    Some(VramInfo {
        total_mb,
        used_mb,
        available_mb,
        gpu_name: name,
    })
}

/// Get the size of a GGUF model file in GB.
pub fn get_model_size_gb(model_path: &std::path::Path) -> f32 {
    std::fs::metadata(model_path)
        .map(|m| m.len() as f32 / (1024.0 * 1024.0 * 1024.0))
        .unwrap_or(4.0) // Default assumption: 4 GB
}
