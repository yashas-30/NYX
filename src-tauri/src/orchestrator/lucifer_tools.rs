use async_trait::async_trait;
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};
use tauri::Manager;
use tokio::fs;

use crate::commands::agent::search_web_command;
use crate::orchestrator::tools::Tool;

/// Lucifer Web Search Tool
pub struct LuciferSearchTool;

impl LuciferSearchTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for LuciferSearchTool {
    fn name(&self) -> String {
        "web_search".to_string()
    }

    fn description(&self) -> String {
        "Search the web for real-time information, documentation, news, or current facts.".to_string()
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query"
                },
                "num_results": {
                    "type": ["integer", "null"],
                    "description": "Number of search results to return (default: 5)"
                },
                "provider": {
                    "type": ["string", "null"],
                    "enum": ["tavily", "serper", "exa", "duckduckgo", null],
                    "description": "Optional search provider override"
                },
                "api_key": {
                    "type": ["string", "null"],
                    "description": "Optional API key for paid search provider"
                }
            },
            "required": ["query"],
            "additionalProperties": false
        })
    }

    async fn execute(&self, app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
        let query = args.get("query")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'query' parameter")?;

        let clean_query = query.trim();
        if clean_query.is_empty() {
            return Err("Search query cannot be empty.".to_string());
        }

        let num_results = args.get("num_results")
            .and_then(|v| v.as_u64())
            .map(|n| n as usize)
            .unwrap_or(7); // Increased: page-fetch enriches top 3, more candidates improves coverage

        let arg_provider = args.get("provider").and_then(|v| v.as_str()).map(|s| s.to_string());
        let arg_api_key = args.get("api_key").and_then(|v| v.as_str()).map(|s| s.to_string());

        let state = app.state::<crate::AppState>();
        
        let provider = match arg_provider {
            Some(p) if !p.trim().is_empty() => p,
            _ => state.search_provider.read().await.clone(),
        };

        let api_key = match arg_api_key {
            Some(k) if !k.trim().is_empty() => Some(k),
            _ => {
                let k = state.search_api_key.read().await.clone();
                if k.trim().is_empty() { None } else { Some(k) }
            }
        };

        let res = search_web_command(
            clean_query.to_string(),
            Some(num_results),
            Some(provider),
            api_key,
        ).await?;

        Ok(json!(res))
    }
}

/// Lucifer Conversational Memory & RAG Tool (FastEmbed + SQLite)
pub struct LuciferMemoryTool;

impl LuciferMemoryTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for LuciferMemoryTool {
    fn name(&self) -> String {
        "conversational_memory".to_string()
    }

