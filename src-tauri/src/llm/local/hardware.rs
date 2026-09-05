// ─────────────────────────────────────────────────────────────────────────────
// NYX — Hardware Analyzer & GPU Detection
// ─────────────────────────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};
use tracing::info;
use super::server::CommandExtWindows;

// § 2 — HARDWARE ANALYSER
// ─────────────────────────────────────────────────────────────────────────────

/// Backend that the GPU is operating through.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum GpuBackend {
    Cuda,
    Vulkan,
    Metal,
    /// Neural Processing Unit — Qualcomm Hexagon (Snapdragon X), Intel NPU, or AMD XDNA (Ryzen AI).
    /// On Windows Copilot+ devices, NYX uses the Vulkan binary as a compatible fallback until
    /// dedicated QNN/OpenVINO llama.cpp builds are stable and auto-downloadable.
    Npu,
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
    /// Dedicated GPU memory available for explicit device allocations.
    #[serde(default)]
    pub dedicated_vram_available_mb: u64,
    /// System memory that the GPU may borrow when using shared/unified memory.
    #[serde(default)]
    pub shared_gpu_memory_mb: u64,
    /// True if any dedicated (discrete) GPU was detected.
    pub has_dedicated_gpu: bool,
    /// True if the GPU is integrated (iGPU / APU / shared memory).
    /// iGPUs require conservative layer caps (≤35%) and context limits (≤8192).
    pub is_igpu: bool,
    /// Name of secondary GPU if present (e.g. integrated GPU when primary is dedicated).
    #[serde(default)]
    pub secondary_gpu_name: Option<String>,
    /// True if an integrated GPU was detected on this system.
    #[serde(default)]
    pub has_integrated_gpu: bool,
    /// Available offload devices (e.g. ["CUDA0", "Vulkan0", "Vulkan1"]).
    #[serde(default)]
    pub available_devices: Vec<String>,

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
    vram_free_bytes: Option<u64>,
    is_dedicated: bool,
    secondary_gpu_name: Option<String>,
    has_integrated: bool,
    available_devices: Vec<String>,
}

