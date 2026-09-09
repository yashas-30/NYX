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
use tracing::{error, info, warn};

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
    pub dedicated_vram_available_mb: u64,
    pub shared_gpu_memory_mb: u64,
    pub total_gpu_memory_mb: u64,
    pub strategy: String,
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
    pub uses_shared_memory: bool,
    pub recommended_cpu_threads: u32,
    pub max_context_length: u32,
    pub schedule_message: String,
    // Version
    pub llamacpp_version: String,
}

static GGUF_META_CACHE: std::sync::LazyLock<std::sync::Mutex<std::collections::HashMap<String, GgufMetadata>>> = std::sync::LazyLock::new(|| {
    std::sync::Mutex::new(std::collections::HashMap::new())
});

pub fn is_vision_projector_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    if !lower.ends_with(".gguf") {
        return false;
    }
    if lower.contains("whisper") || lower.contains("audio") || lower.contains("imatrix") {
        return false;
    }
    if lower.contains("mmproj") || lower.contains("projector") {
        return true;
    }
    if lower.contains("vision_tower")
        || lower.contains("vision-tower")
        || lower.contains("vision_encoder")
        || lower.contains("vision-encoder")
        || lower.contains("image_encoder")
        || lower.contains("image-encoder")
        || lower.contains("image_adapter")
        || lower.contains("image-adapter")
        || lower.contains("resampler")
        || lower.contains("siglip")
        || lower.contains("clip-vision")
        || lower.contains("clip_vision")
        || lower.contains("clip-vit")
        || lower.contains("clip_vit")
    {
        return true;
    }
    let stem = lower.trim_end_matches(".gguf");
    if stem == "vit" || stem == "visual" || stem == "vision" || stem == "clip" {
        return true;
    }
    let precision_suffixes = [
        "-f16", "_f16", ".f16", "-f32", "_f32", ".f32", "-bf16", "_bf16", ".bf16",
        "-fp16", "_fp16", ".fp16", "-fp32", "_fp32", ".fp32", "-q8_0", "_q8_0", ".q8_0",
        "-q4_0", "_q4_0", ".q4_0", "-q4_k_m", "_q4_k_m", ".q4_k_m",
    ];
    for p in precision_suffixes {
        if stem.ends_with(p) {
            let base = &stem[..stem.len() - p.len()];
            if base.ends_with("vision") || base.ends_with("visual") || base.ends_with("vit") || base.ends_with("clip") {
                return true;
            }
        }
    }
    false
}

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
    let is_projector = is_vision_projector_name(&lname)
        || lname.contains("mmproj")
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
    if !models_dir.exists() {
        let _ = tokio::fs::create_dir_all(&models_dir).await;
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

        // Only loose files directly in models_dir need to be organized into dedicated folders.
        // Directories inside models_dir are already dedicated per-model folders and must not be nested.
        if path.is_dir() {
            continue;
        }

        let mut is_model = false;
        let mut size_bytes = 0;
        let mut ext = String::new();

        if path.is_file() {
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

        // 4. Move file/folder to dedicated model folder: models/<folder_name>/<filename>
        let folder_name = derive_model_folder_name(&name, repo_id_opt.as_deref());
        let dest_dir = models_dir.join(&folder_name);
        let _ = tokio::fs::create_dir_all(&dest_dir).await;
        let dest_path = dest_dir.join(&name);

        info!("[NYX Organizer] Migrating legacy model '{}' to dedicated folder {:?}", name, dest_path);

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

                let id = format!("{}/{}", folder_name, name);
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
    let raw_path = PathBuf::from(raw_model_id);
    if raw_path.exists() {
        return Some(crate::llm::local::scheduler::normalize_path_buf(&raw_path));
    }

    let normalized_id = raw_model_id.replace('\\', "/");
    let leaf_name = normalized_id.split('/').last().unwrap_or(&normalized_id);
    let with_gguf = if !leaf_name.ends_with(".gguf") {
        format!("{}.gguf", leaf_name)
    } else {
        leaf_name.to_string()
    };

    let candidates = vec![
        raw_model_id,
        normalized_id.as_str(),
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
    if let Ok(env_models) = std::env::var("NYX_MODELS_DIR") {
        let p_env = PathBuf::from(env_models);
        if !candidate_models_dirs.contains(&p_env) {
            candidate_models_dirs.push(p_env);
        }
    }

    for model_id in &candidates {
        for models_dir in &candidate_models_dirs {
            let p = models_dir.join(PathBuf::from(model_id));
            if p.exists() {
                return Some(crate::llm::local::scheduler::normalize_path_buf(&p));
            }

            // Check dedicated model subfolders: models/<folder>/<model_id>
            if let Ok(entries) = std::fs::read_dir(models_dir) {
                for entry in entries.flatten() {
                    let sub = entry.path();
                    if sub.is_dir() {
                        let candidate = sub.join(model_id);
                        if candidate.exists() {
                            return Some(crate::llm::local::scheduler::normalize_path_buf(&candidate));
                        }
                        let candidate_leaf = sub.join(leaf_name);
                        if candidate_leaf.exists() {
                            return Some(crate::llm::local::scheduler::normalize_path_buf(&candidate_leaf));
                        }
                        let candidate_gguf = sub.join(&with_gguf);
                        if candidate_gguf.exists() {
                            return Some(crate::llm::local::scheduler::normalize_path_buf(&candidate_gguf));
                        }
                    }
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
                    return Some(crate::llm::local::scheduler::normalize_path_buf(&p));
                }
                for models_dir in &candidate_models_dirs {
                    let p_rel = models_dir.join(&model.file_path);
                    if p_rel.exists() {
                        return Some(crate::llm::local::scheduler::normalize_path_buf(&p_rel));
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
    gpu_layers: Option<u32>,
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
    
    let ctx = context_size.unwrap_or(0);
    let total_layers = estimate_total_layers(gguf_meta.as_ref(), model_size_gb);

    let hw_snapshot = HardwareSnapshot::collect().await;

    let decision = compute_ngl_decision(&hw_snapshot, gguf_meta.as_ref(), model_size_gb, ctx);
    let (ngl, fully_gpu, hybrid, uses_shared_memory, estimated_vram_mb, schedule_message, recommended_cpu_threads, strategy) = match decision {
        Ok(d) => {
            if let Some(raw_l) = gpu_layers {
                let custom_ngl = raw_l.min(total_layers);
                let vram = vram_for_ngl(model_size_gb, gguf_meta.as_ref(), total_layers, custom_ngl, ctx);
                let full = custom_ngl >= total_layers;
                let strat = if custom_ngl == 0 {
                    "CpuOnly".to_string()
                } else if full {
                    if hw_snapshot.is_igpu { "IntegratedGpu".to_string() } else { "FullDedicatedGpu".to_string() }
                } else {
                    "Hybrid".to_string()
                };
                let msg = if custom_ngl == 0 {
                    format!("CPU Only — 0/{} layers on GPU, all {} layers in system RAM.", total_layers, total_layers)
                } else if full {
                    format!("GPU (Dedicated VRAM) — all {}/{} layers offloaded to {}.", total_layers, total_layers, hw_snapshot.gpu_name)
                } else {
                    format!("Custom Offload — {}/{} layers on GPU, {} layers on CPU.", custom_ngl, total_layers, total_layers.saturating_sub(custom_ngl))
                };
                let uses_shmem = hw_snapshot.has_dedicated_gpu && vram > hw_snapshot.dedicated_vram_available_mb;
                let threads = hw_snapshot.cpu_physical_cores.max(1);
                (custom_ngl, full, !full, uses_shmem, vram, msg, threads, strat)
            } else {
                (d.ngl, d.fully_gpu, d.hybrid, d.uses_shared_memory, d.estimated_vram_mb, d.message, d.recommended_cpu_threads, d.strategy)
            }
        },
        Err(err_msg) => (0, false, false, false, 0, err_msg, 0, "Unknown".to_string()),
    };
    let layers_on_gpu = ngl.min(total_layers);
    let layers_on_cpu = total_layers.saturating_sub(layers_on_gpu);

    Ok(HardwareAnalysisResult {
        gpu_name: hw_snapshot.gpu_name,
        gpu_backend: format!("{:?}", hw_snapshot.gpu_backend),
        vram_total_mb: hw_snapshot.vram_total_mb,
        vram_available_mb: hw_snapshot.vram_available_mb,
        dedicated_vram_available_mb: hw_snapshot.dedicated_vram_available_mb,
        shared_gpu_memory_mb: hw_snapshot.shared_gpu_memory_mb,
        total_gpu_memory_mb: hw_snapshot.dedicated_vram_available_mb.saturating_add(hw_snapshot.shared_gpu_memory_mb),
        strategy,
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
        hybrid,
        uses_shared_memory,
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
    gpu_layers: Option<u32>,
) -> Result<HardwareAnalysisResult, String> {
    analyze_hardware(app, model_id, context_size, gpu_layers).await
}

#[tauri::command]
pub async fn open_external_installer_cli(_app: AppHandle) -> Result<(), String> {
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

pub static ACTIVE_LOCAL_LLM_PATH: std::sync::LazyLock<std::sync::Mutex<Option<PathBuf>>> = std::sync::LazyLock::new(|| {
    std::sync::Mutex::new(None)
});

pub fn get_active_local_llm_path() -> Option<PathBuf> {
    ACTIVE_LOCAL_LLM_PATH.lock().unwrap().clone()
}

#[derive(Clone, Debug, Default)]
pub struct ActiveServerConfig {
    pub model_id: String,
    pub context_size: Option<u32>,
    pub gpu_layers: Option<u32>,
    pub cpu_threads: Option<u32>,
    pub flash_attention: Option<bool>,
    pub kv_cache_type: Option<String>,
    pub batch_size: Option<u32>,
    pub split_mode: Option<String>,
    pub tensor_split: Option<String>,
    pub reasoning: Option<bool>,
    pub reasoning_budget: Option<i32>,
    pub has_mmproj_loaded: bool,
    pub has_audio_loaded: bool,
    pub has_mtp_loaded: bool,
    pub mmproj_file: Option<String>,
    pub draft_model_file: Option<String>,
}

pub static ACTIVE_SERVER_CONFIG: std::sync::LazyLock<std::sync::Mutex<Option<ActiveServerConfig>>> = std::sync::LazyLock::new(|| {
    std::sync::Mutex::new(None)
});

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
    reasoning: Option<bool>,
    reasoning_budget: Option<i32>,
    load_vision_projector: Option<bool>,
    load_audio_projector: Option<bool>,
    load_draft_model: Option<bool>,
) -> Result<(), String> {
    let _ = use_mlock;
    let _ = disable_kv_offload;
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
    let model_path = crate::llm::local::scheduler::normalize_path_buf(&model_path);

    let explicit_draft = if let Some(ref d_id) = draft_model_id.as_ref().filter(|id| !id.trim().is_empty()) {
        resolve_model_path(&app, d_id).await
    } else {
        None
    };

    // Try to find an mmproj or audio projector file for this model
    let models_dir = app_dir.join("models");
    let model_filename = model_path.file_name().unwrap_or_default();
    let model_stem = model_path.file_stem().unwrap_or_default();
    let mut meta_search_paths = Vec::new();
    meta_search_paths.push(PathBuf::from(format!("{}.meta.json", model_path.display())));
    meta_search_paths.push(PathBuf::from(format!("{}.json", model_path.display())));
    meta_search_paths.push(model_path.with_extension("meta.json"));
    meta_search_paths.push(model_path.with_extension("gguf.meta.json"));
    if let Some(parent) = model_path.parent() {
        meta_search_paths.push(parent.join(format!("{}.meta.json", model_filename.to_string_lossy())));
        meta_search_paths.push(parent.join(format!("{}.gguf.meta.json", model_filename.to_string_lossy())));
        meta_search_paths.push(parent.join(format!("{}.meta.json", model_stem.to_string_lossy())));
        meta_search_paths.push(parent.join(format!("{}.gguf.meta.json", model_stem.to_string_lossy())));
    }
    meta_search_paths.push(models_dir.join(format!("{}.meta.json", model_filename.to_string_lossy())));
    meta_search_paths.push(models_dir.join(format!("{}.gguf.meta.json", model_filename.to_string_lossy())));

    let (target_repo_id, has_multimodal_flag, meta_supports_reasoning, meta_context_length, target_architecture, target_pipeline_tag) = {
        let mut rid: Option<String> = None;
        let mut mm = false;
        let mut reasoning_from_meta = false;
        let mut ctx_len: Option<u32> = None;
        let mut arch: Option<String> = None;
        let mut ptag: Option<String> = None;
        for mp in &meta_search_paths {
            if let Ok(content) = tokio::fs::read_to_string(mp).await {
                if let Ok(j) = serde_json::from_str::<serde_json::Value>(&content) {
                    if rid.is_none() {
                        rid = j.get("repo_id").and_then(|v| v.as_str()).map(|s| s.to_string());
                    }
                    if arch.is_none() {
                        arch = j.get("architecture").and_then(|v| v.as_str()).map(|s| s.to_string());
                    }
                    if ptag.is_none() {
                        ptag = j.get("pipeline_tag").and_then(|v| v.as_str()).map(|s| s.to_string());
                    }
                    if j.get("supports_vision").and_then(|v| v.as_bool()).unwrap_or(false)
                        || j.get("supports_audio").and_then(|v| v.as_bool()).unwrap_or(false)
                    {
                        mm = true;
                    }
                    if j.get("supports_reasoning").and_then(|v| v.as_bool()).unwrap_or(false) {
                        reasoning_from_meta = true;
                    }
                    if let Some(tags) = j.get("tags").and_then(|v| v.as_array()) {
                        for t in tags {
                            if let Some(s) = t.as_str() {
                                let sl = s.to_lowercase();
                                if sl == "reasoning" || sl == "thinking" || sl == "thought" || sl.contains("reasoning") || sl.contains("chain-of-thought") {
                                    reasoning_from_meta = true;
                                }
                            }
                        }
                    }
                    if ctx_len.is_none() {
                        if let Some(c) = j.get("context_length").and_then(|v| v.as_u64()) {
                            ctx_len = Some(c as u32);
                        }
                    }
                }
            }
        }
        (rid, mm, reasoning_from_meta, ctx_len, arch, ptag)
    };

    let name_lower = model_id.to_lowercase();
    let folder_has_mmproj = model_path.parent().map(|p| {
        std::fs::read_dir(p).map(|rd| rd.flatten().any(|e| {
            let n = e.file_name().to_string_lossy().into_owned();
            is_vision_projector_name(&n)
        })).unwrap_or(false)
    }).unwrap_or(false);

    let is_candidate_model = has_multimodal_flag
        || folder_has_mmproj
        || target_architecture.as_deref() == Some("gemma4")
        || target_pipeline_tag.as_deref().map_or(false, |pt| pt.contains("image"))
        || name_lower.contains("-vl") 
        || name_lower.contains("_vl") 
        || name_lower.contains("vision") 
        || name_lower.contains("llava")
        || name_lower.contains("audio")
        || name_lower.contains("whisper")
        || name_lower.contains("multimodal");

    let mut mmproj_path = None;
    let is_audio = load_audio_projector.unwrap_or(false);
    let explicit_disable_vision = load_vision_projector == Some(false);
    let should_load_mm = (!explicit_disable_vision && is_candidate_model)
        || load_vision_projector == Some(true)
        || is_audio;
    if should_load_mm {
        let mut candidate_paths = Vec::new();
        // Priority 1: Check the model's own dedicated folder FIRST
        if let Some(parent) = model_path.parent() {
            if let Ok(mut entries) = tokio::fs::read_dir(parent).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let name = entry.file_name().to_string_lossy().to_string();
                    let matches_type = if is_audio {
                        (name.to_lowercase().contains("whisper") || name.to_lowercase().contains("audio")) && name.to_lowercase().ends_with(".gguf")
                    } else {
                        is_vision_projector_name(&name)
                    };
                    if matches_type {
                        candidate_paths.push(entry.path());
                    }
                }
            }
        }
        // If not found in parent, check models_dir root
        if candidate_paths.is_empty() {
            if let Ok(mut entries) = tokio::fs::read_dir(&models_dir).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let name = entry.file_name().to_string_lossy().to_string();
                    let matches_type = if is_audio {
                        (name.to_lowercase().contains("whisper") || name.to_lowercase().contains("audio")) && name.to_lowercase().ends_with(".gguf")
                    } else {
                        is_vision_projector_name(&name)
                    };
                    if matches_type {
                        candidate_paths.push(entry.path());
                    }
                }
            }
        }

        // Sort candidates by file size ascending so lightweight/BF16 projectors are prioritized over F32
        let mut paths_with_size = Vec::new();
        for p in candidate_paths {
            let size = tokio::fs::metadata(&p).await.map(|m| m.len()).unwrap_or(u64::MAX);
            paths_with_size.push((p, size));
        }
        paths_with_size.sort_by_key(|(_, size)| *size);

        // 1. Companion file in the model's dedicated directory
        if let Some(parent) = model_path.parent() {
            let norm_parent = normalize_path_buf(parent);
            for (path, _) in &paths_with_size {
                if path.parent().map(normalize_path_buf) == Some(norm_parent.clone()) {
                    info!("[start_local_server] Auto-paired dedicated model folder projector: {:?}", path);
                    mmproj_path = Some(path.clone());
                    break;
                }
            }
        }

        // 2. Match by metadata repo_id
        if mmproj_path.is_none() {
            for (path, _) in &paths_with_size {
                let meta_path_1 = PathBuf::from(format!("{}.meta.json", path.display()));
                let meta_path_2 = path.with_extension("meta.json");
                let meta_path_3 = path.with_extension("gguf.meta.json");
                for mp in [&meta_path_1, &meta_path_2, &meta_path_3] {
                    if let Ok(content) = tokio::fs::read_to_string(mp).await {
                        if let Ok(j) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(repo_id) = j.get("repo_id").and_then(|v| v.as_str()) {
                                if Some(repo_id.to_string()) == target_repo_id && target_repo_id.is_some() {
                                    info!("[start_local_server] Auto-paired matching repo_id projector: {:?}", path);
                                    mmproj_path = Some(path.clone());
                                    break;
                                }
                            }
                        }
                    }
                }
                if mmproj_path.is_some() {
                    break;
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

    let hw = HardwareSnapshot::collect().await;
    let model_max_ctx = gguf_meta.as_ref().and_then(|m| m.context_length).or(meta_context_length).unwrap_or(32768);
    let effective_ctx = if ctx == 0 {
        // Auto: pass 0 to let the GPU scheduler calculate the optimal context from available budget
        0
    } else {
        // Explicit: honor user value up to model max, leveraging Shared GPU Memory when physical VRAM is exceeded
        ctx.min(model_max_ctx).max(512)
    };
    info!("[start_local_server] requested_ctx={} effective_ctx={} model_max_ctx={}",
        ctx, effective_ctx, model_max_ctx);

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

            let model_size_mb = tokio::fs::metadata(&model_path).await
                .map(|m| m.len() / (1024 * 1024))
                .unwrap_or(2048);
            let is_low_vram = hw.vram_available_mb < model_size_mb.saturating_add(1024);

            let threads = cpu_threads.unwrap_or_else(|| {
                hw.cpu_physical_cores.max(1)
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
        let hw = HardwareSnapshot::collect().await;

        let _ = app.emit("vram-decision", serde_json::json!({
            "ngl": 0,
            "fully_gpu": true,
            "hybrid": false,
            "message": format!("⚡ {} active ({:.1} GB)", engine_label, model_size_gb),
            "estimated_vram_mb": (model_size_gb * 1024.0) as u64,
            "vram_available_mb": hw.vram_available_mb,
            "dedicated_vram_available_mb": hw.dedicated_vram_available_mb,
            "shared_gpu_memory_mb": hw.shared_gpu_memory_mb,
            "gpu_name": hw.gpu_name,
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
        let hw = HardwareSnapshot::collect().await;

        let _ = app.emit("vram-decision", serde_json::json!({
            "ngl": gpu_layers.unwrap_or(0),
            "fully_gpu": gpu_layers.is_some(),
            "hybrid": false,
            "message": format!("⚡ {} active on port {} ({:.1} GB)", engine_label, native_port, model_size_gb),
            "estimated_vram_mb": (model_size_gb * 1024.0) as u64,
            "vram_available_mb": hw.vram_available_mb,
            "dedicated_vram_available_mb": hw.dedicated_vram_available_mb,
            "shared_gpu_memory_mb": hw.shared_gpu_memory_mb,
            "gpu_name": hw.gpu_name,
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

    let target_bin_name = match &hw.gpu_backend {
        GpuBackend::Cuda => "llama-server-cuda.exe",
        GpuBackend::Vulkan | GpuBackend::Npu => "llama-server-vulkan.exe",
        _ => "llama-server.exe",
    };

    let cuda_path = app_dir.join("binaries").join("llama-server-cuda.exe");
    let vulkan_path = app_dir.join("binaries").join("llama-server-vulkan.exe");

    // Check all possible binary locations on disk
    let mut candidate_dirs = vec![
        app_dir.join("binaries"),
        PathBuf::from(std::env::var("APPDATA").unwrap_or_default()).join("com.nyx.desktop").join("binaries"),
        PathBuf::from(std::env::var("APPDATA").unwrap_or_default()).join("nyx").join("binaries"),
    ];
    if let Ok(cwd) = std::env::current_dir() {
        candidate_dirs.push(cwd.join(".nyx-models").join("bin"));
        candidate_dirs.push(cwd.join("binaries"));
    }
    if let Ok(env_models) = std::env::var("NYX_MODELS_DIR") {
        candidate_dirs.push(PathBuf::from(env_models).join("bin"));
    }

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

    // --- Step 2: Speculative decoding / MTP Companion Resolution ---
    let mtp_companion = find_mtp_model(&model_path);
    let regular_draft = find_draft_model(&model_path);

    let (draft_model_path, spec_type) = if let Some(explicit) = explicit_draft {
        let is_mtp = is_mtp_model(&explicit);
        let st = if is_mtp { "draft-mtp".to_string() } else { "draft-simple".to_string() };
        (Some(explicit), Some(st))
    } else if let Some(mtp) = mtp_companion {
        // Auto-load MTP companion unless load_draft_model was explicitly set to false
        if load_draft_model.unwrap_or(true) {
            info!("[start_local_server] Auto-paired MTP companion for speculative decoding: {:?}", mtp);
            (Some(mtp), Some("draft-mtp".to_string()))
        } else {
            (None, None)
        }
    } else if load_draft_model.unwrap_or(true) && regular_draft.is_some() {
        info!("[start_local_server] Auto-paired draft model for speculative decoding: {:?}", regular_draft);
        (regular_draft, Some("draft-simple".to_string()))
    } else {
        (None, None)
    };


    let model_filename = model_path
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or(&model_id);
    let full_model_ref = format!("{} {}", model_id, model_filename);

    let hybrid_cfg = match compute_gpu_inference_config(&hw, gguf_meta.as_ref(), model_size_gb, effective_ctx, draft_model_path.clone(), is_auto_ctx, Some(&full_model_ref)) {
        Ok(cfg) => cfg,
        Err(err_msg) => {
            // Model cannot fit in GPU VRAM — surface a clear error to the frontend.
            // CPU fallback is disabled by design.
            error!("[start_local_server] GPU scheduler error: {}", err_msg);
            return Err(err_msg);
        }
    };
    let total_layers = estimate_total_layers(gguf_meta.as_ref(), model_size_gb);


    // When a dedicated GPU is available, offload 100% of the layers to the GPU.
    let final_ngl = if hw.has_dedicated_gpu {
        total_layers
    } else {
        match gpu_layers {
            Some(layers) => layers.min(total_layers),
            None => hybrid_cfg.ngl.min(total_layers),
        }
    };
    let fully_gpu = final_ngl >= total_layers;

    // Generation threads: physical cores for sequential decode.
    let final_threads = cpu_threads.filter(|&t| t > 0).unwrap_or_else(|| {
        hw.cpu_physical_cores.max(1)
    });
    // Batch / ubatch: user override or scheduler recommendation.
    let final_batch = batch_size.filter(|&b| b > 0).unwrap_or(hybrid_cfg.batch_size);
    let final_ubatch = hybrid_cfg.ubatch_size;
    // KV cache type: If user set 'auto' or left unset, use the scheduler recommendation (q8_0/q4_0)
    let final_kv_type = if kv_cache_type.as_deref() == Some("auto") || kv_cache_type.is_none() {
        Some(hybrid_cfg.kv_cache_type.clone())
    } else {
        kv_cache_type.clone()
    };
    // Keep KV offload enabled so llama.cpp can place KV data with the GPU layers.
    let final_mlock   = false; // Never mlock in GPU-only mode — double-pinning risk
    let final_no_kv   = false; // KV must stay in VRAM
    let final_flash   = flash_attention.unwrap_or(true);

    let effective_context_size = hybrid_cfg.effective_context_size;
    // Effective context comes from the GPU scheduler (may be auto-reduced to fit VRAM).
    let estimated_vram_mb = vram_for_ngl(model_size_gb, gguf_meta.as_ref(), total_layers, final_ngl, effective_context_size);
    let context_capped = effective_context_size < effective_ctx;
    let mmproj_filename = mmproj_path.as_ref().and_then(|p| p.file_name()).map(|f| f.to_string_lossy().into_owned());
    let draft_filename = draft_model_path.as_ref().and_then(|p| p.file_name()).map(|f| f.to_string_lossy().into_owned());

    let _ = app.emit("vram-decision", serde_json::json!({
        "ngl": final_ngl,
        "fully_gpu": fully_gpu,
        "hybrid": !fully_gpu,
        "uses_shared_memory": hybrid_cfg.uses_shared_memory,
        "message": hybrid_cfg.message,
        "estimated_vram_mb": estimated_vram_mb,
        "vram_available_mb": hw.vram_available_mb,
        "dedicated_vram_available_mb": hw.dedicated_vram_available_mb,
        "shared_gpu_memory_mb": hw.shared_gpu_memory_mb,
        "gpu_name": hw.gpu_name,
        "model_size_gb": (model_size_gb * 0.80),
        "raw_file_size_gb": model_size_gb,
        "layers_on_gpu": final_ngl.min(total_layers),
        "layers_on_cpu": total_layers.saturating_sub(final_ngl),
        "cpu_threads": final_threads,
        "threads_batch": hybrid_cfg.threads_batch,
        "ubatch_size": final_ubatch,
        "batch_size": final_batch,
        "kv_cache_type": final_kv_type,
        "kv_in_vram": true,
        "mlock": final_mlock,
        "flash_attention": final_flash,
        "inference_mode": if fully_gpu { "full_gpu" } else { "hybrid" },
        "llamacpp_version": Downloader::get_installed_version(&app_dir).await,
        // 2026 additions
        "is_igpu": hw.is_igpu,
        "is_npu": hw.gpu_backend == GpuBackend::Npu,
        "context_capped": context_capped,
        "effective_context_size": effective_context_size,
        "gpu_backend": format!("{:?}", hw.gpu_backend),
        "has_mmproj": mmproj_path.is_some(),
        "mmproj_file": mmproj_filename,
        "has_mtp": draft_model_path.is_some(),
        "draft_model_file": draft_filename,
        "spec_type": spec_type.clone(),
    }));

    // --- Step 3: Build config and start the server ---
    // Use the scheduler's effective context — it may have been auto-reduced to
    // keep all layers on the GPU instead of going hybrid/CPU.
    let server_ctx = effective_context_size;

    // Prompt cache must be model-specific. A shared cache file is incompatible
    // across models (different KV dimensions) and causes a hard crash on switch.
    let prompt_cache_path = {
        let model_stem = model_path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "model".to_string());
        Some(app_dir.join("models").join(format!("{}.prompt_cache.bin", model_stem)))
    };

    // GPU Device Assignment:
    // When a dedicated GPU is present, all processing MUST be performed by the
    // dedicated GPU (CUDA0 / dGPU). Integrated GPUs (iGPU / Intel UHD) and CPU
    // must NEVER execute model layers alongside a dedicated GPU.
    // If the model exceeds physical VRAM, Windows WDDM Shared GPU Memory automatically
    // provides system RAM to the dedicated GPU while all compute remains 100% on the dGPU.
    let (final_device_id, final_split_mode) = if split_mode.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false) {
        (
            if hw.gpu_device_id.is_empty() { None } else { Some(hw.gpu_device_id.clone()) },
            split_mode.clone().filter(|s| !s.trim().is_empty()),
        )
    } else {
        (
            if hw.gpu_device_id.is_empty() { None } else { Some(hw.gpu_device_id.clone()) },
            None,
        )
    };
    let final_tensor_split = tensor_split.clone().filter(|s| !s.trim().is_empty());

    // Stop any existing tracked child process and kill any lingering orphans BEFORE allocating port.
    // This releases port 8080 so the new server can reliably reuse port 8080 without drifting to 8081.
    manager.stop().await;
    LlamaManager::kill_orphans(None).await;

    let active_port = find_free_port();
    SERVER_PORT.store(active_port, std::sync::atomic::Ordering::Relaxed);

    let resolved_reasoning = reasoning.or_else(|| {
        let gguf_reasoning = gguf_meta.as_ref().map(|m| m.supports_reasoning).unwrap_or(false);
        if meta_supports_reasoning || gguf_reasoning {
            Some(true)
        } else {
            None
        }
    });

    let mmproj_size_mb = if let Some(ref p) = mmproj_path {
        std::fs::metadata(p).map(|m| m.len() / (1024 * 1024)).unwrap_or(1000)
    } else {
        0
    };
    let gpu_vram_avail = if hw.has_dedicated_gpu {
        hw.dedicated_vram_available_mb
    } else {
        hw.vram_available_mb
    };
    // Real-time available dedicated VRAM headroom after accounting for model and KV cache
    let mut remaining_vram = gpu_vram_avail.saturating_sub(estimated_vram_mb);

    let draft_size_mb = if let Some(ref p) = draft_model_path {
        tokio::fs::metadata(p).await.map(|m| m.len() / (1024 * 1024)).unwrap_or(0)
    } else {
        0
    };

    let can_gpu_offload = hw.has_dedicated_gpu || hw.gpu_backend == GpuBackend::Metal || hw.vram_available_mb > 0;

    // Companion files (mmproj, MTP heads, draft models):
    // When a dedicated GPU is available, the complete model and ALL support files run on the dedicated GPU.
    let mmproj_offload = if hw.has_dedicated_gpu {
        mmproj_path.is_some()
    } else if can_gpu_offload && mmproj_path.is_some() && remaining_vram >= mmproj_size_mb {
        remaining_vram = remaining_vram.saturating_sub(mmproj_size_mb);
        true
    } else {
        false
    };

    let ngl_draft = if hw.has_dedicated_gpu && draft_model_path.is_some() {
        Some(total_layers)
    } else if can_gpu_offload && draft_model_path.is_some() && remaining_vram >= draft_size_mb {
        Some(total_layers)
    } else if draft_model_path.is_some() {
        Some(0)
    } else {
        None
    };

    let mut cfg = LlamaServerConfig {
        server_path: server_path.clone(),
        model_path,
        context_size: server_ctx,
        ngl: final_ngl,
        cpu_threads: final_threads,
        threads_batch: hybrid_cfg.threads_batch,
        ubatch_size: final_ubatch,
        device_id: final_device_id,
        flash_attention: final_flash,
        kv_cache_type: final_kv_type,
        use_mlock: final_mlock,
        use_mmap: hybrid_cfg.use_mmap,
        batch_size: final_batch,
        draft_model_path,
        spec_type,
        spec_draft_min: None,
        spec_draft_max: None,
        ngl_draft,
        disable_kv_offload: final_no_kv,
        prompt_cache_path,
        mmproj_path: mmproj_path.clone(),
        mmproj_offload,
        port: active_port,
        split_mode: final_split_mode,
        tensor_split: final_tensor_split,
        reasoning: resolved_reasoning,
        reasoning_budget,
        extra_args: hybrid_cfg.extra_args,
    };

    let app_handle = app.clone();
    let start_res = manager.start(&cfg, Some(move |pct: u32, msg: &str| {
        let _ = app_handle.emit("llm-server-loading-progress", serde_json::json!({
            "progress": pct,
            "message": msg
        }));
    })).await;

    if let Err(err) = start_res {
        warn!("[start_local_server] Initial launch failed: {}. Initiating dynamic memory recovery...", err);
        let mut recovered = false;

        // Step 1: Offload draft/MTP companion to system memory on CPU
        if cfg.draft_model_path.is_some() && cfg.ngl_draft != Some(0) {
            let mut fallback_cfg = cfg.clone();
            fallback_cfg.ngl_draft = Some(0);
            let app_handle_retry = app.clone();
            if let Ok(()) = manager.start(&fallback_cfg, Some(move |pct: u32, msg: &str| {
                let _ = app_handle_retry.emit("llm-server-loading-progress", serde_json::json!({ "progress": pct, "message": msg }));
            })).await {
                recovered = true;
                cfg = fallback_cfg;
            }
        }

        // Step 2: Offload mmproj to system memory on CPU
        if !recovered && cfg.mmproj_offload {
            let mut fallback_cfg = cfg.clone();
            fallback_cfg.mmproj_offload = false;
            fallback_cfg.ngl_draft = Some(0);
            let app_handle_retry = app.clone();
            if let Ok(()) = manager.start(&fallback_cfg, Some(move |pct: u32, msg: &str| {
                let _ = app_handle_retry.emit("llm-server-loading-progress", serde_json::json!({ "progress": pct, "message": msg }));
            })).await {
                recovered = true;
                cfg = fallback_cfg;
            }
        }

        // Step 3: Run without draft model if draft model is incompatible
        if !recovered && cfg.draft_model_path.is_some() {
            let mut fallback_cfg = cfg.clone();
            fallback_cfg.draft_model_path = None;
            fallback_cfg.spec_type = None;
            fallback_cfg.mmproj_offload = false;
            let app_handle_retry = app.clone();
            if let Ok(()) = manager.start(&fallback_cfg, Some(move |pct: u32, msg: &str| {
                let _ = app_handle_retry.emit("llm-server-loading-progress", serde_json::json!({ "progress": pct, "message": msg }));
            })).await {
                recovered = true;
                cfg = fallback_cfg;
            }
        }

        // Step 3.5: If high layer offload failed, reduce offloaded layers by 50%
        if !recovered && cfg.ngl > 1 {
            let mut fallback_cfg = cfg.clone();
            fallback_cfg.ngl = cfg.ngl / 2;
            fallback_cfg.ngl_draft = Some(0);
            fallback_cfg.mmproj_offload = false;
            let app_handle_retry = app.clone();
            if let Ok(()) = manager.start(&fallback_cfg, Some(move |pct: u32, msg: &str| {
                let _ = app_handle_retry.emit("llm-server-loading-progress", serde_json::json!({ "progress": pct, "message": msg }));
            })).await {
                recovered = true;
                cfg = fallback_cfg;
            }
        }

        // Step 4: If GPU VRAM allocation failed, seamlessly place layers in system memory on CPU (-ngl 0)
        if !recovered && cfg.ngl > 0 {
            warn!("[start_local_server] VRAM exhausted; seamlessly running model in system memory on CPU (-ngl 0)...");
            let mut fallback_cfg = cfg.clone();
            fallback_cfg.ngl = 0;
            fallback_cfg.ngl_draft = Some(0);
            fallback_cfg.mmproj_offload = false;
            fallback_cfg.draft_model_path = None;
            fallback_cfg.spec_type = None;
            let app_handle_retry = app.clone();
            if let Ok(()) = manager.start(&fallback_cfg, Some(move |pct: u32, msg: &str| {
                let _ = app_handle_retry.emit("llm-server-loading-progress", serde_json::json!({ "progress": pct, "message": msg }));
            })).await {
                recovered = true;
                cfg = fallback_cfg;
            }
        }

        if !recovered {
            return Err(err);
        }

        // Re-emit updated vram-decision reflecting the recovered state
        let _ = app.emit("vram-decision", serde_json::json!({
            "ngl": cfg.ngl,
            "fully_gpu": cfg.ngl >= total_layers && cfg.ngl > 0,
            "hybrid": cfg.ngl < total_layers,
            "uses_shared_memory": false,
            "message": if cfg.ngl == 0 {
                format!("CPU (System RAM) — running in system memory on CPU (-ngl 0). Context: {}.", cfg.context_size)
            } else {
                format!("Hybrid — {}/{} layers on GPU and {} layers in system RAM. Context: {}.", cfg.ngl, total_layers, total_layers.saturating_sub(cfg.ngl), cfg.context_size)
            },
            "estimated_vram_mb": vram_for_ngl(model_size_gb, gguf_meta.as_ref(), total_layers, cfg.ngl, cfg.context_size),
            "vram_available_mb": hw.vram_available_mb,
            "dedicated_vram_available_mb": hw.dedicated_vram_available_mb,
            "shared_gpu_memory_mb": hw.shared_gpu_memory_mb,
            "gpu_name": hw.gpu_name,
            "model_size_gb": (model_size_gb * 0.80),
            "raw_file_size_gb": model_size_gb,
            "layers_on_gpu": cfg.ngl.min(total_layers),
            "layers_on_cpu": total_layers.saturating_sub(cfg.ngl),
            "cpu_threads": cfg.cpu_threads,
            "threads_batch": cfg.threads_batch,
            "ubatch_size": cfg.ubatch_size,
            "batch_size": cfg.batch_size,
            "kv_cache_type": cfg.kv_cache_type.clone(),
            "kv_in_vram": cfg.ngl > 0,
            "mlock": cfg.use_mlock,
            "flash_attention": cfg.flash_attention,
            "inference_mode": if cfg.ngl >= total_layers && cfg.ngl > 0 { "full_gpu" } else { "hybrid" },
            "llamacpp_version": Downloader::get_installed_version(&app_dir).await,
            "is_igpu": hw.is_igpu,
            "is_npu": hw.gpu_backend == GpuBackend::Npu,
            "context_capped": cfg.context_size < effective_ctx,
            "effective_context_size": cfg.context_size,
            "gpu_backend": format!("{:?}", hw.gpu_backend),
            "has_mmproj": cfg.mmproj_path.is_some(),
            "mmproj_file": cfg.mmproj_path.as_ref().and_then(|p| p.file_name()).map(|f| f.to_string_lossy().into_owned()),
            "has_mtp": cfg.draft_model_path.is_some(),
            "draft_model_file": cfg.draft_model_path.as_ref().and_then(|p| p.file_name()).map(|f| f.to_string_lossy().into_owned()),
            "spec_type": cfg.spec_type.clone(),
        }));
    }

    {
        let mut active_llm = ACTIVE_LOCAL_LLM_MODEL.lock().unwrap();
        *active_llm = Some(model_id.clone());
    }
    {
        let mut active_path = ACTIVE_LOCAL_LLM_PATH.lock().unwrap();
        *active_path = Some(cfg.model_path.clone());
    }
    ACTIVE_SERVER_CTX_SIZE.store(server_ctx, std::sync::atomic::Ordering::Relaxed);
    {
        let mmproj_filename = cfg.mmproj_path.as_ref().and_then(|p| p.file_name()).map(|f| f.to_string_lossy().into_owned());
        let draft_filename = cfg.draft_model_path.as_ref().and_then(|p| p.file_name()).map(|f| f.to_string_lossy().into_owned());

        let mut cfg_lock = ACTIVE_SERVER_CONFIG.lock().unwrap();
        *cfg_lock = Some(ActiveServerConfig {
            model_id: model_id.clone(),
            context_size,
            gpu_layers,
            cpu_threads,
            flash_attention,
            kv_cache_type: kv_cache_type.clone(),
            batch_size,
            split_mode: split_mode.clone(),
            tensor_split: tensor_split.clone(),
            reasoning,
            reasoning_budget,
            has_mmproj_loaded: mmproj_path.is_some(),
            has_audio_loaded: load_audio_projector.unwrap_or(false),
            has_mtp_loaded: cfg.draft_model_path.is_some(),
            mmproj_file: mmproj_filename.clone(),
            draft_model_file: draft_filename.clone(),
        });
    }

    let mmproj_filename = mmproj_path.as_ref().and_then(|p| p.file_name()).map(|f| f.to_string_lossy().into_owned());
    let draft_filename = cfg.draft_model_path.as_ref().and_then(|p| p.file_name()).map(|f| f.to_string_lossy().into_owned());

    let _ = app.emit("llm-server-ready", serde_json::json!({
        "status": "Ready",
        "model_id": model_id,
        "has_mmproj": mmproj_path.is_some(),
        "mmproj_file": mmproj_filename,
        "has_mtp": cfg.draft_model_path.is_some(),
        "draft_model_file": draft_filename,
        "spec_type": cfg.spec_type.clone(),
    }));
    Ok(())
}

#[tauri::command]
pub async fn load_multimodal_support(
    app: AppHandle,
    manager: State<'_, Arc<LlamaManager>>,
    for_audio: Option<bool>,
) -> Result<bool, String> {
    let audio = for_audio.unwrap_or(false);
    let current_cfg = {
        let guard = ACTIVE_SERVER_CONFIG.lock().unwrap();
        guard.clone()
    };

    let cfg = match current_cfg {
        Some(c) => c,
        None => return Ok(false),
    };

    if (!audio && cfg.has_mmproj_loaded) || (audio && cfg.has_audio_loaded) {
        return Ok(true);
    }

    info!("[load_multimodal_support] Hot-loading companion support file (audio={}) for: {}", audio, cfg.model_id);
    start_local_server(
        app,
        manager,
        cfg.model_id,
        cfg.context_size,
        cfg.gpu_layers,
        cfg.cpu_threads,
        cfg.flash_attention,
        cfg.kv_cache_type,
        None,
        cfg.batch_size,
        cfg.draft_model_file.clone(),
        None,
        cfg.split_mode,
        cfg.tensor_split,
        cfg.reasoning,
        cfg.reasoning_budget,
        Some(!audio),
        Some(audio),
        Some(cfg.draft_model_file.is_some() || cfg.has_mtp_loaded),
    ).await?;

    Ok(true)
}

#[tauri::command]
pub async fn unload_multimodal_support(
    app: AppHandle,
    manager: State<'_, Arc<LlamaManager>>,
) -> Result<bool, String> {
    let current_cfg = {
        let guard = ACTIVE_SERVER_CONFIG.lock().unwrap();
        guard.clone()
    };

    let cfg = match current_cfg {
        Some(c) => c,
        None => return Ok(false),
    };

    if !cfg.has_mmproj_loaded && !cfg.has_audio_loaded {
        return Ok(true);
    }

    info!("[unload_multimodal_support] Unloading companion support files, restoring clean base model: {}", cfg.model_id);
    start_local_server(
        app,
        manager,
        cfg.model_id,
        cfg.context_size,
        cfg.gpu_layers,
        cfg.cpu_threads,
        cfg.flash_attention,
        cfg.kv_cache_type,
        None,
        cfg.batch_size,
        cfg.draft_model_file.clone(),
        None,
        cfg.split_mode,
        cfg.tensor_split,
        cfg.reasoning,
        cfg.reasoning_budget,
        Some(false),
        Some(false),
        Some(cfg.draft_model_file.is_some() || cfg.has_mtp_loaded),
    ).await?;

    Ok(true)
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
    {
        let mut cfg_lock = ACTIVE_SERVER_CONFIG.lock().unwrap();
        *cfg_lock = None;
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

            let (has_mmproj, mmproj_file, has_mtp, draft_model_file) = {
                let cfg_guard = ACTIVE_SERVER_CONFIG.lock().unwrap();
                if let Some(ref c) = *cfg_guard {
                    (c.has_mmproj_loaded, c.mmproj_file.clone(), c.has_mtp_loaded, c.draft_model_file.clone())
                } else {
                    (false, None, false, None)
                }
            };

            Ok(serde_json::json!({
                "running": true,
                "model_id": model_id,
                "port": port,
                "has_mmproj": has_mmproj,
                "mmproj_file": mmproj_file,
                "has_mtp": has_mtp,
                "draft_model_file": draft_model_file,
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
    pub supports_reasoning: bool,
    pub supports_vision: bool,
    #[serde(default)]
    pub supports_audio: bool,
    #[serde(default)]
    pub supports_tools: bool,
    #[serde(default)]
    pub has_draft: bool,
    #[serde(default)]
    pub has_mtp: bool,
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
        let mut total_size = 0u64;
        let mut primary_ext = String::new();
        let mut has_weights = false;
        let mut has_model_index = false;

        let mut read_dir = match tokio::fs::read_dir(dir).await {
            Ok(rd) => rd,
            Err(_) => return (0, String::new(), false, false),
        };

        while let Ok(Some(entry)) = read_dir.next_entry().await {
            let path = entry.path();
            if let Ok(ft) = entry.file_type().await {
                if ft.is_file() {
                    let len = entry.metadata().await.map(|m| m.len()).unwrap_or(0);
                    total_size += len;

                    let name = entry.file_name().to_string_lossy().to_string();
                    if name == "model_index.json" {
                        has_model_index = true;
                    }

                    if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                        let lower_ext = ext.to_lowercase();
                        if ["gguf", "safetensors", "bin", "ckpt", "pt", "onnx", "pth", "engine"].contains(&lower_ext.as_str()) {
                            has_weights = true;
                            if primary_ext.is_empty() {
                                primary_ext = lower_ext;
                            }
                        }
                    }
                } else if ft.is_dir() && !entry.file_name().to_string_lossy().starts_with('.') {
                    let (sub_size, sub_ext, sub_weights, sub_index) =
                        scan_folder_fast(&path, depth + 1).await;
                    total_size += sub_size;
                    if !sub_ext.is_empty() && primary_ext.is_empty() {
                        primary_ext = sub_ext;
                    }
                    if sub_weights {
                        has_weights = true;
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

async fn extract_model_meta_capabilities(
    meta_paths: &[std::path::PathBuf],
    gguf_meta: Option<&GgufMetadata>,
    has_mmproj: bool,
    model_type: &str,
    db_tags: Option<&str>,
) -> (bool, bool, bool, bool) {
    let mut supports_reasoning = false;
    let mut supports_vision = has_mmproj || model_type == "vision";
    let mut supports_audio = model_type == "audio";
    let mut supports_tools = false;

    for meta_path in meta_paths {
        if let Ok(content) = tokio::fs::read_to_string(meta_path).await {
            if let Ok(j) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(r) = j.get("supports_reasoning").and_then(|v| v.as_bool()) {
                    supports_reasoning = supports_reasoning || r;
                }
                if let Some(v) = j.get("supports_vision").and_then(|v| v.as_bool()) {
                    supports_vision = supports_vision || v;
                }
                if let Some(a) = j.get("supports_audio").and_then(|v| v.as_bool()) {
                    supports_audio = supports_audio || a;
                }
                if let Some(t) = j.get("supports_tools").and_then(|v| v.as_bool()) {
                    supports_tools = supports_tools || t;
                }
                if let Some(tags) = j.get("tags").and_then(|v| v.as_array()) {
                    for t in tags {
                        if let Some(s) = t.as_str() {
                            let sl = s.to_lowercase();
                            if sl == "reasoning" || sl == "thinking" || sl == "thought" || sl.contains("reasoning") || sl.contains("chain-of-thought") {
                                supports_reasoning = true;
                            }
                            if sl == "vision" || sl == "multimodal" || sl.contains("vision") || sl.contains("image-to-text") {
                                supports_vision = true;
                            }
                            if sl == "audio" || sl == "speech" || sl == "whisper" || sl.contains("audio") || sl.contains("voice") {
                                supports_audio = true;
                            }
                            if sl == "tool-use" || sl == "function-calling" || sl == "tools" || sl == "agentic" {
                                supports_tools = true;
                            }
                        }
                    }
                }
                if let Some(caps) = j.get("capabilities") {
                    if let Some(r) = caps.get("reasoning").and_then(|v| v.as_bool()) {
                        supports_reasoning = supports_reasoning || r;
                    }
                    if let Some(v) = caps.get("vision").and_then(|v| v.as_bool()) {
                        supports_vision = supports_vision || v;
                    }
                    if let Some(a) = caps.get("audio").and_then(|v| v.as_bool()) {
                        supports_audio = supports_audio || a;
                    }
                    if let Some(t) = caps.get("tools").or_else(|| caps.get("toolCalling")).and_then(|v| v.as_bool()) {
                        supports_tools = supports_tools || t;
                    }
                }
                if let Some(mod_arr) = j.get("modalities").and_then(|v| v.as_array()) {
                    for m in mod_arr {
                        if let Some(s) = m.as_str() {
                            let sl = s.to_lowercase();
                            if sl.contains("image") || sl.contains("vision") { supports_vision = true; }
                            if sl.contains("audio") || sl.contains("speech") { supports_audio = true; }
                        }
                    }
                }
                if let Some(tpl) = j.get("chat_template").and_then(|v| v.as_str()) {
                    let tpl_lower = tpl.to_lowercase();
                    if tpl_lower.contains("<think>")
                        || tpl_lower.contains("<|thought|>")
                        || tpl_lower.contains("thought\n")
                        || tpl_lower.contains("reasoning_content")
                        || tpl_lower.contains("enable_thinking")
                    {
                        supports_reasoning = true;
                    }
                    if tpl_lower.contains("tool_call")
                        || tpl_lower.contains("<|tool_")
                        || tpl_lower.contains("tools")
                        || tpl_lower.contains("function_call")
                    {
                        supports_tools = true;
                    }
                }
                if let Some(arch) = j.get("architecture").and_then(|v| v.as_str()) {
                    let arch_lower = arch.to_lowercase();
                    if arch_lower.contains("clip") || arch_lower.contains("vision") || arch_lower.contains("vlm") {
                        supports_vision = true;
                    }
                    if arch_lower.contains("whisper") || arch_lower.contains("audio") || arch_lower.contains("speech") {
                        supports_audio = true;
                    }
                }
                if let Some(pt) = j.get("pipeline_tag").and_then(|v| v.as_str()) {
                    let ptl = pt.to_lowercase();
                    if ptl == "image-to-text" || ptl == "image-text-to-text" || ptl == "visual-question-answering" || ptl == "any-to-any" {
                        supports_vision = true;
                    }
                    if ptl == "automatic-speech-recognition" || ptl == "audio-to-text" || ptl == "text-to-speech" || ptl == "any-to-any" {
                        supports_audio = true;
                    }
                }
            }
        }
    }

    if let Some(gm) = gguf_meta {
        if gm.supports_reasoning {
            supports_reasoning = true;
        }
        if gm.supports_vision {
            supports_vision = true;
        }
        if gm.supports_audio {
            supports_audio = true;
        }
        if gm.supports_tools {
            supports_tools = true;
        }
        for t in &gm.tags {
            let tl = t.to_lowercase();
            if tl == "reasoning" || tl == "thinking" || tl == "thought" || tl.contains("reasoning") || tl.contains("chain-of-thought") {
                supports_reasoning = true;
            }
            if tl.contains("vision") || tl.contains("multimodal") || tl.contains("image-to-text") {
                supports_vision = true;
            }
            if tl.contains("audio") || tl.contains("speech") || tl.contains("whisper") {
                supports_audio = true;
            }
            if tl.contains("tool_call") || tl.contains("tool-use") || tl.contains("function-calling") {
                supports_tools = true;
            }
        }
    }

    if let Some(tags_str) = db_tags {
        let tl = tags_str.to_lowercase();
        if tl == "reasoning" || tl == "thinking" || tl == "thought" || tl.contains("reasoning") || tl.contains("chain-of-thought") {
            supports_reasoning = true;
        }
        if tl.contains("vision") || tl.contains("multimodal") || tl.contains("image-to-text") {
            supports_vision = true;
        }
        if tl.contains("audio") || tl.contains("speech") || tl.contains("whisper") {
            supports_audio = true;
        }
        if tl.contains("tool") || tl.contains("agent") {
            supports_tools = true;
        }
    }

    (supports_reasoning, supports_vision, supports_audio, supports_tools)
}

pub fn is_companion_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    if is_vision_projector_name(&lower) {
        return true;
    }
    if lower.contains("audio-projector")
        || lower.contains("audio_projector")
        || lower.contains("audio-encoder")
        || lower.contains("audio_encoder")
        || lower.contains("speech_encoder")
        || lower.contains("speech-encoder")
        || lower.contains("conformer")
        || (lower.contains("whisper") && lower.ends_with(".gguf"))
    {
        return true;
    }
    if lower.starts_with("draft-")
        || lower.starts_with("draft_")
        || lower.starts_with("mtp-")
        || lower.starts_with("mtp_")
        || lower.contains("-draft")
        || lower.contains("_draft")
        || lower.contains("-mtp")
        || lower.contains("_mtp")
        || lower.ends_with(".mtp")
        || lower.ends_with(".mtp.gguf")
        || lower.contains(".mtp.")
        || (lower.contains("speculative") && lower.ends_with(".gguf"))
    {
        return true;
    }
    if lower == "ae.safetensors" || lower == "vae.safetensors" {
        return true;
    }
    if lower.starts_with("ae.")
        || lower.starts_with("vae.")
        || lower.starts_with("clip_l")
        || lower.starts_with("clip_g")
        || lower.starts_with("clip-l")
        || lower.starts_with("clip-g")
        || lower.starts_with("t5xxl")
        || lower.starts_with("t5-xxl")
        || lower.starts_with("t5_xxl")
    {
        return true;
    }
    if lower.ends_with("-vae.safetensors") && !lower.contains("text") {
        return true;
    }
    false
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

    // Clean up any stale companion/draft/mtp entries that might have been saved into DB previously
    if let Some(pool) = app.try_state::<sqlx::SqlitePool>() {
        let _ = sqlx::query(
            "DELETE FROM local_models WHERE 
             LOWER(filename) LIKE 'mtp-%' OR LOWER(filename) LIKE 'mtp_%' OR LOWER(filename) LIKE '%-mtp%' OR LOWER(filename) LIKE '%_mtp%' OR LOWER(filename) LIKE '%.mtp%' OR
             LOWER(filename) LIKE 'draft-%' OR LOWER(filename) LIKE 'draft_%' OR LOWER(filename) LIKE '%-draft%' OR LOWER(filename) LIKE '%_draft%' OR
             LOWER(name) LIKE 'mtp-%' OR LOWER(name) LIKE 'mtp_%' OR LOWER(name) LIKE '%-mtp%' OR LOWER(name) LIKE '%_mtp%' OR LOWER(name) LIKE '%.mtp%' OR
             LOWER(name) LIKE 'draft-%' OR LOWER(name) LIKE 'draft_%' OR LOWER(name) LIKE '%-draft%' OR LOWER(name) LIKE '%_draft%'"
        ).execute(&*pool).await;
    }

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
        if is_companion_file(&db_model.name) || is_companion_file(&db_model.filename) || is_companion_file(&db_model.id) {
            continue;
        }
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

    // 1. Scan dedicated model folders directly inside models_dir (e.g. models/gemma-4-E2B-it, models/Ornith-1.5-9B)
    if let Ok(mut rd) = tokio::fs::read_dir(&models_dir).await {
        while let Ok(Some(entry)) = rd.next_entry().await {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if entry.file_type().await.map(|ft| ft.is_dir()).unwrap_or(false) {
                if !namespaces.contains(&name.as_str()) && !name.starts_with('.') {
                    scan_dirs.push(("llm".to_string(), p));
                }
            }
        }
    }

    // 2. Also scan legacy namespaces for full backward-compatibility
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
            if is_companion_file(&name) {
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
                let mut context_length = db_model.context_length.map(|c| c as u32);
                let model_type = Some(db_model.model_type.clone());

                let stem = Path::new(&db_model.filename).file_stem().unwrap_or_default().to_string_lossy().to_string();
                let db_meta_candidates = vec![
                    parent_dir.join(format!("{}.meta.json", db_model.filename)),
                    parent_dir.join(format!("{}.meta.json", stem)),
                    parent_dir.join(format!("{}.gguf.meta.json", db_model.filename)),
                    parent_dir.join(format!("{}.gguf.meta.json", stem)),
                    models_dir.join(format!("{}.meta.json", db_model.filename)),
                    models_dir.join(format!("{}.meta.json", stem)),
                    models_dir.join(format!("{}.gguf.meta.json", db_model.filename)),
                    models_dir.join(format!("{}.gguf.meta.json", stem)),
                ];
                if context_length.is_none() {
                    for meta_path in &db_meta_candidates {
                        if let Ok(content) = tokio::fs::read_to_string(meta_path).await {
                            if let Ok(j) = serde_json::from_str::<serde_json::Value>(&content) {
                                if let Some(ctx) = j.get("context_length").and_then(|v| v.as_u64()) {
                                    context_length = Some(ctx as u32);
                                    break;
                                }
                            }
                        }
                    }
                }
                let cached_gguf = if db_model.filename.ends_with(".gguf") {
                    GGUF_META_CACHE.lock().unwrap().get(&db_model.filename).cloned()
                } else {
                    None
                };
                let (supports_reasoning, supports_vision, supports_audio, supports_tools) = extract_model_meta_capabilities(
                    &db_meta_candidates,
                    cached_gguf.as_ref(),
                    has_mmproj,
                    &db_model.model_type,
                    db_model.tags.as_deref(),
                ).await;

                let parent_dir = path.parent().unwrap_or(&models_dir);
                let mut folder_has_mtp = false;
                let mut folder_has_mmproj = false;
                let mut folder_has_draft = false;

                if let Ok(entries) = std::fs::read_dir(parent_dir) {
                    for entry in entries.flatten() {
                        let ep = entry.path();
                        if ep == path { continue; }
                        let ename = ep.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
                        if is_mtp_model(&ep) {
                            folder_has_mtp = true;
                        }
                        if ename.contains("mmproj") || ename.contains("projector") {
                            folder_has_mmproj = true;
                        }
                        if ename.starts_with("draft-") || ename.contains("-draft") || ename.contains("_draft") {
                            if !is_mtp_model(&ep) {
                                folder_has_draft = true;
                            }
                        }
                    }
                }

                let has_mtp = folder_has_mtp || find_mtp_model(&path).is_some();
                let has_mmproj = has_mmproj || folder_has_mmproj;
                let has_draft = folder_has_draft || find_draft_model(&path).is_some();

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
                    supports_reasoning,
                    supports_vision,
                    supports_audio,
                    supports_tools,
                    has_draft,
                    has_mtp,
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

                for meta_path in &meta_candidates {
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

                let (supports_reasoning, supports_vision, supports_audio, supports_tools) = extract_model_meta_capabilities(
                    &meta_candidates,
                    None,
                    false,
                    &model_type,
                    None,
                ).await;

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
                    supports_reasoning,
                    supports_vision,
                    supports_audio,
                    supports_tools,
                    has_draft: false,
                    has_mtp: false,
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
            let stem = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let meta_candidates = vec![
                dir_path.join(format!("{}.meta.json", name)),
                dir_path.join(format!("{}.meta.json", stem)),
                dir_path.join(format!("{}.gguf.meta.json", name)),
                dir_path.join(format!("{}.gguf.meta.json", stem)),
                models_dir.join(format!("{}.meta.json", name)),
                models_dir.join(format!("{}.meta.json", stem)),
                models_dir.join(format!("{}.gguf.meta.json", name)),
                models_dir.join(format!("{}.gguf.meta.json", stem)),
            ];

            // If metadata file exists in models_dir but not yet in dir_path, copy next to weights
            for meta_path in &meta_candidates {
                if meta_path.exists() && meta_path.parent() != Some(&dir_path) {
                    if let Some(fname) = meta_path.file_name() {
                        let dest = dir_path.join(fname);
                        if !dest.exists() {
                            let _ = tokio::fs::copy(meta_path, &dest).await;
                        }
                    }
                }
            }

            let mut context_length = gguf_meta.as_ref().and_then(|m| m.context_length);
            let mut architecture = gguf_meta.as_ref().and_then(|m| m.architecture.clone());
            let mut repo_id_opt: Option<String> = None;
            let mut description = format!("Local {} model", ext.to_uppercase());

            for meta_path in &meta_candidates {
                if let Ok(content) = tokio::fs::read_to_string(&meta_path).await {
                    if let Ok(j) = serde_json::from_str::<serde_json::Value>(&content) {
                        if repo_id_opt.is_none() {
                            if let Some(rid) = j.get("repo_id").and_then(|v| v.as_str()) {
                                repo_id_opt = Some(rid.to_string());
                            }
                        }
                        if context_length.is_none() {
                            if let Some(ctx) = j.get("context_length").and_then(|v| v.as_u64()) {
                                context_length = Some(ctx as u32);
                            }
                        }
                        if architecture.is_none() {
                            if let Some(arch) = j.get("architecture").and_then(|v| v.as_str()) {
                                architecture = Some(arch.to_string());
                            }
                        }
                        if let Some(a) = j.get("author").and_then(|v| v.as_str()) {
                            description = format!("Downloaded from {}", a);
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

            let (supports_reasoning, supports_vision, supports_audio, supports_tools) = extract_model_meta_capabilities(
                &meta_candidates,
                gguf_meta.as_ref(),
                has_mmproj,
                &model_type,
                None,
            ).await;

            let parent_dir = path.parent().unwrap_or(&models_dir);
            let mut folder_has_mtp = false;
            let mut folder_has_mmproj = false;
            let mut folder_has_draft = false;

            if let Ok(entries) = std::fs::read_dir(parent_dir) {
                for entry in entries.flatten() {
                    let ep = entry.path();
                    if ep == path { continue; }
                    let ename = ep.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
                    if is_mtp_model(&ep) {
                        folder_has_mtp = true;
                    }
                    if ename.contains("mmproj") || ename.contains("projector") {
                        folder_has_mmproj = true;
                    }
                    if ename.starts_with("draft-") || ename.contains("-draft") || ename.contains("_draft") {
                        if !is_mtp_model(&ep) {
                            folder_has_draft = true;
                        }
                    }
                }
            }

            let has_mtp = folder_has_mtp || find_mtp_model(&path).is_some();
            let has_mmproj = has_mmproj || folder_has_mmproj;
            let has_draft = folder_has_draft || find_draft_model(&path).is_some();

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
                supports_reasoning,
                supports_vision,
                supports_audio,
                supports_tools,
                has_draft,
                has_mtp,
            });
        }
    }

    models.retain(|m| !is_companion_file(&m.name) && !is_companion_file(&m.id));
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
    model_folder: Option<String>,
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

    let safe_filename = std::path::Path::new(&final_filename);
    if safe_filename.file_name().and_then(|name| name.to_str()) != Some(final_filename.as_str())
        || final_filename.is_empty()
        || final_filename == "."
        || final_filename == ".."
    {
        return Err("Invalid model filename".to_string());
    }

    let folder_name = model_folder
        .filter(|f| !f.trim().is_empty())
        .unwrap_or_else(|| derive_model_folder_name(&final_filename, repo_id.as_deref()));
    let model_dir = app_dir.join("models").join(&folder_name);
    let _ = tokio::fs::create_dir_all(&model_dir).await;
    let dest = model_dir.join(&final_filename);

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
            move |pct, downloaded, total, speed, eta| {
                let _ = app_emit.emit("hf-download-progress", serde_json::json!({
                    "model_id": mid_emit,
                    "progress": pct,
                    "downloaded": downloaded,
                    "total": total,
                    "speed": speed,
                    "eta": eta,
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
        drop(tasks);
        state.save_persistence().await;
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
        hf_download_model(app, state, p.url, p.model_id, p.filename, p.repo_id, None).await
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
    // Stop the inference server to release any file locks before deletion.
    manager.stop().await;

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    // ── Step 1: Collect all related files from the DB ────────────────────────
    // A vision model consists of (at least) two files:
    //   • The main GGUF (e.g. llava-v1.6-mistral-7b.Q4_K_M.gguf  →  models/llm/)
    //   • The mmproj projector (e.g. llava-...-mmproj-model-f16.gguf → models/projectors/)
    // Both share the same repo_id.  We look up every DB row with that repo_id
    // and physically delete all of them so nothing is left behind.

    let mut files_to_delete: Vec<PathBuf> = Vec::new();
    let mut db_ids_to_delete: Vec<String> = Vec::new();

    if let Some(pool) = app.try_state::<sqlx::SqlitePool>() {
        use crate::db::models::LocalModel;

        // Find the target model row.
        let target: Option<LocalModel> = sqlx::query_as::<_, LocalModel>(
            "SELECT * FROM local_models WHERE id = ? OR filename = ?"
        )
        .bind(&filename)
        .bind(&filename)
        .fetch_optional(&*pool)
        .await
        .unwrap_or(None);

        if let Some(ref t) = target {
            db_ids_to_delete.push(t.id.clone());

            // Collect companion files with the same repo_id.
            if let Some(ref rid) = t.repo_id {
                if !rid.is_empty() {
                    let companions: Vec<LocalModel> = sqlx::query_as::<_, LocalModel>(
                        "SELECT * FROM local_models WHERE repo_id = ?"
                    )
                    .bind(rid)
                    .fetch_all(&*pool)
                    .await
                    .unwrap_or_default();

                    for c in companions {
                        if !db_ids_to_delete.contains(&c.id) {
                            db_ids_to_delete.push(c.id.clone());
                        }
                        // Resolve each companion's physical path.
                        let companion_dest = if let Some(p) = resolve_model_path(&app, &c.id).await {
                            p
                        } else {
                            // Fall back to stored file_path (absolute or relative to models dir)
                            let p = PathBuf::from(&c.file_path);
                            if p.is_absolute() && p.exists() {
                                p
                            } else {
                                app_dir.join("models").join(&c.file_path)
                            }
                        };
                        if !files_to_delete.contains(&companion_dest) {
                            files_to_delete.push(companion_dest);
                        }
                    }
                }
            }
        }

        // Also always add the direct path for the requested filename.
        let direct_dest = match resolve_model_path(&app, &filename).await {
            Some(p) => p,
            None => app_dir.join("models").join(&filename),
        };
        if !files_to_delete.contains(&direct_dest) {
            files_to_delete.push(direct_dest);
        }

        // Delete all collected DB rows.
        for db_id in &db_ids_to_delete {
            let _ = sqlx::query("DELETE FROM local_models WHERE id = ? OR filename = ?")
                .bind(db_id)
                .bind(db_id)
                .execute(&*pool)
                .await;
        }
        // Belt-and-suspenders: also delete by the original filename.
        let _ = sqlx::query("DELETE FROM local_models WHERE id = ? OR filename = ?")
            .bind(&filename)
            .bind(&filename)
            .execute(&*pool)
            .await;
    } else {
        // No DB — fall back to resolving the single path.
        let dest = match resolve_model_path(&app, &filename).await {
            Some(p) => p,
            None => app_dir.join("models").join(&filename),
        };
        files_to_delete.push(dest);
    }

    // ── Step 2: Physically delete every file ────────────────────────────────
    let mut any_error: Option<String> = None;

    for dest in &files_to_delete {
        if !dest.exists() {
            continue; // Already gone — not an error.
        }

        let mut last_err = None;
        for _ in 0..10 {
            let res = if dest.is_dir() {
                tokio::fs::remove_dir_all(dest).await
            } else {
                tokio::fs::remove_file(dest).await
            };
            match res {
                Ok(_) => {
                    info!("[NYX] Deleted model file: {}", dest.display());
                    last_err = None;
                    break;
                }
                Err(e) => {
                    last_err = Some(e);
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                }
            }
        }
        if let Some(e) = last_err {
            any_error = Some(format!("Failed to delete '{}': {:?}", dest.display(), e));
        }

        // Remove sidecar files regardless of whether the main delete succeeded.
        let fname = dest.file_name().unwrap_or_default().to_string_lossy();
        let parent = dest.parent().unwrap_or(dest);
        // e.g.  model.gguf.meta.json  and  model.meta.json
        let sidecars = [
            parent.join(format!("{}.meta.json", fname)),
            dest.with_extension("meta.json"),
            dest.with_extension("gguf.meta.json"),
            parent.join(format!("{}.part", fname)),  // incomplete download artefact
        ];
        for sc in &sidecars {
            let _ = tokio::fs::remove_file(sc).await;
        }

        // If the parent directory is now empty and is one of our namespace dirs, remove it.
        if let Some(parent_dir) = dest.parent() {
            let is_namespace_dir = parent_dir
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| matches!(n, "llm" | "projectors" | "vae" | "text_encoders" | "diffusion"))
                .unwrap_or(false);
            if is_namespace_dir {
                // Only remove if truly empty (ignore hidden/system files).
                if let Ok(mut entries) = tokio::fs::read_dir(parent_dir).await {
                    let mut has_files = false;
                    while let Ok(Some(_)) = entries.next_entry().await {
                        has_files = true;
                        break;
                    }
                    if !has_files {
                        let _ = tokio::fs::remove_dir(parent_dir).await;
                    }
                }
            }
        }
    }

    invalidate_local_models_cache();

    match any_error {
        Some(e) => Err(e),
        None => {
            info!("[NYX] Uninstalled model '{}' and all companion files.", filename);
            Ok(())
        }
    }
}

// ── HF Marketplace Commands ───────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HfSibling {
    pub rfilename: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HfAuthorData {
    #[serde(rename = "avatarUrl", default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub fullname: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
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
    #[serde(default)]
    pub gguf: Option<serde_json::Value>,
    #[serde(default)]
    pub config: Option<serde_json::Value>,
    #[serde(rename = "cardData", default)]
    pub card_data: Option<serde_json::Value>,
    #[serde(rename = "baseModels", default)]
    pub base_models: Option<serde_json::Value>,
    #[serde(default)]
    pub author: Option<String>,
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
        ("expand[]", "gguf".to_string()),
        ("expand[]", "config".to_string()),
        ("expand[]", "cardData".to_string()),
        ("expand[]", "baseModels".to_string()),
        ("expand[]", "pipeline_tag".to_string()),
        ("expand[]", "tags".to_string()),
        ("expand[]", "downloads".to_string()),
        ("expand[]", "likes".to_string()),
        ("expand[]", "lastModified".to_string()),
        ("expand[]", "siblings".to_string()),
        ("expand[]", "author".to_string()),
        ("expand[]", "gated".to_string()),
    ];

    let target_filter = filter.as_deref().unwrap_or("all").trim();
    let active_lib = library.as_deref().unwrap_or("all").trim();

    let api_filter = if active_lib != "all" && !active_lib.is_empty() {
        active_lib
    } else {
        target_filter
    };
    if api_filter != "all" && !api_filter.is_empty() {
        params.push(("filter", api_filter.to_string()));
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

#[tauri::command]
pub async fn hf_get_model_details(model_id: String) -> Result<HfModelResult, String> {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .unwrap_or_else(|_| Client::new());

    let url = format!("https://huggingface.co/api/models/{}?full=true", model_id);
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        let mut model: HfModelResult = resp.json().await.map_err(|e| e.to_string())?;

        // If the model has a base_model and tags or pipeline_tag are minimal, enrich from the base model
        let base_model_id = model.card_data.as_ref()
            .and_then(|cd| cd.get("base_model"))
            .and_then(|bm| {
                if let Some(s) = bm.as_str() {
                    Some(s.to_string())
                } else if let Some(arr) = bm.as_array() {
                    arr.first().and_then(|v| v.as_str()).map(String::from)
                } else {
                    None
                }
            })
            .or_else(|| {
                model.base_models.as_ref().and_then(|bm_val| {
                    if let Some(s) = bm_val.as_str() {
                        Some(s.to_string())
                    } else if let Some(obj) = bm_val.as_object() {
                        obj.get("models")
                            .and_then(|m| m.as_array())
                            .and_then(|arr| arr.first())
                            .and_then(|m| m.get("id"))
                            .and_then(|id| id.as_str())
                            .map(String::from)
                    } else if let Some(arr) = bm_val.as_array() {
                        arr.first().and_then(|item| {
                            if let Some(s) = item.as_str() {
                                Some(s.to_string())
                            } else if let Some(obj) = item.as_object() {
                                obj.get("models")
                                    .and_then(|m| m.as_array())
                                    .and_then(|arr| arr.first())
                                    .and_then(|m| m.get("id"))
                                    .and_then(|id| id.as_str())
                                    .map(String::from)
                            } else {
                                None
                            }
                        })
                    } else {
                        None
                    }
                })
            });

        if let Some(base_id) = base_model_id {
            let base_url = format!("https://huggingface.co/api/models/{}", base_id);
            if let Ok(base_resp) = client.get(&base_url).send().await {
                if base_resp.status().is_success() {
                    if let Ok(base_json) = base_resp.json::<serde_json::Value>().await {
                        // Inherit pipeline_tag if missing
                        if model.pipeline_tag.is_none() {
                            model.pipeline_tag = base_json.get("pipeline_tag").and_then(|v| v.as_str()).map(String::from);
                        }
                        // Merge base model tags
                        if let Some(base_tags) = base_json.get("tags").and_then(|v| v.as_array()) {
                            for bt in base_tags {
                                if let Some(bts) = bt.as_str() {
                                    if !model.tags.iter().any(|t| t.eq_ignore_ascii_case(bts)) {
                                        model.tags.push(bts.to_string());
                                    }
                                }
                            }
                        }
                        // Inherit config if missing
                        if model.config.is_none() {
                            model.config = base_json.get("config").cloned();
                        }
                    }
                }
            }
        }

        Ok(model)
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
    #[serde(default)]
    pub size: u64,
    pub lfs: Option<HfLfsInfo>,
}

#[derive(Serialize, Deserialize)]
struct HfLfsInfo {
    #[serde(default)]
    pub size: u64,
}

#[tauri::command]
pub async fn hf_get_model_files(model_id: String) -> Result<Vec<HfModelFile>, String> {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .unwrap_or_else(|_| Client::new());

    let branches = ["main", "master"];
    for branch in &branches {
        let mut all_files: Vec<HfModelFile> = Vec::new();
        let mut next_url: Option<String> = Some(format!(
            "https://huggingface.co/api/models/{}/tree/{}?recursive=true",
            model_id, branch
        ));
        let mut pages = 0;

        while let Some(url) = next_url {
            pages += 1;
            if pages > 20 {
                // Safety limit: up to 20,000 files
                break;
            }

            let resp = match client.get(&url).send().await {
                Ok(r) if r.status().is_success() => r,
                _ => break,
            };

            // Check pagination via Link header: <url>; rel="next"
            let mut extracted_next = None;
            if let Some(link_header) = resp.headers().get("link").and_then(|h| h.to_str().ok()) {
                for part in link_header.split(',') {
                    if part.contains("rel=\"next\"") || part.contains("rel=next") {
                        if let Some(start) = part.find('<') {
                            if let Some(end) = part[start..].find('>') {
                                extracted_next = Some(part[start + 1..start + end].to_string());
                                break;
                            }
                        }
                    }
                }
            }
            next_url = extracted_next;

            if let Ok(entries) = resp.json::<Vec<HfTreeEntry>>().await {
                for e in entries {
                    if e.r#type == "file" {
                        all_files.push(HfModelFile {
                            filename: e.path,
                            size: e.lfs.map(|l| l.size).unwrap_or(e.size),
                        });
                    }
                }
            } else {
                break;
            }
        }

        if !all_files.is_empty() {
            return Ok(all_files);
        }
    }

    // Fallback to model detail endpoint
    let url_info = format!("https://huggingface.co/api/models/{}?full=true", model_id);
    let info_resp = client.get(&url_info).send().await.map_err(|e| e.to_string())?;
    if info_resp.status().is_success() {
        if let Ok(result) = info_resp.json::<HfModelResult>().await {
            let files = result
                .siblings
                .into_iter()
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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DiscoveredCompanionFile {
    pub filename: String,
    pub size: u64,
    pub repo_id: String,
    pub companion_type: String,
    pub label: String,
}

#[tauri::command]
pub async fn hf_find_companion_files(
    state: State<'_, Arc<HfDownloaderState>>,
    model_id: String,
    base_model: Option<String>,
    companion_type: String,
) -> Result<Vec<DiscoveredCompanionFile>, String> {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .connect_timeout(std::time::Duration::from_secs(6))
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .unwrap_or_else(|_| Client::new());

    let target_source = base_model.as_deref().unwrap_or(&model_id);
    let leaf_name = target_source.split('/').last().unwrap_or(target_source);
    let mut clean_leaf = derive_model_folder_name(leaf_name, None);
    if clean_leaf == "unorganized" || clean_leaf.is_empty() {
        clean_leaf = leaf_name.to_string();
    }

    let token_opt = state.token.lock().await.clone();

    let mut queries = Vec::new();
    if companion_type == "vision" {
        queries.push(format!("{} mmproj", clean_leaf));
        queries.push(format!("{} GGUF", clean_leaf));
        queries.push(clean_leaf.clone());
    } else if companion_type == "audio" {
        queries.push(format!("{} audio", clean_leaf));
        queries.push(format!("{} whisper", clean_leaf));
        queries.push(format!("{} GGUF", clean_leaf));
    } else {
        queries.push(format!("{} draft", clean_leaf));
        queries.push(format!("{} mtp", clean_leaf));
        queries.push(format!("{} GGUF", clean_leaf));
    }

    let mut visited_repos = std::collections::HashSet::new();
    visited_repos.insert(model_id.to_lowercase());

    // Also directly try base_model repo with -GGUF suffix if available
    if let Some(ref bm) = base_model {
        let bm_gguf = format!("{}-GGUF", bm);
        visited_repos.insert(bm_gguf.to_lowercase());
        let url = format!("https://huggingface.co/api/models/{}", bm_gguf);
        let mut req = client.get(&url);
        if let Some(ref t) = token_opt {
            req = req.header("Authorization", format!("Bearer {}", t));
        }
        if let Ok(resp) = req.send().await {
            if resp.status().is_success() {
                if let Ok(details) = resp.json::<serde_json::Value>().await {
                    if let Some(siblings) = details.get("siblings").and_then(|s| s.as_array()) {
                        let mut found = Vec::new();
                        for s in siblings {
                            if let Some(rfn) = s.get("rfilename").and_then(|v| v.as_str()) {
                                if companion_type == "vision" && is_vision_projector_name(rfn) {
                                    found.push(rfn.to_string());
                                }
                            }
                        }
                        if !found.is_empty() {
                            let mut results = Vec::new();
                            for f in found {
                                let mut size = 0u64;
                                let raw_url = format!("https://huggingface.co/{}/resolve/main/{}", bm_gguf, f);
                                let mut head_req = client.head(&raw_url);
                                if let Some(ref t) = token_opt {
                                    head_req = head_req.header("Authorization", format!("Bearer {}", t));
                                }
                                if let Ok(head_resp) = head_req.send().await {
                                    if let Some(cl) = head_resp.headers().get("content-length").and_then(|h| h.to_str().ok()) {
                                        if let Ok(bytes) = cl.parse::<u64>() {
                                            size = bytes;
                                        }
                                    }
                                }
                                let label = format!("Vision Projector ({})", f.split('/').last().unwrap_or(&f));
                                results.push(DiscoveredCompanionFile {
                                    filename: f,
                                    size,
                                    repo_id: bm_gguf.clone(),
                                    companion_type: companion_type.clone(),
                                    label,
                                });
                            }
                            return Ok(results);
                        }
                    }
                }
            }
        }
    }

    for q in queries {
        let search_url = format!(
            "https://huggingface.co/api/models?search={}&filter=gguf&limit=6",
            urlencoding::encode(&q)
        );
        let mut req = client.get(&search_url);
        if let Some(ref t) = token_opt {
            req = req.header("Authorization", format!("Bearer {}", t));
        }

        let search_resp = match req.send().await {
            Ok(r) if r.status().is_success() => r,
            _ => continue,
        };

        let list: Vec<serde_json::Value> = match search_resp.json().await {
            Ok(l) => l,
            _ => continue,
        };

        for item in list {
            let candidate_id = match item.get("id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => continue,
            };

            let cand_lower = candidate_id.to_lowercase();
            if visited_repos.contains(&cand_lower) {
                continue;
            }
            visited_repos.insert(cand_lower);

            let detail_url = format!("https://huggingface.co/api/models/{}", candidate_id);
            let mut det_req = client.get(&detail_url);
            if let Some(ref t) = token_opt {
                det_req = det_req.header("Authorization", format!("Bearer {}", t));
            }

            let det_resp = match det_req.send().await {
                Ok(r) if r.status().is_success() => r,
                _ => continue,
            };

            let details: serde_json::Value = match det_resp.json().await {
                Ok(d) => d,
                _ => continue,
            };

            let siblings = match details.get("siblings").and_then(|v| v.as_array()) {
                Some(s) => s,
                None => continue,
            };

            let mut matched_files: Vec<String> = Vec::new();
            for s in siblings {
                let rfilename = match s.get("rfilename").and_then(|v| v.as_str()) {
                    Some(f) => f,
                    None => continue,
                };
                let rfn_lower = rfilename.to_lowercase();
                if !rfn_lower.ends_with(".gguf") || rfn_lower.contains("imatrix") {
                    continue;
                }

                let matches = if companion_type == "vision" {
                    is_vision_projector_name(&rfn_lower)
                } else if companion_type == "audio" {
                    rfn_lower.contains("audio-projector")
                        || rfn_lower.contains("audio_projector")
                        || rfn_lower.contains("whisper")
                        || rfn_lower.contains("speech_encoder")
                } else {
                    rfn_lower.contains("draft")
                        || rfn_lower.contains("mtp")
                        || rfn_lower.contains("speculative")
                };

                if matches {
                    matched_files.push(rfilename.to_string());
                }
            }

            if !matched_files.is_empty() {
                let mut out = Vec::new();
                for f in matched_files {
                    let mut size = 0u64;
                    // Probe file size with lightweight HEAD request
                    let raw_url = format!("https://huggingface.co/{}/resolve/main/{}", candidate_id, f);
                    let mut head_req = client.head(&raw_url);
                    if let Some(ref t) = token_opt {
                        head_req = head_req.header("Authorization", format!("Bearer {}", t));
                    }
                    if let Ok(head_resp) = head_req.send().await {
                        if let Some(cl) = head_resp.headers().get("content-length").and_then(|h| h.to_str().ok()) {
                            if let Ok(bytes) = cl.parse::<u64>() {
                                size = bytes;
                            }
                        }
                    }

                    let clean_label = if companion_type == "vision" {
                        format!("Vision Projector ({})", f.split('/').last().unwrap_or(&f))
                    } else if companion_type == "audio" {
                        format!("Audio Projector ({})", f.split('/').last().unwrap_or(&f))
                    } else {
                        format!("Draft Model ({})", f.split('/').last().unwrap_or(&f))
                    };

                    out.push(DiscoveredCompanionFile {
                        filename: f,
                        size,
                        repo_id: candidate_id.clone(),
                        companion_type: companion_type.clone(),
                        label: clean_label,
                    });
                }
                return Ok(out);
            }
        }
    }

    Ok(vec![])
}