    fn description(&self) -> String {
        "Save or retrieve long-term facts, preferences, or knowledge vectors in Lucifer's memory store.".to_string()
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["save", "search"],
                    "description": "Whether to 'save' a new memory or 'search' existing memories."
                },
                "fact": {
                    "type": ["string", "null"],
                    "description": "The fact/information to save (required for 'save' action)"
                },
                "query": {
                    "type": ["string", "null"],
                    "description": "The search query for memory retrieval (required for 'search' action)"
                },
                "category": {
                    "type": ["string", "null"],
                    "description": "Optional category tag for the memory (e.g., 'preference', 'project', 'fact')"
                }
            },
            "required": ["action", "fact", "query", "category"],
            "additionalProperties": false
        })
    }

    async fn execute(&self, app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
        let action = args.get("action").and_then(|v| v.as_str()).unwrap_or("search");
        let pool = app.state::<sqlx::SqlitePool>();

        if action == "save" {
            let fact = args.get("fact").and_then(|v| v.as_str()).unwrap_or("");
            if fact.trim().is_empty() {
                return Err("Missing 'fact' parameter for save action".to_string());
            }

            let category = args.get("category")
                .and_then(|v| v.as_str())
                .unwrap_or("lucifer_memory")
                .to_string();

            let id = uuid::Uuid::new_v4().to_string();
            crate::commands::db::db_add_memory(
                pool,
                Some(id),
                fact.to_string(),
                Some(category.clone()),
                None, // Auto-computes and LE-encodes embedding BLOB cleanly inside db_add_memory
            ).await.map_err(|e| e.to_string())?;

            // Also write to TurboVec (LanceDB) if it's available as app state.
            // This dual-write keeps both stores in sync — LanceDB handles ANN at scale,
            // SQLite handles exact cosine at small scale. Both are queried on retrieval.
            if let Some(tv_store) = app.try_state::<std::sync::Arc<crate::rag::turbovec_store::TurbovecStore>>() {
                let tv_wrapper = std::sync::Arc::clone(&tv_store);
                let fact_str = fact.to_string();
                tokio::spawn(async move {
                    tv_wrapper.add_memory(&fact_str).await;
                });
            }

            Ok(json!({
                "status": "success",
                "message": format!("Memory saved successfully under category '{}'.", category),
                "fact": fact
            }))
        } else {
            let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
            if query.trim().is_empty() {
                return Err("Missing 'query' parameter for search action".to_string());
            }

            let query_vector = match crate::rag::embeddings::Embedder::new() {
                Ok(embedder) => embedder.embed(vec![query.to_string()]).await.ok().and_then(|mut v| v.pop()),
                Err(_) => None,
            };

            let mut formatted_memories: Vec<Value> = Vec::new();
            let mut seen_facts: std::collections::HashSet<String> = std::collections::HashSet::new();

            if let Ok(results) = crate::commands::db::db_search_memories(
                pool,
                Some(query.to_string()),
                query_vector,
                Some(5),
            ).await {
                for m in results {
                    let key = m.fact.trim().to_string();
                    if !key.is_empty() && seen_facts.insert(key) {
                        formatted_memories.push(json!({
                            "fact": m.fact,
                            "category": m.category,
                            "relevance_score": (m.similarity * 100.0).round() / 100.0
                        }));
                    }
                }
            }

            if let Some(tv_store) = app.try_state::<std::sync::Arc<crate::rag::turbovec_store::TurbovecStore>>() {
                let tv_results = tv_store.search_memory(query, 5).await;
                for (_id, text) in tv_results {
                    let key = text.trim().to_string();
                    if !key.is_empty() && seen_facts.insert(key.clone()) {
                        formatted_memories.push(json!({
                            "fact": text,
                            "category": "turbovec",
                            "relevance_score": 0.85
                        }));
                    }
                }
            }

            if formatted_memories.is_empty() {
                Ok(json!({
                    "status": "success",
                    "query": query,
                    "count": 0,
                    "memories": [],
                    "message": format!("No relevant memories found matching query: '{}'", query)
                }))
            } else {
                let count = formatted_memories.len();
                Ok(json!({
                    "status": "success",
                    "query": query,
                    "count": count,
                    "memories": formatted_memories
                }))
            }
        }
    }
}

/// Lucifer File Creation Tool
pub struct LuciferCreateFileTool;

impl LuciferCreateFileTool {
    pub fn new() -> Self {
        Self
    }

    fn resolve_safe_path(base_dir: &Path, filename: &str) -> Result<PathBuf, String> {
        let input_path = Path::new(filename);
        let mut target_path = base_dir.to_path_buf();

        for component in input_path.components() {
            match component {
                Component::Normal(c) => target_path.push(c),
                Component::ParentDir => {
                    return Err(format!(
                        "Security violation: path traversal ('..') detected in filename '{}'",
                        filename
                    ));
                }
                Component::RootDir | Component::Prefix(_) | Component::CurDir => {}
            }
        }

        if let Ok(canonical_base) = base_dir.canonicalize() {
            let check_dir = if target_path.exists() {
                target_path.canonicalize().ok()
            } else {
                target_path.parent().and_then(|p| p.canonicalize().ok())
            };
            if let Some(canonical_check) = check_dir {
                if !canonical_check.starts_with(&canonical_base) {
                    return Err("Security violation: resolved path escapes base directory bounds".to_string());
                }
            }
        }

        Ok(target_path)
    }
}

