use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State};
use sqlx::SqlitePool;
use reqwest::Client;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio_util::io::StreamReader;
use futures_util::TryStreamExt;

use crate::db::commands::{get_swarm_context_internal, write_swarm_context_internal};
use crate::commands::agent::{execute_tool, get_builtin_tools};
use crate::commands::llm::{extract_stream_event, StreamEventParse, StreamChunkPayload};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StreamContext {
    pub request_id: String,
    pub session_id: String,
    pub provider: String,
    pub model: String,
    pub api_key: String,
}

// Helper to run a streaming LLM request, parse SSE, emit to UI, and return the accumulated text + tool calls
async fn run_agent_stream(
    app: &AppHandle,
    event_name: &str,
    context: &StreamContext,
    messages: &[Value],
) -> Result<(String, Vec<Value>), String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let is_anthropic = context.provider == "anthropic";
    let is_gemini = context.provider == "gemini";
    let provider_type = if is_anthropic { "anthropic" } else if is_gemini { "gemini" } else { "openai" };

    let url = if is_anthropic {
        "https://api.anthropic.com/v1/messages".to_string()
    } else if is_gemini {
        format!("https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse&key={}", context.model, context.api_key)
    } else {
        "https://api.openai.com/v1/chat/completions".to_string()
    };

    let mut body = json!({
        "model": context.model,
        "messages": messages,
        "temperature": 0.3,
        "stream": true,
    });

    if is_anthropic {
        body["max_tokens"] = json!(8192);
        // Map roles for anthropic
        let mut mapped_msgs = vec![];
        for m in messages {
            if m["role"] == "system" {
                body["system"] = m["content"].clone();
            } else {
                mapped_msgs.push(m.clone());
            }
        }
        body["messages"] = json!(mapped_msgs);
        
        let tools = get_builtin_tools();
        if let Some(t_array) = tools.as_array() {
            let mut anthropic_tools = vec![];
            for t in t_array {
                if let Some(f) = t.get("function") {
                    anthropic_tools.push(json!({
                        "name": f["name"],
                        "description": f["description"],
                        "input_schema": f["parameters"]
                    }));
                }
            }
            body["tools"] = json!(anthropic_tools);
        }
    } else if is_gemini {
        // Simplified Gemini mapping
        let mut contents = vec![];
        for m in messages {
            if m["role"] == "system" {
                body["systemInstruction"] = json!({ "parts": [{"text": m["content"]}] });
            } else {
                let role = if m["role"] == "assistant" { "model" } else { "user" };
                contents.push(json!({
                    "role": role,
                    "parts": [{"text": m["content"]}]
                }));
            }
        }
        body["contents"] = json!(contents);
        // Add tools... omitted for brevity in this Gemini mock mapping
    } else {
        body["tools"] = get_builtin_tools();
    }

    let mut req = client.post(&url).json(&body);
    
    if is_anthropic {
        req = req.header("x-api-key", &context.api_key)
                 .header("anthropic-version", "2023-06-01")
                 .header("anthropic-beta", "interleaved-thinking-2025-05-14");
    } else if !is_gemini {
        req = req.header("Authorization", format!("Bearer {}", context.api_key));
    }

    let res = req.send().await.map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Request failed ({}): {}", status, err_text));
    }

    let byte_stream = res.bytes_stream().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e));
    let stream_reader = StreamReader::new(byte_stream);
    let mut lines = BufReader::new(stream_reader).lines();

    let mut buffer = String::new();
    let mut full_text = String::new();
    
    // Tool call state
    let mut current_tool_id = String::new();
    let mut current_tool_name = String::new();
    let mut current_tool_args = String::new();
    let mut tool_calls = vec![];

    while let Ok(Some(line)) = lines.next_line().await {
        if line.is_empty() {
            if !buffer.is_empty() {
                let data = buffer.trim().to_string();
                buffer.clear();

                if data == "[DONE]" { break; }

                match extract_stream_event(&data, provider_type) {
                    StreamEventParse::Text(text) => {
                        full_text.push_str(&text);
                        let _ = app.emit(event_name, StreamChunkPayload {
                            event_type: "text".to_string(),
                            content: Some(text),
                            done: Some(false),
                            error: None,
                            tool_call: None,
                            name: None,
                            result: None,
                            metadata: None,
                        });
                    }
                    StreamEventParse::ToolCallStart { id, name } => {
                        if !current_tool_id.is_empty() {
                            // Save previous tool call
                            tool_calls.push(json!({
                                "id": current_tool_id,
                                "type": "function",
                                "function": {
                                    "name": current_tool_name,
                                    "arguments": current_tool_args
                                }
                            }));
                        }
                        current_tool_id = id.clone();
                        current_tool_name = name.clone();
                        current_tool_args = String::new();
                        
                        let _ = app.emit(event_name, StreamChunkPayload {
                            event_type: "tool_start".to_string(),
                            content: None,
                            done: Some(false),
                            error: None,
                            tool_call: Some(json!({"id": id})),
                            name: Some(name),
                            result: None,
                            metadata: None,
                        });
                    }
                    StreamEventParse::ToolCallArgs { args } => {
                        current_tool_args.push_str(&args);
                        let _ = app.emit(event_name, StreamChunkPayload {
                            event_type: "tool_call".to_string(),
                            content: Some(args),
                            done: Some(false),
                            error: None,
                            tool_call: None,
                            name: None,
                            result: None,
                            metadata: None,
                        });
                    }
                    StreamEventParse::None => {}
                }
            }
            continue;
        }

        if let Some(payload) = line.strip_prefix("data: ") {
            if payload == "[DONE]" { break; }
            buffer = payload.to_string();
        } else if line.starts_with("data:") {
            buffer = line[5..].trim().to_string();
        }
    }

    if !current_tool_id.is_empty() {
        tool_calls.push(json!({
            "id": current_tool_id,
            "type": "function",
            "function": {
                "name": current_tool_name,
                "arguments": current_tool_args
            }
        }));
    }

    Ok((full_text, tool_calls))
}

