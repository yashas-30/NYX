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

pub const LUCIFER_PERSONA: &str = r#"You are Lucifer, an autonomous AI companion and intelligent orchestrator running on the NYX platform.
You operate as an autonomous, hyper-intelligent orchestrator connected to local GGUF models, cloud LLMs, agentic vector RAG memory (TurboVec), live web search, image generation, and text-to-voice engines.

IMPORTANT IDENTITY DIRECTIVE:
- NYX is the name of the software application / desktop platform, NOT the user's name.
- NEVER address or call the user "NYX".
- Greet the user naturally (e.g. "Hello!", "Hi there!") without assuming their name is NYX.

Guidelines:
1. Always analyze user intent accurately (Search, RAG Memory, Image Gen, Voice, Code/File Creation, Model Hardware Analysis).
2. Communicate naturally, fluidly, and directly. Answer immediately — never narrate or announce what you are about to do.
3. When tool calls are required, output valid function calls.
4. When research or memory facts are retrieved, integrate them seamlessly using Markdown citations like [Source Title](URL) when source URLs are available.
5. Provide clear, accurate, and direct answers using Markdown formatting.
6. PERSON/ENTITY/GENERATED IMAGES: Whenever an image URL is provided in search results, [ENTITY IMAGE ATTACHMENT], or [GENERATED VISUAL ASSET ATTACHMENT], ALWAYS embed the image in your markdown response using: ![Title](URL) at the top of your response and warmly describe the visual asset.
7. CONVERSATIONAL CONTINUITY: Maintain complete context of conversation history. If the user provides a short response ("yes", "no", "do it", "that one", "correct", "sure", etc.) acknowledging your question or suggestion from the previous turn, IMMEDIATELY fulfill the pending task or answer. NEVER reset the conversation or output generic greetings when continuing an active conversation.

CRITICAL OUTPUT RULES — NEVER BREAK THESE:
- NEVER repeat or echo the user's message at the start of your response.
- NEVER start with "User:", "Human:", "Assistant:", "Lucifer:", or any role prefix.
- NEVER output meta-commentary, self-narration, or internal notes ("I need to...", "Let me...", "Based on...", "Following the instructions...", "Adhering to...").
- NEVER output raw search result formatting ([Source N], URL:, Snippet:, User question:).
- Your FIRST output token must be the actual answer content — never a preamble.
- NEVER output JSON, tool call syntax, or structured data unless the user explicitly requested it."#;


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
    pub refers_to_previous_response: Option<bool>,
    pub decontextualized_query: Option<String>,
}

pub struct LuciferOrchestrator {
    tools: HashMap<String, Arc<dyn Tool>>,
}

static SEARCH_INTENT_REGEX: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"(?i)^(?:/search|/web|search:|google:|lookup:|web:)\s*|\b(?:search\s+(?:the\s+)?web|search\s+online|google\s+for|search\s+for|look\s*up\s+online|browse\s+the\s+web)\b|\b(?:latest|current|today's|breaking|live|real-time|price|prices|cost|stock|stocks|crypto|weather|score|scores|winner|results|version|release|fixtures|standings)\b|\b(?:what\s+is\s+the\s+latest|what\s+happened\s+today|who\s+won|breaking\s+news|trending\s+now|who\s+is\s+(?:the\s+)?(?:current|sitting|present)?\s*(?:president|prime\s+minister|chancellor|ceo|governor|leader|king|queen|head\s+of\s+state))\b").unwrap()
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

/// Explicit image generation intent — matches natural and explicit image creation commands.
static IMAGE_INTENT_REGEX: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"(?i)^(?:/image|/img|image:|draw:|generate\s+image:|picture:)\s*|\b(?:generate|create|draw|paint|render|make|show\s+me|give\s+me|visualize)\s+(?:an?\s+)?(?:image|picture|photo|illustration|artwork|drawing|painting|banner|poster|logo|avatar)\b|\b(?:draw|paint|render|show|give)\s+me\b|\b(?:generate|create|make|show)\s+(?:a\s+)?picture\s+of\b|\bvisualize\s+").unwrap()
});

/// Explicit memory save/recall intent.
static MEMORY_INTENT_REGEX: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"(?i)^(?:/memory|/remember|remember:|memory:)\s*|\b(?:remember\s+that|remember\s+this|save\s+(?:this\s+)?to\s+(?:your\s+)?memory|store\s+this\s+fact|keep\s+in\s+mind\s+that|note\s+that\s+I\s+)\b|\b(?:what\s+do\s+you\s+remember\s+about|what\s+did\s+I\s+say\s+about|do\s+you\s+recall\s+(?:my|what|when)|search\s+(?:your\s+)?memory\s+for)\b").unwrap()
});