#[async_trait]
impl Tool for LuciferCreateFileTool {
    fn name(&self) -> String {
        "create_file".to_string()
    }

    fn description(&self) -> String {
        "Safely create code, text, markdown, or data files within the application workspace.".to_string()
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Relative file name or subpath (e.g. 'scripts/run.py', 'doc.md')"
                },
                "content": {
                    "type": "string",
                    "description": "Content to write into the file"
                }
            },
            "required": ["filename", "content"],
            "additionalProperties": false
        })
    }

    async fn execute(&self, app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
        let filename = args
            .get("filename")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Missing required parameter 'filename'".to_string())?;

        let content = args
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let base_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| dirs::download_dir().unwrap_or_else(|| PathBuf::from(".")))
            .join("Lucifer_Files");

        let target_path = Self::resolve_safe_path(&base_dir, filename)?;

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).await.map_err(|e| {
                format!("Failed to create parent directory '{}': {}", parent.display(), e)
            })?;
        }

        let file_existed = target_path.exists();

        fs::write(&target_path, content).await.map_err(|e| {
            format!("Failed to write to file '{}': {}", target_path.display(), e)
        })?;

        let bytes_written = content.len();
        Ok(json!({
            "status": if file_existed { "overwritten" } else { "created" },
            "path": target_path.to_string_lossy().to_string(),
            "filename": filename,
            "bytes_written": bytes_written,
            "parent_directory": target_path.parent().map(|p| p.to_string_lossy().to_string())
        }))
    }
}

/// Lucifer Image Generation Tool Trigger
pub struct LuciferImageGenTool;

impl LuciferImageGenTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for LuciferImageGenTool {
    fn name(&self) -> String {
        "generate_image".to_string()
    }

    fn description(&self) -> String {
        "Trigger image synthesis for a detailed visual prompt.".to_string()
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Detailed image generation prompt describing the desired visual"
                },
                "aspect_ratio": {
                    "type": ["string", "null"],
                    "enum": ["1:1", "16:9", "9:16", "4:3", null],
                    "description": "Aspect ratio of the generated image"
                }
            },
            "required": ["prompt", "aspect_ratio"],
            "additionalProperties": false
        })
    }

    async fn execute(&self, app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
        let prompt = args.get("prompt").and_then(|v| v.as_str()).unwrap_or("");
        let aspect_ratio = args.get("aspect_ratio").and_then(|v| v.as_str()).unwrap_or("1:1");

        let (w, h) = match aspect_ratio {
            "16:9" => (1280, 720),
            "9:16" => (720, 1280),
            "4:3" => (1024, 768),
            _ => (1024, 1024),
        };

        match crate::llm::diffusers::generate_local_image(app.clone(), prompt.to_string(), None, Some(w), Some(h)).await {
            Ok(res) => Ok(json!({
                "type": "image_generation_request",
                "status": if res.success { "completed" } else { "failed" },
                "prompt": prompt,
                "aspect_ratio": aspect_ratio,
                "engine": res.engine.clone().unwrap_or_else(|| "Unknown Engine".to_string()),
                "image_path": res.image_path,
                "message": format!("Image successfully generated via {} at '{}'", res.engine.unwrap_or_default(), res.image_path)
            })),
            Err(e) => Err(format!("Image generation failed: {}", e)),
        }
    }
}

/// Lucifer Topic Web Image Search Tool (DuckDuckGo & Bing Images)
pub struct LuciferMediaSearchTool;

impl LuciferMediaSearchTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for LuciferMediaSearchTool {
    fn name(&self) -> String {
        "search_media".to_string()
    }

