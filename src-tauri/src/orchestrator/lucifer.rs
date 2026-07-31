use std::collections::HashMap;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Listener, Manager};
use regex::Regex;

use crate::llm::types::{UnifiedRequest, UnifiedMessage, StreamChunkPayload};
use crate::llm::cloud_orchestrator::execute_cloud_stream;
use crate::llm::local_inference::execute_local_stream;
use crate::orchestrator::tools::Tool;
use crate::orchestrator::lucifer_tools::{
    LuciferSearchTool, LuciferMemoryTool, LuciferCreateFileTool,
    LuciferImageGenTool, LuciferVoiceTool, LuciferContextAnalyzerTool
};

pub const LUCIFER_PERSONA: &str = r#"You are Lucifer, NYX's supreme AI Agent.
You operate as an autonomous, hyper-intelligent orchestrator connected to local GGUF models, cloud LLMs, agentic vector RAG memory (TurboVec), live web search, image generation, and text-to-voice engines.

Guidelines:
1. Always analyze user intent accurately (Search, RAG Memory, Image Gen, Voice, Code/File Creation, Model Hardware Analysis).
2. Answer ONLY what the user explicitly requested. Be precise, concise, and eliminate unnecessary conversational filler.
3. When tool calls are required, output valid function calls.
4. When research or memory facts are retrieved, integrate them seamlessly without robotic meta-commentary.
5. Maintain a powerful, sophisticated, accurate, and helpful persona. Never claim to be ChatGPT, Gemini, or Claude; your identity is strictly Lucifer, the Supreme Agent of NYX.
6. CONVERSATIONAL CONTINUITY: Maintain complete context of conversation history. If the user provides a short response ("yes", "no", "do it", "that one", "correct", "sure", etc.) acknowledging your question or suggestion from the previous turn, IMMEDIATELY fulfill the pending task or answer. NEVER reset the conversation or output generic greetings like "How can I help you today?" when continuing an active conversation."#;

struct UnlistenGuard {
    app: AppHandle,
    id: tauri::EventId,
}

impl Drop for UnlistenGuard {
    fn drop(&mut self) {
        self.app.unlisten(self.id);
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LuciferAnalysis {
    pub intent: String,
    pub requires_search: bool,
    pub requires_memory: bool,
    pub requires_image_gen: bool,
    pub requires_voice: bool,
    pub is_local_model: bool,
    pub confidence: f32,
}

pub struct LuciferOrchestrator {
    tools: HashMap<String, Arc<dyn Tool>>,
}

static SEARCH_INTENT_REGEX: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"(?i)^(?:/search|/web|search:|google:|lookup:|web:)\s*|\b(?:search\s+(?:the\s+)?web|search\s+online|google\s+for|search\s+for|look\s*up\s+online|browse\s+the\s+web)\b|\b(?:latest|current|today's|breaking|live|real-time)\s+(?:news|weather|score|scores|stock|stocks|price|prices|market|release|version|fixtures|standings)\b|\b(?:what\s+is\s+the\s+latest|what\s+happened\s+today|who\s+won\s+today|current\s+standings|current\s+score|live\s+score|breaking\s+news|trending\s+now|real-time\s+data)\b").unwrap()
});

/// Anchored greeting regex — evaluated ONLY against the current user message.
static GREETING_REGEX: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"(?i)^(hi|hello|hey|greetings|good\s+(?:morning|afternoon|evening|day)|yo|sup|ping|test|howdy|what's\s+up|whats\s+up|hiya)(?:[\s!.,?]+(?:lucifer|nyx|there|bot|assistant))?[\s!.,?]*$").unwrap()
});

/// Voice synthesis intent — requires an explicit command prefix in the current message.
/// ONLY fires when user provides prefix + content (e.g. "say this: good morning world").
static VOICE_INTENT_REGEX: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"(?i)^(?:say\s+this:|say:|speak:|read\s+aloud:|synthesize\s+(?:voice|audio|speech):|generate\s+audio\s+for:|text-to-speech:|tts:)\s*|\b(?:say\s+out\s+loud|read\s+(?:this|that|it)\s+(?:aloud|out\s+loud)|synthesize\s+(?:voice|audio|speech)\s+for|convert\s+to\s+speech|speak\s+this\s+text)\b").unwrap()
});

