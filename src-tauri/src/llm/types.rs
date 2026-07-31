use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct UnifiedMessage {
    pub role: String,
    pub content: serde_json::Value,
}

/// Shared tool-message sanitizer used by both local and cloud inference.
/// Reconstructs OpenAI-compatible message formats from our internal UnifiedMessage array.
pub fn sanitize_messages_for_api(messages: &[UnifiedMessage]) -> Vec<Value> {
    let mut sanitized = Vec::new();
    let mut system_contents = Vec::new();

    for m in messages {
        if m.role == "system" {
            let sys_text = match &m.content {
                Value::String(s) => s.trim().to_string(),
                Value::Object(obj) => obj.get("text").and_then(|v| v.as_str()).unwrap_or("").trim().to_string(),
                _ => m.content.to_string(),
            };
            if !sys_text.is_empty() && !system_contents.contains(&sys_text) {
                system_contents.push(sys_text);
            }
            continue;
        }

        if m.role == "assistant" && m.content.is_array() {
            let mut tool_calls: Vec<Value> = Vec::new();
            if let Some(arr) = m.content.as_array() {
                for item in arr {
                    if item.get("type").and_then(|t| t.as_str()) == Some("tool_call") {
                        tool_calls.push(item.clone());
                    }
                }
            }
            if !tool_calls.is_empty() {
                sanitized.push(json!({"role": "assistant", "tool_calls": tool_calls, "content": null}));
                continue;
            }
        }

        if m.role == "tool" && m.content.is_array() {
            if let Some(item) = m.content.as_array().and_then(|a| a.first()) {
                let tool_call_id = item.get("tool_call_id").and_then(|v| v.as_str()).unwrap_or("");
                let content = item.get("content").and_then(|v| v.as_str()).unwrap_or("");
                sanitized.push(json!({"role": "tool", "tool_call_id": tool_call_id, "content": content}));
                continue;
            }
        }

        // Check if message content is empty
        let is_empty = match &m.content {
            Value::String(s) => s.trim().is_empty(),
            Value::Null => true,
            Value::Array(a) => a.is_empty(),
            _ => false,
        };

        if !is_empty {
            sanitized.push(json!({"role": m.role, "content": m.content}));
        }
    }

    // Ensure trailing assistant messages with empty/whitespace content are popped
    while let Some(last) = sanitized.last() {
        if last.get("role").and_then(|r| r.as_str()) == Some("assistant") {
            let has_content = last.get("content").map_or(false, |c| !c.is_null() && c.as_str().map_or(true, |s| !s.trim().is_empty()));
            let has_tools = last.get("tool_calls").map_or(false, |t| t.as_array().map_or(false, |a| !a.is_empty()));
            if !has_content && !has_tools {
                sanitized.pop();
            } else {
                break;
            }
        } else {
            break;
        }
    }

    // Insert unified system message at top if present
    if !system_contents.is_empty() {
        let combined_system = system_contents.join("\n\n");
        sanitized.insert(0, json!({"role": "system", "content": combined_system}));
    }

    sanitized
}