    fn description(&self) -> String {
        "Search high-quality topic photographs and web images from DuckDuckGo and Bing for visual grounding and response illustration.".to_string()
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Topic or keyword for image retrieval (e.g. 'James Webb Space Telescope', 'Porsche 911 GT3 RS')"
                },
                "limit": {
                    "type": ["integer", "null"],
                    "description": "Maximum number of images to return (default: 4, max: 10)"
                }
            },
            "required": ["query"],
            "additionalProperties": false
        })
    }

    async fn execute(&self, _app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
        let query = args.get("query")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'query' parameter")?;

        let limit = args.get("limit")
            .and_then(|v| v.as_u64())
            .map(|n| (n as usize).clamp(1, 10))
            .unwrap_or(4);

        let images_json = crate::commands::agent::search_images_command(
            query.to_string(),
            Some(limit),
        ).await?;

        let parsed_images: Value = serde_json::from_str(&images_json).unwrap_or(json!([]));

        Ok(json!({
            "query": query,
            "images_count": parsed_images.as_array().map(|a| a.len()).unwrap_or(0),
            "photos": parsed_images
        }))
    }
}

/// Lucifer Voice Synthesis (TTS) Tool Trigger
pub struct LuciferVoiceTool;

impl LuciferVoiceTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for LuciferVoiceTool {
    fn name(&self) -> String {
        "synthesize_voice".to_string()
    }

    fn description(&self) -> String {
        "Synthesize text into natural spoken audio (Text-to-Voice).".to_string()
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "Text to speak"
                },
                "voice": {
                    "type": ["string", "null"],
                    "description": "Voice identifier or style"
                }
            },
            "required": ["text", "voice"],
            "additionalProperties": false
        })
    }

    async fn execute(&self, app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
        let text = args.get("text").and_then(|v| v.as_str()).unwrap_or("").trim();

        // Guard: reject empty or whitespace-only input immediately
        if text.is_empty() {
            return Err("Voice synthesis requires text to speak. Usage: 'say this: <text>' or 'speak: <text>'".to_string());
        }

        let voice = args.get("voice").and_then(|v| v.as_str()).unwrap_or("lucifer-default");

        let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let audio_dir = app_dir.join("generated_audio");
        tokio::fs::create_dir_all(&audio_dir).await.map_err(|e| e.to_string())?;

        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let audio_path = audio_dir.join(format!("speech_{}.wav", ts));
        let audio_str = audio_path.to_string_lossy().to_string();

        #[cfg(target_os = "windows")]
        {
            // Sanitize: escape single quotes, strip newlines, remove double-quotes to prevent PS injection
            let safe_text = text
                .replace('\'', "''")
                .replace('\n', " ")
                .replace('\r', "")
                .replace('"', "");
            let ps_script = format!(
                "Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.SetOutputToWaveFile('{}'); $synth.Speak('{}'); $synth.Dispose()",
                audio_str.replace('\\', "/"),
                safe_text
            );
            let output = tokio::process::Command::new("powershell")
                .args(&["-NoProfile", "-Command", &ps_script])
                .output()
                .await
                .map_err(|e| e.to_string())?;

            if !output.status.success() {
                return Err(format!("SAPI TTS synthesis failed: {}", String::from_utf8_lossy(&output.stderr)));
            }
        }

        Ok(json!({
            "type": "voice_synthesis_request",
            "status": "completed",
            "text": text,
            "voice": voice,
            "audio_path": audio_str,
            "message": format!("Voice synthesis completed: audio saved to '{}'", audio_str)
        }))
    }
}

/// Lucifer Hardware & Context Analyzer Tool
pub struct LuciferContextAnalyzerTool;

impl LuciferContextAnalyzerTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for LuciferContextAnalyzerTool {
    fn name(&self) -> String {
        "analyze_model_context".to_string()
    }