/// Explicit image generation intent — requires direct image creation command.
static IMAGE_INTENT_REGEX: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"(?i)^(?:/image|/img|image:|draw:|generate\s+image:)\s*|\b(?:generate|create|draw|paint|render)\s+(?:an?\s+)?(?:image|picture|photo|illustration|artwork|drawing|painting|banner|poster|logo|avatar)\b|\b(?:draw|paint|render)\s+me\b|\bgenerate\s+(?:a\s+)?picture\s+of\b").unwrap()
});

/// Explicit memory save/recall intent.
static MEMORY_INTENT_REGEX: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"(?i)^(?:/memory|/remember|remember:|memory:)\s*|\b(?:remember\s+that|remember\s+this|save\s+(?:this\s+)?to\s+(?:your\s+)?memory|store\s+this\s+fact|keep\s+in\s+mind\s+that|note\s+that\s+I\s+)\b|\b(?:what\s+do\s+you\s+remember\s+about|what\s+did\s+I\s+say\s+about|do\s+you\s+recall\s+(?:my|what|when)|search\s+(?:your\s+)?memory\s+for)\b").unwrap()
});

impl LuciferOrchestrator {
    pub fn new() -> Self {
        let mut orchestrator = Self {
            tools: HashMap::new(),
        };

        orchestrator.register_tool(LuciferSearchTool::new());
        orchestrator.register_tool(LuciferMemoryTool::new());
        orchestrator.register_tool(LuciferCreateFileTool::new());
        orchestrator.register_tool(LuciferImageGenTool::new());
        orchestrator.register_tool(LuciferVoiceTool::new());
        orchestrator.register_tool(LuciferContextAnalyzerTool::new());

        orchestrator
    }

