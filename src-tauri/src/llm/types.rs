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
                    let item_type = item.get("type").and_then(|t| t.as_str());
                    // Accept "tool_call", "function", and "tool_use"
                    if item_type == Some("tool_call") || item_type == Some("function") || item_type == Some("tool_use") {
                        if item_type == Some("tool_use") {
                            let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("call_0");
                            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("tool");
                            let default_input = json!({});
                            let input = item.get("input").unwrap_or(&default_input);
                            let args_str = if input.is_string() {
                                input.as_str().unwrap().to_string()
                            } else {
                                serde_json::to_string(input).unwrap_or_else(|_| "{}".to_string())
                            };
                            tool_calls.push(json!({
                                "id": id,
                                "type": "function",
                                "function": {
                                    "name": name,
                                    "arguments": args_str
                                }
                            }));
                        } else {
                            tool_calls.push(item.clone());
                        }
                    }
                }
            }
            if !tool_calls.is_empty() {
                sanitized.push(json!({"role": "assistant", "tool_calls": tool_calls, "content": null}));
                continue;
            }
        }

        if m.role == "tool" {
            let (tool_call_id, content, name) = match &m.content {
                Value::Array(arr) => {
                    if let Some(item) = arr.first() {
                        let id = item.get("tool_call_id").and_then(|v| v.as_str()).unwrap_or("");
                        let c = item.get("content").and_then(|v| v.as_str()).unwrap_or("");
                        let n = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        (id.to_string(), c.to_string(), n.to_string())
                    } else {
                        (String::new(), String::new(), String::new())
                    }
                }
                Value::String(s) => (String::new(), s.clone(), String::new()),
                Value::Object(obj) => {
                    let id = obj.get("tool_call_id").and_then(|v| v.as_str()).unwrap_or("");
                    let c = obj.get("content").and_then(|v| v.as_str()).unwrap_or("");
                    let n = obj.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    (id.to_string(), c.to_string(), n.to_string())
                }
                _ => (String::new(), m.content.to_string(), String::new()),
            };
            let mut tool_val = json!({
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": content,
            });
            if !name.is_empty() {
                tool_val["name"] = json!(name);
            }
            sanitized.push(tool_val);
            continue;
        }

        // Check if message content is empty
        let is_empty = match &m.content {
            Value::String(s) => s.trim().is_empty(),
            Value::Null => true,
            Value::Array(a) => a.is_empty(),
            _ => false,
        };

        if !is_empty {
            // Normalize content array for llama-server / OpenAI compatibility
            let normalized_content = match &m.content {
                Value::Array(arr) => {
                    let has_image = arr.iter().any(|item| {
                        item.get("type").and_then(|t| t.as_str()) == Some("image_url")
                    });
                    if !has_image {
                        let mut text_parts = Vec::new();
                        for item in arr {
                            if let Some(t) = item.get("text").and_then(|v| v.as_str()) {
                                if !t.trim().is_empty() { text_parts.push(t); }
                            } else if let Some(c) = item.get("content").and_then(|v| v.as_str()) {
                                if !c.trim().is_empty() { text_parts.push(c); }
                            } else if let Some(s) = item.as_str() {
                                if !s.trim().is_empty() { text_parts.push(s); }
                            }
                        }
                        json!(text_parts.join("\n\n"))
                    } else {
                        // Keep only valid OpenAI array blocks: type "text" and "image_url"
                        let mut valid_blocks = Vec::new();
                        for item in arr {
                            let item_type = item.get("type").and_then(|t| t.as_str());
                            if item_type == Some("image_url") {
                                valid_blocks.push(item.clone());
                            } else if let Some(t) = item.get("text").and_then(|v| v.as_str()) {
                                valid_blocks.push(json!({"type": "text", "text": t}));
                            }
                        }
                        if valid_blocks.is_empty() {
                            json!("")
                        } else {
                            json!(valid_blocks)
                        }
                    }
                }
                _ => m.content.clone(),
            };

            sanitized.push(json!({"role": m.role, "content": normalized_content}));
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
    #[serde(default)]
    pub thinking_level: Option<String>,
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
    /// When true, Lucifer will automatically pre-fetch live web search results before generating a
    /// response (if the intent requires it). When false (default), search only fires if the user
    /// explicitly calls the web_search tool via a tool call in the model output.
    #[serde(default)]
    pub web_search_enabled: bool,
    /// When true (default), full Lucifer agent orchestration is active.
    /// When false, prompts go directly to the model without agentic routing or persona overhead.
    #[serde(default)]
    pub agent_mode: Option<bool>,
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