#[cfg(target_os = "windows")]
async fn detect_gpu(sys_ram_bytes: u64) -> GpuDetectionResult {
    // ── Step 1: Try nvidia-smi for precise total and free VRAM (NVIDIA GPUs) ──
    // Win32_VideoController.AdapterRAM is a 32-bit DWORD and overflows/wraps
    // to 0 or 4 294 967 295 for cards with >=4 GB VRAM (GTX 1650, RTX 30xx…).
    // nvidia-smi reports the correct 64-bit values directly.
    let nvidia_smi_vram = async {
        let out = tokio::process::Command::new("nvidia-smi").hide_window()
            .args(&["--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"])
            .output()
            .await
            .ok()?;
        let text = String::from_utf8(out.stdout).ok()?;
        let line = text.lines().next()?.trim();
        let mut parts = line.splitn(3, ',');
        let name = parts.next()?.trim().to_string();
        let total_mib: u64 = parts.next()?.trim().parse().ok()?;
        let free_mib: Option<u64> = parts.next().and_then(|p| p.trim().parse().ok());
        Some((name, total_mib * 1024 * 1024, free_mib.map(|f| f * 1024 * 1024)))
    }.await;

    if let Some((name, vram_bytes, free_bytes)) = nvidia_smi_vram {
        info!(
            "[GPU] nvidia-smi: {} — {:.1} GB VRAM (free: {:.1} GB)",
            name,
            vram_bytes as f64 / 1e9,
            free_bytes.unwrap_or(vram_bytes) as f64 / 1e9
        );

        // Check for secondary integrated GPU (e.g. Intel UHD / AMD Radeon) for multi-device capability
        let secondary = async {
            let out = tokio::process::Command::new("powershell").hide_window()
                .args(&["-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | Select-Object Name | ConvertTo-Json"])
                .output()
                .await
                .ok()?;
            let text = String::from_utf8(out.stdout).ok()?;
            let val = serde_json::from_str::<serde_json::Value>(&text).ok()?;
            let arr = if val.is_array() { val.as_array()?.clone() } else { vec![val] };
            for item in arr {
                if let Some(n) = item.get("Name").and_then(|v| v.as_str()) {
                    let n_lower = n.to_lowercase();
                    if !n_lower.contains("nvidia") && (n_lower.contains("intel") || n_lower.contains("amd") || n_lower.contains("uhd") || n_lower.contains("iris") || n_lower.contains("radeon")) {
                        return Some(n.to_string());
                    }
                }
            }
            None
        }.await;

        let (secondary_gpu_name, has_integrated, available_devices) = (
            secondary,
            true,
            vec!["CUDA0".to_string()],
        );

        return GpuDetectionResult {
            name,
            backend: GpuBackend::Cuda,
            vram_total_bytes: vram_bytes,
            vram_free_bytes: free_bytes,
            is_dedicated: true,
            secondary_gpu_name,
            has_integrated,
            available_devices,
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
                let is_npu_device = vendor_lower.contains("npu")
                    || vendor_lower.contains("hexagon")
                    || vendor_lower.contains("snapdragon")
                    || vendor_lower.contains("neural")
                    || vendor_lower.contains("xdna")
                    || vendor_lower.contains("vpu")
                    || vendor_lower.contains("ryzen ai");

                let backend = if is_npu_device {
                    GpuBackend::Npu
                } else if vendor_lower.contains("nvidia") {
                    GpuBackend::Cuda
                } else if vendor_lower.contains("amd") || vendor_lower.contains("radeon") {
                    GpuBackend::Vulkan
                } else {
                    GpuBackend::Vulkan
                };
                
                // Heuristic: dedicated GPU if AdapterRAM >= 2 GB or if name matches dedicated GPU brands
                let is_dedicated = is_npu_device
                    || best_ram >= 2_000_000_000 
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
                        vram_free_bytes: None,
                        is_dedicated,
                        secondary_gpu_name: None,
                        has_integrated: !is_dedicated,
                        available_devices: vec!["Vulkan0".to_string()],
                    };
                }
            }
        }
    }
    
    GpuDetectionResult {
        name: "Unknown GPU".to_string(),
        backend: GpuBackend::Unknown,
        vram_total_bytes: 0,
        vram_free_bytes: None,
        is_dedicated: false,
        secondary_gpu_name: None,
        has_integrated: false,
        available_devices: Vec::new(),
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
        vram_free_bytes: None,
        is_dedicated: false, // Apple Silicon is Unified Memory
        secondary_gpu_name: None,
        has_integrated: false,
        available_devices: vec!["Metal0".to_string()],
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
async fn detect_gpu(_sys_ram_bytes: u64) -> GpuDetectionResult {
    // ── Step 1: Try nvidia-smi (NVIDIA GPUs on Linux) ───────────────────────
    let nvidia_smi_vram = async {
        let out = tokio::process::Command::new("nvidia-smi")
            .args(&["--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"])
            .output()
            .await
            .ok()?;
        let text = String::from_utf8(out.stdout).ok()?;
        let line = text.lines().next()?.trim();
        let mut parts = line.splitn(3, ',');
        let name = parts.next()?.trim().to_string();
        let total_mib: u64 = parts.next()?.trim().parse().ok()?;
        let free_mib: Option<u64> = parts.next().and_then(|p| p.trim().parse().ok());
        Some((name, total_mib * 1024 * 1024, free_mib.map(|f| f * 1024 * 1024)))
    }.await;

    if let Some((name, vram_bytes, free_bytes)) = nvidia_smi_vram {
        info!("[GPU/Linux] nvidia-smi: {} — {:.1} GB VRAM (free: {:.1} GB)", name, vram_bytes as f64 / 1e9, free_bytes.unwrap_or(vram_bytes) as f64 / 1e9);
        return GpuDetectionResult {
            name,
            backend: GpuBackend::Cuda,
            vram_total_bytes: vram_bytes,
            vram_free_bytes: free_bytes,
            is_dedicated: true,
            secondary_gpu_name: None,
            has_integrated: false,
            available_devices: vec!["CUDA0".to_string()],
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
            vram_free_bytes: None,
            is_dedicated: vram_bytes >= 2_000_000_000,
            secondary_gpu_name: None,
            has_integrated: false,
            available_devices: vec!["Vulkan0".to_string()],
        };
    }

    // ── Fallback: CPU-only or unknown GPU ────────────────────────────────────
    warn!("[GPU/Linux] No GPU detected via nvidia-smi or sysfs; falling back to CPU-only.");
    GpuDetectionResult {
        name: "No GPU detected".to_string(),
        backend: GpuBackend::Unknown,
        vram_total_bytes: 0,
        vram_free_bytes: None,
        is_dedicated: false,
        secondary_gpu_name: None,
        has_integrated: false,
        available_devices: Vec::new(),
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

        #[cfg(target_os = "windows")]
        let live_free_bytes = if snapshot.gpu_backend == GpuBackend::Cuda {
            let out = tokio::process::Command::new("nvidia-smi").hide_window()
                .args(&["--query-gpu=memory.free", "--format=csv,noheader,nounits"])
                .output()
                .await
                .ok();
            out.and_then(|o| String::from_utf8(o.stdout).ok())
                .and_then(|t| t.lines().next().map(|l| l.trim().to_string()))
                .and_then(|s| s.parse::<u64>().ok())
                .map(|mib| mib * 1024 * 1024)
        } else {
            None
        };
        #[cfg(not(target_os = "windows"))]
        let live_free_bytes: Option<u64> = None;

        let effective_free_bytes = live_free_bytes.or(gpu_result.vram_free_bytes);
        
        if snapshot.has_dedicated_gpu {
            // Live free memory if detected via driver query, otherwise total minus 256MB OS baseline
            snapshot.vram_available_mb = if let Some(free_b) = effective_free_bytes {
                (free_b / (1024 * 1024)).saturating_sub(64)
            } else {
                snapshot.vram_total_mb.saturating_sub(256)
            };
            snapshot.dedicated_vram_available_mb = snapshot.vram_available_mb;
            // Windows WDDM allocates up to 50% of System RAM as Shared GPU Memory.
            // Keep a 1GB reserve for general host OS needs.
            let wddm_shared_cap_mb = snapshot.ram_total_mb / 2;
            let usable_ram_mb = snapshot.ram_available_mb.saturating_sub(1024);
            snapshot.shared_gpu_memory_mb = wddm_shared_cap_mb.min(usable_ram_mb);
        } else {
            snapshot.vram_available_mb = snapshot.vram_total_mb.saturating_sub(100);
            snapshot.dedicated_vram_available_mb = 0;
            let wddm_shared_cap_mb = snapshot.ram_total_mb / 2;
            let usable_ram_mb = snapshot.ram_available_mb.saturating_sub(1024);
            snapshot.shared_gpu_memory_mb = wddm_shared_cap_mb.min(usable_ram_mb);
        }
        
        snapshot.secondary_gpu_name = gpu_result.secondary_gpu_name.clone();
        snapshot.has_integrated_gpu = gpu_result.has_integrated;
        snapshot.available_devices = gpu_result.available_devices.clone();

        info!("[HardwareAnalyser] Snapped to 2026 Profile: {:?} ({}MB VRAM, {}MB RAM, integrated: {})", 
            profile, snapshot.vram_total_mb, snapshot.ram_total_mb, snapshot.has_integrated_gpu);

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
            dedicated_vram_available_mb: 0,
            shared_gpu_memory_mb: 0,
            has_dedicated_gpu: false,
            is_igpu: false,
            secondary_gpu_name: None,
            has_integrated_gpu: false,
            available_devices: Vec::new(),
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