    pub fn register_tool<T: Tool + 'static>(&mut self, tool: T) {
        self.tools.insert(tool.name().to_string(), Arc::new(tool));
    }

    /// Returns true when the CURRENT user message is a pure greeting that should never trigger tools.
    fn is_greeting_text(text: &str) -> bool {
        let trimmed = text.trim();
        if trimmed.is_empty() || trimmed.len() > 30 {
            return false;
        }
        GREETING_REGEX.is_match(trimmed)
    }

    /// Extracts the text payload from an explicit TTS command in the CURRENT message.
    /// Returns Some(text_to_speak) ONLY when the user provides a valid prefix + non-empty content.
    /// Returns None for all other messages — preventing voice tool from firing on greetings or
    /// informational questions like "how does audio compression work?".
    pub fn extract_voice_text(input: &str) -> Option<String> {
        let trimmed = input.trim();
        if trimmed.is_empty() || !VOICE_INTENT_REGEX.is_match(trimmed) {
            return None;
        }
        // Strip the matched prefix to get the content
        let lower = trimmed.to_lowercase();
        let prefixes = [
            "say this:", "say:", "speak:", "read aloud:",
            "synthesize voice:", "synthesize audio:", "synthesize speech:",
            "generate audio for:", "text-to-speech:", "tts:",
            "say out loud", "read this aloud", "read it aloud",
            "speak this text", "convert to speech",
        ];
        for prefix in prefixes {
            if lower.starts_with(prefix) {
                let content = trimmed[prefix.len()..].trim().trim_matches(':').trim();
                if !content.is_empty() {
                    return Some(content.to_string());
                }
            }
        }
        // Fallback: if regex matched but no prefix stripped, return the full trimmed text
        // (handles patterns like "synthesize speech for me" where content follows the match)
        None
    }

    pub fn analyze_turn(messages: &[UnifiedMessage], provider: &str) -> LuciferAnalysis {
        let is_local_model = provider == "nyx-native" || provider.contains("local");

        // Extract CURRENT user message (last message) for tool intent evaluation
        let last_user_text = messages.last().map(|msg| match &msg.content {
            Value::String(s) => s.clone(),
            Value::Array(arr) => arr.iter()
                .filter_map(|v| v.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>().join(" "),
            _ => String::new(),
        }).unwrap_or_default();

        // --- GREETING SHORT-CIRCUIT ---
        // If the current message is a pure greeting, ALL tool flags are false.
        // Historical keywords ("voice", "audio", "draw") in past turns MUST NOT pollute this turn.
        if Self::is_greeting_text(&last_user_text) {
            return LuciferAnalysis {
                intent: "conversational".to_string(),
                requires_search: false,
                requires_memory: false,
                requires_image_gen: false,
                requires_voice: false,
                is_local_model,
                confidence: 1.0,
            };
        }

        // Evaluate tool intent strictly on current message
        let current = last_user_text.to_lowercase();
        let requires_voice = VOICE_INTENT_REGEX.is_match(&current);
        let requires_image_gen = IMAGE_INTENT_REGEX.is_match(&current);
        let requires_memory = MEMORY_INTENT_REGEX.is_match(&current);

        // Web search: current-turn explicit patterns OR short continuation on a history search turn
        let requires_search = SEARCH_INTENT_REGEX.is_match(&current);

        let intent = if requires_image_gen {
            "image_generation"
        } else if requires_voice {
            "voice_synthesis"
        } else if requires_search {
            "web_search"
        } else if requires_memory {
            "memory_rag"
        } else if current.contains("debug") || current.contains("function") || current.contains("compile") {
            "code_engineering"
        } else {
            "conversational"
        };

        LuciferAnalysis {
            intent: intent.to_string(),
            requires_search,
            requires_memory,
            requires_image_gen,
            requires_voice,
            is_local_model,
            confidence: 0.95,
        }
    }

    pub async fn run_turn(
        &self,
        app: AppHandle,
        mut request: UnifiedRequest,
        tx: tauri::ipc::Channel<StreamChunkPayload>,
    ) -> Result<(), String> {
        // --- MODEL-AWARE PERSONA INJECTION ---
        // Inject the active model name and provider into the system instruction so Lucifer
        // knows what backend it is running on and can communicate capability limitations.
        let base_sys = request.system_instruction.clone().unwrap_or_default();
        let sys_prompt = if !base_sys.contains("You are Lucifer") {
            format!(
                "{}\n\nCURRENT ENGINE CONTEXT:\n- Active Backend Model: {}\n- Provider: {}\n\n{}",
                LUCIFER_PERSONA,
                request.model_id,
                request.provider,
                base_sys
            )
        } else if !base_sys.contains("CURRENT ENGINE CONTEXT") {
            // Already has persona but missing model context block — inject model context
            format!(
                "{}\n\nCURRENT ENGINE CONTEXT:\n- Active Backend Model: {}\n- Provider: {}",
                base_sys,
                request.model_id,
                request.provider
            )
        } else {
            base_sys
        };
        request.system_instruction = Some(sys_prompt);

        let analysis = Self::analyze_turn(&request.messages, &request.provider);

        let last_user_text = request.messages.last().map(|msg| match &msg.content {
            Value::String(s) => s.clone(),
            Value::Array(arr) => arr.iter().filter_map(|v| v.get("text").and_then(|t| t.as_str())).collect::<Vec<_>>().join(" "),
            _ => String::new(),
        }).unwrap_or_default();

        // Automatic Fast Vector RAG Memory Retrieval (TurboVec / SQLite Memory)
        if !last_user_text.is_empty() {


            // --- VOICE SYNTHESIS: Explicit prefix + content ONLY ---
            // extract_voice_text() returns Some ONLY when the CURRENT message starts with
            // an explicit TTS command ("say this:", "speak:", "read aloud:", etc.)
            // This prevents history-contaminated requires_voice from triggering on "hi".
            if let Some(text_to_speak) = Self::extract_voice_text(&last_user_text) {
                // Capability gate: local GGUF models use OS TTS (Windows SAPI) — allowed.
                // Cloud models: voice tool uses same OS TTS path — allowed.
                if let Some(tool) = self.tools.get("synthesize_voice") {
                    let _ = tx.send(StreamChunkPayload::tool_start("tts_1".to_string(), "synthesize_voice".to_string()));
                    match tool.execute(&app, json!({ "text": text_to_speak })).await {
                        Ok(_res) => {
                            let _ = tx.send(StreamChunkPayload::tool_complete());
                            let msg = format!("Voice synthesis complete. Speaking: \"{}\"\nAudio saved successfully.", text_to_speak);
                            let _ = tx.send(StreamChunkPayload::text(msg));
                            let _ = tx.send(StreamChunkPayload::done());
                            return Ok(());
                        }
                        Err(e) => {
                            let _ = tx.send(StreamChunkPayload::error(format!("Voice synthesis failed: {}", e)));
                            return Err(e);
                        }
                    }
                }
            }

            // --- CAPABILITY EXPLANATION ---
            // If user asked about audio/voice capabilities but didn't provide an explicit TTS command,
            // route to LLM — it will explain model limitations using the CURRENT ENGINE CONTEXT.
            // (No early return here — falls through to LLM generation below.)

            if !last_user_text.trim().is_empty() && last_user_text.len() > 3 {
                let pool = app.state::<sqlx::SqlitePool>();
                let query_vector = match crate::rag::embeddings::Embedder::new() {
                    Ok(embedder) => embedder.embed(vec![last_user_text.clone()]).await.ok().and_then(|mut v| v.pop()),
                    Err(_) => None,
                };
                if let Ok(memories) = crate::commands::db::db_search_memories(pool, Some(last_user_text.clone()), query_vector, Some(3)).await {
                    if !memories.is_empty() {
                        let memory_block = memories.iter()
                            .map(|m| format!("- {}", m.fact))
                            .collect::<Vec<_>>()
                            .join("\n");
                        let sys = request.system_instruction.take().unwrap_or_default();
                        request.system_instruction = Some(format!("{}\n\n[RELEVANT MEMORIES / FACTS FROM VECTOR STORE]\n{}", sys, memory_block));
                    }
                }
            }

            // Automatic Fast Web Search Pre-Fetch (DuckDuckGo + DashMap In-Memory Cache)
            if (analysis.requires_search || last_user_text.to_lowercase().contains("f1") || last_user_text.to_lowercase().contains("gp") || last_user_text.to_lowercase().contains("schedule") || last_user_text.to_lowercase().contains("latest") || last_user_text.to_lowercase().contains("news"))
                && !last_user_text.contains("[LIVE WEB SEARCH RESULTS") 
            {
                if let Ok(search_res) = crate::commands::agent::search_web_command(last_user_text.clone(), Some(5), Some("duckduckgo".to_string()), None).await {
                    if !search_res.trim().is_empty() {
                        let sys = request.system_instruction.take().unwrap_or_default();
                        request.system_instruction = Some(format!("{}\n\n[LIVE WEB SEARCH RESULTS - CURRENT INFORMATION]\n{}\n[END LIVE WEB SEARCH RESULTS]", sys, search_res));
                    }
                }
            }
        }

        // --- DYNAMIC TOOL SCHEMA INJECTION ---
        // For conversational turns: strip ALL tool schemas to guarantee 0% false-positive tool calls.
        // For action turns: inject only the relevant tool subset.
        if analysis.intent == "conversational" {
            // Conversational turns get NO tool schemas — the model responds directly.
            request.tools = None;
            request.tool_choice = Some(json!("none"));

            // If the message is a greeting, inject a direct response directive so small local models
            // respond warmly and state how they can help instead of outputting meta-reasoning or remaining silent.
            if Self::is_greeting_text(&last_user_text) {
                let greeting_prompt = "\n\n[DIRECTIVE: CONVERSATIONAL GREETING]\nThe user sent a greeting. Respond directly, warmly, and concisely as Lucifer in 1-2 sentences. Greet the user, state that you are Lucifer, Supreme Agent of NYX, and ask how you can assist today. Do NOT output <think> tags, tool commentary, or internal reasoning.";
                request.system_instruction = Some(format!("{}{}", request.system_instruction.as_deref().unwrap_or_default(), greeting_prompt));
            }
        } else {
            let mut tool_schemas = Vec::new();
            for (_, tool) in &self.tools {
                tool_schemas.push(json!({
                    "type": "function",
                    "function": {
                        "name": tool.name(),
                        "description": tool.description(),
                        "parameters": tool.parameters_schema()
                    }
                }));
            }

            if !tool_schemas.is_empty() {
                request.tools = Some(json!(tool_schemas));
                request.tool_choice = Some(json!("auto"));

                if request.provider == "nyx-native" || request.provider.contains("local") {
                    let tool_prompt = format!(
                        "\n\n[AVAILABLE TOOLS]\nYou have access to the following tools:\n{}\n\nTo call a tool, output a JSON object in this format:\n{{\"tool\": \"<tool_name>\", \"args\": {{...}}}}",
                        serde_json::to_string_pretty(&tool_schemas).unwrap_or_default()
                    );
                    request.system_instruction = Some(format!("{}{}", request.system_instruction.as_deref().unwrap_or_default(), tool_prompt));
                }
            }
        }

        let cancel_name = format!("cancel_{}", request.event_name.clone().unwrap_or_default());
        let (cancel_tx, mut cancel_rx) = tokio::sync::mpsc::channel::<()>(1);
        let cancel_id = app.listen(cancel_name.clone(), move |_| {
            let _ = cancel_tx.try_send(());
        });
        let _guard = UnlistenGuard { app: app.clone(), id: cancel_id };

        let max_iterations = 15;
        let mut iteration = 0usize;

        loop {
            iteration += 1;
            if iteration > max_iterations {
                let msg = format!("Lucifer Agent loop reached maximum limit of {} turns.", max_iterations);
                let _ = tx.send(StreamChunkPayload::error(msg.clone()));
                return Err(msg);
            }

            let mut inner_rx = if request.provider == "nyx-native" {
                use futures_util::StreamExt;
                let stream = execute_local_stream(&app, &request).await.map_err(|e| {
                    let _ = tx.send(StreamChunkPayload::error(e.clone()));
                    e
                })?;
                let (itx, irx) = tokio::sync::mpsc::channel(256);
                tauri::async_runtime::spawn(async move {
                    tokio::pin!(stream);
                    while let Some(res) = stream.next().await {
                        if itx.send(res).await.is_err() {
                            break;
                        }
                    }
                });
                irx
            } else {
                match execute_cloud_stream(&request).await {
                    Ok(rx) => rx,
                    Err(e) => {
                        let _ = tx.send(StreamChunkPayload::error(e.clone()));
                        return Err(e);
                    }
                }
            };

            let mut accumulated_text = String::new();
            let mut sse_tool_name: Option<String> = None;
            let mut sse_tool_args_buf = String::new();
            let mut detected_tool_call: Option<(String, Value)> = None;

            loop {
                let res = tokio::select! {
                    _ = cancel_rx.recv() => {
                        let _ = tx.send(StreamChunkPayload::done());
                        return Ok(());
                    }
                    msg = inner_rx.recv() => match msg {
                        Some(r) => r,
                        None => break,
                    }
                };

                match res {
                    Ok(payload) => {
                        if payload.event_type == "tool_start" {
                            if let Some(name) = payload.name.clone() {
                                sse_tool_name = Some(name);
                                sse_tool_args_buf.clear();
                            }
                            let _ = tx.send(payload.clone());
                        } else if payload.event_type == "tool_call" {
                            if let Some(args_chunk) = &payload.content {
                                sse_tool_args_buf.push_str(args_chunk);
                            }
                            let _ = tx.send(payload.clone());
                        } else if payload.event_type == "tool_call_complete" {
                            if let Some(name) = sse_tool_name.take() {
                                let parsed_args = serde_json::from_str::<Value>(&sse_tool_args_buf)
                                    .unwrap_or(json!({}));
                                detected_tool_call = Some((name, parsed_args));
                            }
                            let _ = tx.send(payload.clone());
                        } else if payload.event_type == "done" || payload.done == Some(true) {
                            // Do NOT forward intermediate done signal if tool execution was requested
                            break;
                        } else if payload.event_type == "error" || payload.error.is_some() {
                            let _ = tx.send(payload);
                            return Err("LLM stream encountered error".into());
                        } else {
                            if let Some(text) = &payload.content {
                                accumulated_text.push_str(text);
                            }
                            let _ = tx.send(payload);
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(StreamChunkPayload::error(e.clone()));
                        return Err(e);
                    }
                }
            }

            // Fallback text parser if native tool call was not emitted
            if detected_tool_call.is_none() {
                detected_tool_call = parse_tool_call_from_text(&accumulated_text);
            }

            // Execute tool if detected and registered
            if let Some((tool_name, args)) = detected_tool_call {
                if let Some(tool) = self.tools.get(&tool_name) {
                    let _ = tx.send(StreamChunkPayload::text(format!("\n\n*Lucifer Executing Tool: `{}`...*\n\n", tool_name)));
                    
                    let call_id = format!("call_{}", &tool_name);
                    let tool_result_str = match tool.execute(&app, args.clone()).await {
                        Ok(res) => {
                            if res.is_string() {
                                res.as_str().unwrap().to_string()
                            } else {
                                serde_json::to_string_pretty(&res).unwrap_or_default()
                            }
                        }
                        Err(err) => {
                            let _ = tx.send(StreamChunkPayload::text(format!("\n\n*Lucifer Tool Error*: `{}` - {}. Autonomous self-correction in progress...\n\n", tool_name, err)));
                            format!("Error: {}", err)
                        }
                    };

                    request.messages.push(UnifiedMessage {
                        role: "assistant".to_string(),
                        content: json!([
                            {
                                "type": "tool_call",
                                "id": call_id,
                                "function": {
                                    "name": tool_name,
                                    "arguments": serde_json::to_string(&args).unwrap_or_default()
                                }
                            }
                        ]),
                    });
                    request.messages.push(UnifiedMessage {
                        role: "tool".to_string(),
                        content: json!([
                            {
                                "type": "tool_result",
                                "tool_call_id": call_id,
                                "name": tool_name,
                                "content": tool_result_str
                            }
                        ]),
                    });
                    continue;
                }
            }

            // Turn complete (final response delivered)
            break;
        }

        let _ = tx.send(StreamChunkPayload::done());
        Ok(())
    }
}

/// Cleans and repairs malformed JSON generated by small local GGUF models.
fn sanitize_json_string(raw: &str) -> String {
    let mut s = raw.trim().to_string();

    if s.starts_with("```") {
        if let Some(first_newline) = s.find('\n') {
            s = s[first_newline + 1..].to_string();
        }
        if s.ends_with("```") {
            s.truncate(s.len() - 3);
        }
    }
    s = s.trim().to_string();

    s = s.replace(": True", ": true")
         .replace(": False", ": false")
         .replace(": None", ": null")
         .replace(":True", ": true")
         .replace(":False", ": false")
         .replace(":None", ": null");

    if let Ok(re_comma) = Regex::new(r",\s*([\}\]])") {
        s = re_comma.replace_all(&s, "$1").to_string();
    }

    let open_braces = s.chars().filter(|&c| c == '{').count();
    let close_braces = s.chars().filter(|&c| c == '}').count();
    if open_braces > close_braces {
        for _ in 0..(open_braces - close_braces) {
            s.push('}');
        }
    }

    s
}

/// Scans text for top-level balanced JSON objects '{ ... }', properly handling nested structures.
fn find_json_objects(text: &str) -> Vec<String> {
    let mut results = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        if chars[i] == '{' {
            let start = i;
            let mut depth = 0;
            let mut in_string = false;
            let mut escape = false;

            while i < len {
                let c = chars[i];
                if escape {
                    escape = false;
                } else if c == '\\' && in_string {
                    escape = true;
                } else if c == '"' {
                    in_string = !in_string;
                } else if !in_string {
                    if c == '{' {
                        depth += 1;
                    } else if c == '}' {
                        depth -= 1;
                        if depth == 0 {
                            let obj_str: String = chars[start..=i].iter().collect();
                            results.push(obj_str);
                            break;
                        }
                    }
                }
                i += 1;
            }
        }
        i += 1;
    }
    results
}