#[tauri::command]
pub async fn orchestrate_supervisor(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    mut messages: Vec<Value>,
    context: StreamContext,
    event_name: String,
) -> Result<String, String> {
    let _ = app.emit(&event_name, json!({
        "type": "thinking",
        "content": "\n━━━ [NYX Agent] Initializing Autonomous Loop... ━━━\n"
    }));

    let system_prompt = "[ROLE] You are NYX, an elite Autonomous Software Engineer and Researcher. 
[RULES] 
1. You operate in a continuous Reason + Act (ReAct) loop.
2. You have access to tools. Use them to gather information or execute code.
3. ALWAYS output your reasoning in <think>...</think> blocks before acting.
4. If you need to use a tool, emit a tool call. Wait for the tool result before proceeding.
5. If you have enough information to fulfill the user's request, provide the final response without any tool calls.";

    if let Some(first) = messages.first_mut() {
        if first.get("role").and_then(|r| r.as_str()) == Some("system") {
            first["content"] = json!(system_prompt);
        } else {
            messages.insert(0, json!({"role": "system", "content": system_prompt}));
        }
    } else {
        messages.push(json!({"role": "system", "content": system_prompt}));
    }

    let mut loop_count = 0;
    let max_loops = 10;
    
    while loop_count < max_loops {
        loop_count += 1;
        
        let _ = app.emit(&event_name, json!({
            "type": "thinking",
            "content": format!("\n🔄 [ReAct Loop] Iteration {} ━━━\n", loop_count)
        }));

        let (full_text, tool_calls) = match run_agent_stream(&app, &event_name, &context, &messages).await {
            Ok(res) => res,
            Err(e) => {
                let _ = app.emit(&event_name, json!({"type": "error", "content": format!("Stream error: {}", e)}));
                return Err(e);
            }
        };
        
        if !tool_calls.is_empty() {
            messages.push(json!({
                "role": "assistant",
                "content": full_text,
                "tool_calls": tool_calls
            }));
            
            for tc in &tool_calls {
                let name = tc["function"]["name"].as_str().unwrap_or("");
                let args = tc["function"]["arguments"].as_str().unwrap_or("{}");
                
                let _ = app.emit(&event_name, json!({
                    "type": "thinking",
                    "content": format!("\n🛠️ [Executing Tool] {} ({})\n", name, args)
                }));
                
                let result = execute_tool(name, args).await;
                
                // Write to swarm memory for persistence
                let pool_clone = pool.inner().clone();
                let _ = write_swarm_context_internal(&pool_clone, &context.session_id, name, args, &result).await;

                messages.push(json!({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "name": name,
                    "content": result
                }));
            }
        } else {
            messages.push(json!({
                "role": "assistant",
                "content": full_text
            }));
            break;
        }
    }
    
    let _ = app.emit(&event_name, json!({
        "type": "done"
    }));
    
    Ok("Agent Loop Complete".to_string())
}