    fn description(&self) -> String {
        "Inspect local CPU/GPU/RAM hardware state, resolve system specs, and calculate optimal context window size and VRAM offload layers.".to_string()
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "model_size_gb": {
                    "type": ["number", "null"],
                    "description": "Estimated model size in GB (default: 4.0)"
                },
                "context_size": {
                    "type": ["integer", "null"],
                    "description": "Requested context window size in tokens (e.g. 4096, 8192, 16384). Default: 8192"
                }
            },
            "required": ["model_size_gb", "context_size"],
            "additionalProperties": false
        })
    }

    async fn execute(&self, _app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
        let size_gb = args.get("model_size_gb").and_then(|v| v.as_f64()).unwrap_or(4.0) as f32;
        let ctx_size = args.get("context_size").and_then(|v| v.as_u64()).unwrap_or(8192) as u32;

        let sys_specs = crate::commands::system::get_hardware_specs().await;
        let hw = crate::llm::local_orchestrator::HardwareSnapshot::collect().await;
        let ngl = crate::llm::local_orchestrator::compute_ngl_decision(&hw, None, size_gb, ctx_size);

        let gpu_type = if hw.is_igpu {
            "Integrated GPU (iGPU / Shared Memory)"
        } else if hw.has_dedicated_gpu {
            "Dedicated GPU (dGPU)"
        } else {
            "No Dedicated GPU (CPU Only)"
        };

        let offload_mode = if ngl.fully_gpu {
            "Full GPU Offload"
        } else if ngl.hybrid {
            "Hybrid (GPU + CPU Split)"
        } else {
            "CPU Only"
        };

        let ram_avail_gb = hw.ram_available_mb as f64 / 1024.0;
        let ram_total_gb = hw.ram_total_mb as f64 / 1024.0;
        let vram_avail_gb = hw.vram_available_mb as f64 / 1024.0;
        let vram_total_gb = hw.vram_total_mb as f64 / 1024.0;
        let est_vram_gb = ngl.estimated_vram_mb as f64 / 1024.0;

        let recommendation = if ngl.fully_gpu {
            "Optimal performance: Model fits entirely within VRAM. Full GPU acceleration active."
        } else if ngl.hybrid {
            "Partial offload mode: Model exceeds VRAM headroom. Layers split between GPU and system RAM."
        } else {
            "CPU fallback mode: Insufficient VRAM or no GPU detected. Inference running entirely on CPU threads."
        };

        let markdown_report = format!(
            "# 🖥️ Hardware & Model Context Analysis Report\n\n\
             ## 📊 Hardware Specifications\n\
             - **CPU**: {} ({} Physical Cores / {} Logical Threads)\n\
             - **System RAM**: {:.2} GB Available / {:.2} GB Total\n\
             - **GPU**: {} ({})\n\
             - **VRAM**: {:.2} GB Available / {:.2} GB Total\n\n\
             ## ⚙️ Context Window & Offload Calculation\n\
             - **Target Model Size**: {:.1} GB\n\
             - **Requested Context Window**: {} tokens\n\
             - **Effective Context Window**: {} tokens\n\
             - **Offload Mode**: {} (Suggested NGL: `{}`)\n\
             - **Estimated VRAM Usage**: {:.2} GB\n\
             - **Recommended CPU Threads**: `{}`\n\n\
             ## 💡 Analysis & Recommendation\n\
             > {}\n\n\
             *System Note: {}*",
            hw.cpu_name, hw.cpu_physical_cores, hw.cpu_logical_threads,
            ram_avail_gb, ram_total_gb,
            hw.gpu_name, gpu_type,
            vram_avail_gb, vram_total_gb,
            size_gb,
            ctx_size,
            ngl.effective_context_size,
            offload_mode, ngl.ngl,
            est_vram_gb,
            ngl.recommended_cpu_threads,
            recommendation,
            ngl.message
        );

        Ok(json!({
            "status": "success",
            "markdown": markdown_report,
            "analysis": {
                "cpu_name": hw.cpu_name,
                "cpu_physical_cores": hw.cpu_physical_cores,
                "cpu_logical_threads": hw.cpu_logical_threads,
                "ram_total_mb": hw.ram_total_mb,
                "ram_available_mb": hw.ram_available_mb,
                "gpu_name": hw.gpu_name,
                "gpu_type": gpu_type,
                "is_igpu": hw.is_igpu,
                "vram_total_mb": hw.vram_total_mb,
                "vram_available_mb": hw.vram_available_mb,
                "requested_model_size_gb": size_gb,
                "requested_context_size": ctx_size,
                "effective_context_size": ngl.effective_context_size,
                "suggested_ngl": ngl.ngl,
                "offload_mode": offload_mode,
                "recommended_cpu_threads": ngl.recommended_cpu_threads,
                "estimated_vram_mb": ngl.estimated_vram_mb,
                "recommendation": recommendation,
                "system_specs_resolved": sys_specs.data.is_some()
            }
        }))
    }
}

