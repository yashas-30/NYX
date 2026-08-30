// ─────────────────────────────────────────────────────────────────────────────
// NYX — Dynamic Intent Classifier & Task Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::llm::{execute_any_stream, UnifiedRequest, UnifiedMessage};
use crate::llm::gateway::{DynamicModelRegistry, LiveQuotaLedger, ModelRole};
use tauri::AppHandle;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PrimaryIntent {
    DirectChat,
    AutonomousCoding,
    DeepResearch,
    SlidevPresentation,
    DiagramGeneration,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaDecision {
    pub include_images: bool,
    #[serde(default)]
    pub image_search_queries: Vec<String>,
    pub include_youtube: bool,
    #[serde(default)]
    pub youtube_search_queries: Vec<String>,
    #[serde(default)]
    pub media_relevance_rationale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteDecision {
    pub intent: PrimaryIntent,
    pub needs_web_search: bool,
    pub search_depth: u8, // 0 = none, 1 = quick factual, 2 = multi-step deep research
    pub media_requirements: MediaDecision,
    pub target_diagram_format: Option<String>, // "mermaid", "d2", etc.
    pub extracted_core_query: String,
}

impl Default for RouteDecision {
    fn default() -> Self {
        Self {
            intent: PrimaryIntent::DirectChat,
            needs_web_search: false,
            search_depth: 0,
            media_requirements: MediaDecision {
                include_images: false,
                image_search_queries: vec![],
                include_youtube: false,
                youtube_search_queries: vec![],
                media_relevance_rationale: "Default chat routing".to_string(),
            },
            target_diagram_format: None,
            extracted_core_query: String::new(),
        }
    }
}

/// Classifies user intent dynamically using the healthiest model assigned to FastIntentClassifier
pub async fn classify_intent_dynamically(
    app: &AppHandle,
    user_prompt: &str,
    registry: &DynamicModelRegistry,
    ledger: &LiveQuotaLedger,
    api_key_override: Option<&str>,
) -> Result<RouteDecision, String> {
    let model_spec = registry.select_model_for_role(ModelRole::FastIntentClassifier, ledger).await?;

    let system_prompt = r#"You are an ultra-fast, grammar-aware intent router.
Analyze the user request and output ONLY valid JSON matching this exact schema:
{
  "intent": "DirectChat" | "AutonomousCoding" | "DeepResearch" | "SlidevPresentation" | "DiagramGeneration",
  "needs_web_search": boolean,
  "search_depth": 0 | 1 | 2,
  "media_requirements": {
    "include_images": boolean,
    "image_search_queries": ["query"],
    "include_youtube": boolean,
    "youtube_search_queries": ["query"],
    "media_relevance_rationale": "reason"
  },
  "target_diagram_format": null | "html_svg" | "architecture" | "flowchart" | "sequence" | "state_machine" | "er_data_model" | "sankey" | "wardley_map" | "loop_flywheel" | "medallion" | "data_flow" | "user_journey" | "deployment" | "db_schema" | "kanban" | "radar" | "polar_chart" | "gantt" | "treemap",
  "extracted_core_query": "clean search phrase"
}

STRICT GATING RULES:
- If the user asks to edit, refactor, write, debug, create, or delete code files, set intent to "AutonomousCoding".
- If the user asks for a presentation, slides, slide deck, or pitch deck, set intent to "SlidevPresentation".
- If the user asks for a diagram, flowchart, sequence map, Sankey, flywheel, Wardley map, or architecture visual, set intent to "DiagramGeneration".
- If the user asks for deep research, comprehensive whitepaper, or multi-angle study, set intent to "DeepResearch".
- Images are allowed ONLY for physical appearance, UI layout, or geography. BANNED for code/math.
- YouTube is allowed ONLY for tutorials, how-to, or walkthroughs.
Output NO extra text or markdown formatting."#;

    let api_key = api_key_override
        .map(|s| s.to_string())
        .unwrap_or_else(|| std::env::var(format!("{}_API_KEY", model_spec.provider.to_uppercase())).unwrap_or_default());

    let req = UnifiedRequest {
        provider: model_spec.provider,
        endpoint_override: None,
        model_id: model_spec.id,
        messages: vec![UnifiedMessage {
            role: "user".to_string(),
            content: json!(user_prompt),
        }],
        system_instruction: Some(system_prompt.to_string()),
        api_key,
        temperature: Some(0.1),
        max_tokens: Some(1024),
        event_name: None,
        tools: None,
        response_format: Some(json!({ "type": "json_object" })),
        stop: None,
        repeat_penalty: None,
        presence_penalty: None,
        frequency_penalty: None,
        top_k: None,
        top_p: None,
        execution_mode: Some("chat".to_string()),
        reasoning_enabled: None,
        context_window: None,
        capabilities: None,
        tool_choice: None,
        web_search_enabled: false,
        agent_mode: None,
    };

    let mut rx = execute_any_stream(app, &req).await?;
    let mut response_text = String::new();

    while let Some(msg) = rx.recv().await {
        if let Ok(payload) = msg {
            if payload.event_type == "text" {
                if let Some(c) = payload.content {
                    response_text.push_str(&c);
                }
            }
        }
    }

    let trimmed = response_text.trim();
    let json_slice = if let (Some(s), Some(e)) = (trimmed.find('{'), trimmed.rfind('}')) {
        if s < e { &trimmed[s..=e] } else { trimmed }
    } else {
        trimmed
    };

    match serde_json::from_str::<RouteDecision>(json_slice) {
        Ok(decision) => Ok(decision),
        Err(_) => {
            // Fallback heuristic classification
            let p_lower = user_prompt.to_lowercase();
            let intent = if p_lower.contains("slide") || p_lower.contains("presentation") || p_lower.contains("ppt") {
                PrimaryIntent::SlidevPresentation
            } else if p_lower.contains("diagram") || p_lower.contains("mermaid") || p_lower.contains("flowchart") {
                PrimaryIntent::DiagramGeneration
            } else if p_lower.contains("deep research") || p_lower.contains("whitepaper") || p_lower.contains("in-depth analysis") {
                PrimaryIntent::DeepResearch
            } else if p_lower.contains("file") || p_lower.contains("code") || p_lower.contains("refactor") || p_lower.contains("create") {
                PrimaryIntent::AutonomousCoding
            } else {
                PrimaryIntent::DirectChat
            };

            Ok(RouteDecision {
                intent,
                needs_web_search: p_lower.contains("search") || p_lower.contains("latest") || p_lower.contains("news"),
                search_depth: 1,
                extracted_core_query: user_prompt.to_string(),
                ..Default::default()
            })
        }
    }
}