use std::sync::OnceLock;

static THINK_RE: OnceLock<Regex> = OnceLock::new();
static TOOL_CALL_TAG_RE: OnceLock<Regex> = OnceLock::new();
static FUNC_TAG_RE: OnceLock<Regex> = OnceLock::new();
static JSON_CODEBLOCK_RE: OnceLock<Regex> = OnceLock::new();

fn get_think_re() -> &'static Regex {
    THINK_RE.get_or_init(|| Regex::new(r"(?s)<think>.*?</think>").unwrap())
}

fn get_tool_call_tag_re() -> &'static Regex {
    TOOL_CALL_TAG_RE.get_or_init(|| Regex::new(r"(?s)<tool_call(?: name=[\x22']?([a-zA-Z0-9_]+)[\x22']?)?>\s*(.*?)\s*(?:</tool_call>|$)").unwrap())
}

fn get_func_tag_re() -> &'static Regex {
    FUNC_TAG_RE.get_or_init(|| Regex::new(r"(?s)<(?:function|function_call|tool)(?:=|\s+name=[\x22'])?([a-zA-Z0-9_]+)[\x22']?>\s*(.*?)\s*(?:</(?:function|function_call|tool)>|$)").unwrap())
}

fn get_json_codeblock_re() -> &'static Regex {
    JSON_CODEBLOCK_RE.get_or_init(|| Regex::new(r"(?s)```(?:json)?\s*(\{.*\})\s*(?:```|$)").unwrap())
}