static CASUAL_IDENTITY_REGEX: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"(?i)^(who\s+are\s+you|what\s+can\s+you\s+do|tell\s+me\s+about\s+yourself|introduce\s+yourself|what\s+is\s+your\s+name|who\s+made\s+you|who\s+created\s+you|who\s+are\s+you\s+and\s+what\s+can\s+you\s+do)(?:[\s!.,?]+(?:lucifer|nyx))?[\s!.,?]*$").unwrap()
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

    /// Returns true when the CURRENT user message is a pure greeting or casual identity question that should never trigger tools.
    fn is_greeting_text(text: &str) -> bool {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return false;
        }
        if trimmed.len() <= 40 && GREETING_REGEX.is_match(trimmed) {
            return true;
        }
        if trimmed.len() <= 80 && CASUAL_IDENTITY_REGEX.is_match(trimmed) {
            return true;
        }
        false
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
            "say this:", "say:", "speak:", "read aloud:", "synthesize voice:",
            "synthesize audio:", "synthesize speech:", "generate audio for:",
            "text-to-speech:", "tts:", "say out loud", "read this aloud",
            "read that aloud", "read it aloud", "read this out loud",
            "read that out loud", "read it out loud", "synthesize voice for",
            "synthesize audio for", "synthesize speech for", "convert to speech",
            "speak this text"
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
                refers_to_previous_response: Some(false),
                decontextualized_query: Some(last_user_text),
            };
        }

        // Evaluate tool intent strictly on current message
        let current = last_user_text.to_lowercase();
        let requires_voice = VOICE_INTENT_REGEX.is_match(&current);
        let requires_image_gen = IMAGE_INTENT_REGEX.is_match(&current);
        let requires_memory = MEMORY_INTENT_REGEX.is_match(&current);

        // Web search: current-turn explicit patterns OR short continuation on a history search turn
        let requires_search = SEARCH_INTENT_REGEX.is_match(&current);

        // Capabilities request check — requires explicit model/hardware anchors
        let is_capabilities = current.contains("model capabilities") 
            || current.contains("model specs") 
            || current.contains("model specifications") 
            || current.contains("context window")
            || current.contains("context length")
            || current.contains("token limit");

        let intent = if is_capabilities {
            "model_capabilities"
        } else if requires_image_gen {
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

        // Context analysis and decontextualization
        let mut refers_to_previous_response = false;
        let decontextualized_query = last_user_text.clone();

        // Search backward from len - 2 to find the actual previous user message (skipping assistant/tool turns)
        let prev_user_text = if messages.len() >= 2 {
            messages.iter()
                .rev()
                .skip(1) // Skip current user message (last)
                .find(|m| m.role == "user")
                .map(|m| match &m.content {
                    Value::String(s) => s.clone(),
                    Value::Array(arr) => arr.iter()
                        .filter_map(|v| v.get("text").and_then(|t| t.as_str()))
                        .collect::<Vec<_>>().join(" "),
                    _ => String::new(),
                })
        } else {
            None
        };

        if let Some(_prev_text) = prev_user_text {
            let current_lower = last_user_text.to_lowercase();
            let refers_to_prev_pattern = [
                "why did you say that", "explain the previous", "expand on that",
                "what was the second", "what was the first", "can you explain why",
                "why?", "are you sure", "that's wrong", "what did you mean",
                "tell me more about that", "expand on the last", "explain the last",
                "can you elaborate", "tell me more"
            ];
            if refers_to_prev_pattern.iter().any(|&phrase| current_lower.contains(phrase)) || current_lower == "why" || current_lower == "why?" {
                refers_to_previous_response = true;
            }
        }

        LuciferAnalysis {
            intent: intent.to_string(),
            requires_search,
            requires_memory,
            requires_image_gen,
            requires_voice,
            is_local_model,
            confidence: if is_capabilities { 0.98 } else { 0.95 },
            refers_to_previous_response: Some(refers_to_previous_response),
            decontextualized_query: Some(decontextualized_query),
        }
    }

    pub fn clean_search_query(raw_query: &str) -> String {
        let mut clean = raw_query.to_string();
        let preambles = [
            "please search the web for the following specific information and respond in a clear, concise format:",
            "please search the web for the following specific information:",
            "please search the web for:",
            "please search the web for",
            "search the web for",
            "task: find the exact",
            "task: find the",
            "task: find",
            "task:",
        ];
        let mut lowered = clean.to_lowercase();
        for p in preambles {
            if let Some(idx) = lowered.find(p) {
                clean = clean[idx + p.len()..].trim().to_string();
                lowered = clean.to_lowercase();
            }
        }
        if let Some(req_idx) = lowered.find("output requirements:") {
            clean = clean[..req_idx].trim().to_string();
        }
        if clean.trim().len() >= 4 { clean } else { raw_query.to_string() }
    }

    pub async fn run_turn(
        &self,
        app: AppHandle,
        mut request: UnifiedRequest,
        tx: tauri::ipc::Channel<StreamChunkPayload>,
    ) -> Result<(), String> {
        let turn_start = std::time::Instant::now();
        // --- MODEL-AWARE PERSONA INJECTION ---
        // --- MODEL-AWARE PERSONA & CAPABILITY INJECTION ---
        let caps = request.capabilities.clone().unwrap_or_default();
        let is_text_only = !caps.vision && !caps.audio;
        let vision_str = if caps.vision { "Supported (Multi-Modal Vision Model)" } else { "NOT SUPPORTED (Text-Only Model - Cannot view or analyze images)" };
        let audio_str = if caps.audio { "Supported" } else { "NOT SUPPORTED (Text-Only Model)" };
        let voice_str = if caps.voice { "Supported" } else { "NOT SUPPORTED (Text Generation Only)" };
        let tool_str = if caps.tool_calling { "Native Tool Calling Supported" } else { "Text-JSON Tool Fallback Enabled" };

        let capability_context = format!(
            "CURRENT ENGINE CONTEXT:\n- Active Model: {}\n- Provider: {}\n- Vision Capabilities: {}\n- Audio Capabilities: {}\n- Voice Capabilities: {}\n- Tool Calling Mode: {}\n- Modality Class: {}\n\nCRITICAL MODEL BOUNDARY DIRECTIVE:\n1. You are running on the model specified above. You MUST be 100% truthful about your current model capabilities.\n2. If the active model is Text-Only ({}), explicitly inform the user that your current model cannot see or process images if asked to analyze images.\n3. Do not pretend to have vision or native multimodal capabilities if your active model does not support them.",
            request.model_id,
            request.provider,
            vision_str,
            audio_str,
            voice_str,
            tool_str,
            if is_text_only { "Text-Only LLM" } else { "Multimodal Model" },
            if is_text_only { "Text-Only Model" } else { "Multimodal Model" }
        );

        let base_sys = request.system_instruction.clone().unwrap_or_default();
        let sys_prompt = if base_sys.is_empty() {
            LUCIFER_PERSONA.to_string()
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

        let mut search_already_performed = false;

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

            // --- AGENTIC ORCHESTRATION PIPELINE ---
            // LuciferAgent acts as the autonomous executive agent:
            // Stage 1: Intent Analysis & Task Planning
            // Stage 2: Memory RAG & Live Tool Pre-Fetch
            // Stage 3: Multi-Turn Execution & Self-Correction
            // Stage 4: High-Agency Answer Synthesis
            let is_casual = Self::is_greeting_text(&last_user_text) || analysis.intent == "conversational";

            // Emit Agentic Execution Plan metadata payload to UI for complex non-casual tasks
            if !is_casual {
                let plan_summary = match analysis.intent.as_str() {
                    "web_search" => "Agentic Plan: 1. Evaluate Query -> 2. Live Web Search Pre-fetch -> 3. Ground Historical Facts -> 4. Direct Response Synthesis",
                    "code_engineering" => "Agentic Plan: 1. Parse Code Requirements -> 2. Inspect Target State -> 3. Synthesize Production-Ready Implementation",
                    "memory_rag" => "Agentic Plan: 1. Embed Input Vector -> 2. Query SQLite & TurboVec Memory -> 3. Contextual Answer Synthesis",
                    _ => "Agentic Plan: 1. Analyze Task Requirements -> 2. Execute Required Tools -> 3. Synthesize Verified Response",
                };
                let _ = tx.send(StreamChunkPayload {
                    event_type: "agent_plan".to_string(),
                    content: Some(plan_summary.to_string()),
                    done: Some(false),
                    error: None,
                    tool_call: None,
                    name: Some("LuciferAgent".to_string()),
                    result: None,
                    metadata: Some(json!({ "intent": analysis.intent, "requires_search": analysis.requires_search })),
                });
            }

            // Automatic Fast Vector RAG Memory Retrieval (TurboVec / SQLite Memory)
            // ONLY execute when the prompt is NOT a greeting/conversational message AND has substantive length (>15 chars)
            if !is_casual && last_user_text.trim().len() > 15 {
                let pool = app.state::<sqlx::SqlitePool>();
                let query_vector = match crate::rag::embeddings::Embedder::new() {
                    Ok(embedder) => embedder.embed(vec![last_user_text.clone()]).await.ok().and_then(|mut v| v.pop()),
                    Err(_) => None,
                };
                let mut collected_facts: Vec<String> = Vec::new();

                // 1. Fetch from SQLite memory store
                if let Ok(memories) = crate::commands::db::db_search_memories(pool, Some(last_user_text.clone()), query_vector, Some(3)).await {
                    for m in memories {
                        let fact = m.fact.trim().to_string();
                        if !fact.is_empty() && !collected_facts.contains(&fact) {
                            collected_facts.push(fact);
                        }
                    }
                }

                // 2. Fetch from TurboVec (LanceDB) store if available
                if let Some(tv_store) = app.try_state::<std::sync::Arc<crate::rag::turbovec_store::TurbovecStore>>() {
                    let tv_results = tv_store.search_memory(&last_user_text, 3).await;
                    for (_id, text) in tv_results {
                        let fact = text.trim().to_string();
                        if !fact.is_empty() && !collected_facts.contains(&fact) {
                            collected_facts.push(fact);
                        }
                    }
                }

                if !collected_facts.is_empty() {
                    let memory_block = collected_facts.iter()
                        .map(|f| format!("- {}", f))
                        .collect::<Vec<_>>()
                        .join("\n");
                    let sys = request.system_instruction.take().unwrap_or_default();
                    request.system_instruction = Some(format!("{}\n\n[RELEVANT MEMORIES / FACTS FROM VECTOR STORE]\n{}", sys, memory_block));
                }
            }

            // Automatic Fast Web Search Pre-Fetch
            // ONLY fires when: (a) web search is explicitly enabled by the user via the toggle,
            // (b) the current turn is not casual, (c) intent analysis detected a search requirement,
            // (d) search results are not already embedded in the message.
            let user_explicitly_enabled_search = request.web_search_enabled;
            if !is_casual 
                && user_explicitly_enabled_search
                && analysis.requires_search
                && !last_user_text.contains("[LIVE WEB SEARCH RESULTS") 
                && !last_user_text.contains("[SEARCH RESULTS]") 
            {
                let state = app.state::<crate::AppState>();
                let search_provider = state.search_provider.read().await.clone();
                let search_api_key = state.search_api_key.read().await.clone();
                let api_key_opt = if search_api_key.trim().is_empty() { None } else { Some(search_api_key) };

                let raw_q = analysis.decontextualized_query.clone().unwrap_or_else(|| last_user_text.clone());
                let search_query = Self::clean_search_query(&raw_q);
                let prefetch_call_id = format!("call_web_search_prefetch_{}", chrono::Utc::now().timestamp_millis());

                // 1. Emit UI tool_start event so tool pill appears in UI immediately
                let _ = tx.send(StreamChunkPayload {
                    event_type: "tool_start".to_string(),
                    content: None,
                    done: Some(false),
                    error: None,
                    tool_call: Some(json!({
                        "id": prefetch_call_id.clone(),
                        "type": "function",
                        "function": { "name": "web_search", "arguments": json!({"query": search_query}).to_string() }
                    })),
                    name: Some("web_search".to_string()),
                    result: None,
                    metadata: None,
                });

                if let Ok(search_res) = crate::commands::agent::search_web_command(search_query.clone(), Some(5), Some(search_provider.clone()), api_key_opt).await {
                    if !search_res.trim().is_empty() && !search_res.contains("No web search results found") && search_res.len() > 60 {
                        let sys = request.system_instruction.take().unwrap_or_default();
                        let search_block = format!(
                            "\n\n[LIVE WEB SEARCH RESULTS]\n{}\n\nAnswer directly from these search results using markdown citations [Title](URL) with full dates. Integrate naturally — no raw source dumps.",
                            search_res
                        );
                        request.system_instruction = Some(format!("{}\n\n{}", sys, search_block));
                        search_already_performed = true;

                        // 2. Emit UI tool_result event so UI tool pill flips to SUCCESS immediately
                        let _ = tx.send(StreamChunkPayload {
                            event_type: "tool_result".to_string(),
                            content: Some(search_res.clone()),
                            done: Some(false),
                            error: None,
                            tool_call: Some(json!({"id": prefetch_call_id})),
                            name: Some("web_search".to_string()),
                            result: Some(json!(search_res)),
                            metadata: None,
                        });
                    } else {
                        // Search returned no useful results — emit empty tool result
                        let _ = tx.send(StreamChunkPayload {
                            event_type: "tool_result".to_string(),
                            content: Some("No results found.".to_string()),
                            done: Some(false),
                            error: None,
                            tool_call: Some(json!({"id": prefetch_call_id})),
                            name: Some("web_search".to_string()),
                            result: Some(json!("No results found.")),
                            metadata: None,
                        });
                    }
                }
            }
        }

        // --- CODE ENGINEERING INTENT DIRECTIVE ---
        // Handle code engineering directly under Lucifer persona
        if analysis.intent == "code_engineering" {
            let code_directive = "\n\n[DIRECTIVE: LUCIFER CODE ENGINEERING MODE]\nYou are Lucifer executing a code engineering task. Use available tools as needed. Provide clean, efficient, production-ready code with concise explanations.";
            request.system_instruction = Some(format!("{}{}", request.system_instruction.as_deref().unwrap_or_default(), code_directive));
        }

        // --- DYNAMIC TOOL SCHEMA INJECTION ---
        // ONLY inject tools if the turn is NOT a pure greeting / casual conversational message AND requires action.
        let is_pure_greeting = Self::is_greeting_text(&last_user_text);
        let is_greeting_or_casual = is_pure_greeting || (analysis.intent == "conversational" && !analysis.requires_search && !analysis.requires_memory && !analysis.requires_image_gen && !analysis.requires_voice);

        if is_greeting_or_casual {
            // Greetings: no tools, short warm response
            request.tools = None;
            request.tool_choice = None;
            let sys_curr = request.system_instruction.take().unwrap_or_default();
            let greeting_directive = "\n\n[DIRECTIVE: CASUAL CONVERSATION & GREETING]\nThe user sent a casual greeting or conversational remark. Respond warmly, naturally, and directly in 1-2 short sentences as Lucifer. NEVER output lists, definitions, or multi-paragraph responses for greetings.";
            request.system_instruction = Some(format!("{}{}", sys_curr, greeting_directive));
        } else {
            // Non-casual turns: always inject the full tool schema set so the model can call any tool
            // EXCEPT web_search when it was already pre-fetched (prevents double-search loop).
            let mut tool_schemas = Vec::new();

            for (tool_name, tool) in &self.tools {
                // Skip web_search tool schema injection when pre-fetch already retrieved results;
                // the model already has the data and adding the tool schema would cause it to call
                // web_search again instead of synthesizing the response immediately.
                if search_already_performed && tool_name == "web_search" {
                    continue;
                }
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
            } else {
                request.tools = None;
                request.tool_choice = None;
            }

            // After search pre-fetch: add a synthesis directive so local GGUF models
            // understand they should answer directly from the provided data.
            if search_already_performed {
                let sys_curr = request.system_instruction.take().unwrap_or_default();
                let synth_directive = "\n\n[DIRECTIVE: ANSWER FROM SEARCH RESULTS]\nSearch results have already been retrieved and are embedded above. Do NOT call web_search again. Answer the user's question directly right now, integrating citations naturally.";
                request.system_instruction = Some(format!("{}{}", sys_curr, synth_directive));
            }
        }


        let cancel_name = format!("cancel_{}", request.event_name.clone().unwrap_or_default());
        let (cancel_tx, mut cancel_rx) = tokio::sync::mpsc::channel::<()>(1);
        let cancel_id = app.listen(cancel_name.clone(), move |_| {
            let _ = cancel_tx.try_send(());
        });
        let _guard = UnlistenGuard { app: app.clone(), id: cancel_id };

        let max_iterations = 5;
        let mut iteration = 0usize;
        let mut executed_tools = std::collections::HashSet::<String>::new();

        loop {
            iteration += 1;
            if iteration > max_iterations {
                request.tools = None;
                request.tool_choice = None;
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
            let mut stream_buffer = String::new();
            let mut initial_prefix_checked = false;
            let user_prompt_clean = last_user_text.trim();

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
                            break;
                        } else if payload.event_type == "error" || payload.error.is_some() {
                            let _ = tx.send(payload);
                            return Err("LLM stream encountered error".into());
                        } else {
                            if let Some(text) = &payload.content {
                                accumulated_text.push_str(text);

                                if !initial_prefix_checked {
                                    stream_buffer.push_str(text);
                                    // Wait for a paragraph break (double newline) before checking the buffer.
                                    // This is crucial: models like Gemma 3 output their reasoning as plain
                                    // text BEFORE the actual answer, separated by a blank line (\n\n).
                                    // Flushing at the first newline would still send "1" (the next thinking
                                    // line) to the UI. We wait for \n\n or 512 chars as a safety cap.
                                    let has_paragraph_break = stream_buffer.contains("\n\n");
                                    let has_newline = stream_buffer.contains('\n');
                                    if !has_paragraph_break && !has_newline && stream_buffer.len() < 32 {
                                        continue;
                                    }

                                    let mut clean_buf = stream_buffer.trim_start().to_string();

                                    // Strip role prefix echoes: "User: ...", "Human: ...", "Assistant: ..."
                                    let role_prefixes = ["User:", "User :", "Human:", "Human :", "Assistant:", "Lucifer:"];
                                    for prefix in &role_prefixes {
                                        if clean_buf.starts_with(prefix) {
                                            if let Some(colon_idx) = clean_buf.find(':') {
                                                clean_buf = clean_buf[colon_idx + 1..].trim_start().to_string();
                                            }
                                            break;
                                        }
                                    }

                                    // Strip direct prompt echo: model repeats back the exact user message
                                    if !user_prompt_clean.is_empty() {
                                        let clean_lower = clean_buf.to_lowercase();
                                        let prompt_lower = user_prompt_clean.to_lowercase();
                                        if clean_lower.starts_with(&prompt_lower) {
                                            clean_buf = clean_buf[user_prompt_clean.len()..].trim_start().to_string();
                                        }
                                    }

                                    // Strip ALL meta-reflection lines from the top of the buffer.
                                    // This handles multi-line preambles like:
                                    //   "a thinking process to construct the detailed response:\n1\n\n"
                                    clean_buf = strip_meta_reflection_prefix(&clean_buf);

                                    // If the cleaned buffer is just a lone number or single punctuation,
                                    // it's likely a leftover thinking artifact — suppress it.
                                    let trimmed_check = clean_buf.trim();
                                    let is_thinking_artifact = trimmed_check.len() <= 3
                                        && trimmed_check.chars().all(|c| c.is_ascii_digit() || c == '.' || c == ')');
                                    if is_thinking_artifact {
                                        clean_buf = String::new();
                                    }

                                    initial_prefix_checked = true;
                                    if !clean_buf.is_empty() {
                                        let _ = tx.send(StreamChunkPayload::text(clean_buf));
                                    }
                                    continue;
                                }

                                let trimmed = text.trim();
                                if trimmed.starts_with("User:")
                                    || trimmed.starts_with("User :")
                                    || trimmed.starts_with("Human:")
                                    || trimmed.starts_with("[Source ")
                                    || trimmed.starts_with("URL: ")
                                    || trimmed.starts_with("Snippet: ")
                                    || trimmed.starts_with("User question:")
                                    || trimmed.starts_with("INSTRUCTION:")
                                    || trimmed.contains("AGENTIC DEEP RESEARCH CONSOLIDATED CONTEXT")
                                    || trimmed.contains("Reflection Hops:")
                                    || trimmed.contains("Total Web Sources Scraped:")
                                {
                                    continue;
                                }
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

            // Ensure any un-flushed stream buffer is transmitted before post-processing
            if !initial_prefix_checked && !stream_buffer.is_empty() {
                let mut clean_buf = stream_buffer.trim_start().to_string();
                let role_prefixes = ["User:", "User :", "Human:", "Human :", "Assistant:", "Lucifer:"];
                for prefix in &role_prefixes {
                    if clean_buf.starts_with(prefix) {
                        if let Some(colon_idx) = clean_buf.find(':') {
                            clean_buf = clean_buf[colon_idx + 1..].trim_start().to_string();
                        }
                        break;
                    }
                }
                clean_buf = strip_meta_reflection_prefix(&clean_buf);
                let trimmed_check = clean_buf.trim();
                let is_thinking_artifact = trimmed_check.len() <= 3
                    && trimmed_check.chars().all(|c| c.is_ascii_digit() || c == '.' || c == ')');
                if !is_thinking_artifact && !clean_buf.is_empty() {
                    let _ = tx.send(StreamChunkPayload::text(clean_buf));
                }
            }

            // Fallback text parser if native tool call was not emitted
            let clean_accumulated = strip_meta_reflection_prefix(&accumulated_text);
            if detected_tool_call.is_none() {
                detected_tool_call = parse_tool_call_from_text(&clean_accumulated);
            }


            // Execute tool if detected and registered
            if let Some((tool_name, args)) = detected_tool_call {
                if !executed_tools.insert(tool_name.clone()) {
                    // Tool has already been executed in a previous iteration
                    // Disable tools and instruct model to synthesize final response now
                    request.tools = None;
                    request.tool_choice = None;
                    let sys_curr = request.system_instruction.take().unwrap_or_default();
                    request.system_instruction = Some(format!(
                        "{}\n\n[DIRECTIVE: SYNTHESIZE FINAL RESPONSE NOW]\nYou have already executed tool '{}' and retrieved all data. Do NOT output tool calls or JSON. Directly answer the user's question now using the retrieved facts.",
                        sys_curr, tool_name
                    ));
                    iteration += 1;
                    continue;
                }

                // Validate tool call via SafetyGuard
                if let Err(violation) = crate::orchestrator::safety_guard::SafetyGuard::validate_tool_call(&tool_name, &args) {
                    tracing::warn!("[Lucifer Orchestrator] SafetyGuard blocked tool '{}': {}", tool_name, violation);
                    let _ = tx.send(StreamChunkPayload::text(format!("\n\n*Lucifer Tool Blocked*: `{}` - {}\n\n", tool_name, violation)));
                    
                    let call_id = format!("call_{}", &tool_name);
                    let _ = tx.send(StreamChunkPayload {
                        event_type: "tool_result".to_string(),
                        content: Some(violation.clone()),
                        done: Some(false),
                        error: None,
                        tool_call: Some(json!({"id": call_id})),
                        name: Some(tool_name.clone()),
                        result: Some(json!(violation)),
                        metadata: None,
                    });

                    request.messages.push(UnifiedMessage {
                        role: "assistant".to_string(),
                        content: json!([
                            {
                                "type": "tool_use",
                                "id": call_id,
                                "name": tool_name,
                                "input": args
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
                                "content": violation
                            }
                        ]),
                    });
                    continue;
                }

                if let Some(tool) = self.tools.get(&tool_name) {
                    let call_id = format!("call_{}_{}", &tool_name, iteration);
                    let _ = tx.send(StreamChunkPayload {
                        event_type: "tool_start".to_string(),
                        content: None,
                        done: Some(false),
                        error: None,
                        tool_call: Some(json!({"id": call_id, "type": "function", "function": {"name": tool_name, "arguments": args.to_string()}})),
                        name: Some(tool_name.clone()),
                        result: None,
                        metadata: None,
                    });

                    let thinking_msg = format!("> 🛠️ **Executing Lucifer Tool (`{}`)**...\n\n", tool_name);
                    let _ = tx.send(StreamChunkPayload::thinking(thinking_msg));
                    
                    let tool_result_res = tool.execute(&app, args.clone()).await;
                    let tool_result_str = match tool_result_res {
                        Ok(val) => {
                            if val.is_string() {
                                val.as_str().unwrap().to_string()
                            } else {
                                serde_json::to_string_pretty(&val).unwrap_or_default()
                            }
                        }
                        Err(err) => format!("Error: {}", err),
                    };

                    let _ = tx.send(StreamChunkPayload {
                        event_type: "tool_result".to_string(),
                        content: Some(tool_result_str.clone()),
                        done: Some(false),
                        error: None,
                        tool_call: Some(json!({"id": call_id})),
                        name: Some(tool_name.clone()),
                        result: Some(json!(tool_result_str.clone())),
                        metadata: None,
                    });

                    // Inject tool result into system prompt for 100% guaranteed context access
                    let sys_curr = request.system_instruction.take().unwrap_or_default();
                    let tool_context_block = format!(
                        "\n\n[LIVE RETRIEVED TOOL DATA — {}]\n{}\n[/LIVE RETRIEVED TOOL DATA]",
                        tool_name,
                        tool_result_str
                    );
                    request.system_instruction = Some(format!("{}{}", sys_curr, tool_context_block));

                    // Disable tool schemas so subsequent iteration MUST synthesize final response text
                    request.tools = None;
                    request.tool_choice = None;

                    request.messages.push(UnifiedMessage {
                        role: "assistant".to_string(),
                        content: json!([
                            {
                                "type": "tool_use",
                                "id": call_id,
                                "name": tool_name,
                                "input": args
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
                    iteration += 1;
                    continue;
                }
            }

            // Fallback Text Synthesis Guarantee:
            // If the loop ended without accumulating any text response, force a final direct text pass with tools disabled.
            if accumulated_text.trim().is_empty() {
                request.tools = None;
                request.tool_choice = None;
                let sys_curr = request.system_instruction.take().unwrap_or_default();
                request.system_instruction = Some(format!(
                    "{}\n\n[DIRECTIVE: FINAL ANSWER GENERATION]\nDirectly answer the user's question now based on the conversation history and retrieved tool data above.",
                    sys_curr
                ));
                if request.provider == "nyx-native" {
                    use futures_util::StreamExt;
                    if let Ok(mut stream) = execute_local_stream(&app, &request).await {
                        while let Some(res) = stream.next().await {
                            if let Ok(payload) = res {
                                if let Some(text) = &payload.content {
                                    accumulated_text.push_str(text);
                                }
                                let _ = tx.send(payload);
                            }
                        }
                    }
                } else {
                    if let Ok(mut rx) = execute_cloud_stream(&request).await {
                        while let Some(res) = rx.recv().await {
                            if let Ok(payload) = res {
                                if let Some(text) = &payload.content {
                                    accumulated_text.push_str(text);
                                }
                                let _ = tx.send(payload);
                            }
                        }
                    }
                }
            }

            // Turn complete (final response delivered)
            // Check system instructions and all message history (including search tool results) for entity images
            let mut found_entity_image: Option<(String, String)> = None;

            let search_sources = std::iter::once(request.system_instruction.as_deref().unwrap_or(""))
                .chain(request.messages.iter().map(|m| m.content.as_str().unwrap_or("")));

            for source_text in search_sources {
                if let Some(img_idx) = source_text.find("[ENTITY IMAGE ATTACHMENT]") {
                    let attachment_sub = &source_text[img_idx..];
                    if let (Some(url_start), Some(cap_start)) = (attachment_sub.find("Image URL: "), attachment_sub.find("Caption: ")) {
                        let url_sub = &attachment_sub[url_start + 11..];
                        let img_url = url_sub.lines().next().unwrap_or("").trim().to_string();
                        let cap_sub = &attachment_sub[cap_start + 9..];
                        let img_title = cap_sub.lines().next().unwrap_or("").trim().to_string();

                        if !img_url.is_empty() {
                            found_entity_image = Some((img_url, img_title));
                            break;
                        }
                    }
                }
            }

            if let Some((img_url, img_title)) = found_entity_image {
                if !accumulated_text.contains(&img_url) {
                    let auto_img_markdown = format!("![{}]({})\n\n", if img_title.is_empty() { "Entity Image" } else { &img_title }, img_url);
                    accumulated_text.insert_str(0, &auto_img_markdown);
                    let _ = tx.send(StreamChunkPayload::text(auto_img_markdown));
                }
            }


            let cleaned_accumulated = strip_raw_source_dumps(&accumulated_text);
            if !cleaned_accumulated.trim().is_empty() {
                request.messages.push(UnifiedMessage {
                    role: "assistant".to_string(),
                    content: json!(cleaned_accumulated),
                });
            }
            break;
        }


        // --- RECORD LLM OBSERVABILITY TRACE TO SQLITE DB ---
        let pool = app.state::<sqlx::SqlitePool>();

        let prompt_tokens = (request.system_instruction.as_deref().unwrap_or("").len() / 4) as i64;
        let completion_tokens = (request.messages.last().map(|m| format!("{:?}", m.content).len()).unwrap_or(0) / 4) as i64;
        let actual_latency_ms = turn_start.elapsed().as_millis() as i64;
        crate::db::traces::record_trace(pool.inner().clone(), crate::db::traces::TraceInput {
            session_id: request.event_name.clone(),
            provider: request.provider.clone(),
            model: request.model_id.clone(),
            prompt_tokens,
            completion_tokens,
            latency_ms: actual_latency_ms,
            cached: false,
            error: None,
            agent_node_id: Some("lucifer".to_string()),
        });

        let _ = tx.send(StreamChunkPayload::done());

        Ok(())
    }
}

/// Strips raw search prompt dumps ([Source N], - https://..., User question: ...) emitted by small local models.
fn strip_raw_source_dumps(text: &str) -> String {
    let mut lines = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("[Source ")
            || trimmed.starts_with("URL: ")
            || trimmed.starts_with("Snippet: ")
            || (trimmed.starts_with("- http://") || trimmed.starts_with("- https://"))
            || trimmed.starts_with("User question:")
            || trimmed.starts_with("INSTRUCTION:")
            || trimmed.starts_with("[/WEB SEARCH")
            || trimmed.starts_with("[WEB SEARCH")
        {
            continue;
        }

        lines.push(line);
    }
    lines.join("\n").trim().to_string()
}

/// Strips internal monologue preambles (e.g., "I need to answer directly...", "Adhering to strict...")
/// emitted by small GGUF local models before sending final text to the user interface.
fn strip_meta_reflection_prefix(text: &str) -> String {
    // These are lines that models output as self-narration before the actual answer.
    // We strip them entirely, looping until no more meta lines remain at the top.
    let meta_prefixes: &[&str] = &[
        // Instruction-following narration
        "i need to answer directly based on",
        "i need to answer directly",
        "i need to answer",
        "adhering to strict",
        "adhering to the strict",
        "based on the provided facts",
        "i will answer directly",
        "following the instructions",
        "following the given instructions",
        "following the prompt",
        "based on the user's request",
        "based on the request",
        "as instructed",
        // Thinking preamble patterns (Gemma 3, Phi-4, Mistral Small)
        "a thinking process to construct",
        "a structured thinking process",
        "thinking process:",
        "my thinking process",
        "let me think through",
        "let me think step by step",
        "let me reason through",
        "let me work through",
        "let me construct",
        "let me analyze",
        "let me break down",
        "let me outline",
        "let me craft",
        // Meta-commentary about the user's question
        "the user is asking",
        "the user wants",
        "the user asked",
        "the user has asked",
        "user is asking",
        "the question is",
        "this is a request",
        "i see the user",
    ];

    let mut result = text.trim_start().to_string();

    // Loop: strip one meta line at a time until the text starts with real content.
    // This handles models that output 2-3 consecutive meta-commentary lines before answering.
    let mut changed = true;
    while changed {
        changed = false;
        let trimmed = result.trim_start().to_string();
        let lower = trimmed.to_lowercase();
        for prefix in meta_prefixes {
            if lower.starts_with(prefix) {
                // Find end of this meta line
                if let Some(newline_pos) = trimmed.find('\n') {
                    result = trimmed[newline_pos + 1..].trim_start().to_string();
                } else {
                    // Entire remaining text is a meta line with no newline.
                    // Don't blank it completely — return original to avoid losing content.
                    return text.to_string();
                }
                changed = true;
                break;
            }
        }
    }

    if result.trim().is_empty() {
        text.to_string()
    } else {
        result
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
pub fn parse_tool_call_from_text(text: &str) -> Option<(String, Value)> {
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