/// Per-model capability flags — populated by the frontend based on the selected model definition.
/// Used by LuciferOrchestrator to gate tool injection and execution.
#[derive(Debug, Deserialize, Serialize, Clone, Default)]
pub struct ModelCapabilities {
    #[serde(default)]
    pub vision: bool,
    #[serde(default)]
    pub audio: bool,
    #[serde(default)]
    pub voice: bool,
    #[serde(default)]
    pub image_gen: bool,
    #[serde(default)]
    pub tool_calling: bool,
    #[serde(default)]
    pub reasoning: bool,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct UnifiedRequest {
    pub provider: String,
    #[serde(default)]
    pub endpoint_override: Option<String>,
    pub model_id: String,
    pub messages: Vec<UnifiedMessage>,
    #[serde(default)]
    pub system_instruction: Option<String>,
    pub api_key: String,
    #[serde(default)]
    pub temperature: Option<f32>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub top_p: Option<f32>,
    #[serde(default)]
    pub top_k: Option<u32>,
    #[serde(default)]
    pub repeat_penalty: Option<f32>,
    #[serde(default)]
    pub presence_penalty: Option<f32>,
    #[serde(default)]
    pub frequency_penalty: Option<f32>,
    #[serde(default)]
    pub event_name: Option<String>,
    #[serde(default)]
    pub tools: Option<Value>,
    #[serde(default)]
    pub response_format: Option<Value>,
    #[serde(default)]
    pub stop: Option<Vec<String>>,
    #[serde(default)]
    pub execution_mode: Option<String>,
    #[serde(default)]
    pub reasoning_enabled: Option<bool>,
    /// Actual context window the llama-server was started with.
    /// When set, local_inference uses this for history budgeting instead of
    /// the conservative 8 192-token fallback, preventing premature message drops
    /// on 32K / 128K models.  0 or None = fall back to 8 192.
    #[serde(default)]
    pub context_window: Option<u32>,
    /// Model capability flags sent from frontend model registry.
    #[serde(default)]
    pub capabilities: Option<ModelCapabilities>,
    /// OpenAI-compatible tool_choice override ("none", "auto", or specific function).
    #[serde(default)]
    pub tool_choice: Option<Value>,
}

/// Full stream event payload sent to the frontend via Tauri IPC channel.
#[derive(Serialize, Clone)]
pub struct StreamChunkPayload {
    #[serde(rename = "type")]
    pub event_type: String, // "text" | "thinking" | "tool_start" | "tool_call" |
                            // "tool_call_complete" | "tool_result" | "done" | "error"
    pub content: Option<String>,
    pub done: Option<bool>,
    pub error: Option<String>,
    pub tool_call: Option<Value>,
    pub name: Option<String>,
    pub result: Option<Value>,
    pub metadata: Option<Value>,
}

impl StreamChunkPayload {
    pub fn text(content: String) -> Self {
        Self { event_type: "text".into(), content: Some(content),
               done: Some(false), error: None, tool_call: None,
               name: None, result: None, metadata: None }
    }
    pub fn thinking(content: String) -> Self {
        Self { event_type: "thinking".into(), content: Some(content),
               done: Some(false), error: None, tool_call: None,
               name: None, result: None, metadata: None }
    }
    pub fn tool_start(id: String, name: String) -> Self {
        Self { event_type: "tool_start".into(), content: None,
               done: Some(false), error: None,
               tool_call: Some(json!({"id": id})),
               name: Some(name), result: None, metadata: None }
    }
    pub fn tool_args(args: String) -> Self {
        Self { event_type: "tool_call".into(), content: Some(args),
               done: Some(false), error: None, tool_call: None,
               name: None, result: None, metadata: None }
    }
    pub fn tool_complete() -> Self {
        Self { event_type: "tool_call_complete".into(), content: None,
               done: Some(false), error: None, tool_call: None,
               name: None, result: None, metadata: None }
    }
    pub fn done() -> Self {
        Self { event_type: "done".into(), content: None, done: Some(true),
               error: None, tool_call: None, name: None, result: None,
               metadata: None }
    }
    pub fn error(msg: String) -> Self {
        Self { event_type: "error".into(), content: None, done: Some(true),
               error: Some(msg), tool_call: None, name: None, result: None,
               metadata: None }
    }
    pub fn usage(prompt_tokens: u32, completion_tokens: u32, total_tokens: u32) -> Self {
        Self { event_type: "usage".into(), content: None, done: Some(false),
               error: None, tool_call: None, name: None, result: None,
               metadata: Some(json!({
                   "prompt_tokens": prompt_tokens,
                   "completion_tokens": completion_tokens,
                   "total_tokens": total_tokens
               })) }
    }
}
