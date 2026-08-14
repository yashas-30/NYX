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
use tracing::info;

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

/// llama-server HTTP port (dynamic).
pub static SERVER_PORT: std::sync::atomic::AtomicU16 = std::sync::atomic::AtomicU16::new(8080);
const SERVER_HOST: &str = "127.0.0.1";

fn find_free_port() -> u16 {
    for port in 8080..8100 {
        if std::net::TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return port;
        }
    }
    8080
}

/// Guards concurrent binary-download attempts.
static DOWNLOAD_SEMAPHORE: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);

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

/// 2026 Standard Hardware Profiles
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum HardwareProfile {
    Vram4GbSys16Gb,
    Vram6GbSys16Gb,
    Vram8GbSys16Gb,
    Vram8GbSys24Gb,
    Vram12GbSys16Gb,
    Vram12GbSys24Gb,
    Vram12GbSys32Gb,
    Vram16GbSys32Gb,
    Vram16GbSys64Gb,
    AutoDetect,
}

impl HardwareProfile {
    pub fn get_specs(&self) -> Option<(u64, u64)> {
        match self {
            Self::Vram4GbSys16Gb => Some((4, 16)),
            Self::Vram6GbSys16Gb => Some((6, 16)),
            Self::Vram8GbSys16Gb => Some((8, 16)),
            Self::Vram8GbSys24Gb => Some((8, 24)),
            Self::Vram12GbSys16Gb => Some((12, 16)),
            Self::Vram12GbSys24Gb => Some((12, 24)),
            Self::Vram12GbSys32Gb => Some((12, 32)),
            Self::Vram16GbSys32Gb => Some((16, 32)),
            Self::Vram16GbSys64Gb => Some((16, 64)),
            Self::AutoDetect => None,
        }
    }

    /// Snaps raw detected hardware to the closest 2026 standard profile
    pub fn snap_from(vram_mb: u64, ram_mb: u64) -> Self {
        let vram_gb = (vram_mb as f64 / 1024.0).round() as u64;
        let ram_gb = (ram_mb as f64 / 1024.0).round() as u64;

        if vram_mb == 0 {
            if ram_gb >= 64 {
                return Self::Vram16GbSys64Gb;
            } else if ram_gb >= 32 {
                return Self::Vram12GbSys32Gb;
            } else if ram_gb >= 24 {
                return Self::Vram8GbSys24Gb;
            } else {
                return Self::Vram4GbSys16Gb;
            }
        }

        match vram_gb {
            0..=4 => Self::Vram4GbSys16Gb,
            5..=6 => Self::Vram6GbSys16Gb,
            7..=8 => {
                if ram_gb >= 24 { Self::Vram8GbSys24Gb } else { Self::Vram8GbSys16Gb }
            },
            9..=12 => {
                if ram_gb >= 32 { Self::Vram12GbSys32Gb }
                else if ram_gb >= 24 { Self::Vram12GbSys24Gb }
                else { Self::Vram12GbSys16Gb }
            },
            _ => {
                if ram_gb >= 64 { Self::Vram16GbSys64Gb } else { Self::Vram16GbSys32Gb }
            }
        }
    }
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
    /// True if any dedicated (discrete) GPU was detected.
    pub has_dedicated_gpu: bool,
    /// True if the GPU is integrated (iGPU / APU / shared memory).
    /// iGPUs require conservative layer caps (≤35%) and context limits (≤8192).
    pub is_igpu: bool,

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

    // ── Profile ──────────────────────────────────────────────────────────────
    /// The 2026 standardized hardware profile matched to this device.
    pub profile: HardwareProfile,
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
    let ps_script = r#"$gpus = 0..9 | ForEach-Object { $sub = '{0:D4}' -f $_; $p = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\' + $sub; if (Test-Path $p) { $val = Get-ItemProperty -Path $p -ErrorAction SilentlyContinue; if ($val.DriverDesc) { $ram = $val.'HardwareInformation.qwMemorySize'; if ($null -eq $ram) { $ram = $val.'HardwareInformation.AdapterMemorySize' }; if ($null -ne $ram) { [PSCustomObject]@{ Name = $val.DriverDesc; AdapterRAM = [uint64]$ram } } } } }; if ($null -eq $gpus -or $gpus.Count -eq 0) { $gpus = Get-CimInstance Win32_VideoController | Select-Object @{N='Name';E={$_.Name}}, @{N='AdapterRAM';E={[uint64]$_.AdapterRAM}} }; @($gpus) | ConvertTo-Json -Depth 2"#;
    