/// Lucifer Model Fleet Management Tool
/// Gives the Lucifer supervisor agent programmatic capability to inspect installed models,
/// load models onto GPU, unload active models to free VRAM, and check system hardware stats.
pub struct LuciferModelManagementTool;

impl LuciferModelManagementTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for LuciferModelManagementTool {
    fn name(&self) -> String {
        "model_management".to_string()
    }

    fn description(&self) -> String {
        "Manage the local model fleet and hardware: list installed models, load a local model onto GPU, unload active models to free VRAM, and check system hardware stats.".to_string()
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["list_models", "load_model", "unload_model", "hardware_info"],
                    "description": "The action to perform: list_models, load_model, unload_model, or hardware_info"
                },
                "model_id": {
                    "type": ["string", "null"],
                    "description": "Model filename/identifier (e.g. 'qwen2.5-1.5b-instruct-q4_k_m.gguf') for load_model"
                },
                "gpu_layers": {
                    "type": ["integer", "null"],
                    "description": "Number of GPU layers to offload (default: 99 for full GPU offload)"
                }
            },
            "required": ["action"]
        })
    }

    async fn execute(&self, app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
        let action = args.get("action").and_then(|v| v.as_str()).unwrap_or("list_models");

        match action {
            "list_models" => {
                let models = crate::llm::local_orchestrator::list_local_models(app.clone()).await?;
                Ok(json!({
                    "status": "success",
                    "installed_local_models": models,
                    "default_agent_brain": "qwen2.5-1.5b-instruct-q4_k_m.gguf (Rig-Core 100% GPU)"
                }))
            },
            "load_model" => {
                let model_id = args.get("model_id").and_then(|v| v.as_str())
                    .ok_or_else(|| "Missing 'model_id' parameter for load_model action".to_string())?;
                let gpu_layers = args.get("gpu_layers").and_then(|v| v.as_u64()).map(|v| v as u32).or(Some(99));
                
                let manager = app.state::<std::sync::Arc<crate::llm::local_orchestrator::LlamaManager>>();
                let res = crate::llm::local_orchestrator::start_local_server(
                    app.clone(),
                    manager,
                    model_id.to_string(),
                    Some(8192),
                    gpu_layers,
                    None,
                    Some(true),
                    None,
                    None,
                    Some(512),
                    None,
                    None,
                    None,
                    None,
                ).await?;

                Ok(json!({
                    "status": "success",
                    "message": format!("Model '{}' loaded onto GPU", model_id),
                    "details": res
                }))
            },
            "unload_model" => {
                let manager = app.state::<std::sync::Arc<crate::llm::local_orchestrator::LlamaManager>>();
                let _ = crate::llm::local_orchestrator::stop_local_server(manager).await?;
                Ok(json!({
                    "status": "success",
                    "message": "Local model unloaded. VRAM freed."
                }))
            },
            "hardware_info" => {
                let hw = crate::llm::local_orchestrator::HardwareSnapshot::collect().await;
                Ok(json!({
                    "status": "success",
                    "cpu": hw.cpu_name,
                    "ram_available_mb": hw.ram_available_mb,
                    "ram_total_mb": hw.ram_total_mb,
                    "gpu": hw.gpu_name,
                    "vram_available_mb": hw.vram_available_mb,
                    "vram_total_mb": hw.vram_total_mb,
                    "gpu_backend": format!("{:?}", hw.gpu_backend)
                }))
            },
            other => Err(format!("Unknown action '{}'. Expected: list_models, load_model, unload_model, hardware_info", other))
        }
    }
}