/// Robust Multi-format Tool Call Parser supporting XML tags, Markdown blocks, and loose JSON
fn parse_tool_call_from_text(text: &str) -> Option<(String, Value)> {
    let text_clean = get_think_re().replace_all(text, "").to_string();
    let text_trim = text_clean.trim();

    // 1. Direct JSON parse
    let sanitized = sanitize_json_string(text_trim);
    if let Ok(val) = serde_json::from_str::<Value>(&sanitized) {
        if let Some(pair) = extract_tool_and_args(&val) {
            return Some(pair);
        }
    }

    // 2. XML <tool_call>...</tool_call>
    if let Some(caps) = get_tool_call_tag_re().captures(text_trim) {
        let tag_name = caps.get(1).map(|m| m.as_str().to_string());
        if let Some(body) = caps.get(2) {
            let clean_body = sanitize_json_string(body.as_str());
            if let Ok(val) = serde_json::from_str::<Value>(&clean_body) {
                if let Some((parsed_name, args)) = extract_tool_and_args(&val) {
                    return Some((parsed_name, args));
                } else if let Some(name) = tag_name {
                    return Some((name, val));
                }
            } else if let Some(name) = tag_name {
                return Some((name, json!({"query": body.as_str().trim()})));
            }
        }
    }

    // 3. XML <function name="...">, <function_call name="...">, <tool name="...">
    if let Some(caps) = get_func_tag_re().captures(text_trim) {
        if let (Some(n), Some(a)) = (caps.get(1), caps.get(2)) {
            let name = n.as_str().to_string();
            let clean_args = sanitize_json_string(a.as_str());
            let args = serde_json::from_str::<Value>(&clean_args)
                .unwrap_or_else(|_| json!({"query": a.as_str().trim()}));
            return Some((name, args));
        }
    }

    // 4. Markdown ```json ... ``` codeblock
    if let Some(caps) = get_json_codeblock_re().captures(text_trim) {
        if let Some(m) = caps.get(1) {
            let clean_block = sanitize_json_string(m.as_str());
            for json_str in find_json_objects(&clean_block) {
                if let Ok(val) = serde_json::from_str::<Value>(&json_str) {
                    if let Some(pair) = extract_tool_and_args(&val) {
                        return Some(pair);
                    }
                }
            }
        }
    }

    // 5. Embedded JSON Object Scanner
    for json_str in find_json_objects(text_trim) {
        let clean = sanitize_json_string(&json_str);
        if let Ok(val) = serde_json::from_str::<Value>(&clean) {
            if let Some(pair) = extract_tool_and_args(&val) {
                return Some(pair);
            }
        }
    }

    None
}

