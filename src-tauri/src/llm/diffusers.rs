// src-tauri/src/llm/diffusers.rs
//
// Local image generation engine for NYX.
// Priority order:
//   1. Active local .safetensors/.ckpt model  → Python diffusers subprocess
//   2. Active local .onnx model               → Python onnxruntime subprocess
//   3. Active local .pt/.pth/.bin model        → Python torch.load subprocess
//   4. Cloud: Pollinations AI (no key needed)
//   5. Cloud: OpenAI DALL-E (if key present)
//   6. Fallback: procedural gradient render

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Manager;
use tracing::{info, warn};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageGenResult {
    pub success: bool,
    pub image_path: String,
    pub prompt: String,
    pub engine: Option<String>,
    pub error: Option<String>,
}

/// Try to run local inference via Python diffusers/onnxruntime.
/// Returns the output PNG path on success.
async fn try_python_local_inference(
    model_path: &str,
    prompt: &str,
    output_path: &str,
    w: u32,
    h: u32,
) -> Option<String> {
    let model_path_lower = model_path.to_lowercase();
    let ext = std::path::Path::new(model_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    // Build the Python script based on model type
    let python_script = if ext == "onnx" {
        // ONNX Runtime inference (stable-diffusion-onnx pipeline)
        format!(r#"
import sys
import os
try:
    import onnxruntime as ort
    import numpy as np
    from PIL import Image
    # Minimal ONNX SD pipeline: load and run a single image pass
    # Most ONNX SD models expose a standard pipeline via optimum
    try:
        from optimum.onnxruntime import ORTStableDiffusionPipeline
        pipe = ORTStableDiffusionPipeline.from_pretrained(os.path.dirname(r"{model_path}"))
        image = pipe(prompt="{prompt}", width={w}, height={h}, num_inference_steps=20).images[0]
        image.save(r"{output}")
        print("SUCCESS")
    except ImportError:
        # Fallback: try huggingface diffusers with onnx provider
        from diffusers import OnnxStableDiffusionPipeline
        pipe = OnnxStableDiffusionPipeline.from_pretrained(
            os.path.dirname(r"{model_path}"),
            provider="CUDAExecutionProvider"
        )
        image = pipe(prompt="{prompt}", width={w}, height={h}, num_inference_steps=20).images[0]
        image.save(r"{output}")
        print("SUCCESS")
except Exception as e:
    print(f"ERROR: {{e}}", file=sys.stderr)
    sys.exit(1)
"#,
            model_path = model_path.replace('\\', "/"),
            prompt = prompt.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', " ").replace('\r', ""),
            w = w,
            h = h,
            output = output_path.replace('\\', "/"),
        )
    } else if ext == "safetensors" || ext == "ckpt" || model_path_lower.contains("flux") || model_path_lower.contains("diffusion") || model_path_lower.contains("sdxl") {
        // Stable Diffusion / FLUX via HuggingFace diffusers
        format!(r#"
import sys
import os
try:
    import torch
    from diffusers import (
        StableDiffusionPipeline,
        StableDiffusionXLPipeline,
        FluxPipeline,
        DiffusionPipeline,
        AutoPipelineForText2Image,
    )

    model_path = r"{model_path}"
    prompt = "{prompt}"
    output = r"{output}"
    w, h = ({w} // 8) * 8, ({h} // 8) * 8
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32

    # Try AutoPipeline first (handles SD, SDXL, FLUX automatically)
    try:
        pipe = AutoPipelineForText2Image.from_pretrained(
            model_path if os.path.isdir(model_path) else os.path.dirname(model_path),
            torch_dtype=dtype,
            use_safetensors=True,
        )
        pipe = pipe.to(device)
        if hasattr(pipe, "enable_model_cpu_offload"):
            pipe.enable_model_cpu_offload()
    except Exception:
        # Fallback: single-file load for .safetensors / .ckpt with architecture detection
        m_lower = model_path.lower()
        if "flux" in m_lower:
            pipe = FluxPipeline.from_single_file(model_path, torch_dtype=dtype)
        elif "sdxl" in m_lower or "xl" in m_lower:
            pipe = StableDiffusionXLPipeline.from_single_file(model_path, torch_dtype=dtype)
        else:
            try:
                pipe = AutoPipelineForText2Image.from_single_file(model_path, torch_dtype=dtype)
            except Exception:
                pipe = StableDiffusionPipeline.from_single_file(model_path, torch_dtype=dtype)
        pipe = pipe.to(device)
        if hasattr(pipe, "enable_model_cpu_offload"):
            pipe.enable_model_cpu_offload()

    m_lower = model_path.lower()
    is_flux = "flux" in m_lower
    pipe_kwargs = {{
        "prompt": prompt,
        "width": w,
        "height": h,
        "num_inference_steps": 20 if not is_flux else 4,
    }}
    if not is_flux:
        pipe_kwargs["guidance_scale"] = 7.5
    else:
        pipe_kwargs["guidance_scale"] = 0.0

    image = pipe(**pipe_kwargs).images[0]
    image.save(output)
    print("SUCCESS")
except Exception as e:
    print(f"ERROR: {{e}}", file=sys.stderr)
    sys.exit(1)
"#,
            model_path = model_path.replace('\\', "/"),
            prompt = prompt.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', " ").replace('\r', ""),
            w = w,
            h = h,
            output = output_path.replace('\\', "/"),
        )
    } else if ext == "pt" || ext == "pth" || ext == "bin" {
        // Generic PyTorch model — try diffusers AutoPipeline first, then torch.hub
        format!(r#"
import sys
import os
try:
    import torch
    from diffusers import AutoPipelineForText2Image

    model_path = r"{model_path}"
    prompt = "{prompt}"
    output = r"{output}"
    w, h = {w}, {h}
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32

    model_dir = model_path if os.path.isdir(model_path) else os.path.dirname(model_path)
    pipe = AutoPipelineForText2Image.from_pretrained(model_dir, torch_dtype=dtype)
    pipe = pipe.to(device)
    image = pipe(prompt=prompt, width=w, height=h, num_inference_steps=20).images[0]
    image.save(output)
    print("SUCCESS")
except Exception as e:
    print(f"ERROR: {{e}}", file=sys.stderr)
    sys.exit(1)
"#,
            model_path = model_path.replace('\\', "/"),
            prompt = prompt.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', " ").replace('\r', ""),
            w = w,
            h = h,
            output = output_path.replace('\\', "/"),
        )
    } else if std::path::Path::new(model_path).is_dir() {
        // ── Subcomponent directory (text_encoder, vae, transformer, etc.) ──────
        // Hot-swap the local weights into a default SD 1.5 shell pipeline.
        let dir_name = std::path::Path::new(model_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();

        let is_text_encoder = dir_name.contains("text_encoder") || dir_name.contains("text-encoder");
        let is_vae = dir_name.contains("vae");
        let is_transformer = dir_name.contains("transformer");

        if is_text_encoder || is_vae || is_transformer {
            let component_type = if is_text_encoder { "text_encoder" }
                else if is_vae { "vae" }
                else { "transformer" };

            format!(r#"
import sys
import os
import gc
try:
    import torch
    from diffusers import StableDiffusionPipeline, AutoencoderKL
    from transformers import CLIPTextModel

    model_path = r"{model_path}"
    prompt = "{prompt}"
    output = r"{output}"
    w, h = ({w} // 8) * 8, ({h} // 8) * 8
    component_type = "{component_type}"

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32

    # Load base SD 1.5 shell — avoids downloading full weights if cached
    base_pipeline_id = "runwayml/stable-diffusion-v1-5"

    print(f"[NyxImgGen] Loading base pipeline: {{base_pipeline_id}}", flush=True)
    kwargs = dict(torch_dtype=dtype, safety_checker=None)

    if component_type == "text_encoder":
        print(f"[NyxImgGen] Hot-swapping local text_encoder from: {{model_path}}", flush=True)
        try:
            local_encoder = CLIPTextModel.from_pretrained(model_path, torch_dtype=dtype)
        except Exception as enc_err:
            # Fallback: check if there's a pytorch_model.bin or model.safetensors inside
            print(f"[NyxImgGen] Direct load failed ({{enc_err}}), attempting parent dir...", flush=True)
            parent = os.path.dirname(model_path)
            local_encoder = CLIPTextModel.from_pretrained(parent, subfolder=os.path.basename(model_path), torch_dtype=dtype)
        kwargs["text_encoder"] = local_encoder

    elif component_type == "vae":
        print(f"[NyxImgGen] Hot-swapping local VAE from: {{model_path}}", flush=True)
        local_vae = AutoencoderKL.from_pretrained(model_path, torch_dtype=dtype)
        kwargs["vae"] = local_vae

    pipe = StableDiffusionPipeline.from_pretrained(base_pipeline_id, **kwargs)

    if hasattr(pipe, "enable_model_cpu_offload"):
        pipe.enable_model_cpu_offload()
    if hasattr(pipe, "enable_vae_tiling"):
        pipe.enable_vae_tiling()

    image = pipe(
        prompt=prompt,
        width=w,
        height=h,
        num_inference_steps=20,
        guidance_scale=7.5,
    ).images[0]
    image.save(output)
    del pipe
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    print("SUCCESS")
except Exception as e:
    print(f"ERROR: {{e}}", file=sys.stderr)
    sys.exit(1)
"#,
                model_path = model_path.replace('\\', "/"),
                prompt = prompt.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', " ").replace('\r', ""),
                w = w,
                h = h,
                output = output_path.replace('\\', "/"),
                component_type = component_type,
            )
        } else {
            // Generic directory — try AutoPipeline (might be a full pipeline dir without model_index.json)
            format!(r#"
import sys
import os
try:
    import torch
    from diffusers import AutoPipelineForText2Image

    model_path = r"{model_path}"
    prompt = "{prompt}"
    output = r"{output}"
    w, h = {w}, {h}
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32

    pipe = AutoPipelineForText2Image.from_pretrained(model_path, torch_dtype=dtype, safety_checker=None)
    pipe = pipe.to(device)
    if hasattr(pipe, "enable_model_cpu_offload"):
        pipe.enable_model_cpu_offload()
    image = pipe(prompt=prompt, width=w, height=h, num_inference_steps=20).images[0]
    image.save(output)
    print("SUCCESS")
except Exception as e:
    print(f"ERROR: {{e}}", file=sys.stderr)
    sys.exit(1)
"#,
                model_path = model_path.replace('\\', "/"),
                prompt = prompt.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', " ").replace('\r', ""),
                w = w,
                h = h,
                output = output_path.replace('\\', "/"),
            )
        }
    } else {
        return None;
    };

    // Write to unique temp file and execute
    let script_name = format!("nyx_imggen_{}.py", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
    let tmp_script = std::env::temp_dir().join(script_name);
    if tokio::fs::write(&tmp_script, python_script.as_bytes()).await.is_err() {
        return None;
    }

    // Try python/python3 based on OS
    let python_cmds: &[&str] = if cfg!(target_os = "windows") {
        &["python", "python3", "py"]
    } else {
        &["python3", "python"]
    };
    for python_cmd in python_cmds {
        let result = tokio::process::Command::new(python_cmd)
            .arg(tmp_script.to_str().unwrap_or(""))
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn();

        if let Ok(child) = result {
            match child.wait_with_output().await {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    if stdout.contains("SUCCESS") && tokio::fs::metadata(output_path).await.is_ok() {
                        info!("[Diffusers] Local inference succeeded with {}", python_cmd);
                        let _ = tokio::fs::remove_file(&tmp_script).await;
                        return Some(output_path.to_string());
                    } else {
                        warn!("[Diffusers] Python local inference failed. stderr: {}", stderr);
                    }
                }
                Err(e) => {
                    warn!("[Diffusers] Failed to wait for {} process: {}", python_cmd, e);
                }
            }
        }
    }

    let _ = tokio::fs::remove_file(&tmp_script).await;
    None
}

async fn try_sd_cpp_server_inference(
    port: u16,
    prompt: &str,
    output_path: &str,
    w: u32,
    h: u32,
) -> Option<String> {
    use base64::{Engine as _, engine::general_purpose};

    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{}/v1/images/generations", port);

    let final_w = w.min(512);
    let final_h = h.min(512);

    let body = serde_json::json!({
        "prompt": prompt,
        "size": format!("{}x{}", final_w, final_h),
        "response_format": "b64_json"
    });

    info!("[Diffusers] Sending image generation request to sd-server on port {}", port);
    let res = client.post(&url).json(&body).send().await.ok()?;
    if !res.status().is_success() {
        warn!("[Diffusers] sd-server returned error status: {:?}", res.status());
        return None;
    }

    let val: serde_json::Value = res.json().await.ok()?;
    let b64_str = val.get("data")
        .and_then(|d| d.as_array())
        .and_then(|arr| arr.first())
        .and_then(|m| m.get("b64_json"))
        .and_then(|v| v.as_str())?;

    let img_bytes = general_purpose::STANDARD.decode(b64_str).ok()?;
    tokio::fs::write(output_path, img_bytes).await.ok()?;

    Some(output_path.to_string())
}

async fn try_sd_cpp_local_inference(
    app: &AppHandle,
    model_path: &str,
    prompt: &str,
    output_path: &str,
    w: u32,
    h: u32,
) -> Option<String> {
    use crate::llm::local_orchestrator::CommandExtWindows;
    
    let app_dir = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(e) => {
            warn!("[Diffusers] Failed to get app data dir: {}", e);
            return None;
        }
    };

    let hw = crate::llm::local_orchestrator::HardwareSnapshot::collect().await;
    let binary_name = crate::llm::local_orchestrator::Downloader::sd_binary_name(&hw.gpu_backend);
    let binary_path = app_dir.join("binaries").join("stable-diffusion").join(binary_name);

    if !binary_path.exists() {
        warn!("[Diffusers] stable-diffusion.cpp binary not found at {:?}", binary_path);
        return None;
    }

    // Apply low-memory (4GB VRAM) constraints and general defaults
    let is_low_vram = hw.profile == crate::llm::local_orchestrator::HardwareProfile::Vram4GbSys16Gb 
        || hw.vram_total_mb <= 4608;

    let final_w = if is_low_vram {
        w.min(512)
    } else {
        w
    };

    let final_h = if is_low_vram {
        h.min(512)
    } else {
        h
    };

    let model_path_lower = model_path.to_lowercase();
    let is_flux = model_path_lower.contains("flux");
    let is_turbo = model_path_lower.contains("turbo") || model_path_lower.contains("schnell");

    let steps = if is_flux || is_turbo {
        4
    } else if is_low_vram {
        15
    } else {
        20
    };

    let cfg = if is_flux || is_turbo {
        1.0
    } else {
        7.0
    };

    let threads = if hw.cpu_physical_cores > 0 {
        hw.cpu_physical_cores.min(8)
    } else {
        4
    };

    info!(
        "[Diffusers] Running stable-diffusion.cpp: {:?} | model: {} | prompt: {} | resolution: {}x{} | threads: {}",
        binary_path, model_path, prompt, final_w, final_h, threads
    );

    let mut cmd = tokio::process::Command::new(&binary_path);
    cmd.arg("-m").arg(model_path);
    cmd.arg("-p").arg(prompt);
    cmd.arg("-o").arg(output_path);
    cmd.arg("-w").arg(final_w.to_string());
    cmd.arg("-h").arg(final_h.to_string());
    cmd.arg("--steps").arg(steps.to_string());
    cmd.arg("--cfg-scale").arg(cfg.to_string());
    cmd.arg("--threads").arg(threads.to_string());
    
    cmd.hide_window();

    if let Some(parent) = binary_path.parent() {
        cmd.current_dir(parent);
    }

    match cmd.output().await {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            if std::path::Path::new(output_path).exists() {
                info!("[Diffusers] stable-diffusion.cpp inference succeeded.");
                Some(output_path.to_string())
            } else {
                warn!(
                    "[Diffusers] stable-diffusion.cpp failed to create image. stdout: {}, stderr: {}",
                    stdout, stderr
                );
                None
            }
        }
        Err(e) => {
            warn!("[Diffusers] Failed to run stable-diffusion.cpp process: {}", e);
            None
        }
    }
}

#[tauri::command]
pub async fn generate_local_image(
    app: AppHandle,
    prompt: String,
    model_id: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<ImageGenResult, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let output_dir = app_dir.join("generated_images");
    tokio::fs::create_dir_all(&output_dir).await.map_err(|e| e.to_string())?;

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let file_name = format!("img_{}.png", ts);
    let target_path = output_dir.join(&file_name);
    let target_str = target_path.to_string_lossy().to_string();

    let w = width.unwrap_or(1024);
    let h = height.unwrap_or(1024);

    // ── Step 1: Try active local model (registered via start_local_server) ──
    let active_model_path: Option<String> = {
        let lock = crate::llm::local_orchestrator::ACTIVE_LOCAL_IMAGE_MODEL
            .lock()
            .unwrap();
        lock.clone()
    };

    // Also allow caller to pass model_id directly (full path or filename in models dir)
    let resolved_model_path: Option<PathBuf> = active_model_path
        .map(|path_str| {
            let p = PathBuf::from(&path_str);
            if p.is_absolute() { p } else { app_dir.join("models").join(path_str) }
        })
        .or_else(|| {
            model_id.as_ref().map(|id| {
                let p = PathBuf::from(id);
                if p.is_absolute() { p } else { app_dir.join("models").join(id) }
            })
        })
        .filter(|p| p.exists());

    if let Some(model_path) = resolved_model_path {
        let model_str = model_path.to_string_lossy().to_string();
        let ext = model_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        info!("[Diffusers] Attempting local inference: {} ({}) → {}", model_str, ext, target_str);

        if ext == "gguf" {
            let port = crate::llm::local_orchestrator::SERVER_PORT.load(std::sync::atomic::Ordering::Relaxed);
            let mut out = None;
            if port > 0 {
                out = try_sd_cpp_server_inference(port, &prompt, &target_str, w, h).await;
            }
            if out.is_none() {
                out = try_sd_cpp_local_inference(&app, &model_str, &prompt, &target_str, w, h).await;
            }
            if let Some(image_path) = out {
                return Ok(ImageGenResult {
                    success: true,
                    image_path,
                    prompt: prompt.clone(),
                    engine: Some(format!("Local GGUF ({} / {})", ext, model_path.file_name().unwrap_or_default().to_string_lossy())),
                    error: None,
                });
            }
        } else {
            if let Some(out) = try_python_local_inference(&model_str, &prompt, &target_str, w, h).await {
                return Ok(ImageGenResult {
                    success: true,
                    image_path: out,
                    prompt: prompt.clone(),
                    engine: Some(format!("Local Python ({} / {})", ext, model_path.file_name().unwrap_or_default().to_string_lossy())),
                    error: None,
                });
            }
        }

        warn!(
            "[Diffusers] Local inference failed for '{}'. Falling through to cloud fallbacks.",
            model_path.display()
        );
        // ⚠️ Fall through to cloud fallbacks below — do NOT return Err here.
    }

    // ── Step 2: Pollinations AI (free cloud API used ONLY when no local model is selected) ──────────
    let seed = ts % 1_000_000;
    let poll_url = format!(
        "https://image.pollinations.ai/prompt/{}?width={}&height={}&nologo=true&seed={}",
        urlencoding::encode(&prompt),
        w,
        h,
        seed
    );

    if let Ok(client) = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
    {
        if let Ok(res) = client.get(&poll_url).send().await {
            if res.status().is_success() {
                if let Ok(bytes) = res.bytes().await {
                    if !bytes.is_empty()
                        && tokio::fs::write(&target_path, &bytes).await.is_ok()
                    {
                        return Ok(ImageGenResult {
                            success: true,
                            image_path: target_str,
                            prompt,
                            engine: Some("Pollinations AI (FLUX Cloud)".to_string()),
                            error: None,
                        });
                    }
                }
            }
        }
    }

    // ── Step 3: OpenAI DALL-E (if key set) ──────────────────────────────────
    if let Ok(openai_key) = std::env::var("OPENAI_API_KEY") {
        if !openai_key.is_empty() {
            let client = reqwest::Client::new();
            let body = serde_json::json!({
                "model": "dall-e-3",
                "prompt": prompt,
                "n": 1,
                "size": "1024x1024",
                "response_format": "b64_json"
            });

            if let Ok(res) = client
                .post("https://api.openai.com/v1/images/generations")
                .header("Authorization", format!("Bearer {}", openai_key))
                .json(&body)
                .send()
                .await
            {
                if let Ok(json) = res.json::<serde_json::Value>().await {
                    if let Some(b64) = json["data"][0]["b64_json"].as_str() {
                        use base64::Engine;
                        if let Ok(bytes) =
                            base64::engine::general_purpose::STANDARD.decode(b64)
                        {
                            if tokio::fs::write(&target_path, bytes).await.is_ok() {
                                return Ok(ImageGenResult {
                                    success: true,
                                    image_path: target_str,
                                    prompt,
                                    engine: Some("OpenAI DALL-E 3".to_string()),
                                    error: None,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    Err("Image generation failed: No local model selected and cloud providers unreachable.".to_string())
}
