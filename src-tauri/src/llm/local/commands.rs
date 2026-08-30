use std::sync::atomic::AtomicBool;
// ─────────────────────────────────────────────────────────────────────────────
// NYX — Local LLM Tauri IPC Commands
// ─────────────────────────────────────────────────────────────────────────────

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State};
use tracing::{error, info};

use super::hardware::*;
use super::scheduler::*;
use super::server::*;
use super::binary_manager::*;
use super::hf_downloader::*;

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
    /// True when an NPU (Qualcomm Hexagon, Intel NPU, AMD XDNA) was detected.
    pub is_npu: bool,
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
    raw_model_id: &str,
) -> Option<PathBuf> {
    let leaf_name = raw_model_id.split('/').last().unwrap_or(raw_model_id);
    let with_gguf = if !leaf_name.ends_with(".gguf") {
        format!("{}.gguf", leaf_name)
    } else {
        leaf_name.to_string()
    };

    let candidates = vec![
        raw_model_id,
        leaf_name,
        &with_gguf,
    ];

    let mut candidate_models_dirs = Vec::new();
    if let Ok(app_dir) = app.path().app_data_dir() {
        candidate_models_dirs.push(app_dir.join("models"));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        let p1 = PathBuf::from(&appdata).join("nyx").join("models");
        if !candidate_models_dirs.contains(&p1) {
            candidate_models_dirs.push(p1);
        }
        let p2 = PathBuf::from(&appdata).join("com.nyx.desktop").join("models");
        if !candidate_models_dirs.contains(&p2) {
            candidate_models_dirs.push(p2);
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        let p_cwd1 = cwd.join("models");
        if !candidate_models_dirs.contains(&p_cwd1) {
            candidate_models_dirs.push(p_cwd1);
        }
        let p_cwd2 = cwd.join(".nyx-models");
        if !candidate_models_dirs.contains(&p_cwd2) {
            candidate_models_dirs.push(p_cwd2);
        }
    }
    let p_workspace = PathBuf::from("E:\\NYX\\.nyx-models");
    if !candidate_models_dirs.contains(&p_workspace) {
        candidate_models_dirs.push(p_workspace);
    }

    for model_id in &candidates {
        for models_dir in &candidate_models_dirs {
            let p = models_dir.join(model_id);
            if p.exists() {
                return Some(p);
            }

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
        }
    }

    // 3. Query the database
    if let Some(pool) = app.try_state::<sqlx::SqlitePool>() {
        use crate::db::models::LocalModel;
        for model_id in &candidates {
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
                for models_dir in &candidate_models_dirs {
                    let p_rel = models_dir.join(&model.file_path);
                    if p_rel.exists() {
                        return Some(p_rel);
                    }
                }
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
    let (ngl, fully_gpu, estimated_vram_mb, schedule_message, recommended_cpu_threads) = match decision {
        Ok(d) => (d.ngl, d.fully_gpu, d.estimated_vram_mb, d.message, d.recommended_cpu_threads),
        Err(err_msg) => (0, false, 0, err_msg, 0),
    };
    let layers_on_gpu = if ngl >= total_layers { total_layers } else { ngl };
    let layers_on_cpu = 0u32; // In GPU-only mode, layers on CPU is always 0

    Ok(HardwareAnalysisResult {
        gpu_name: hw_snapshot.gpu_name,
        gpu_backend: format!("{:?}", hw_snapshot.gpu_backend),
        vram_total_mb: hw_snapshot.vram_total_mb,
        vram_available_mb: hw_snapshot.vram_available_mb,
        has_dedicated_gpu: hw_snapshot.has_dedicated_gpu,
        is_igpu: hw_snapshot.is_igpu,
        is_npu: hw_snapshot.gpu_backend == GpuBackend::Npu,
        cpu_name: hw_snapshot.cpu_name,
        cpu_physical_cores: hw_snapshot.cpu_physical_cores,
        cpu_logical_threads: hw_snapshot.cpu_logical_threads,
        ram_total_mb: hw_snapshot.ram_total_mb,
        ram_available_mb: hw_snapshot.ram_available_mb,
        model_size_gb,
        total_layers,
        layers_on_gpu,
        layers_on_cpu,
        estimated_vram_mb,
        estimated_ram_mb: {
            let kv_mb_per_1k = 40.0 + (model_size_gb * 8.0).min(100.0);
            let total_kv_mb = (ctx as f32 / 1024.0) * kv_mb_per_1k;
            let cpu_ratio = layers_on_cpu as f32 / total_layers.max(1) as f32;
            let cpu_kv_mb = total_kv_mb * cpu_ratio;
            // OS mmap memory mapping maps the GGUF model file into system page cache working set
            let model_ram_mb = model_size_gb * 1024.0;
            (model_ram_mb + cpu_kv_mb) as u64 + 256
        },
        fully_gpu,
        hybrid: false,
        recommended_cpu_threads,
        max_context_length: gguf_meta.as_ref().and_then(|m| m.context_length).unwrap_or(131072),
        schedule_message,
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
pub async fn open_external_installer_cli(app: AppHandle) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let script_path = app_dir.join("install-dependencies.bat");

    let script_content = include_str!("../../../scripts/install-dependencies.bat");
    let _ = tokio::fs::write(&script_path, script_content).await;

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let _ = Command::new("cmd.exe")
            .args(&["/c", "start", "NYX Local Intelligence Installer", script_path.to_str().unwrap_or("install-dependencies.bat")])
            .spawn();
    }

    Ok(())
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
    _use_mlock: Option<bool>,
    batch_size: Option<u32>,
    draft_model_id: Option<String>,
    _disable_kv_offload: Option<bool>,
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
    let name_lower = model_id.to_lowercase();
    let is_vision_model = name_lower.contains("-vl") 
        || name_lower.contains("_vl") 
        || name_lower.contains("vision") 
        || name_lower.contains("llava")
        || name_lower.contains("multimodal");

    // Only search and attach an mmproj projector if this is an explicit vision/multimodal model.
    // Attaching a 1 GB vision projector to standard text models wastes VRAM/RAM, disables Flash Attention, and forces CPU offload.
    let mut mmproj_path = None;
    if is_vision_model {
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
    }

    let ctx = context_size.unwrap_or(0);
    let is_auto_ctx = ctx == 0;

    // --- Non-GGUF Native Model Handler ---
    // All extensions other than .gguf (and folders containing PyTorch/Safetensors/config.json) cannot be loaded by llama-server.exe.
    // We register them as active native engines and emit llm-server-ready immediately.
    // This covers: .safetensors/.ckpt/.pt/.pth (PyTorch diffusion/vision), .onnx (ONNX runtime),
    // .bin (HuggingFace serialised weights or old GGML), and model folders.
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

    // If ctx is 0 (auto), default to 8192 context window (capped to model max if model max is smaller).
    // Never blindly assign 131,072 or 1,000,000 on a 4GB-8GB GPU, as 128k KV cache consumes 8.5+ GB of memory!
    let model_max_ctx = gguf_meta.as_ref().and_then(|m| m.context_length).unwrap_or(8192);
    let effective_ctx = if ctx == 0 {
        8192u32.min(model_max_ctx).max(2048)
    } else {
        ctx.min(model_max_ctx).max(2048)
    };

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
        let source_script = include_str!("../nyx_native_server.py");
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

    let hw = HardwareSnapshot::collect().await;

    let target_bin_name = match &hw.gpu_backend {
        GpuBackend::Cuda => "llama-server-cuda.exe",
        GpuBackend::Vulkan | GpuBackend::Npu => "llama-server-vulkan.exe",
        _ => "llama-server.exe",
    };

    let cuda_path = app_dir.join("binaries").join("llama-server-cuda.exe");
    let vulkan_path = app_dir.join("binaries").join("llama-server-vulkan.exe");

    // Check all possible binary locations on disk
    let candidate_dirs = [
        app_dir.join("binaries"),
        PathBuf::from(std::env::var("APPDATA").unwrap_or_default()).join("com.nyx.desktop").join("binaries"),
        PathBuf::from(std::env::var("APPDATA").unwrap_or_default()).join("nyx").join("binaries"),
        PathBuf::from("E:\\NYX\\.nyx-models\\bin"),
        PathBuf::from(".nyx-models").join("bin"),
    ];

    let mut found_server_path: Option<PathBuf> = None;
    for dir in &candidate_dirs {
        let p_named = dir.join(target_bin_name);
        if p_named.exists() && p_named.metadata().map(|m| m.len() >= MIN_SERVER_BINARY_BYTES).unwrap_or(false) {
            found_server_path = Some(p_named);
            break;
        }
        let p_generic = dir.join("llama-server.exe");
        if p_generic.exists() && p_generic.metadata().map(|m| m.len() >= MIN_SERVER_BINARY_BYTES).unwrap_or(false) {
            found_server_path = Some(p_generic);
            break;
        }
    }

    let server_path_buf = if let Some(p) = found_server_path {
        p
    } else {
        match &hw.gpu_backend {
            GpuBackend::Cuda => cuda_path.clone(),
            GpuBackend::Vulkan => vulkan_path.clone(),
            GpuBackend::Metal => cuda_path.clone(),
            GpuBackend::Npu => vulkan_path.clone(),
            GpuBackend::Unknown => cuda_path.clone(),
        }
    };
    let server_path = &server_path_buf;

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


    let hybrid_cfg = match compute_gpu_inference_config(&hw, gguf_meta.as_ref(), model_size_gb, effective_ctx, draft_model_path.clone(), is_auto_ctx) {
        Ok(cfg) => cfg,
        Err(err_msg) => {
            // Model cannot fit in GPU VRAM — surface a clear error to the frontend.
            // CPU fallback is disabled by design.
            error!("[start_local_server] GPU scheduler error: {}", err_msg);
            return Err(err_msg);
        }
    };
    let total_layers = estimate_total_layers(gguf_meta.as_ref(), model_size_gb);


    // Always pass 999 to llama-server in GPU-only mode to guarantee 100% of all layers,
    // embeddings, and output tensors are offloaded to GPU without any trailing layers left on CPU.
    let final_ngl = 999;

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
    // Memory and KV placement: always keep KV in VRAM (GPU-only mode).
    let final_mlock   = false; // Never mlock in GPU-only mode — double-pinning risk
    let final_no_kv   = false; // KV must stay in VRAM
    let final_flash   = flash_attention.unwrap_or(true);

    // estimated_vram_mb is already computed inside compute_gpu_inference_config.
    let estimated_vram_mb = vram_for_ngl(model_size_gb, gguf_meta.as_ref(), total_layers, final_ngl, effective_ctx);
    // Effective context comes from the GPU scheduler (may be auto-reduced to fit VRAM).
    let effective_context_size = hybrid_cfg.effective_context_size;
    let context_capped = effective_context_size < effective_ctx;
    let _ = app.emit("vram-decision", serde_json::json!({
        "ngl": final_ngl,
        "fully_gpu": true,
        "hybrid": false,
        "message": hybrid_cfg.message,
        "estimated_vram_mb": estimated_vram_mb,
        "vram_available_mb": hw.vram_available_mb,
        "gpu_name": hw.gpu_name,
        "model_size_gb": (model_size_gb * 0.80),
        "raw_file_size_gb": model_size_gb,
        "layers_on_gpu": total_layers,
        "layers_on_cpu": 0u32,
        "cpu_threads": final_threads,
        "threads_batch": hybrid_cfg.threads_batch,
        "ubatch_size": final_ubatch,
        "batch_size": final_batch,
        "kv_cache_type": final_kv_type,
        "kv_in_vram": true,
        "mlock": final_mlock,
        "flash_attention": final_flash,
        "inference_mode": "full_gpu",
        "llamacpp_version": Downloader::get_installed_version(&app_dir).await,
        // 2026 additions
        "is_igpu": hw.is_igpu,
        "is_npu": hw.gpu_backend == GpuBackend::Npu,
        "context_capped": context_capped,
        "effective_context_size": effective_context_size,
        "gpu_backend": format!("{:?}", hw.gpu_backend),
    }));

    // --- Step 3: Build config and start the server ---
    // Use the scheduler's effective context — it may have been auto-reduced to
    // keep all layers on the GPU instead of going hybrid/CPU.
    // Use the scheduler's effective context (8,192 default or user override)
    let server_ctx = effective_ctx;

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

    let target_filter = filter.as_deref().unwrap_or("all").trim();
    let active_lib = library.as_deref().unwrap_or("all").trim();

    if active_lib != "all" && !active_lib.is_empty() {
        params.push(("filter", active_lib.to_string()));
    }
    if target_filter != "all" && !target_filter.is_empty() && target_filter != active_lib {
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
            if active_lib == "gguf" || target_filter == "gguf" {
                let id_lower = r.id.to_lowercase();
                let has_gguf_tag = r.tags.iter().any(|t| t.to_lowercase() == "gguf");
                let has_gguf_name = id_lower.contains("gguf");
                let has_gguf_file = r.siblings.iter().any(|s| s.rfilename.to_lowercase().ends_with(".gguf"));
                has_gguf_tag || has_gguf_name || has_gguf_file || r.siblings.is_empty()
            } else if active_lib == "onnx" || target_filter == "onnx" {
                r.siblings.iter().any(|s| s.rfilename.to_lowercase().ends_with(".onnx"))
            } else if active_lib == "safetensors" || target_filter == "safetensors" {
                r.siblings.iter().any(|s| s.rfilename.to_lowercase().ends_with(".safetensors"))
            } else {
                true
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
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .unwrap_or_else(|_| Client::new());

    let branches = ["main", "master"];
    let filenames = ["README.md", "readme.md"];

    for branch in &branches {
        for filename in &filenames {
            let url = format!("https://huggingface.co/{}/raw/{}/{}", model_id, branch, filename);
            if let Ok(resp) = client.get(&url).send().await {
                if resp.status().is_success() {
                    return resp.text().await.map_err(|e| e.to_string());
                }
            }
        }
    }

    Err(format!("Failed to fetch README for {}: no README.md found on main or master branch", model_id))
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