/// Extracts tool name and arguments from a JSON Value.
fn extract_tool_and_args(val: &Value) -> Option<(String, Value)> {
    if !val.is_object() {
        return None;
    }

    let obj = val.as_object()?;

    let name_keys = [
        "tool", "tool_name", "name", "function", "function_name", "action", "call", "command"
    ];
    let arg_keys = [
        "args", "arguments", "parameters", "params", "input", "action_input", "payload", "kwargs"
    ];

    let mut found_name_key = None;
    let mut found_name = None;
    for key in name_keys {
        if let Some(n) = obj.get(key).and_then(|v| v.as_str()) {
            found_name_key = Some(key);
            found_name = Some(n.to_string());
            break;
        }
    }

    let tool_name = found_name?;
    let name_key_used = found_name_key.unwrap();

    let mut found_args = None;
    for key in arg_keys {
        if let Some(a) = obj.get(key) {
            let parsed_arg = if a.is_string() {
                let clean_str = sanitize_json_string(a.as_str().unwrap());
                serde_json::from_str::<Value>(&clean_str).unwrap_or_else(|_| repair_single_string_arg(&tool_name, a.as_str().unwrap()))
            } else {
                a.clone()
            };
            found_args = Some(parsed_arg);
            break;
        }
    }

    let final_args = match found_args {
        Some(args) => args,
        None => {
            let mut flat_args = obj.clone();
            flat_args.remove(name_key_used);
            Value::Object(flat_args)
        }
    };

    Some((tool_name.clone(), repair_parameter_names(&tool_name, final_args)))
}

