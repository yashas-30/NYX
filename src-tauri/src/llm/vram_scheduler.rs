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
    if model_size_gb < 2.0 { return 32; }
    if model_size_gb < 5.0 { return 40; }
    if model_size_gb < 10.0 { return 60; }
    80
}

/// Baseline constant VRAM cost for CUDA/Vulkan driver + context (in MB)
const BASE_VRAM_OVERHEAD_MB: u64 = 600;

/// Estimates VRAM required if we offload `ngl` layers.
pub fn vram_for_ngl(model_size_gb: f32, total_layers: u32, ngl: u32) -> u64 {
    if ngl == 0 {
        return 0; // Pure CPU mode doesn't allocate huge VRAM buffers
    }

    // Rough heuristic: model size in MB
    let model_mb = (model_size_gb * 1024.0) as u64;
    
    // Assume linear distribution of memory across layers for weights
    let layer_cost = model_mb / total_layers as u64;
    
    // Total VRAM = Overhead + (Layers offloaded * Cost per layer)
    BASE_VRAM_OVERHEAD_MB + (layer_cost * ngl as u64)
}

/// Core scheduling logic — pure function, no I/O.
///
/// # Arguments
/// * `vram` - Live VRAM snapshot from `query_vram()`
/// * `model_size_gb` - GGUF file size in GB (proxy for parameter memory)
///
/// # Returns
/// A `SpawnDecision` with the recommended -ngl and a human message.
pub fn compute_spawn_decision(vram: &VramInfo, model_size_gb: f32) -> SpawnDecision {
    let total_layers = estimate_total_layers(model_size_gb);
    // Leave 512 MB headroom for OS + WebView2 + Tauri
    let usable_mb = vram.available_mb.saturating_sub(512);

    // Binary search for max ngl that fits in available VRAM
    let mut best_ngl = 0u32;
    for ngl in (0..=total_layers).rev() {
        let needed = vram_for_ngl(model_size_gb, total_layers, ngl);
        if needed <= usable_mb {
            best_ngl = ngl;
            break;
        }
    }

    let estimated_vram_mb = vram_for_ngl(model_size_gb, total_layers, best_ngl);
    let fully_gpu = best_ngl >= total_layers;
    let suggest_cloud_fallback = best_ngl == 0;

    let message = if suggest_cloud_fallback {
        format!(
            "⚠️ Insufficient VRAM: {:.1} GB model requires ~{} MB but only {} MB available. \
             Consider using a cloud model or a Q2/Q3 quantization.",
            model_size_gb,
            vram_for_ngl(model_size_gb, total_layers, total_layers),
            vram.available_mb
        )
    } else if fully_gpu {
        format!(
            "✅ Model fits fully in VRAM ({} MB estimated / {} MB available). \
             All {} layers on GPU for maximum speed.",
            estimated_vram_mb, vram.available_mb, total_layers
        )
    } else {
        format!(
            "⚡ Partial GPU offload: {}/{} layers on GPU ({} MB VRAM). \
             Remaining layers run on CPU — inference will be slower.",
            best_ngl, total_layers, estimated_vram_mb
        )
    };

    info!(
        "[VramScheduler] model={:.1}GB total_layers={} ngl={} vram_available={}MB fully_gpu={} suggest_cloud={}",
        model_size_gb, total_layers, best_ngl, vram.available_mb, fully_gpu, suggest_cloud_fallback
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
    // Use the existing system_gpu_info logic from commands/system.rs
    // We query WMI via PowerShell to get VRAM — consistent with what the UI already shows.
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

    // Handle both single GPU (object) and multiple GPUs (array)
    let gpu = if parsed.is_array() {
        parsed.as_array()?.first()?.clone()
    } else {
        parsed
    };

    let name = gpu["Name"].as_str().unwrap_or("Unknown GPU").to_string();
    let total_bytes = gpu["AdapterRAM"].as_u64().unwrap_or(0);
    let total_mb = total_bytes / (1024 * 1024);

    // WMI doesn't give real-time VRAM usage; estimate used from running processes
    // Conservative: assume 15% is already used by OS/driver
    let used_mb = total_mb / 7;
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