    let ps_output = async {
        use std::process::Stdio;
        use tokio::io::AsyncWriteExt;
        
        let mut child = tokio::process::Command::new("powershell")
            .hide_window()
            .args(&["-NoProfile", "-Command", "-"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;
            
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(ps_script.as_bytes()).await?;
        }
        
        child.wait_with_output().await
    }.await;
        
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
                
                // Heuristic: dedicated GPU if AdapterRAM >= 2 GB or if name matches dedicated GPU brands
                let is_dedicated = best_ram >= 2_000_000_000 
                    || vendor_lower.contains("rx") 
                    || vendor_lower.contains("rtx") 
                    || vendor_lower.contains("gtx") 
                    || vendor_lower.contains("geforce")
                    || vendor_lower.contains("radeon")
                    || vendor_lower.contains("arc");
                
                let mut vram_total_bytes = best_ram;
                if !is_dedicated {
                    // Windows WDDM allows APUs/iGPUs to borrow up to 50% of system RAM.
                    vram_total_bytes += sys_ram_bytes / 2;
                } else if best_ram < 1_000_000_000 {
                    // WMI AdapterRAM wrapped for a dedicated card (usually means 4GB+)
                    // Default to 4GB before standard profile snapping
                    vram_total_bytes = 4_294_967_296; 
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
async fn detect_gpu(_sys_ram_bytes: u64) -> GpuDetectionResult {
    // ── Step 1: Try nvidia-smi (NVIDIA GPUs on Linux) ───────────────────────
    let nvidia_smi_vram = async {
        let out = tokio::process::Command::new("nvidia-smi")
            .args(&["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
            .output()
            .await
            .ok()?;
        let text = String::from_utf8(out.stdout).ok()?;
        let line = text.lines().next()?.trim();
        let mut parts = line.splitn(2, ',');
        let name = parts.next()?.trim().to_string();
        let vram_mib: u64 = parts.next()?.trim().parse().ok()?;
        Some((name, vram_mib * 1024 * 1024))
    }.await;

    if let Some((name, vram_bytes)) = nvidia_smi_vram {
        info!("[GPU/Linux] nvidia-smi: {} — {:.1} GB VRAM", name, vram_bytes as f64 / 1e9);
        return GpuDetectionResult {
            name,
            backend: GpuBackend::Cuda,
            vram_total_bytes: vram_bytes,
            is_dedicated: true,
        };
    }

    // ── Step 2: AMD via sysfs (works without ROCm runtime) ─────────────────
    // /sys/class/drm/card*/device/mem_info_vram_total exists on amdgpu kernel module
    let amd_sysfs = async {
        let mut best_vram = 0u64;
        let mut best_name = String::new();
        if let Ok(mut entries) = tokio::fs::read_dir("/sys/class/drm").await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let path = entry.path();
                let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                // Only top-level card* entries (not renderD*)
                if !name.starts_with("card") || name.contains('-') { continue; }
                let vram_path = path.join("device/mem_info_vram_total");
                if let Ok(content) = tokio::fs::read_to_string(&vram_path).await {
                    if let Ok(bytes) = content.trim().parse::<u64>() {
                        if bytes > best_vram {
                            best_vram = bytes;
                            // Try to read vendor name
                            let product_path = path.join("device/product_name");
                            best_name = tokio::fs::read_to_string(&product_path)
                                .await
                                .unwrap_or_else(|_| "AMD GPU".to_string())
                                .trim()
                                .to_string();
                            if best_name.is_empty() { best_name = "AMD GPU".to_string(); }
                        }
                    }
                }
            }
        }
        if best_vram > 0 { Some((best_name, best_vram)) } else { None }
    }.await;

    if let Some((name, vram_bytes)) = amd_sysfs {
        info!("[GPU/Linux] sysfs AMD: {} — {:.1} GB VRAM", name, vram_bytes as f64 / 1e9);
        return GpuDetectionResult {
            name,
            backend: GpuBackend::Vulkan, // ROCm or Vulkan; Vulkan is safe universal choice
            vram_total_bytes: vram_bytes,
            is_dedicated: vram_bytes >= 2_000_000_000,
        };
    }

    // ── Fallback: CPU-only or unknown GPU ────────────────────────────────────
    warn!("[GPU/Linux] No GPU detected via nvidia-smi or sysfs; falling back to CPU-only.");
    GpuDetectionResult {
        name: "No GPU detected".to_string(),
        backend: GpuBackend::Unknown,
        vram_total_bytes: 0,
        is_dedicated: false,
    }
}

static GPU_INFO: tokio::sync::OnceCell<GpuDetectionResult> = tokio::sync::OnceCell::const_new();

impl HardwareSnapshot {
    /// Collect hardware information. Uses `sysinfo` for CPU/RAM and `Get-CimInstance` for GPU.
    pub async fn collect() -> Self {
        let mut snapshot = Self::default();

        static SYS: std::sync::LazyLock<std::sync::Mutex<sysinfo::System>> = std::sync::LazyLock::new(|| {
            std::sync::Mutex::new(sysinfo::System::new_with_specifics(
                sysinfo::RefreshKind::new()
                    .with_cpu(sysinfo::CpuRefreshKind::new())
                    .with_memory(sysinfo::MemoryRefreshKind::new().with_ram())
            ))
        });
        
        let (cpu_cores, cpu_threads, cpu_name, ram_total, ram_avail) = tokio::task::spawn_blocking(|| {
            if let Ok(mut sys) = SYS.lock() {
                sys.refresh_all();
                sys.refresh_memory();
                
                let cpu_cores = sys.physical_core_count().unwrap_or(sys.cpus().len().max(1)) as u32;
                let cpu_threads = sys.cpus().len() as u32;
                let cpu_name = sys.cpus().first()
                    .map(|c| c.brand().to_string())
                    .unwrap_or_else(|| "Unknown CPU".to_string());
                let ram_total = sys.total_memory() / (1024 * 1024);
                let ram_avail = sys.available_memory() / (1024 * 1024);
                
                (cpu_cores, cpu_threads, cpu_name, ram_total, ram_avail)
            } else {
                (4, 8, "Unknown CPU".to_string(), 8192, 4096)
            }
        }).await.unwrap_or((4, 8, "Unknown CPU".to_string(), 8192, 4096));

        snapshot.cpu_physical_cores = cpu_cores;
        snapshot.cpu_logical_threads = cpu_threads;
        snapshot.cpu_name = cpu_name;
        snapshot.ram_total_mb = ram_total;
        snapshot.ram_available_mb = ram_avail;

        // 2. GPU detection via OS-specific logic (static props cached)
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
            snapshot.has_dedicated_gpu = gpu_result.is_dedicated;

            // iGPU heuristic
            snapshot.is_igpu = if snapshot.gpu_backend == GpuBackend::Metal {
                false 
            } else {
                !gpu_result.is_dedicated
            };
        } else {
            snapshot.is_igpu = false;
        }

        // 2026 Hardware Standardization: Snap to standard profiles
        let profile = HardwareProfile::snap_from(snapshot.vram_total_mb, snapshot.ram_total_mb);
        snapshot.profile = profile;
        
        if snapshot.has_dedicated_gpu {
            snapshot.vram_available_mb = snapshot.vram_total_mb.saturating_sub(256);
        } else {
            snapshot.vram_available_mb = snapshot.vram_total_mb.saturating_sub(100);
        }
        
        info!("[HardwareAnalyser] Snapped to 2026 Profile: {:?} ({}MB VRAM, {}MB RAM)", 
            profile, snapshot.vram_total_mb, snapshot.ram_total_mb);

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
            is_igpu: false,
            cpu_physical_cores: 4,
            cpu_logical_threads: 8,
            cpu_name: "Unknown CPU".to_string(),
            ram_total_mb: 0,
            ram_available_mb: 0,
            profile: HardwareProfile::AutoDetect,
        }
    }
}



// ─────────────────────────────────────────────────────────────────────────────
// § 3 — SMART NGL SCHEDULER
// ─────────────────────────────────────────────────────────────────────────────

/// Overhead constants (MB).
const CUDA_DRIVER_OVERHEAD_MB: u64 = 100;
const COMPUTE_BUFFER_BASE_MB: u64 = 150;

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
fn vram_for_ngl(model_size_gb: f32, meta: Option<&GgufMetadata>, total_layers: u32, ngl: u32, ctx_size: u32) -> u64 {
    if ngl == 0 { return 0; }

    let model_mb = (model_size_gb * 1024.0) as u64;

    // Non-layer overhead (embedding table + lm_head projection + norm layers)
    // is ~18% of model size for modern architectures (Llama-3, Qwen-2.5, DeepSeek).
    let non_layer_overhead_mb = (model_mb as f64 * 0.18) as u64;
    let transformer_layers_mb = model_mb.saturating_sub(non_layer_overhead_mb);

    let weights_in_vram_mb = if ngl >= total_layers {
        model_mb
    } else {
        // Base non-layer overhead (embeddings) offloaded + proportional layer weights
        let per_layer_mb = transformer_layers_mb / total_layers.max(1) as u64;
        let offloaded_mb = per_layer_mb.saturating_mul(ngl as u64);
        (non_layer_overhead_mb / 2).saturating_add(offloaded_mb).min(model_mb)
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
        // Fallback heuristic: scale by ngl fraction of total
        let base = 25.0 + (model_size_gb * 5.0).min(75.0);
        base * (gpu_kv_layers as f32 / total_layers.max(1) as f32)
    };

    let total_kv_mb = (ctx_size as f32 / 1024.0) * kv_mb_per_1k;
    // All GPU-resident KV is already accounted for in kv_mb_per_1k (uses gpu_kv_layers)
    let offloaded_kv_mb = total_kv_mb as u64;

    // FlashAttention-2 compute buffer overhead
    let compute_mb = COMPUTE_BUFFER_BASE_MB
        .saturating_add((model_size_gb * 12.0) as u64)
        .saturating_add((ctx_size as u64 / 1024) * 8);

    CUDA_DRIVER_OVERHEAD_MB + compute_mb + weights_in_vram_mb + offloaded_kv_mb
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
    /// The actual context size that will fit (may be reduced from requested ctx_size).
    pub effective_context_size: u32,
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
    /// 2026/2027 Injected CLI arguments based on hardware topology and inference mode.
    pub extra_args: Vec<String>,
    /// Human-readable summary for the frontend / log.
    pub message: String,
    /// The actual context size the server will be started with.
    /// May be less than the user-requested size if auto-reduction was needed to
    /// keep all layers on the GPU instead of falling back to hybrid/CPU mode.
    pub effective_context_size: u32,
    /// Optional path to a draft GGUF model for speculative decoding.
    /// When set, llama-server uses it for draft prediction (~2x generation speed).
    pub draft_model_path: Option<PathBuf>,
}

/// Look for a draft model in the same directory as the main model for speculative decoding.
/// Draft models should be named with a "draft-" prefix (e.g. "draft-qwen2.5-0.5b-Q4_K_M.gguf").
/// Speculative decoding ~2x generation speed with minimal quality loss.
fn find_draft_model(main_model_path: &Path) -> Option<PathBuf> {
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

/// Compute the best NGL split given live hardware and the model.
///
/// KEY INVARIANT: this function always returns the REAL ngl value.
/// The caller MUST pass it to llama-server; it must NOT be overridden with 999.
///
/// 2026 addition: iGPU mode enforces a hard 35% layer cap and 50% VRAM safety
/// factor to prevent system RAM starvation on shared-memory devices.
pub fn compute_ngl_decision(hw: &HardwareSnapshot, meta: Option<&GgufMetadata>, model_size_gb: f32, ctx_size: u32) -> NglDecision {
    let total_layers = estimate_total_layers(meta, model_size_gb);
    let avail_mb = hw.vram_available_mb;

    let mut actual_ctx_size = ctx_size;
    if actual_ctx_size == 0 {
        // Auto mode: use model's max context metadata, defaulting to 32768
        let max_ctx = meta.and_then(|m| m.context_length).unwrap_or(32768);
        actual_ctx_size = max_ctx.min(131072); 
    }

    // Optimal CPU threads: physical cores, capped at 24 to avoid NUMA thrash.
    let cpu_threads = hw.cpu_physical_cores.min(24).max(1);

    // Determine if GPU acceleration is usable.
    if avail_mb == 0 {
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
            effective_context_size: actual_ctx_size,
        };
    }

    // iGPU & Low-VRAM safety factor:
    // For GPUs with <= 6GB VRAM, use 0.78 safety factor to leave 22% buffer for CUDA
    // context, FlashAttention scratch buffers, and OS display composition.
    // iGPUs use 0.50 due to shared RAM contention. Standard discrete GPUs with > 6GB use 0.92.
    let safety_factor = if hw.is_igpu {
        0.50_f64
    } else if hw.vram_available_mb <= 6144 {
        0.78_f64
    } else {
        0.92_f64
    };
    let safe_avail_mb = (avail_mb as f64 * safety_factor) as u64;

    // Check if model fits entirely in VRAM.
    let full_vram_needed = vram_for_ngl(model_size_gb, meta, total_layers, total_layers, actual_ctx_size);

    // Full-GPU path: model fits in (safe) VRAM.
    if full_vram_needed <= safe_avail_mb {
        // iGPU cap: even if model "fits", cap at 35% of layers for stability.
        let capped_ngl = if hw.is_igpu {
            let igpu_max = ((total_layers as f64) * 0.35) as u32;
            total_layers.min(igpu_max)
        } else {
            total_layers
        };
        let fully_gpu = capped_ngl == total_layers;
        return NglDecision {
            ngl: capped_ngl,
            fully_gpu,
            hybrid: !fully_gpu,
            estimated_vram_mb: full_vram_needed,
            message: if fully_gpu {
                format!(
                    "✅ Model fits fully in VRAM ({} MB / {} MB available). Running 100% on GPU.",
                    full_vram_needed, avail_mb
                )
            } else {
                format!(
                    "⚡ iGPU mode: {}/{} layers on GPU (35% cap for stability).",
                    capped_ngl, total_layers
                )
            },
            recommended_cpu_threads: cpu_threads,
            effective_context_size: actual_ctx_size,
        };
    }

    // ── Small Model Fast-Path (2026 Optimization) ─────────────────────────
    // Small models (<= 4.5 GB) on dedicated GPUs with >= 1.5GB available VRAM MUST be 100% offloaded to GPU!
    if !hw.is_igpu && hw.has_dedicated_gpu && model_size_gb <= 4.5 && safe_avail_mb >= 1500 {
        let needed = vram_for_ngl(model_size_gb, meta, total_layers, total_layers, ctx_size);
        info!("[NglScheduler] Small model ({:.1}GB) fully offloaded to GPU (ngl={}).", model_size_gb, total_layers);
        return NglDecision {
            ngl: total_layers,
            fully_gpu: true,
            hybrid: false,
            estimated_vram_mb: needed,
            message: format!("✅ Full GPU ({}/{} layers) — small model fast path.", total_layers, total_layers),
            recommended_cpu_threads: cpu_threads,
            effective_context_size: ctx_size,
        };
    }

    // ── Context-aware full-GPU attempt ────────────────────────────────────────

    // Before doing a hybrid split (which forces CPU computation), try reducing
    // the context size to keep ALL layers on the GPU. This is almost always the
    // right tradeoff: a 64K context with hybrid inference (CPU bottleneck) is
    // FAR slower than a 16K context with pure GPU inference.
    //
    // We try context sizes in descending order; the first one that fits gives
    // us full GPU mode. If even the model weights alone don't fit, fall through
    // to the hybrid binary search.
    if !hw.is_igpu {
        // Only try if the model weights alone (no KV cache) would fit in VRAM.
        // Use ctx=512 as a proxy for "minimal KV overhead".
        let weights_only_needed = vram_for_ngl(model_size_gb, meta, total_layers, total_layers, 512);
        if weights_only_needed <= safe_avail_mb {
            // Find the largest context that keeps us fully on GPU.
            let ctx_candidates = [65536u32, 32768, 16384, 8192, 4096];
            for &candidate_ctx in &ctx_candidates {
                if candidate_ctx > ctx_size {
                    continue; // Skip contexts strictly larger than what was requested
                }
                let needed = vram_for_ngl(model_size_gb, meta, total_layers, total_layers, candidate_ctx);
                if needed <= safe_avail_mb {
                    info!(
                        "[NglScheduler] Context reduced from {} to {} to keep model fully on GPU. \
                         VRAM: {}MB needed / {}MB available.",
                        ctx_size, candidate_ctx, needed, avail_mb
                    );
                    return NglDecision {
                        ngl: total_layers,
                        fully_gpu: true,
                        hybrid: false,
                        estimated_vram_mb: needed,
                        message: format!(
                            "✅ Full GPU ({}/{} layers) — context auto-reduced from {} to {}K to fit in VRAM ({} MB / {} MB).",
                            total_layers, total_layers,
                            actual_ctx_size,
                            candidate_ctx / 1024,
                            needed, avail_mb
                        ),
                        recommended_cpu_threads: cpu_threads,
                        effective_context_size: candidate_ctx,
                    };
                }
            }
        }
    }

    // Binary search for the maximum layers that fit in safe VRAM.
    let mut lo = 0u32;
    let mut hi = total_layers;
    while lo < hi {
        let mid = lo + (hi - lo + 1) / 2;
        if vram_for_ngl(model_size_gb, meta, total_layers, mid, ctx_size) <= safe_avail_mb {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    let mut best_ngl = lo;

    // iGPU hard cap: never exceed 35% of layers regardless of VRAM estimate.
    if hw.is_igpu {
        let igpu_max = ((total_layers as f64) * 0.35) as u32;
        best_ngl = best_ngl.min(igpu_max);
    }

    // Mitigate GGML_ASSERT(n_inputs < GGML_SCHED_MAX_SPLIT_INPUTS) in llama.cpp scheduler:
    // When context size is extremely large (>= 32K) and we can't fully offload the model,
    // the graph split between CPU and GPU involves too many intermediate tensors.
    // Also, offloading a tiny number of layers (e.g. < 4) is counter-productive due to PCIe overhead.
    let fully_gpu = best_ngl == total_layers;
    let hybrid = best_ngl > 0 && !fully_gpu;

    let estimated_vram_mb = vram_for_ngl(model_size_gb, meta, total_layers, best_ngl, ctx_size);

    let message = if best_ngl == 0 {
        format!(
            "⚠️ Model ({:.1} GB) exceeds available VRAM ({} MB). Running entirely on CPU ({} threads).",
            model_size_gb, avail_mb, cpu_threads
        )
    } else if fully_gpu {
        format!(
            "✅ Full GPU — {}/{} layers | {} MB estimated / {} MB available.",
            total_layers, total_layers, estimated_vram_mb, avail_mb
        )
    } else if hw.is_igpu {
        format!(
            "⚡ iGPU hybrid: {}/{} layers on GPU (capped at 35%) + {} CPU layers ({} threads).",
            best_ngl, total_layers, total_layers - best_ngl, cpu_threads
        )
    } else {
        format!(
            "⚡ Hybrid: {}/{} layers on GPU ({} MB VRAM) + {} CPU layers ({} threads).",
            best_ngl, total_layers, estimated_vram_mb, total_layers - best_ngl, cpu_threads
        )
    };

    info!(
        "[NglScheduler] model={:.1}GB ctx={} total={} ngl={} vram_est={}MB avail={}MB is_igpu={}",
        model_size_gb, ctx_size, total_layers, best_ngl, estimated_vram_mb, avail_mb, hw.is_igpu
    );

    NglDecision {
        ngl: best_ngl,
        fully_gpu,
        hybrid,
        estimated_vram_mb,
        message,
        recommended_cpu_threads: cpu_threads,
        effective_context_size: actual_ctx_size,
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
/// 2026: `context_capped` and `effective_context_size` reflect iGPU auto-clamping.
/// Frontend should read these from the `vram-decision` event for display.
pub fn compute_hybrid_inference_config(
    hw: &HardwareSnapshot,
    meta: Option<&GgufMetadata>,
    model_size_gb: f32,
    mut ctx_size: u32,
    draft_model_path: Option<PathBuf>,
    is_auto_ctx: bool,
) -> HybridInferenceConfig {
    
    // ── Profile-Driven 2026 Tuning ───────────────────────────────────────
    // We strictly tune batching, context caps, and KV cache based on the profile.
    let (batch_size, ubatch_size, kv_cache_type, mut use_mlock);
    
    match hw.profile {
        // Tier 3: Entry-Level (4GB VRAM - e.g. GTX 1650 / 1050Ti)
        HardwareProfile::Vram4GbSys16Gb => {
            if is_auto_ctx && ctx_size > 16384 {
                info!("[HybridScheduler] Vram4Gb profile active: clamping context from {} to 16384 to prevent RAM paging locks.", ctx_size);
                ctx_size = 16384;
            }
            ubatch_size = 512;
            batch_size = 1024;
            kv_cache_type = "q4_0".to_string();
            use_mlock = false;
        }
        
        HardwareProfile::Vram6GbSys16Gb | HardwareProfile::Vram8GbSys16Gb => {
            if is_auto_ctx && ctx_size > 32768 {
                info!("[HybridScheduler] Vram6Gb/8Gb profile active: clamping context from {} to 32768.", ctx_size);
                ctx_size = 32768;
            }
            ubatch_size = 1024;
            batch_size = 2048;
            kv_cache_type = "q4_0".to_string();
            use_mlock = false;
        }
        
        HardwareProfile::Vram8GbSys24Gb | HardwareProfile::Vram12GbSys16Gb | HardwareProfile::Vram12GbSys24Gb | HardwareProfile::Vram12GbSys32Gb => {
            if is_auto_ctx && ctx_size > 65536 {
                info!("[HybridScheduler] Tier 2 profile active: clamping context from {} to 65536.", ctx_size);
                ctx_size = 65536;
            }
            ubatch_size = 2048;
            batch_size = 2048;
            kv_cache_type = if ctx_size >= 16384 { "q5_0".to_string() } else { "q8_0".to_string() };
            use_mlock = false;
        }
        
        HardwareProfile::Vram16GbSys32Gb | HardwareProfile::Vram16GbSys64Gb => {
            ubatch_size = 4096;
            batch_size = 4096;
            kv_cache_type = "q8_0".to_string();
            use_mlock = false;
        }
        
        HardwareProfile::AutoDetect => {
            if is_auto_ctx && hw.is_igpu && ctx_size > 32768 {
                ctx_size = 32768;
            }
            ubatch_size = if hw.is_igpu { 512 } else { 2048 };
            batch_size = 2048;
            kv_cache_type = "q5_0".to_string();
            use_mlock = false;
        }
    }


    // Now calculate NGL with the potentially clamped context size
    let ngl_decision = compute_ngl_decision(hw, meta, model_size_gb, ctx_size);
    let total_layers = estimate_total_layers(meta, model_size_gb);

    let mode = if ngl_decision.fully_gpu {
        InferenceMode::FullGpu
    } else if ngl_decision.hybrid {
        InferenceMode::Hybrid
    } else {
        InferenceMode::CpuOnly
    };

    // Threading Strategy for Maximum Sustained Performance
    //
    // llama.cpp token generation is memory-bandwidth-bound, not compute-bound.
    // However, using too FEW threads means the memory controllers are not fully
    // saturated, which is the actual bottleneck in long generation runs.
    //
    // Strategy:
    // - For FullGpu mode: CPU is idle during decode (GPU handles everything).
    //   Use only 2 threads to avoid waking unnecessary cores.
    // - For Hybrid/CpuOnly mode: Use ALL physical cores (capped at 24 for
    //   NUMA safety). This saturates all memory channels and prevents the
    //   50%-CPU slowdown users see after ~2 minutes when only 8 cores are used.
    // - Prefill (batch): Always use ALL logical threads — embarrassingly parallel.
    let threads_gen = match mode {
        InferenceMode::FullGpu => hw.cpu_physical_cores.min(4).max(1),
        InferenceMode::Hybrid => hw.cpu_physical_cores.min(24).max(1),
        InferenceMode::CpuOnly => hw.cpu_physical_cores.min(24).max(1),
    };

    // Prefill (batch) is compute-bound; maximize logical threads to saturate AVX/AMX.
    let threads_batch = hw.cpu_logical_threads.max(hw.cpu_physical_cores).min(32);

    let extra_args: Vec<String> = Vec::new();

    // NUMA Optimization for high-core-count multi-socket/chiplet systems
    if hw.cpu_physical_cores > 16 {
        // distribute NUMA if needed
    }

    let disable_kv_offload = false;
    let use_mmap = true;
    
    // Safety check for mlock: when GPU offloading is active (Hybrid or FullGpu), disable mlock
    // to prevent memory double-pinning across System RAM and GPU VRAM.
    if mode != InferenceMode::CpuOnly || hw.ram_available_mb < ((model_size_gb * 1024.0) as u64 + 4096) {
        use_mlock = false;
    }

    let message = match mode {
        InferenceMode::FullGpu => format!(
            "✅ Full GPU — {}/{} layers | KV: {} | ubatch {} | 2026 Profile: {:?}",
            total_layers, total_layers, kv_cache_type, ubatch_size, hw.profile
        ),
        InferenceMode::Hybrid => format!(
            "⚡ Hybrid — {}/{} layers GPU | KV: {} | ubatch {}{} | 2026 Profile: {:?}",
            ngl_decision.ngl, total_layers, kv_cache_type, ubatch_size,
            if use_mlock { " | mmap+mlock" } else { " | mmap" }, hw.profile
        ),
        InferenceMode::CpuOnly => format!(
            "🖥️ CPU only — {} threads | KV: {} | ubatch {}{} | 2026 Profile: {:?}",
            threads_gen, kv_cache_type, ubatch_size,
            if use_mlock { " | mmap+mlock" } else { " | mmap" }, hw.profile
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
        flash_attention: true, 
        mode,
        extra_args,
        message: ngl_decision.message.clone(),
        effective_context_size: ngl_decision.effective_context_size,
        draft_model_path,
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
    pub prompt_cache_path: Option<PathBuf>,
    pub mmproj_path: Option<PathBuf>,
    pub port: u16,
    pub split_mode: Option<String>,
    pub tensor_split: Option<String>,
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
            "-np".into(), "1".into(),
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
        }

        if self.use_mmap {
            #[cfg(not(target_os = "windows"))]
            if self.use_mlock {
                args.push("--mlock".into());
            }
        } else {
            args.push("--no-mmap".into());
        }

        let fa_enabled = self.flash_attention && self.mmproj_path.is_none();
        if fa_enabled {
            args.extend(["--flash-attn".into(), "on".into()]);
        }

        if let Some(ref kct) = self.kv_cache_type {
            const VALID_KV_TYPES: &[&str] = &["f16","f32","q8_0","q5_0","q5_1","q4_0","q4_1","q8_1"];
            if VALID_KV_TYPES.contains(&kct.as_str()) {
                args.extend(["-ctk".into(), kct.clone()]);
                if fa_enabled {
                    args.extend(["-ctv".into(), kct.clone()]);
                } else {
                    args.extend(["-ctv".into(), "f16".into()]);
                }
            }
        }

        if self.disable_kv_offload {
            args.push("--no-kv-offload".into());
        }

        if let Some(ref draft) = self.draft_model_path {
            args.extend([
                "-md".into(), draft.to_string_lossy().into_owned(),
                "--draft-min".into(), "5".into(),
                "--draft-max".into(), "16".into(),
                "-ngld".into(), self.ngl.to_string(),
            ]);
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

        if self.prompt_cache_path.is_some() {
            args.extend([
                "--cache-prompt".into(),
            ]);
        }

        // 2026 Dynamic Context Management: Enable context shifting so context auto-expands & shifts on demand
        args.push("--context-shift".into());

        // Continuous batching: server immediately starts processing the next token
        // without waiting for a full batch to accumulate — eliminates the inter-token
        // stall that causes GPU/CPU to drop to 50% utilization after ~2 minutes.
        args.push("--cont-batching".into());

        // Metrics endpoint: expose /metrics so performance can be monitored.
        args.push("--metrics".into());

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

        let port = SERVER_PORT.load(std::sync::atomic::Ordering::Relaxed);
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

        // Spawn orphan watchdog: kill any stray llama-server processes every 30s
        let weak_process = Arc::downgrade(&self.process);
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
                if let Some(process_arc) = weak_process.upgrade() {
                    let guard = process_arc.lock().await;
                    let current_pid = guard.as_ref().and_then(|c| c.id());
                    drop(guard);
                    if current_pid == active_pid {
                        LlamaManager::kill_orphans(current_pid).await;
                    } else {
                        break; // Process changed or ended; terminate watchdog task
                    }
                } else {
                    break; // Manager was dropped / process released
                }
            }
        });

        Ok(())
    }

    /// Start sd-server with the GGUF image model.
    pub async fn start_sd_server(
        &self,
        binary_path: &Path,
        model_path: &Path,
        port: u16,
        threads: u32,
        is_low_vram: bool,
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

        // Apply CPU/GPU split memory budget configurations
        if is_low_vram {
            cmd.arg("--max-vram").arg("3.0"); // fit nicely in 4GB GPU
            cmd.arg("--auto-fit");
            cmd.arg("--vae-tiling");
            cmd.arg("--offload-to-cpu");
        } else {
            cmd.arg("--vae-tiling");
        }

        if let Some(ref progress) = on_progress {
            progress(10, "sd-server starting, loading weights into CPU/GPU split...");
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

        // Spawn watchdog
        let weak_process = Arc::downgrade(&self.process);
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
                if let Some(process_arc) = weak_process.upgrade() {
                    let guard = process_arc.lock().await;
                    let current_pid = guard.as_ref().and_then(|c| c.id());
                    drop(guard);
                    if current_pid == active_pid {
                        LlamaManager::kill_orphans(current_pid).await;
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
        });

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

        *guard = Some(child);
        Ok(())
    }

    async fn kill_orphans(exclude_pid: Option<u32>) {
        let (pids_to_kill, _) = tokio::task::spawn_blocking(move || {
            let mut sys = sysinfo::System::new_all();
            sys.refresh_processes();
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
            (pids, sys)
        }).await.unwrap_or((Vec::new(), sysinfo::System::new()));

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

    pub fn sd_binary_name(backend: &GpuBackend) -> &'static str {
        #[cfg(target_os = "windows")]
        {
            match backend {
                GpuBackend::Cuda => "sd-cli-cuda.exe",
                GpuBackend::Vulkan => "sd-cli-vulkan.exe",
                _ => "sd-cli-cpu.exe",
            }
        }
        #[cfg(target_os = "macos")]
        {
            "sd-cli"
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            match backend {
                GpuBackend::Vulkan => "sd-cli-vulkan",
                _ => "sd-cli",
            }
        }
    }

    pub fn sd_server_binary_name() -> &'static str {
        #[cfg(target_os = "windows")]
        { "sd-server.exe" }
        #[cfg(not(target_os = "windows"))]
        { "sd-server" }
    }

    async fn resolve_sd_release(&self, backend: &GpuBackend) -> (String, String) {
        if let Ok(resp) = self.client.get("https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/latest").send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(tag) = json["tag_name"].as_str() {
                        if let Some(assets) = json["assets"].as_array() {
                            let mut target_url = None;
                            for asset in assets {
                                if let (Some(name), Some(url)) = (asset["name"].as_str(), asset["browser_download_url"].as_str()) {
                                    let name_lower = name.to_lowercase();
                                    #[cfg(target_os = "windows")]
                                    {
                                        if name_lower.starts_with("sd-") && name_lower.contains("win") && name_lower.contains("x64") && name_lower.ends_with(".zip") {
                                            let is_cuda = matches!(backend, GpuBackend::Cuda | GpuBackend::Unknown) && name_lower.contains("cuda");
                                            let is_vulkan = matches!(backend, GpuBackend::Vulkan) && name_lower.contains("vulkan");
                                            let is_cpu = matches!(backend, GpuBackend::Metal) && name_lower.contains("cpu");
                                            if is_cuda || is_vulkan || is_cpu {
                                                target_url = Some(url.to_string());
                                                break;
                                            }
                                        }
                                    }
                                    #[cfg(target_os = "macos")]
                                    {
                                        if name_lower.starts_with("sd-") && name_lower.contains("darwin") && name_lower.contains("mac") && name_lower.contains("arm64") && name_lower.ends_with(".zip") {
                                            target_url = Some(url.to_string());
                                            break;
                                        }
                                    }
                                    #[cfg(target_os = "linux")]
                                    {
                                        if name_lower.starts_with("sd-") && name_lower.contains("linux") && name_lower.contains("x86_64") && name_lower.ends_with(".zip") {
                                            let is_vulkan = matches!(backend, GpuBackend::Vulkan) && name_lower.contains("vulkan");
                                            if is_vulkan {
                                                target_url = Some(url.to_string());
                                                break;
                                            }
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
        
        let fallback_url = match backend {
            GpuBackend::Cuda | GpuBackend::Unknown => "https://github.com/leejet/stable-diffusion.cpp/releases/download/master-796-2d0385b/sd-master-2d0385b-bin-win-cuda12-x64.zip",
            GpuBackend::Vulkan => "https://github.com/leejet/stable-diffusion.cpp/releases/download/master-796-2d0385b/sd-master-2d0385b-bin-win-vulkan-x64.zip",
            _ => "https://github.com/leejet/stable-diffusion.cpp/releases/download/master-796-2d0385b/sd-master-2d0385b-bin-win-cpu-x64.zip",
        };
        ("master-796-2d0385b".to_string(), fallback_url.to_string())
    }

    pub async fn ensure_sd_cli(
        &self,
        data_dir: &Path,
        backend: &GpuBackend,
        on_progress: impl Fn(f32, &str) + Send + 'static,
    ) -> Result<PathBuf, String> {
        let bin_dir = data_dir.join("binaries");
        let sd_bin_dir = bin_dir.join("stable-diffusion");
        tokio::fs::create_dir_all(&sd_bin_dir).await.map_err(|e| e.to_string())?;

        let binary_name = Self::sd_binary_name(backend);
        let cli_path = sd_bin_dir.join(binary_name);

        let needs_download = match tokio::fs::metadata(&cli_path).await {
            Ok(m) => m.len() < 1024,
            Err(_) => true,
        };

        if !needs_download {
            on_progress(100.0, "stable-diffusion-cpp binary already installed.");
            return Ok(cli_path);
        }

        let _permit = DOWNLOAD_SEMAPHORE.acquire().await.unwrap();

        if cli_path.exists() && tokio::fs::metadata(&cli_path).await.map(|m| m.len()).unwrap_or(0) >= 1024 {
            on_progress(100.0, "stable-diffusion-cpp binary already installed.");
            return Ok(cli_path);
        }

        on_progress(0.0, "Resolving stable-diffusion.cpp release...");
        let (tag_name, url) = self.resolve_sd_release(backend).await;
        let zip_name = url.split('/').last().unwrap_or("sd-cli.zip");
        let zip_path = sd_bin_dir.join(zip_name);

        on_progress(5.0, &format!("Downloading stable-diffusion.cpp {} ({:?})...", tag_name, backend));
        self.download_file(&url, &zip_path, |p| {
            on_progress(5.0 + (p * 0.8), &format!("Downloading stable-diffusion-cpp... {:.0}%", p));
        }).await?;

        on_progress(85.0, "Extracting stable-diffusion-cpp binary...");
        let zip_str = zip_path.to_string_lossy().replace("\\\\?\\", "");
        let sd_bin_str = sd_bin_dir.to_string_lossy().replace("\\\\?\\", "");

        let extract_ok = Self::extract_with_retry(&zip_str, &sd_bin_str).await;
        if !extract_ok {
            return Err(format!("Failed to extract stable-diffusion-cpp {}", zip_name));
        }

        let mut found_exe = None;
        if let Ok(mut entries) = tokio::fs::read_dir(&sd_bin_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let name = entry.file_name().to_string_lossy().to_string();
                let name_lower = name.to_lowercase();
                if name_lower == "sd-cli.exe" || name_lower == "sd.exe" || name_lower == "sd-cli" || name_lower == "sd" {
                    found_exe = Some(entry.path());
                    break;
                }
            }
        }

        if found_exe.is_none() {
            if let Ok(mut entries) = tokio::fs::read_dir(&sd_bin_dir).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    if entry.path().is_dir() {
                        if let Ok(mut sub_entries) = tokio::fs::read_dir(entry.path()).await {
                            while let Ok(Some(sub_entry)) = sub_entries.next_entry().await {
                                let name = sub_entry.file_name().to_string_lossy().to_string();
                                let name_lower = name.to_lowercase();
                                if name_lower == "sd-cli.exe" || name_lower == "sd.exe" || name_lower == "sd-cli" || name_lower == "sd" {
                                    found_exe = Some(sd_bin_dir.join(&name));
                                    let mut move_entries = tokio::fs::read_dir(entry.path()).await.map_err(|e| e.to_string())?;
                                    while let Ok(Some(me)) = move_entries.next_entry().await {
                                        let dest = sd_bin_dir.join(me.file_name());
                                        let _ = tokio::fs::rename(me.path(), dest).await;
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some(src_exe) = found_exe {
            if src_exe != cli_path {
                tokio::fs::rename(&src_exe, &cli_path).await
                    .map_err(|e| format!("Failed to rename stable-diffusion binary: {}", e))?;
            }
        } else if !cli_path.exists() {
            return Err(format!("Expected stable-diffusion binary not found after extraction: {}", binary_name));
        }

        let _ = tokio::fs::remove_file(&zip_path).await;
        let _ = tokio::fs::write(sd_bin_dir.join(".version"), &tag_name).await;

        on_progress(100.0, &format!("stable-diffusion-cpp {} installed.", tag_name));
        Ok(cli_path)
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

        Ok((PathBuf::new(), server_path))
    }

    async fn extract_with_retry(zip_str: &str, bin_str: &str) -> bool {
        let zip_path = PathBuf::from(zip_str);
        let bin_path = PathBuf::from(bin_str);
        
        for attempt in 0..5 {
            let zp = zip_path.clone();
            let bp = bin_path.clone();
            let result = tokio::task::spawn_blocking(move || -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
                let file = std::fs::File::open(&zp)?;
                let mut archive = zip::ZipArchive::new(file)?;
                
                for i in 0..archive.len() {
                    let mut file = archive.by_index(i)?;
                    let outpath = match file.enclosed_name() {
                        Some(path) => bp.join(path),
                        None => continue,
                    };
                    
                    if file.is_dir() {
                        std::fs::create_dir_all(&outpath)?;
                    } else {
                        if let Some(p) = outpath.parent() {
                            if !p.exists() {
                                std::fs::create_dir_all(&p)?;
                            }
                        }
                        let mut outfile = std::fs::File::create(&outpath)?;
                        std::io::copy(&mut file, &mut outfile)?;
                    }
                }
                Ok(())
            }).await;

            if let Ok(Ok(())) = result {
                return true;
            }

            if attempt < 4 {
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
    #[serde(default)]
    pub downloaded: u64,
    /// Preserved so meta.json is written correctly on resume.
    pub repo_id: Option<String>,
}

pub struct DownloadTask {
    pub is_paused: Arc<AtomicBool>,
    pub is_cancelled: Arc<AtomicBool>,
    pub handle: tokio::task::JoinHandle<()>,
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
        let mut path_guard = self.downloads_file_path.lock().await;
        if path_guard.is_some() {
            return;
        }
        let file_path = app_data_dir.join("models").join("downloads.json");
        *path_guard = Some(file_path.clone());
        drop(path_guard);

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
                let tmp_path = path.with_extension("tmp");
                let _ = tokio::fs::write(&tmp_path, content).await;
                let _ = tokio::fs::rename(&tmp_path, &path).await;
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
    on_progress: impl Fn(f32, u64, u64) + Send + Sync + 'static,
) -> Result<(), String> {
    use std::io::SeekFrom;
    use tokio::io::AsyncSeekExt;
    use tokio::io::AsyncWriteExt;

    // Use full browser User-Agent + TCP connection pooling for max CDN bandwidth
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .tcp_keepalive(std::time::Duration::from_secs(60))
        .pool_max_idle_per_host(32)
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;

    let dest_filename = dest.file_name().unwrap_or_default().to_string_lossy();
    let dest_part = dest.parent().unwrap_or(&dest).join(format!("{}.part", dest_filename));
    let disk_part_size = if dest_part.exists() {
        tokio::fs::metadata(&dest_part).await.map(|m| m.len()).unwrap_or(0)
    } else {
        if let Some(parent) = dest_part.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
        }
        tokio::fs::File::create(&dest_part).await.map_err(|e| e.to_string())?;
        0
    };

    let saved_downloaded = {
        let pd = state.persistent_downloads.lock().await;
        pd.get(&model_id).map(|p| p.downloaded).unwrap_or(0)
    };

    // Probe total size with automatic branch fallback (main -> master -> HEAD -> raw)
    let mut resolved_url = url.clone();
    let mut req = client.get(&resolved_url);
    if let Some(token) = state.get_token().await {
        req = req.header(AUTHORIZATION, format!("Bearer {}", token));
    }

    let mut head_resp = req.send().await.map_err(|e| e.to_string())?;

    if head_resp.status() == reqwest::StatusCode::NOT_FOUND {
        let fallbacks = if resolved_url.contains("/resolve/main/") {
            vec![
                resolved_url.replace("/resolve/main/", "/resolve/master/"),
                resolved_url.replace("/resolve/main/", "/resolve/HEAD/"),
                resolved_url.replace("/resolve/main/", "/raw/main/"),
                resolved_url.replace("/resolve/main/", "/raw/master/"),
            ]
        } else if resolved_url.contains("/resolve/master/") {
            vec![
                resolved_url.replace("/resolve/master/", "/resolve/main/"),
                resolved_url.replace("/resolve/master/", "/resolve/HEAD/"),
            ]
        } else {
            vec![]
        };

        for fallback in fallbacks {
            let mut alt_req = client.get(&fallback);
            if let Some(token) = state.get_token().await {
                alt_req = alt_req.header(AUTHORIZATION, format!("Bearer {}", token));
            }
            if let Ok(alt_resp) = alt_req.send().await {
                if alt_resp.status().is_success() {
                    resolved_url = fallback;
                    head_resp = alt_resp;
                    break;
                }
            }
        }
    }

    if !head_resp.status().is_success() {
        return Err(format!("Download failed ({}): {}", head_resp.status(), resolved_url));
    }

    let url = resolved_url;
    let total_size = head_resp.content_length().unwrap_or(0);

    // Calculate actual initial downloaded bytes.
    // Pre-allocation expands .part file to total_size on disk.
    // We must ignore disk_part_size if it matches total_size and use saved_downloaded instead.
    let initial_downloaded = if saved_downloaded > 0 && total_size > 0 && saved_downloaded < total_size {
        saved_downloaded
    } else if disk_part_size > 0 && total_size > 0 && disk_part_size < total_size {
        disk_part_size
    } else {
        0
    };

    // Save download persistence state
    {
        let mut pd = state.persistent_downloads.lock().await;
        pd.insert(model_id.clone(), PersistentDownload {
            model_id: model_id.clone(),
            filename: dest.file_name().unwrap_or_default().to_string_lossy().to_string(),
            url: url.clone(),
            total_size,
            downloaded: initial_downloaded,
            repo_id: repo_id.clone(),
        });
    }
    state.save_persistence().await;

    let on_progress_arc = Arc::new(on_progress);

    // Use 8 parallel worker connections for files > 32 MB
    let supports_range = total_size > 32 * 1024 * 1024;

    if supports_range {
        // Pre-allocate destination file size
        let file = tokio::fs::OpenOptions::new()
            .write(true)
            .open(&dest_part).await
            .map_err(|e| e.to_string())?;
        file.set_len(total_size).await.map_err(|e| e.to_string())?;
        drop(file);

        // Fixed 4 MB chunk size for dynamic work-stealing queue
        let chunk_size: u64 = 4 * 1024 * 1024;
        let total_chunks = (total_size + chunk_size - 1) / chunk_size;

        // Compute initial chunk index to resume cleanly without disk byte gaps
        let initial_chunk = initial_downloaded / chunk_size;
        let effective_initial_downloaded = initial_chunk * chunk_size;

        let next_chunk_index = Arc::new(std::sync::atomic::AtomicU64::new(initial_chunk));
        let downloaded_bytes = Arc::new(std::sync::atomic::AtomicU64::new(effective_initial_downloaded));

        let num_workers = 8;
        let mut tasks = Vec::new();

        let last_emit_arc = Arc::new(tokio::sync::Mutex::new(std::time::Instant::now()));

        for _ in 0..num_workers {
            let client_worker = client.clone();
            let url_worker = url.clone();
            let dest_part_worker = dest_part.clone();
            let token_opt = state.get_token().await;
            let is_paused_w = is_paused.clone();
            let is_cancelled_w = is_cancelled.clone();
            let downloaded_bytes_w = downloaded_bytes.clone();
            let next_chunk_w = next_chunk_index.clone();
            let on_progress_w = on_progress_arc.clone();
            let last_emit_w = last_emit_arc.clone();

            let state_worker = state.clone();
            let mid_worker = model_id.clone();

            tasks.push(tokio::spawn(async move {
                let mut file_w = tokio::fs::OpenOptions::new()
                    .write(true)
                    .open(&dest_part_worker).await
                    .map_err(|e| e.to_string())?;

                loop {
                    if is_cancelled_w.load(Ordering::SeqCst) || is_paused_w.load(Ordering::SeqCst) {
                        return Err("Cancelled or paused".to_string());
                    }

                    let chunk_idx = next_chunk_w.fetch_add(1, Ordering::SeqCst);
                    if chunk_idx >= total_chunks {
                        break;
                    }

                    let start = chunk_idx * chunk_size;
                    let end = ((chunk_idx + 1) * chunk_size - 1).min(total_size - 1);

                    // Fetch chunk with per-chunk retry logic (up to 3 retries)
                    let mut attempts = 0;
                    let mut bytes_data = None;

                    while attempts < 3 {
                        if is_cancelled_w.load(Ordering::SeqCst) || is_paused_w.load(Ordering::SeqCst) {
                            return Err("Cancelled or paused".to_string());
                        }

                        let mut req_w = client_worker.get(&url_worker)
                            .header(RANGE, format!("bytes={}-{}", start, end));
                        if let Some(ref t) = token_opt {
                            req_w = req_w.header(AUTHORIZATION, format!("Bearer {}", t));
                        }

                        match tokio::time::timeout(std::time::Duration::from_secs(30), req_w.send()).await {
                            Ok(Ok(resp)) if resp.status().is_success() || resp.status() == reqwest::StatusCode::PARTIAL_CONTENT => {
                                match tokio::time::timeout(std::time::Duration::from_secs(30), resp.bytes()).await {
                                    Ok(Ok(b)) => {
                                        bytes_data = Some(b);
                                        break;
                                    }
                                    _ => {}
                                }
                            }
                            _ => {}
                        }

                        attempts += 1;
                        if attempts < 3 {
                            tokio::time::sleep(std::time::Duration::from_millis(500 * attempts as u64)).await;
                        }
                    }

                    let chunk_bytes = match bytes_data {
                        Some(b) => b,
                        None => return Err(format!("Chunk {} (bytes {}-{}) failed after retries", chunk_idx, start, end)),
                    };

                    file_w.seek(SeekFrom::Start(start)).await.map_err(|e| e.to_string())?;
                    file_w.write_all(&chunk_bytes).await.map_err(|e| e.to_string())?;

                    let total_d = downloaded_bytes_w.fetch_add(chunk_bytes.len() as u64, Ordering::SeqCst) + chunk_bytes.len() as u64;

                    if total_size > 0 {
                        let mut last = last_emit_w.lock().await;
                        if last.elapsed().as_millis() >= 150 {
                            *last = std::time::Instant::now();
                            drop(last);
                            let pct = (total_d as f32 / total_size as f32) * 100.0;
                            on_progress_w(pct.min(100.0), total_d, total_size);

                            {
                                let mut pd = state_worker.persistent_downloads.lock().await;
                                if let Some(item) = pd.get_mut(&mid_worker) {
                                    item.downloaded = total_d;
                                }
                            }
                        }
                    }
                }

                file_w.flush().await.map_err(|e| e.to_string())?;
                Ok(())
            }));
        }

        let results = futures::future::join_all(tasks).await;
        for r in results {
            match r {
                Ok(Ok(())) => {},
                Ok(Err(e)) => {
                    if is_paused.load(Ordering::SeqCst) {
                        return Err("Download paused".to_string());
                    }
                    if is_cancelled.load(Ordering::SeqCst) {
                        let _ = tokio::fs::remove_file(&dest_part).await;
                        return Err("Download cancelled".to_string());
                    }
                    return Err(e);
                }
                Err(e) => return Err(format!("Worker thread panicked: {}", e)),
            }
        }
    } else {
        // Single-stream fallback
        let file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&dest_part).await
            .map_err(|e| e.to_string())?;

        let mut downloaded = initial_downloaded;
        let mut req_s = client.get(&url);
        if downloaded > 0 {
            req_s = req_s.header(RANGE, format!("bytes={}-", downloaded));
        }
        if let Some(token) = state.get_token().await {
            req_s = req_s.header(AUTHORIZATION, format!("Bearer {}", token));
        }

        let mut response = req_s.send().await.map_err(|e| e.to_string())?;
        let mut writer = tokio::io::BufWriter::with_capacity(4 * 1024 * 1024, file);
        let mut last_emit = std::time::Instant::now();

        while !is_cancelled.load(Ordering::SeqCst) {
            if is_paused.load(Ordering::SeqCst) {
                let _ = writer.flush().await;
                return Err("Download paused".to_string());
            }

            let chunk_res = tokio::time::timeout(std::time::Duration::from_secs(30), response.chunk()).await;
            let chunk = match chunk_res {
                Ok(Ok(Some(c))) => c,
                Ok(Ok(None)) => break,
                Ok(Err(e)) => return Err(e.to_string()),
                Err(_) => return Err("Connection timeout".to_string()),
            };

            writer.write_all(&chunk).await.map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;

            if total_size > 0 && last_emit.elapsed().as_millis() > 250 {
                on_progress_arc((downloaded as f32 / total_size as f32) * 100.0, downloaded, total_size);
                last_emit = std::time::Instant::now();
                {
                    let mut pd = state.persistent_downloads.lock().await;
                    if let Some(item) = pd.get_mut(&model_id) {
                        item.downloaded = downloaded;
                    }
                }
            }
        }
        writer.flush().await.map_err(|e| e.to_string())?;
    }

    if is_cancelled.load(Ordering::SeqCst) {
        let _ = tokio::fs::remove_file(&dest_part).await;
        return Err("Download cancelled".to_string());
    }

    // Clean up persistence entry on completion
    { state.persistent_downloads.lock().await.remove(&model_id); }
    state.save_persistence().await;

    on_progress_arc(100.0, total_size, total_size);

    tokio::fs::rename(&dest_part, &dest).await
        .map_err(|e| format!("Failed to finalise download: {}", e))?;

    if let Some(rid) = repo_id {
        let author = rid.split('/').next().unwrap_or("Hugging Face").to_string();
        let fname = dest.file_name().unwrap_or_default().to_string_lossy().to_string();
        let meta_path = dest.parent().unwrap_or(&dest).join(format!("{}.meta.json", fname));
        let meta = serde_json::json!({ "author": author, "repo_id": rid });
        let _ = tokio::fs::write(&meta_path, meta.to_string()).await.ok();
    }

    invalidate_local_models_cache();
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
    /// True when an integrated GPU (APU / Intel iGPU) was detected.
    /// The frontend uses this to show a stability warning.
    pub is_igpu: bool,
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
    pub max_context_length: u32,
    pub schedule_message: String,
    // Version
    pub llamacpp_version: String,
}

static GGUF_META_CACHE: std::sync::LazyLock<std::sync::Mutex<std::collections::HashMap<String, GgufMetadata>>> = std::sync::LazyLock::new(|| {
    std::sync::Mutex::new(std::collections::HashMap::new())
});

static HW_SNAPSHOT_CACHE: std::sync::LazyLock<tokio::sync::Mutex<Option<HardwareSnapshot>>> = std::sync::LazyLock::new(|| {
    tokio::sync::Mutex::new(None)
});

fn classify_model_namespace(
    filename: &str,
    repo_id: Option<&str>,
    ext: &str,
) -> &'static str {
    let lname = filename.to_lowercase();
    let repo_lower = repo_id.map(|r| r.to_lowercase()).unwrap_or_default();
    let search_str = format!("{} {}", lname, repo_lower);

    // 1. VAE
    let is_vae = lname == "ae.safetensors"
        || lname.starts_with("ae.")
        || lname == "vae.safetensors"
        || lname.starts_with("vae.")
        || (lname.ends_with("-vae.safetensors") && !lname.contains("text"));
    if is_vae {
        return "vae";
    }

    // 2. Text Encoder
    let is_text_encoder = lname.starts_with("clip_l")
        || lname.starts_with("clip_g")
        || lname.starts_with("clip-l")
        || lname.starts_with("clip-g")
        || lname.starts_with("t5xxl")
        || lname.starts_with("t5-xxl")
        || lname.starts_with("t5_xxl")
        || search_str.contains("text_encoder")
        || search_str.contains("text-encoder");
    if is_text_encoder {
        return "text_encoders";
    }

    // 3. Projector
    let is_projector = lname.contains("mmproj")
        || search_str.contains("projector");
    if is_projector {
        return "projectors";
    }

    // 4. Diffusion / Image
    let is_diffusion = ext == "ckpt"
        || search_str.contains("flux")
        || search_str.contains("diffusion")
        || search_str.contains("diffus")
        || search_str.contains("sdxl")
        || search_str.contains("sd_")
        || search_str.contains("sd3")
        || search_str.contains("sd-")
        || search_str.contains("sd1")
        || search_str.contains("sd2")
        || search_str.contains("sd5")
        || search_str.contains("stable")
        || search_str.contains("turbo")
        || search_str.contains("inpainting")
        || search_str.contains("pix2pix")
        || search_str.contains("text-to-image")
        || search_str.contains("image-gen")
        || search_str.contains("midjourney")
        || search_str.contains("playground")
        || search_str.contains("controlnet")
        || search_str.contains("wan")
        || search_str.contains("hunyuan")
        || search_str.contains("kolors")
        || search_str.contains("cogvideo")
        || search_str.contains("lora")
        || search_str.contains("v1-5")
        || search_str.contains("v2-1");
    if is_diffusion {
        return "diffusion";
    }

    // 5. Default
    "llm"
}

pub async fn run_migration_worker(app: &AppHandle) {
    let app_dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return,
    };
    let models_dir = app_dir.join("models");

    // Make sure name-spaced folders exist
    let namespaces = &["llm", "diffusion", "vae", "text_encoders", "projectors"];
    for ns in namespaces {
        let ns_dir = models_dir.join(ns).join("unorganized");
        if !ns_dir.exists() {
            let _ = tokio::fs::create_dir_all(&ns_dir).await;
        }
    }

    if !models_dir.exists() {
        return;
    }

    let mut entries = match tokio::fs::read_dir(&models_dir).await {
        Ok(e) => e,
        Err(_) => return,
    };

    const SUPPORTED_EXTENSIONS: &[&str] = &["gguf", "safetensors", "bin", "ckpt", "pt", "onnx", "pth", "engine"];

    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') || name == ".nyx_offload" || name.ends_with(".part") || name.ends_with(".meta.json") {
            continue;
        }

        // Skip the namespaced directories themselves
        if path.is_dir() && namespaces.contains(&name.as_str()) {
            continue;
        }

        // Determine if it is a legacy model file/folder that needs to be moved
        let mut is_model = false;
        let mut size_bytes = 0;
        let mut ext = String::new();

        if path.is_dir() {
            let (dir_size, primary_ext, has_weights, _) = scan_folder_fast(&path, 0).await;
            if has_weights {
                is_model = true;
                size_bytes = dir_size;
                ext = primary_ext;
            }
        } else if path.is_file() {
            let file_ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
            if SUPPORTED_EXTENSIONS.contains(&file_ext.as_str()) {
                is_model = true;
                size_bytes = entry.metadata().await.map(|m| m.len()).unwrap_or(0);
                ext = file_ext;
            }
        }

        if !is_model {
            continue;
        }

        // 1. Read metadata if companion meta files exist
        let stem = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let meta_candidates = vec![
            models_dir.join(format!("{}.meta.json", name)),
            models_dir.join(format!("{}.meta.json", stem)),
            models_dir.join(format!("{}.gguf.meta.json", name)),
            models_dir.join(format!("{}.gguf.meta.json", stem)),
        ];

        let mut repo_id_opt: Option<String> = None;
        let mut found_meta_path = None;

        for meta_path in &meta_candidates {
            if let Ok(content) = tokio::fs::read_to_string(meta_path).await {
                if let Ok(j) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(rid) = j.get("repo_id").and_then(|v| v.as_str()) {
                        repo_id_opt = Some(rid.to_string());
                    }
                    found_meta_path = Some(meta_path.clone());
                    break;
                }
            }
        }

        // 2. Parse GGUF header if GGUF
        let gguf_meta = if ext == "gguf" && path.is_file() {
            tokio::task::spawn_blocking({
                let p = path.clone();
                move || parse_gguf_metadata(&p).ok()
            }).await.unwrap_or(None)
        } else {
            None
        };

        // 3. Classify namespace
        let namespace = classify_model_namespace(&name, repo_id_opt.as_deref(), &ext);

        // 4. Move file/folder to models/{namespace}/unorganized/{filename}
        let dest_dir = models_dir.join(namespace).join("unorganized");
        let dest_path = dest_dir.join(&name);

        info!("[NYX Organizer] Migrating legacy model '{}' from root models/ to {:?}", name, dest_path);

        let move_ok = if path.is_dir() {
            tokio::fs::rename(&path, &dest_path).await.is_ok()
        } else {
            tokio::fs::rename(&path, &dest_path).await.is_ok()
        };

        if move_ok {
            // Also move companion meta files to the same location
            if let Some(meta_path) = found_meta_path {
                let meta_dest_name = meta_path.file_name().unwrap_or_default();
                let meta_dest_path = dest_dir.join(meta_dest_name);
                let _ = tokio::fs::rename(&meta_path, &meta_dest_path).await;
            }

            // 5. Insert record into database
            if let Some(pool) = app.try_state::<sqlx::SqlitePool>() {
                let display_name = if let Some(ref rid) = repo_id_opt {
                    let repo_name = rid.split('/').last().unwrap_or(rid).to_string();
                    let fn_lower = name.to_lowercase();
                    let is_generic = fn_lower == "model.safetensors"
                        || fn_lower == "model.gguf"
                        || fn_lower == "model.bin"
                        || fn_lower == "pytorch_model.bin"
                        || fn_lower == "consolidated.00.pth"
                        || fn_lower.starts_with("model-0000")
                        || fn_lower.starts_with("model.safetensors-0000")
                        || fn_lower == "model_opt.onnx"
                        || fn_lower == "model.onnx";
                    if is_generic { repo_name } else { name.clone() }
                } else {
                    name.clone()
                };

                let context_length = gguf_meta.as_ref().and_then(|m| m.context_length);
                let architecture = gguf_meta.as_ref().and_then(|m| m.architecture.clone());
                let has_mmproj = repo_id_opt.as_ref().map_or(false, |rid| {
                    rid.to_lowercase().contains("mmproj") || name.to_lowercase().contains("mmproj")
                });

                let model_type = if ext == "onnx" {
                    "onnx".to_string()
                } else if namespace == "diffusion" {
                    "text-to-image".to_string()
                } else if ext == "safetensors" || ext == "pt" || ext == "pth" || ext == "bin" {
                    "pytorch".to_string()
                } else if has_mmproj || name.to_lowercase().contains("vl") || name.to_lowercase().contains("vision") {
                    "vision".to_string()
                } else {
                    "text-generation".to_string()
                };

                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64;

                let id = format!("{}/unorganized/{}", namespace, name);
                let absolute_path = dest_path.to_string_lossy().to_string();

                let _ = sqlx::query(
                    "INSERT INTO local_models (id, name, repo_id, filename, file_path, size_bytes, model_type, architecture, context_length, has_mmproj, downloaded_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                        name=excluded.name,
                        repo_id=excluded.repo_id,
                        filename=excluded.filename,
                        file_path=excluded.file_path,
                        size_bytes=excluded.size_bytes,
                        model_type=excluded.model_type,
                        architecture=excluded.architecture,
                        context_length=excluded.context_length,
                        has_mmproj=excluded.has_mmproj,
                        downloaded_at=excluded.downloaded_at"
                )
                .bind(&id)
                .bind(&display_name)
                .bind(repo_id_opt.as_ref())
                .bind(&name)
                .bind(&absolute_path)
                .bind(size_bytes as i64)
                .bind(&model_type)
                .bind(architecture.as_ref())
                .bind(context_length.map(|c| c as i32))
                .bind(if has_mmproj { 1i32 } else { 0i32 })
                .bind(now)
                .execute(&*pool)
                .await;
            }
        }
    }
}

pub async fn resolve_model_path(
    app: &AppHandle,
    model_id: &str,
) -> Option<PathBuf> {
    let app_dir = app.path().app_data_dir().ok()?;
    let models_dir = app_dir.join("models");

    // 1. Direct join (handles relative paths like "llm/unorganized/model.gguf")
    let p = models_dir.join(model_id);
    if p.exists() {
        return Some(p);
    }

    // 2. Try namespaces
    for ns in &["llm", "diffusion", "vae", "text_encoders", "projectors"] {
        let p = models_dir.join(ns).join(model_id);
        if p.exists() {
            return Some(p);
        }
        let p = models_dir.join(ns).join("unorganized").join(model_id);
        if p.exists() {
            return Some(p);
        }
    }

    // 3. Query the database
    if let Some(pool) = app.try_state::<sqlx::SqlitePool>() {
        use crate::db::models::LocalModel;
        if let Ok(Some(model)) = sqlx::query_as::<_, LocalModel>(
            "SELECT * FROM local_models WHERE id = ? OR filename = ?"
        )
        .bind(model_id)
        .bind(model_id)
        .fetch_optional(&*pool)
        .await
        {
            let p = PathBuf::from(&model.file_path);
            if p.exists() {
                return Some(p);
            }
            let p_rel = models_dir.join(&model.file_path);
            if p_rel.exists() {
                return Some(p_rel);
            }
        }
    }

    None
}

#[tauri::command]
pub async fn analyze_hardware(
    app: AppHandle,
    model_id: String,
    context_size: Option<u32>,
) -> Result<HardwareAnalysisResult, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let model_path = resolve_model_path(&app, &model_id).await
        .ok_or_else(|| format!("Model '{}' not found. Please download it first.", model_id))?;

    let meta = tokio::fs::metadata(&model_path).await.map_err(|e| e.to_string())?;
    let model_size_gb = meta.len() as f32 / (1024.0 * 1024.0 * 1024.0);
    let gguf_meta = {
        let cached_meta = {
            let cache = GGUF_META_CACHE.lock().unwrap();
            cache.get(&model_id).cloned()
        };
        if let Some(cached) = cached_meta {
            Some(cached)
        } else {
            let path_clone = model_path.clone();
            let parsed = tokio::task::spawn_blocking(move || {
                parse_gguf_metadata(&path_clone).ok()
            }).await.unwrap_or(None);
            if let Some(ref p) = parsed {
                let mut cache = GGUF_META_CACHE.lock().unwrap();
                cache.insert(model_id.clone(), p.clone());
            }
            parsed
        }
    };
    
    let ctx = context_size.unwrap_or_else(|| gguf_meta.as_ref().and_then(|m| m.context_length).unwrap_or(32768));
    let total_layers = estimate_total_layers(gguf_meta.as_ref(), model_size_gb);

    // Try to use the actual server binary for accurate VRAM (it knows all drivers).
    let mut cache = HW_SNAPSHOT_CACHE.lock().await;
    let hw_snapshot = if let Some(cached) = cache.as_ref() {
        cached.clone()
    } else {
        let hw = HardwareSnapshot::collect().await;
        *cache = Some(hw.clone());
        hw
    };

    let decision = compute_ngl_decision(&hw_snapshot, gguf_meta.as_ref(), model_size_gb, ctx);
    let layers_on_gpu = if decision.ngl >= total_layers { total_layers } else { decision.ngl };
    let layers_on_cpu = total_layers.saturating_sub(layers_on_gpu);

    Ok(HardwareAnalysisResult {
        gpu_name: hw_snapshot.gpu_name,
        gpu_backend: format!("{:?}", hw_snapshot.gpu_backend),
        vram_total_mb: hw_snapshot.vram_total_mb,
        vram_available_mb: hw_snapshot.vram_available_mb,
        has_dedicated_gpu: hw_snapshot.has_dedicated_gpu,
        is_igpu: hw_snapshot.is_igpu,
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
            // OS mmap memory mapping maps the GGUF model file into system page cache working set
            let model_ram_mb = model_size_gb * 1024.0;
            (model_ram_mb + cpu_kv_mb) as u64 + 256
        },
        fully_gpu: decision.fully_gpu,
        hybrid: decision.hybrid,
        recommended_cpu_threads: decision.recommended_cpu_threads,
        max_context_length: gguf_meta.as_ref().and_then(|m| m.context_length).unwrap_or(131072),
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
    _gpu_layers: Option<u32>,
) -> Result<HardwareAnalysisResult, String> {
    analyze_hardware(app, model_id, context_size).await
}

#[tauri::command]
pub async fn download_local_model(app: AppHandle) -> Result<(), String> {
    let _permit = DOWNLOAD_SEMAPHORE.try_acquire()
        .map_err(|_| "A download is already in progress".to_string())?;

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    // Clean up any legacy starter model if it exists
    let legacy_starter_model = app_dir.join("models").join("qwen2.5-0.5b-instruct-q4_k_m.gguf");
    if legacy_starter_model.exists() {
        let _ = tokio::fs::remove_file(&legacy_starter_model).await;
        info!("[download_local_model] Cleaned up legacy starter model: {:?}", legacy_starter_model);
    }

    // Detect GPU backend first so we download the right binary.
    let hw = HardwareSnapshot::collect().await;
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

pub static ACTIVE_LOCAL_IMAGE_MODEL: std::sync::LazyLock<std::sync::Mutex<Option<String>>> = std::sync::LazyLock::new(|| {
    std::sync::Mutex::new(None)
});

pub fn get_active_local_image_model() -> Option<String> {
    ACTIVE_LOCAL_IMAGE_MODEL.lock().unwrap().clone()
}

pub static ACTIVE_SERVER_CTX_SIZE: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

pub static ACTIVE_LOCAL_LLM_MODEL: std::sync::LazyLock<std::sync::Mutex<Option<String>>> = std::sync::LazyLock::new(|| {
    std::sync::Mutex::new(None)
});

pub fn get_active_local_llm_model() -> Option<String> {
    ACTIVE_LOCAL_LLM_MODEL.lock().unwrap().clone()
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
    split_mode: Option<String>,
    tensor_split: Option<String>,
) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let models_dir = app_dir.join("models");
    let model_path = match resolve_model_path(&app, &model_id).await {
        Some(p) => p,
        None => {
            let mut p = models_dir.join(&model_id);
            if !p.exists() {
                for ext in &["gguf", "safetensors", "pt", "pth", "bin", "ckpt", "onnx"] {
                    let alt = models_dir.join(format!("{}.{}", model_id, ext));
                    if alt.exists() {
                        p = alt;
                        break;
                    }
                }
            }
            p
        }
    };

    if !model_path.exists() {
        return Err(format!("Model '{}' not found in {:?}. Please download it first.", model_id, models_dir));
    }

    let explicit_draft = if let Some(ref d_id) = draft_model_id.as_ref().filter(|id| !id.trim().is_empty()) {
        resolve_model_path(&app, d_id).await
    } else {
        None
    };

    // Try to find an mmproj file for this model
    let mut mmproj_path = None;
    let target_meta_path = model_path.with_extension("gguf.meta.json");
    let target_repo_id = if let Ok(content) = tokio::fs::read_to_string(&target_meta_path).await {
        if let Ok(j) = serde_json::from_str::<serde_json::Value>(&content) {
            j.get("repo_id").and_then(|v| v.as_str()).map(|s| s.to_string())
        } else { None }
    } else { None };

    let mut candidate_paths = Vec::new();
    let search_dirs = vec![
        app_dir.join("models"),
        app_dir.join("models").join("projectors"),
        app_dir.join("models").join("projectors").join("unorganized"),
    ];
    for dir in search_dirs {
        if let Ok(mut entries) = tokio::fs::read_dir(dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.contains("mmproj") && name.ends_with(".gguf") {
                    candidate_paths.push(entry.path());
                }
            }
        }
    }

    for path in candidate_paths {
        let meta_path = path.with_extension("gguf.meta.json");
        if let Ok(content) = tokio::fs::read_to_string(&meta_path).await {
            if let Ok(j) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(repo_id) = j.get("repo_id").and_then(|v| v.as_str()) {
                    if Some(repo_id.to_string()) == target_repo_id {
                        mmproj_path = Some(path);
                        break;
                    }
                }
            }
        }
    }

    let ctx = context_size.unwrap_or(0);
    let is_auto_ctx = ctx == 0;

    // --- Non-GGUF Native Model Handler ---
    // All extensions other than .gguf (and folders containing PyTorch/Safetensors/config.json) cannot be loaded by llama-server.exe.
    // We register them as active native engines and emit llm-server-ready immediately.
    // This covers: .safetensors/.ckpt/.pt/.pth (PyTorch diffusion/vision), .onnx (ONNX runtime),
    // .bin (HuggingFace serialised weights or old GGML), and model folders.
    let name_lower = model_id.to_lowercase();
    let ext_lower = model_path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();

    let is_directory_model = model_path.is_dir();
    let is_native_non_gguf = is_directory_model
        || ext_lower == "safetensors"
        || ext_lower == "ckpt"
        || ext_lower == "pt"
        || ext_lower == "pth"
        || ext_lower == "onnx"
        || ext_lower == "bin";

    let is_image_by_name = name_lower.contains("flux")
        || name_lower.contains("diffusion") || name_lower.contains("diffus")
        || name_lower.contains("sdxl") || name_lower.contains("sd_")
        || name_lower.contains("sd3") || name_lower.contains("sd-") || name_lower.contains("sd1") || name_lower.contains("sd2") || name_lower.contains("sd5")
        || name_lower.contains("stable") || name_lower.contains("turbo")
        || name_lower.contains("inpainting") || name_lower.contains("pix2pix")
        || name_lower.contains("text-to-image") || name_lower.contains("image-gen")
        || name_lower.contains("midjourney") || name_lower.contains("playground")
        || name_lower.contains("wan") || name_lower.contains("hunyuan")
        || name_lower.contains("kolors") || name_lower.contains("cogvideo")
        || name_lower.contains("controlnet") || name_lower.contains("lora")
        || name_lower.contains("v1-5") || name_lower.contains("v2-1")
        || name_lower.contains("text_encoder") || name_lower.contains("text-encoder")
        || name_lower.contains("vae") || name_lower.contains("transformer");

    // Read companion meta.json file if available to extract repo_id and pipeline_tag
    let mut repo_id_from_meta: Option<String> = None;
    let mut pipeline_tag_from_meta: Option<String> = None;
    let target_meta_path = models_dir.join(format!("{}.meta.json", model_id));
    let alt_meta_path = model_path.with_extension("meta.json");
    let alt_gguf_meta_path = model_path.with_extension("gguf.meta.json");

    for mp in &[target_meta_path, alt_meta_path, alt_gguf_meta_path] {
        if let Ok(content) = tokio::fs::read_to_string(mp).await {
            if let Ok(j) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(rid) = j.get("repo_id").and_then(|v| v.as_str()) {
                    repo_id_from_meta = Some(rid.to_string());
                }
                if let Some(ptag) = j.get("pipeline_tag").and_then(|v| v.as_str()) {
                    pipeline_tag_from_meta = Some(ptag.to_string());
                }
            }
        }
    }

    let is_image_by_meta = pipeline_tag_from_meta.as_deref() == Some("text-to-image")
        || pipeline_tag_from_meta.as_deref() == Some("image-to-image");

    let is_image_by_index = model_path.is_dir() && (model_path.join("model_index.json").exists() || model_path.parent().map_or(false, |p| p.join("model_index.json").exists()));
    let is_onnx_model = ext_lower == "onnx";
    
    let gguf_meta = if ext_lower == "gguf" {
        let cached_meta = {
            let cache = GGUF_META_CACHE.lock().unwrap();
            cache.get(&model_id).cloned()
        };
        if let Some(cached) = cached_meta {
            Some(cached)
        } else {
            let path_clone = model_path.clone();
            let parsed = tokio::task::spawn_blocking(move || {
                parse_gguf_metadata(&path_clone).ok()
            }).await.unwrap_or(None);
            if let Some(ref p) = parsed {
                let mut cache = GGUF_META_CACHE.lock().unwrap();
                cache.insert(model_id.clone(), p.clone());
            }
            parsed
        }
    } else {
        None
    };

    // If ctx is 0 (auto), use detected GGUF context length or default to 32768
    let effective_ctx = if ctx == 0 { gguf_meta.as_ref().and_then(|m| m.context_length).unwrap_or(32768) } else { ctx };

    let is_gguf_image_model = if ext_lower == "gguf" {
        if let Some(ref meta) = gguf_meta {
            if let Some(ref arch) = meta.architecture {
                let arch_lower = arch.to_lowercase();
                arch_lower == "diffusion" || arch_lower == "flux"
            } else {
                is_image_by_name || is_image_by_meta
            }
        } else {
            is_image_by_name || is_image_by_meta
        }
    } else {
        false
    };

    let is_image_model = (is_native_non_gguf && (ext_lower == "ckpt" || is_image_by_name || is_image_by_meta || is_image_by_index))
        || is_gguf_image_model;

    let (engine_label, model_type_str) = if is_onnx_model {
        ("ONNX Runtime Engine", "onnx")
    } else if is_gguf_image_model {
        ("Native GGUF Diffusion Engine", "text-to-image")
    } else if is_image_model {
        ("Local Diffusion Engine", "text-to-image")
    } else if is_native_non_gguf {
        ("PyTorch Native Engine", "pytorch")
    } else {
        // GGUF — handled below by llama-server
        ("", "")
    };

    if is_image_model {
        info!("[LocalOrchestrator] Model '{}' identified as image model ({}) → {}.", model_id, ext_lower, engine_label);
        {
            let mut active_img = ACTIVE_LOCAL_IMAGE_MODEL.lock().unwrap();
            *active_img = Some(model_id.clone());
        }
        let mut sd_port = 0;
        if is_gguf_image_model {
            let _ = app.emit("llm-server-loading", serde_json::json!({
                "elapsed_secs": 0,
                "status": "Initializing Native GGUF Diffusion Engine..."
            }));
            let hw = HardwareSnapshot::collect().await;
            let sd_downloader = Downloader::new();
            let app_clone = app.clone();
            sd_downloader.ensure_sd_cli(&app_dir, &hw.gpu_backend, move |p, s| {
                let _ = app_clone.emit("llm-download-progress", serde_json::json!({
                    "progress": p, "status": s
                }));
            }).await?;

            sd_port = find_free_port();
            SERVER_PORT.store(sd_port, std::sync::atomic::Ordering::Relaxed);

            let is_low_vram = hw.profile == HardwareProfile::Vram4GbSys16Gb 
                || hw.vram_total_mb <= 4608;

            let threads = cpu_threads.unwrap_or_else(|| {
                if hw.cpu_physical_cores > 0 { hw.cpu_physical_cores.min(8) } else { 4 }
            });

            let binary_path = app_dir.join("binaries").join("stable-diffusion").join(Downloader::sd_server_binary_name());
            
            let app_handle = app.clone();
            let on_progress = move |pct: u32, msg: &str| {
                let _ = app_handle.emit("llm-server-loading", serde_json::json!({
                    "elapsed_secs": 0,
                    "status": msg.to_string(),
                    "progress_percent": pct,
                }));
            };

            manager.start_sd_server(&binary_path, &model_path, sd_port, threads, is_low_vram, Some(on_progress)).await?;
        } else {
            SERVER_PORT.store(0, std::sync::atomic::Ordering::Relaxed);
            let _ = app.emit("llm-server-loading", serde_json::json!({
                "elapsed_secs": 0,
                "status": "Initializing Local Diffusion Engine ..."
            }));
        }

        let model_size_gb = tokio::fs::metadata(&model_path).await
            .map(|m| m.len() as f32 / (1024.0 * 1024.0 * 1024.0))
            .unwrap_or(0.0);

        let _ = app.emit("vram-decision", serde_json::json!({
            "ngl": 99,
            "fully_gpu": true,
            "hybrid": false,
            "message": format!("⚡ {} active ({:.1} GB)", engine_label, model_size_gb),
            "estimated_vram_mb": (model_size_gb * 1024.0) as u64,
            "vram_available_mb": 8192,
            "gpu_name": "Local GPU",
            "model_size_gb": model_size_gb,
            "model_type": "text-to-image",
        }));

        let _ = app.emit("llm-server-ready", serde_json::json!({
            "status": format!("{} Active", engine_label),
            "port": sd_port,
            "model_id": model_id,
            "model_type": "text-to-image",
        }));

        return Ok(());
    } else if is_native_non_gguf {
        info!("[LocalOrchestrator] Model '{}' identified as native non-GGUF text model ({}) → {}.", model_id, ext_lower, engine_label);

        let native_port = find_free_port();
        SERVER_PORT.store(native_port, std::sync::atomic::Ordering::Relaxed);

        let app_handle = app.clone();
        let _ = app.emit("llm-server-loading", serde_json::json!({
            "elapsed_secs": 0,
            "status": format!("Launching {} on port {} ...", engine_label, native_port)
        }));

        let script_path = app_dir.join("binaries").join("nyx_native_server.py");
        if let Some(parent) = script_path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        let source_script = include_str!("nyx_native_server.py");
        let _ = tokio::fs::write(&script_path, source_script).await;

        let on_progress = move |pct: u32, msg: &str| {
            let _ = app_handle.emit("llm-server-loading", serde_json::json!({
                "elapsed_secs": 0,
                "status": msg.to_string(),
                "progress_percent": pct,
            }));
        };

        manager.start_native_python_server(&model_path, native_port, &script_path, gpu_layers, cpu_threads, repo_id_from_meta.as_deref(), Some(on_progress)).await?;

        let model_size_gb = tokio::fs::metadata(&model_path).await
            .map(|m| m.len() as f32 / (1024.0 * 1024.0 * 1024.0))
            .unwrap_or(0.0);

        let _ = app.emit("vram-decision", serde_json::json!({
            "ngl": 99,
            "fully_gpu": true,
            "hybrid": false,
            "message": format!("⚡ {} active on port {} ({:.1} GB)", engine_label, native_port, model_size_gb),
            "estimated_vram_mb": (model_size_gb * 1024.0) as u64,
            "vram_available_mb": 8192,
            "gpu_name": "Local GPU",
            "model_size_gb": model_size_gb,
            "model_type": model_type_str,
        }));

        let _ = app.emit("llm-server-ready", serde_json::json!({
            "status": format!("{} Active", engine_label),
            "port": native_port,
            "model_id": model_id,
            "model_type": model_type_str,
        }));

        return Ok(());
    }

    // --- Step 1: Detect hardware and pick the right binary ---
    // We check for both CUDA and Vulkan binaries on disk.
    let cuda_path = app_dir.join("binaries").join("llama-server-cuda.exe");
    let vulkan_path = app_dir.join("binaries").join("llama-server-vulkan.exe");

    // Collect hardware snapshot using whichever binary is available.
    let _server_for_detection = if cuda_path.exists() { Some(cuda_path.clone()) }
                               else if vulkan_path.exists() { Some(vulkan_path.clone()) }
                               else { None };

    let hw = HardwareSnapshot::collect().await;

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
        let _permit = DOWNLOAD_SEMAPHORE.acquire().await.unwrap();
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

    // Check for draft model (small GGUF in the same directory that can be used for speculative decoding)
    // Auto-detect draft model in directory (explicit user-provided draft takes priority)
    let draft_model_path = explicit_draft.or_else(|| find_draft_model(&model_path));


    let hybrid_cfg = compute_hybrid_inference_config(&hw, gguf_meta.as_ref(), model_size_gb, effective_ctx, draft_model_path.clone(), is_auto_ctx);
    let total_layers = estimate_total_layers(gguf_meta.as_ref(), model_size_gb);


    // Manual overrides from UI (slider / settings panel) take precedence.
    let final_ngl = if let Some(manual_ngl) = gpu_layers {
        if manual_ngl >= 99 {
            total_layers
        } else {
            manual_ngl.min(total_layers)
        }
    } else {
        hybrid_cfg.ngl
    };

    // Generation threads: physical cores for sequential decode.
    let final_threads = cpu_threads.filter(|&t| t > 0).unwrap_or(hybrid_cfg.threads_gen);
    // Batch / ubatch: user override or scheduler recommendation.
    let final_batch = batch_size.filter(|&b| b > 0).unwrap_or(hybrid_cfg.batch_size);
    let final_ubatch = hybrid_cfg.ubatch_size;
    // KV cache type: If user set 'auto' or left unset, use the scheduler recommendation (q8_0/q4_0)
    let final_kv_type = if kv_cache_type.as_deref() == Some("auto") || kv_cache_type.is_none() {
        Some(hybrid_cfg.kv_cache_type.clone())
    } else {
        kv_cache_type
    };
    // Memory and KV placement: user overrides or scheduler.
    let final_mlock   = use_mlock.unwrap_or(hybrid_cfg.use_mlock);
    let final_no_kv = if hybrid_cfg.mode == InferenceMode::FullGpu {
        false // KV must stay in VRAM for full GPU mode
    } else {
        disable_kv_offload.unwrap_or(hybrid_cfg.disable_kv_offload)
    };
    let final_flash   = flash_attention.unwrap_or(true);

    // estimated_vram_mb is already computed inside compute_hybrid_inference_config.
    // Avoid redundant NGL binary search — read from hybrid_cfg indirectly.
    let estimated_vram_mb = vram_for_ngl(model_size_gb, gguf_meta.as_ref(), total_layers, final_ngl, effective_ctx);
    // 2026: Enrich vram-decision with iGPU info and effective context for frontend display.
    let context_capped = hw.is_igpu && effective_ctx > 8192;
    let effective_context_size = if context_capped { 8192 } else { effective_ctx };
    let _ = app.emit("vram-decision", serde_json::json!({
        "ngl": final_ngl,
        "fully_gpu": hybrid_cfg.mode == InferenceMode::FullGpu,
        "hybrid": hybrid_cfg.mode == InferenceMode::Hybrid,
        "message": hybrid_cfg.message,
        "estimated_vram_mb": estimated_vram_mb,
        "vram_available_mb": hw.vram_available_mb,
        "gpu_name": hw.gpu_name,
        "model_size_gb": model_size_gb,
        "layers_on_gpu": if final_ngl >= total_layers { total_layers } else { final_ngl },
        "layers_on_cpu": total_layers.saturating_sub(if final_ngl >= total_layers { total_layers } else { final_ngl }),
        "cpu_threads": final_threads,
        "threads_batch": hybrid_cfg.threads_batch,
        "ubatch_size": final_ubatch,
        "batch_size": final_batch,
        "kv_cache_type": final_kv_type,
        "kv_in_vram": !final_no_kv,
        "mlock": final_mlock,
        "flash_attention": final_flash,
        "inference_mode": hybrid_cfg.mode,
        "llamacpp_version": Downloader::get_installed_version(&app_dir).await,
        // 2026 additions
        "is_igpu": hw.is_igpu,
        "context_capped": context_capped,
        "effective_context_size": effective_context_size,
        "gpu_backend": format!("{:?}", hw.gpu_backend),
    }));

    // --- Step 3: Build config and start the server ---
    // Use the scheduler's effective context — it may have been auto-reduced to
    // keep all layers on the GPU instead of going hybrid/CPU.
    // If ctx=0 (auto), the scheduler already used 8192 for estimation; pass that.
    let server_ctx = if ctx == 0 {
        hybrid_cfg.effective_context_size.max(2048)
    } else {
        ctx.min(hybrid_cfg.effective_context_size).max(2048)
    };

    // Prompt cache must be model-specific. A shared cache file is incompatible
    // across models (different KV dimensions) and causes a hard crash on switch.
    let prompt_cache_path = {
        let model_stem = model_path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "model".to_string());
        Some(app_dir.join("models").join(format!("{}.prompt_cache.bin", model_stem)))
    };

    // 2026 Optimization: Let llama-server default (usually 'layer') unless user overrides
    let final_split_mode = split_mode.filter(|s| !s.trim().is_empty());
    let final_tensor_split = tensor_split.filter(|s| !s.trim().is_empty());

    let active_port = find_free_port();
    SERVER_PORT.store(active_port, std::sync::atomic::Ordering::Relaxed);

    let cfg = LlamaServerConfig {
        server_path: server_path.clone(),
        model_path,
        context_size: server_ctx,
        ngl: final_ngl,
        cpu_threads: final_threads,
        threads_batch: hybrid_cfg.threads_batch,
        ubatch_size: final_ubatch,
        device_id: if hw.gpu_device_id.is_empty() { None } else { Some(hw.gpu_device_id.clone()) },
        flash_attention: final_flash,
        kv_cache_type: final_kv_type,
        use_mlock: final_mlock,
        use_mmap: hybrid_cfg.use_mmap,
        batch_size: final_batch,
        draft_model_path,
        disable_kv_offload: final_no_kv,
        prompt_cache_path,
        mmproj_path,
        port: active_port,
        split_mode: final_split_mode,
        tensor_split: final_tensor_split,
        extra_args: hybrid_cfg.extra_args,
    };

    let app_handle = app.clone();
    manager.start(&cfg, Some(move |pct: u32, msg: &str| {
        let _ = app_handle.emit("llm-server-loading-progress", serde_json::json!({
            "progress": pct,
            "message": msg
        }));
    })).await?;

    {
        let mut active_llm = ACTIVE_LOCAL_LLM_MODEL.lock().unwrap();
        *active_llm = Some(model_id);
    }
    ACTIVE_SERVER_CTX_SIZE.store(server_ctx, std::sync::atomic::Ordering::Relaxed);

    let _ = app.emit("llm-server-ready", serde_json::json!({ "status": "Ready" }));
    Ok(())
}

#[tauri::command]
pub async fn stop_local_server(manager: State<'_, Arc<LlamaManager>>) -> Result<(), String> {
    manager.stop().await;
    SERVER_PORT.store(0, std::sync::atomic::Ordering::Relaxed);
    ACTIVE_SERVER_CTX_SIZE.store(0, std::sync::atomic::Ordering::Relaxed);
    {
        let mut active_img = ACTIVE_LOCAL_IMAGE_MODEL.lock().unwrap();
        *active_img = None;
    }
    {
        let mut active_llm = ACTIVE_LOCAL_LLM_MODEL.lock().unwrap();
        *active_llm = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn check_local_server_status() -> Result<serde_json::Value, String> {
    let active_img = get_active_local_image_model();
    if let Some(img_model) = active_img {
        let port = SERVER_PORT.load(std::sync::atomic::Ordering::Relaxed);
        if port > 0 {
            let resp = HEALTH_CLIENT
                .get(format!("http://{}:{}/v1/models", SERVER_HOST, port))
                .send().await;
            if let Ok(res) = resp {
                if res.status().is_success() {
                    return Ok(serde_json::json!({
                        "running": true,
                        "model_id": img_model,
                        "port": port,
                        "is_image_model": true,
                    }));
                }
            }
            return Ok(serde_json::json!({
                "running": false,
                "model_id": serde_json::Value::Null,
                "port": serde_json::Value::Null,
            }));
        } else {
            return Ok(serde_json::json!({
                "running": true,
                "model_id": img_model,
                "port": 0,
                "is_image_model": true,
            }));
        }
    }

    let port = SERVER_PORT.load(std::sync::atomic::Ordering::Relaxed);
    if port == 0 {
        return Ok(serde_json::json!({
            "running": false,
            "model_id": serde_json::Value::Null,
            "port": serde_json::Value::Null,
        }));
    }

    let resp = HEALTH_CLIENT
        .get(format!("http://{}:{}/v1/models", SERVER_HOST, port))
        .send().await;

    match resp {
        Ok(res) if res.status().is_success() => {
            let body: serde_json::Value = res.json().await.unwrap_or_default();
            let model_id = get_active_local_llm_model().or_else(|| {
                body.get("data")
                    .and_then(|d| d.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|m| m.get("id"))
                    .and_then(|id| id.as_str())
                    .map(|s| {
                        std::path::Path::new(s)
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or(s)
                            .to_string()
                    })
            });

            Ok(serde_json::json!({
                "running": true,
                "model_id": model_id,
                "port": port,
            }))
        }
        _ => {
            Ok(serde_json::json!({
                "running": false,
                "model_id": serde_json::Value::Null,
                "port": serde_json::Value::Null,
            }))
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct LocalModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub description: String,
    pub size_bytes: u64,
    pub status: String,
    pub repo_id: Option<String>,
    pub has_mmproj: bool,
    pub context_length: Option<u32>,
    pub model_type: Option<String>,
}

static LOCAL_MODELS_CACHE: std::sync::LazyLock<tokio::sync::Mutex<Option<(std::time::Instant, Vec<LocalModelInfo>)>>> = std::sync::LazyLock::new(|| {
    tokio::sync::Mutex::new(None)
});

pub fn invalidate_local_models_cache() {
    if let Ok(mut cache) = LOCAL_MODELS_CACHE.try_lock() {
        *cache = None;
    }
}

fn scan_folder_fast<'a>(
    dir: &'a std::path::Path,
    depth: u32,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = (u64, String, bool, bool)> + Send + 'a>> {
    Box::pin(async move {
        if depth > 4 {
            return (0, String::new(), false, false);
        }
        let mut total_size: u64 = 0;
        let mut primary_ext = String::new();
        let mut has_weights = false;
        let mut has_model_index = false;

        let supported = ["gguf", "safetensors", "bin", "ckpt", "pt", "onnx", "pth", "engine"];

        if let Ok(mut entries) = tokio::fs::read_dir(dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let p = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();

                if name == "model_index.json" {
                    has_model_index = true;
                }

                if p.is_file() {
                    if let Ok(m) = entry.metadata().await {
                        total_size += m.len();
                    }
                    let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                    if supported.contains(&ext.as_str()) {
                        has_weights = true;
                        if primary_ext.is_empty() {
                            primary_ext = ext;
                        }
                    }
                    if name == "config.json" || name == "model_index.json" {
                        has_weights = true;
                    }
                } else if p.is_dir() && !name.starts_with('.') && name != ".nyx_offload" {
                    let (sub_size, sub_ext, sub_weights, sub_index) = scan_folder_fast(&p, depth + 1).await;
                    total_size += sub_size;
                    if sub_weights {
                        has_weights = true;
                        if primary_ext.is_empty() {
                            primary_ext = sub_ext;
                        }
                    }
                    if sub_index {
                        has_model_index = true;
                    }
                }
            }
        }

        (total_size, primary_ext, has_weights, has_model_index)
    })
}

#[tauri::command]
pub async fn list_local_models(app: AppHandle) -> Result<Vec<LocalModelInfo>, String> {
    {
        let cache = LOCAL_MODELS_CACHE.lock().await;
        if let Some((ts, ref cached_models)) = *cache {
            if ts.elapsed() < std::time::Duration::from_secs(2) {
                return Ok(cached_models.clone());
            }
        }
    }

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let models_dir = app_dir.join("models");

    if !models_dir.exists() {
        tokio::fs::create_dir_all(&models_dir).await.ok();
        return Ok(vec![]);
    }

    // Run self-healing legacy layout migration
    run_migration_worker(&app).await;

    // Retrieve database models first (DB-first lookup)
    let db_models = if let Some(pool) = app.try_state::<sqlx::SqlitePool>() {
        use crate::db::models::LocalModel;
        sqlx::query_as::<_, LocalModel>("SELECT * FROM local_models")
            .fetch_all(&*pool)
            .await
            .unwrap_or_default()
    } else {
        vec![]
    };

    let normalize_absolute_path = |file_path_str: &str| -> String {
        let path = Path::new(file_path_str);
        let abs_path = if path.is_absolute() {
            path.to_path_buf()
        } else {
            models_dir.join(path)
        };
        abs_path.to_string_lossy().to_string().replace('\\', "/").to_lowercase()
    };

    let mut db_models_by_path = std::collections::HashMap::new();
    for db_model in &db_models {
        let normalized = normalize_absolute_path(&db_model.file_path);
        db_models_by_path.insert(normalized, db_model.clone());
    }

    let mut mmproj_repo_ids = std::collections::HashSet::new();
    for db_model in &db_models {
        if db_model.model_type == "vision" || db_model.id.starts_with("projectors/") {
            if let Some(ref rid) = db_model.repo_id {
                mmproj_repo_ids.insert(rid.clone());
            }
        }
    }

    let namespaces = &["projectors", "vae", "text_encoders", "diffusion", "llm"];
    let mut scan_dirs = Vec::new();
    for ns in namespaces {
        scan_dirs.push((ns.to_string(), models_dir.join(ns)));
        scan_dirs.push((ns.to_string(), models_dir.join(ns).join("unorganized")));
    }

    let mut models = Vec::new();
    const SUPPORTED_EXTENSIONS: &[&str] = &["gguf", "safetensors", "bin", "ckpt", "pt", "onnx", "pth", "engine"];

    for (namespace, dir_path) in scan_dirs {
        if !dir_path.exists() {
            continue;
        }

        let mut entries = match tokio::fs::read_dir(&dir_path).await {
            Ok(e) => e,
            Err(_) => continue,
        };

        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            if name.starts_with('.') || name == ".nyx_offload" || name.ends_with(".part") || name.ends_with(".meta.json") || name == "unorganized" {
                continue;
            }
            if name.contains("mmproj") && namespace != "projectors" {
                continue;
            }

            let normalized_path = normalize_absolute_path(&path.to_string_lossy());

            if let Some(db_model) = db_models_by_path.get(&normalized_path) {
                if db_model.model_type == "vision" || db_model.id.starts_with("projectors/") {
                    if let Some(ref rid) = db_model.repo_id {
                        mmproj_repo_ids.insert(rid.clone());
                    }
                }

                let id = db_model.id.clone();
                let display_name = db_model.name.clone();
                let provider = "nyx-native".to_string();
                let description = if let Some(ref rid) = db_model.repo_id {
                    let author = rid.split('/').next().unwrap_or("HuggingFace");
                    format!("Downloaded from {}", author)
                } else {
                    let ext = Path::new(&db_model.filename).extension().and_then(|s| s.to_str()).unwrap_or("").to_uppercase();
                    if ext.is_empty() {
                        "Local model".to_string()
                    } else {
                        format!("Local {} model", ext)
                    }
                };
                let size_bytes = db_model.size_bytes as u64;

                let part_filename = format!("{}.part", db_model.filename);
                let parent_dir = Path::new(&db_model.file_path).parent().unwrap_or(&models_dir);
                let part_path = parent_dir.join(&part_filename);
                let status = if part_path.exists() { "downloading" } else { "completed" };

                let mut has_mmproj = db_model.has_mmproj != 0;
                if let Some(ref rid) = db_model.repo_id {
                    if mmproj_repo_ids.contains(rid) {
                        has_mmproj = true;
                    }
                }
                let context_length = db_model.context_length.map(|c| c as u32);
                let model_type = Some(db_model.model_type.clone());

                models.push(LocalModelInfo {
                    id,
                    name: display_name,
                    provider,
                    description,
                    size_bytes,
                    status: status.to_string(),
                    repo_id: db_model.repo_id.clone(),
                    has_mmproj,
                    context_length,
                    model_type,
                });
                continue;
            }

            if path.is_dir() {
                let config_path = path.join("config.json");
                if config_path.exists() {
                    if let Ok(cfg_str) = tokio::fs::read_to_string(&config_path).await {
                        if let Ok(cfg) = serde_json::from_str::<serde_json::Value>(&cfg_str) {
                            let has_model_type = cfg.get("model_type").is_some();
                            let has_diffusers_marker = cfg.get("_class_name").is_some()
                                || cfg.get("_diffusers_version").is_some();
                            if has_diffusers_marker && !has_model_type {
                                continue;
                            }
                        }
                    }
                }

                let (dir_size, mut primary_ext, has_model_weights, _has_model_index) = scan_folder_fast(&path, 0).await;
                if !has_model_weights {
                    continue;
                }

                if primary_ext.is_empty() {
                    primary_ext = "safetensors".to_string();
                }

                let meta_candidates = vec![
                    dir_path.join(format!("{}.meta.json", name)),
                    path.join("nyx_meta.json"),
                    path.join("config.json"),
                    path.join("model_index.json"),
                ];
                let mut repo_id_opt: Option<String> = None;
                let mut description = format!("Local {} model folder", primary_ext.to_uppercase());

                for meta_path in meta_candidates {
                    if let Ok(content) = tokio::fs::read_to_string(&meta_path).await {
                        if let Ok(j) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(rid) = j.get("repo_id").or_else(|| j.get("_name_or_path")).and_then(|v| v.as_str()) {
                                repo_id_opt = Some(rid.to_string());
                            }
                            if let Some(a) = j.get("author").and_then(|v| v.as_str()) {
                                description = format!("Downloaded from {}", a);
                                break;
                            }
                        }
                    }
                }

                let display_name = if let Some(ref rid) = repo_id_opt {
                    let repo_name = rid.split('/').last().unwrap_or(rid).to_string();
                    let fn_lower = name.to_lowercase();
                    let is_generic = fn_lower == "model" || fn_lower == "weights" || fn_lower == "files";
                    if is_generic { repo_name } else { name.clone() }
                } else {
                    name.clone()
                };

                let model_type = if primary_ext == "onnx" {
                    "onnx".to_string()
                } else if namespace == "diffusion" {
                    "text-to-image".to_string()
                } else {
                    "pytorch".to_string()
                };

                let rel_path = path.strip_prefix(&models_dir).unwrap_or(&path).to_string_lossy().to_string().replace('\\', "/");
                let absolute_path = path.to_string_lossy().to_string();

                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64;

                if let Some(pool) = app.try_state::<sqlx::SqlitePool>() {
                    let _ = sqlx::query(
                        "INSERT INTO local_models (id, name, repo_id, filename, file_path, size_bytes, model_type, downloaded_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                         ON CONFLICT(id) DO UPDATE SET
                            name=excluded.name,
                            repo_id=excluded.repo_id,
                            filename=excluded.filename,
                            file_path=excluded.file_path,
                            size_bytes=excluded.size_bytes,
                            model_type=excluded.model_type,
                            downloaded_at=excluded.downloaded_at"
                    )
                    .bind(&rel_path)
                    .bind(&display_name)
                    .bind(repo_id_opt.as_ref())
                    .bind(&name)
                    .bind(&absolute_path)
                    .bind(dir_size as i64)
                    .bind(&model_type)
                    .bind(now)
                    .execute(&*pool)
                    .await;
                }

                models.push(LocalModelInfo {
                    id: rel_path,
                    name: display_name,
                    provider: "nyx-native".to_string(),
                    description,
                    size_bytes: dir_size,
                    status: "completed".to_string(),
                    repo_id: repo_id_opt,
                    has_mmproj: false,
                    context_length: None,
                    model_type: Some(model_type),
                });
                continue;
            }

            if !path.is_file() { continue; }
            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
            if !SUPPORTED_EXTENSIONS.contains(&ext.as_str()) { continue; }

            let size_bytes = entry.metadata().await.map(|m| m.len()).unwrap_or(0);

            let gguf_meta = if ext == "gguf" {
                let cached_meta = {
                    let cache = GGUF_META_CACHE.lock().unwrap();
                    cache.get(&name).cloned()
                };
                if let Some(cached) = cached_meta {
                    Some(cached)
                } else {
                    let path_clone = path.clone();
                    let parsed = tokio::task::spawn_blocking(move || {
                        parse_gguf_metadata(&path_clone).ok()
                    }).await.unwrap_or(None);
                    if let Some(ref p) = parsed {
                        let mut cache = GGUF_META_CACHE.lock().unwrap();
                        cache.insert(name.clone(), p.clone());
                    }
                    parsed
                }
            } else {
                None
            };
            let context_length = gguf_meta.as_ref().and_then(|m| m.context_length);
            let architecture = gguf_meta.as_ref().and_then(|m| m.architecture.clone());

            let stem = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let meta_candidates = vec![
                dir_path.join(format!("{}.meta.json", name)),
                dir_path.join(format!("{}.meta.json", stem)),
                dir_path.join(format!("{}.gguf.meta.json", name)),
                dir_path.join(format!("{}.gguf.meta.json", stem)),
            ];

            let mut repo_id_opt: Option<String> = None;
            let mut description = format!("Local {} model", ext.to_uppercase());

            for meta_path in meta_candidates {
                if let Ok(content) = tokio::fs::read_to_string(&meta_path).await {
                    if let Ok(j) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(rid) = j.get("repo_id").and_then(|v| v.as_str()) {
                            repo_id_opt = Some(rid.to_string());
                        }
                        if let Some(a) = j.get("author").and_then(|v| v.as_str()) {
                            description = format!("Downloaded from {}", a);
                            break;
                        }
                    }
                }
            }

            let part_filename = format!("{}.part", name);
            let part_path = dir_path.join(&part_filename);
            let status = if part_path.exists() { "downloading" } else { "completed" };

            let has_mmproj = repo_id_opt.as_ref().map_or(false, |rid| mmproj_repo_ids.contains(rid));

            let model_type = if ext == "onnx" {
                "onnx".to_string()
            } else if namespace == "diffusion" {
                "text-to-image".to_string()
            } else if ext == "safetensors" || ext == "pt" || ext == "pth" || ext == "bin" {
                "pytorch".to_string()
            } else if has_mmproj || name.to_lowercase().contains("vl") || name.to_lowercase().contains("vision") || namespace == "projectors" {
                "vision".to_string()
            } else {
                "text-generation".to_string()
            };

            let display_name = if let Some(ref rid) = repo_id_opt {
                let repo_name = rid.split('/').last().unwrap_or(rid).to_string();
                let fn_lower = name.to_lowercase();
                let is_generic = fn_lower == "model.safetensors"
                    || fn_lower == "model.gguf"
                    || fn_lower == "model.bin"
                    || fn_lower == "pytorch_model.bin"
                    || fn_lower == "consolidated.00.pth"
                    || fn_lower.starts_with("model-0000")
                    || fn_lower.starts_with("model.safetensors-0000")
                    || fn_lower == "model_opt.onnx"
                    || fn_lower == "model.onnx";
                if is_generic { repo_name } else { name.clone() }
            } else {
                name.clone()
            };

            let rel_path = path.strip_prefix(&models_dir).unwrap_or(&path).to_string_lossy().to_string().replace('\\', "/");
            let absolute_path = path.to_string_lossy().to_string();

            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;

            if let Some(pool) = app.try_state::<sqlx::SqlitePool>() {
                let _ = sqlx::query(
                    "INSERT INTO local_models (id, name, repo_id, filename, file_path, size_bytes, model_type, architecture, context_length, has_mmproj, downloaded_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                        name=excluded.name,
                        repo_id=excluded.repo_id,
                        filename=excluded.filename,
                        file_path=excluded.file_path,
                        size_bytes=excluded.size_bytes,
                        model_type=excluded.model_type,
                        architecture=excluded.architecture,
                        context_length=excluded.context_length,
                        has_mmproj=excluded.has_mmproj,
                        downloaded_at=excluded.downloaded_at"
                )
                .bind(&rel_path)
                .bind(&display_name)
                .bind(repo_id_opt.as_ref())
                .bind(&name)
                .bind(&absolute_path)
                .bind(size_bytes as i64)
                .bind(&model_type)
                .bind(architecture.as_ref())
                .bind(context_length.map(|c| c as i32))
                .bind(if has_mmproj { 1i32 } else { 0i32 })
                .bind(now)
                .execute(&*pool)
                .await;
            }

            models.push(LocalModelInfo {
                id: rel_path,
                name: display_name,
                provider: "nyx-native".to_string(),
                description,
                size_bytes,
                status: status.to_string(),
                repo_id: repo_id_opt,
                has_mmproj,
                context_length,
                model_type: Some(model_type),
            });
        }
    }

    info!("[NYX] list_local_models: found {} models in {:?}", models.len(), models_dir);
    {
        let mut cache = LOCAL_MODELS_CACHE.lock().await;
        *cache = Some((std::time::Instant::now(), models.clone()));
    }
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
    state.init_persistence(app_dir.clone()).await;
    let final_filename = if let Some(ref rid) = repo_id {
        let repo_name = rid.split('/').last().unwrap_or(rid);
        let fn_lower = filename.to_lowercase();
        let is_vae = fn_lower == "ae.safetensors" || fn_lower == "vae.safetensors";
        let is_generic = fn_lower == "model.safetensors"
            || fn_lower == "model.gguf"
            || fn_lower == "model.bin"
            || fn_lower == "pytorch_model.bin"
            || fn_lower == "consolidated.00.pth"
            || fn_lower.starts_with("model-0000")
            || fn_lower.starts_with("model.safetensors-0000")
            || fn_lower == "model_opt.onnx"
            || fn_lower == "model.onnx"
            || is_vae;
            
        if is_generic {
            let ext = std::path::Path::new(&filename)
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("bin");
            if is_vae {
                format!("{}-vae.{}", repo_name, ext)
            } else {
                format!("{}.{}", repo_name, ext)
            }
        } else {
            filename.clone()
        }
    } else {
        filename.clone()
    };

    let dest = app_dir.join("models").join(&final_filename);

    let is_paused = Arc::new(AtomicBool::new(false));
    let is_cancelled = Arc::new(AtomicBool::new(false));

    {
        let tasks = state.tasks.lock().await;
        if tasks.contains_key(&model_id) {
            return Err("Model is already downloading".to_string());
        }
    }

    let state_clone = Arc::clone(&*state);
    let app_clone = app.clone();
    let mid = model_id.clone();
    let repo_id_clone = repo_id.clone();
    let is_paused_clone = is_paused.clone();
    let is_cancelled_clone = is_cancelled.clone();

    let final_filename_clone = final_filename.clone();
    let handle = tokio::spawn(async move {
        let mid_emit = mid.clone();
        let state_for_download = state_clone.clone();
        let is_cancelled_check = is_cancelled_clone.clone();
        let app_emit = app_clone.clone();
        let res = download_hf_model(
            state_for_download,
            url,
            dest,
            mid.clone(),
            repo_id_clone,
            is_paused_clone,
            is_cancelled_clone,
            move |pct, downloaded, total| {
                let _ = app_emit.emit("hf-download-progress", serde_json::json!({
                    "model_id": mid_emit,
                    "progress": pct,
                    "downloaded": downloaded,
                    "total": total,
                }));
            },
        ).await;

        match res {
            Ok(_) => {
                invalidate_local_models_cache();
                let _ = app.emit("hf-download-complete", serde_json::json!({
                    "model_id": mid,
                    "filename": final_filename_clone,
                }));
            }
            Err(e) => {
                let is_canc = is_cancelled_check.load(Ordering::SeqCst);
                let err_lower = e.to_lowercase();
                if !is_canc && e != "Download paused" && e != "Download cancelled" && !err_lower.contains("cancel") {
                    let _ = app_clone.emit("hf-download-error", serde_json::json!({
                        "model_id": mid,
                        "error": e,
                    }));
                }
            }
        }
        
        // Always ensure the task is removed from memory when the loop exits
        {
            state_clone.tasks.lock().await.remove(&mid);
        }
    });

    {
        let mut tasks = state.tasks.lock().await;
        tasks.insert(model_id.clone(), DownloadTask {
            is_paused: is_paused.clone(),
            is_cancelled: is_cancelled.clone(),
            handle,
        });
    }

    Ok(())
}

fn find_task_key(tasks: &std::collections::HashMap<String, DownloadTask>, model_id: &str) -> Option<String> {
    if tasks.contains_key(model_id) {
        return Some(model_id.to_string());
    }
    let id_filename = model_id.split('/').last().unwrap_or(model_id);
    for key in tasks.keys() {
        if key == model_id || key.ends_with(model_id) || model_id.ends_with(key) {
            return Some(key.clone());
        }
        let key_filename = key.split('/').last().unwrap_or(key);
        if key_filename == id_filename {
            return Some(key.clone());
        }
    }
    None
}

fn find_pd_key(pd: &std::collections::HashMap<String, PersistentDownload>, model_id: &str) -> Option<String> {
    if pd.contains_key(model_id) {
        return Some(model_id.to_string());
    }
    let id_filename = model_id.split('/').last().unwrap_or(model_id);
    for (key, item) in pd.iter() {
        if key == model_id || key.ends_with(model_id) || model_id.ends_with(key) || item.filename == id_filename {
            return Some(key.clone());
        }
        let key_filename = key.split('/').last().unwrap_or(key);
        if key_filename == id_filename {
            return Some(key.clone());
        }
    }
    None
}

#[tauri::command]
pub async fn hf_pause_download(
    model_id: String,
    state: State<'_, Arc<HfDownloaderState>>,
) -> Result<(), String> {
    info!("[hf_pause_download] Requested for model_id: '{}'", model_id);
    let mut tasks = state.tasks.lock().await;
    if let Some(key) = find_task_key(&tasks, &model_id) {
        if let Some(task) = tasks.remove(&key) {
            info!("[hf_pause_download] Pausing & aborting task: '{}'", key);
            task.is_paused.store(true, Ordering::SeqCst);
            task.handle.abort();
        }
        Ok(())
    } else {
        info!("[hf_pause_download] Task not active for: '{}', assuming already paused", model_id);
        Ok(())
    }
}

#[tauri::command]
pub async fn hf_resume_download(
    app: AppHandle,
    model_id: String,
    state: State<'_, Arc<HfDownloaderState>>,
) -> Result<(), String> {
    info!("[hf_resume_download] Requested for model_id: '{}'", model_id);
    {
        let tasks = state.tasks.lock().await;
        if let Some(key) = find_task_key(&tasks, &model_id) {
            if let Some(task) = tasks.get(&key) {
                task.is_paused.store(false, Ordering::SeqCst);
                return Ok(());
            }
        }
    }

    let restored = {
        let pd = state.persistent_downloads.lock().await;
        if let Some(key) = find_pd_key(&pd, &model_id) {
            pd.get(&key).cloned()
        } else {
            None
        }
    };

    if let Some(p) = restored {
        info!("[hf_resume_download] Restoring from persistence: '{}'", p.model_id);
        hf_download_model(app, state, p.url, p.model_id, p.filename, p.repo_id).await
    } else {
        Err("Cannot resume: Task record not found. Click X to dismiss.".to_string())
    }
}

#[tauri::command]
pub async fn hf_cancel_download(
    app: AppHandle,
    model_id: String,
    state: State<'_, Arc<HfDownloaderState>>,
) -> Result<(), String> {
    info!("[hf_cancel_download] Requested for model_id: '{}'", model_id);
    {
        let mut tasks = state.tasks.lock().await;
        if let Some(key) = find_task_key(&tasks, &model_id) {
            if let Some(task) = tasks.remove(&key) {
                info!("[hf_cancel_download] Aborting active task: '{}'", key);
                task.is_cancelled.store(true, Ordering::SeqCst);
                task.handle.abort();
            }
        }
    }

    let mut filename_to_remove = None;
    {
        let mut pd = state.persistent_downloads.lock().await;
        if let Some(key) = find_pd_key(&pd, &model_id) {
            if let Some(p) = pd.remove(&key) {
                filename_to_remove = Some(p.filename);
            }
        }
        if filename_to_remove.is_none() {
            let fname = model_id.split('/').last().unwrap_or(&model_id).to_string();
            filename_to_remove = Some(fname);
        }
    }

    state.save_persistence().await;

    if let Some(filename) = filename_to_remove {
        if let Ok(app_dir) = app.path().app_data_dir() {
            let part_path = app_dir.join("models").join(format!("{}.part", filename));
            let _ = tokio::fs::remove_file(&part_path).await;
            let meta_path = app_dir.join("models").join(format!("{}.meta.json", filename));
            let _ = tokio::fs::remove_file(&meta_path).await;
        }
    }

    Ok(())
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
        let part = models_dir.join(format!("{}.part", pd.filename));
        if part.exists() {
            // Pre-allocation (set_len) expands disk file length to total_size.
            // Prefer recorded pd.downloaded if valid, otherwise fallback only if disk file length < total_size.
            let actual_downloaded = if pd.downloaded > 0 && pd.downloaded < pd.total_size {
                pd.downloaded
            } else if let Ok(meta) = tokio::fs::metadata(&part).await {
                if meta.len() < pd.total_size {
                    meta.len()
                } else {
                    0
                }
            } else {
                0
            };

            restored.push(RestoredDownload {
                model_id: pd.model_id.clone(),
                filename: pd.filename.clone(),
                url: pd.url.clone(),
                total_size: pd.total_size,
                downloaded: actual_downloaded,
                is_running: tasks.contains_key(&pd.model_id),
            });
        } else {
            to_remove.push(id);
        }
    }

    if !to_remove.is_empty() {
        {
            let mut pd = state.persistent_downloads.lock().await;
            for id in to_remove { pd.remove(&id); }
        }
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
    let dest = match resolve_model_path(&app, &filename).await {
        Some(p) => p,
        None => app_dir.join("models").join(&filename),
    };

    // Also remove from DB
    if let Some(pool) = app.try_state::<sqlx::SqlitePool>() {
        let _ = sqlx::query("DELETE FROM local_models WHERE id = ? OR filename = ?")
            .bind(&filename)
            .bind(&filename)
            .execute(&*pool)
            .await;
    }

    if !dest.exists() {
        return Ok(()); // Already gone.
    }

    let mut last_error = None;
    for _ in 0..10 {
        let delete_res = if dest.is_dir() {
            tokio::fs::remove_dir_all(&dest).await
        } else {
            tokio::fs::remove_file(&dest).await
        };
        match delete_res {
            Ok(_) => {
                info!("[NYX] Uninstalled model: {}", filename);
                // Also remove metadata file if present.
                let meta = dest.with_extension("meta.json");
                let _ = tokio::fs::remove_file(&meta).await;
                let meta_gguf = dest.with_extension("gguf.meta.json");
                let _ = tokio::fs::remove_file(&meta_gguf).await;
                invalidate_local_models_cache();
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
pub struct HfSibling {
    pub rfilename: String,
}

#[derive(Serialize, Deserialize)]
pub struct HfAuthorData {
    #[serde(rename = "avatarUrl", default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub fullname: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct HfModelResult {
    pub id: String,
    #[serde(default)]
    pub downloads: u64,
    #[serde(rename = "downloadsAllTime", default)]
    pub downloads_all_time: u64,
    #[serde(default)]
    pub likes: u64,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub siblings: Vec<HfSibling>,
    #[serde(rename = "createdAt", default)]
    pub created_at: Option<String>,
    #[serde(rename = "lastModified", default)]
    pub last_modified: Option<String>,
    #[serde(default)]
    pub gated: serde_json::Value,
    #[serde(rename = "trendingScore", default)]
    pub trending_score: f64,
    #[serde(rename = "pipeline_tag", default)]
    pub pipeline_tag: Option<String>,
    #[serde(rename = "authorData", default)]
    pub author_data: Option<HfAuthorData>,
    #[serde(rename = "numParameters", default)]
    pub num_parameters: Option<u64>,
}

#[derive(Serialize, Deserialize)]
pub struct HfSearchResponse {
    pub models: Vec<HfModelResult>,
    pub next_cursor: Option<String>,
}

#[tauri::command]
pub async fn hf_search_models(
    query: String,
    sort: Option<String>,
    filter: Option<String>,
    library: Option<String>,
    limit: Option<usize>,
    cursor: Option<String>,
) -> Result<HfSearchResponse, String> {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .unwrap_or_else(|_| Client::new());
    
    let raw_sort = sort.as_deref().unwrap_or("trendingScore");
    let sort_by = if raw_sort == "trending" { "trendingScore" } else { raw_sort };
    
    let limit_str = limit.unwrap_or(50).to_string();
    let mut params: Vec<(&str, String)> = vec![
        ("sort", sort_by.to_string()),
        ("direction", "-1".to_string()),
        ("limit", limit_str),
        ("full", "true".to_string()),
    ];

    let target_filter = filter.as_deref().unwrap_or("all");
    let active_lib = library.as_deref().unwrap_or("all").trim();

    if active_lib != "all" && !active_lib.is_empty() {
        params.push(("filter", active_lib.to_string()));
    } else if target_filter != "all" && !target_filter.is_empty() {
        params.push(("filter", target_filter.to_string()));
    }
    
    if let Some(c) = cursor {
        params.push(("cursor", c));
    }
    
    let q = query.trim().to_string();
    if !q.is_empty() {
        params.push(("search", q));
    }
    
    let resp = client.get("https://huggingface.co/api/models")
        .query(&params)
        .send().await.map_err(|e| e.to_string())?;
        
    if resp.status().is_success() {
        let mut next_cursor = None;
        if let Some(link_header) = resp.headers().get("link") {
            if let Ok(link_str) = link_header.to_str() {
                if let Some(start) = link_str.find('<') {
                    if let Some(end) = link_str[start..].find('>') {
                        let url_str = &link_str[start + 1..start + end];
                        if let Ok(url) = url::Url::parse(url_str) {
                            for (k, v) in url.query_pairs() {
                                if k == "cursor" {
                                    next_cursor = Some(v.into_owned());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        let results: Vec<HfModelResult> = resp.json().await.map_err(|e| e.to_string())?;
        let filtered = results.into_iter().filter(|r| {
            if r.siblings.is_empty() {
                return true;
            }
            if active_lib == "gguf" || target_filter == "gguf" {
                r.siblings.iter().any(|s| s.rfilename.to_lowercase().ends_with(".gguf"))
            } else if active_lib == "onnx" || target_filter == "onnx" {
                r.siblings.iter().any(|s| s.rfilename.to_lowercase().ends_with(".onnx"))
            } else if active_lib == "safetensors" || target_filter == "safetensors" {
                r.siblings.iter().any(|s| s.rfilename.to_lowercase().ends_with(".safetensors"))
            } else {
                r.siblings.iter().any(|s| {
                    let name = s.rfilename.to_lowercase();
                    name.ends_with(".gguf")
                        || name.ends_with(".onnx")
                        || name.ends_with(".safetensors")
                        || name.ends_with(".bin")
                        || name.ends_with(".pt")
                        || name.ends_with(".pth")
                        || name.ends_with(".json")
                        || name.ends_with(".model")
                        || name.ends_with(".tflite")
                        || name.ends_with(".engine")
                        || name.ends_with(".ckpt")
                })
            }
        }).collect();
        
        Ok(HfSearchResponse {
            models: filtered,
            next_cursor,
        })
    } else {
        Err(format!("HF API error: {}", resp.status()))
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
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .unwrap_or_else(|_| Client::new());

    // Try main branch with recursive listing first
    let url_main = format!("https://huggingface.co/api/models/{}/tree/main?recursive=true", model_id);
    let mut resp = client.get(&url_main).send().await;
    
    if resp.as_ref().map_or(true, |r| !r.status().is_success()) {
        let url_master = format!("https://huggingface.co/api/models/{}/tree/master?recursive=true", model_id);
        resp = client.get(&url_master).send().await;
    }

    if let Ok(r) = resp {
        if r.status().is_success() {
            if let Ok(entries) = r.json::<Vec<HfTreeEntry>>().await {
                let files: Vec<HfModelFile> = entries.into_iter()
                    .filter(|e| e.r#type == "file")
                    .map(|e| HfModelFile {
                        filename: e.path,
                        size: e.lfs.map(|l| l.size).unwrap_or(e.size),
                    })
                    .collect();
                if !files.is_empty() {
                    return Ok(files);
                }
            }
        }
    }

    // Fallback to model detail endpoint
    let url_info = format!("https://huggingface.co/api/models/{}?full=true", model_id);
    let info_resp = client.get(&url_info).send().await.map_err(|e| e.to_string())?;
    if info_resp.status().is_success() {
        if let Ok(result) = info_resp.json::<HfModelResult>().await {
            let files = result.siblings.into_iter()
                .map(|s| HfModelFile {
                    filename: s.rfilename,
                    size: 0,
                })
                .collect();
            return Ok(files);
        }
    }

    Err("Failed to fetch model files".to_string())
}

#[tauri::command]
pub async fn hf_get_model_readme(model_id: String) -> Result<String, String> {
    let url = format!("https://huggingface.co/{}/raw/main/README.md", model_id);
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .unwrap_or_else(|_| Client::new());
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

#[derive(Serialize, Deserialize)]
pub struct BinaryUpdateStatus {
    pub success: bool,
    pub current_version: String,
    pub latest_version: String,
    pub updated: bool,
    pub message: String,
}

#[tauri::command]
pub async fn check_and_update_binaries(app: AppHandle) -> Result<BinaryUpdateStatus, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let hw = HardwareSnapshot::collect().await;
    let downloader = Downloader::new();
    let bin_dir = app_dir.join("binaries");
    let version_file = bin_dir.join(".version");
    let current_version = tokio::fs::read_to_string(&version_file).await.unwrap_or_else(|_| "none".to_string());

    let _server_path = downloader.ensure_server(&app_dir, &hw.gpu_backend, |_p, _msg| {}).await?;
    let new_version = tokio::fs::read_to_string(&version_file).await.unwrap_or_else(|_| "latest".to_string());

    let updated = current_version.trim() != new_version.trim();

    Ok(BinaryUpdateStatus {
        success: true,
        current_version: current_version.trim().to_string(),
        latest_version: new_version.trim().to_string(),
        updated,
        message: if updated {
            format!("Updated local server binaries to {}", new_version.trim())
        } else {
            format!("Local binaries are up to date ({})", current_version.trim())
        },
    })
}