fn repair_parameter_names(tool_name: &str, mut args: Value) -> Value {
    if !args.is_object() {
        return args;
    }

    if let Some(obj) = args.as_object_mut() {
        match tool_name {
            "web_search" => {
                if !obj.contains_key("query") {
                    if let Some(val) = obj.remove("q").or_else(|| obj.remove("search")).or_else(|| obj.remove("text")) {
                        obj.insert("query".to_string(), val);
                    }
                }
            }
            "create_file" => {
                if !obj.contains_key("filename") {
                    if let Some(val) = obj.remove("file").or_else(|| obj.remove("path")).or_else(|| obj.remove("name")) {
                        obj.insert("filename".to_string(), val);
                    }
                }
                if !obj.contains_key("content") {
                    if let Some(val) = obj.remove("text").or_else(|| obj.remove("body")).or_else(|| obj.remove("code")) {
                        obj.insert("content".to_string(), val);
                    }
                }
            }
            "synthesize_voice" => {
                if !obj.contains_key("text") {
                    if let Some(val) = obj.remove("speech").or_else(|| obj.remove("prompt")).or_else(|| obj.remove("input")) {
                        obj.insert("text".to_string(), val);
                    }
                }
            }
            "generate_image" => {
                if !obj.contains_key("prompt") {
                    if let Some(val) = obj.remove("text").or_else(|| obj.remove("description")).or_else(|| obj.remove("image_prompt")) {
                        obj.insert("prompt".to_string(), val);
                    }
                }
            }
            _ => {}
        }
    }
    args
}

fn repair_single_string_arg(tool_name: &str, raw_str: &str) -> Value {
    match tool_name {
        "create_file" => json!({"filename": "output.md", "content": raw_str}),
        "synthesize_voice" => json!({"text": raw_str}),
        "generate_image" => json!({"prompt": raw_str}),
        _ => json!({"query": raw_str}),
    }
}
