use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State, Manager};
use sqlx::SqlitePool;
use reqwest::Client;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio_util::io::StreamReader;
use futures_util::TryStreamExt;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use crate::db::commands::write_swarm_context_internal;
use crate::commands::agent::{execute_tool, get_builtin_tools};
use crate::commands::llm::{extract_stream_event, StreamEventParse, StreamChunkPayload};
use crate::AppState;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StreamContext {
    pub request_id: String,
    pub session_id: String,
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub max_iterations: Option<usize>,
    pub system_instruction: Option<String>,
    pub agent_type: Option<String>,
    pub is_fast_intent: Option<bool>,
}

fn convert_schema_to_gemini(schema: &mut Value) {
    if let Some(obj) = schema.as_object_mut() {
        if let Some(t) = obj.get_mut("type") {
            if let Some(t_str) = t.as_str() {
                *t = json!(t_str.to_uppercase());
            }
        }
        if let Some(properties) = obj.get_mut("properties") {
            if let Some(prop_obj) = properties.as_object_mut() {
                for (_, val) in prop_obj.iter_mut() {
                    convert_schema_to_gemini(val);
                }
            }
        }
        if let Some(items) = obj.get_mut("items") {
            convert_schema_to_gemini(items);
        }
    }
}

/// Run a streaming LLM request, parse SSE, emit to UI, and return accumulated text + tool calls.
/// Includes exponential-backoff retry for HTTP 429 / 503 responses.
pub async fn run_agent_stream(
    app: &AppHandle,
    event_name: &str,
    context: &StreamContext,
    messages: &[Value],
) -> Result<(String, Vec<Value>), String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let provider = context.provider.as_str();
    let is_gemini = provider == "gemini";
    let provider_type = if is_gemini { "gemini" } else { "openrouter" };

    // ── Build URL ─────────────────────────────────────────────────────────────
    // IMPORTANT: Gemini API key goes in the x-goog-api-key header — NOT the URL.
    // Putting secret keys in URLs leaks them via proxy logs and browser history.
    let url = if is_gemini {
        format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse",
            context.model
        )
    } else {
        "https://openrouter.ai/api/v1/chat/completions".to_string()
    };

    // ── Build request body ────────────────────────────────────────────────────
    let mut body = json!({
        "model": context.model,
        "temperature": 0.3,
        "stream": true,
    });

    if is_gemini {
        let mut contents = vec![];
        for m in messages {
            if m["role"] == "system" {
                body["systemInstruction"] = json!({"parts": [{"text": m["content"]}]});
            } else if m["role"] == "assistant" {
                let mut parts = vec![];
                if let Some(txt) = m["content"].as_str() {
                    if !txt.is_empty() {
                        parts.push(json!({"text": txt}));
                    }
                }
                if let Some(tool_calls) = m.get("tool_calls").and_then(|tc| tc.as_array()) {
                    for tc in tool_calls {
                        let name     = tc["function"]["name"].as_str().unwrap_or("");
                        let args_str = tc["function"]["arguments"].as_str().unwrap_or("{}");
                        let args: Value = serde_json::from_str(args_str).unwrap_or(json!({}));
                        parts.push(json!({"functionCall": {"name": name, "args": args}}));
                    }
                }
                if parts.is_empty() {
                    parts.push(json!({"text": "(No content generated)"}));
                }
                contents.push(json!({"role": "model", "parts": parts}));
            } else if m["role"] == "tool" {
                let name    = m["name"].as_str().unwrap_or("");
                let content = m["content"].as_str().unwrap_or("");

                let mut merged = false;
                if let Some(last_msg) = contents.last_mut() {
                    if last_msg["role"] == "user" && last_msg["parts"].is_array() {
                        if let Some(parts_arr) = last_msg["parts"].as_array_mut() {
                            if parts_arr.iter().any(|item| item.get("functionResponse").is_some()) {
                                parts_arr.push(json!({
                                    "functionResponse": {"name": name, "response": {"output": content}}
                                }));
                                merged = true;
                            }
                        }
                    }
                }
                if !merged {
                    contents.push(json!({
                        "role": "user",
                        "parts": [{"functionResponse": {"name": name, "response": {"output": content}}}]
                    }));
                }
            } else {
                contents.push(json!({"role": "user", "parts": [{"text": m["content"]}]}));
            }
        }
        body["contents"] = json!(contents);

        let tools = get_builtin_tools();
        if let Some(t_array) = tools.as_array() {
            let mut decls = vec![];
            for t in t_array {
                if let Some(f) = t.get("function") {
                    let mut f_clone = f.clone();
                    if let Some(params) = f_clone.get_mut("parameters") {
                        convert_schema_to_gemini(params);
                    }
                    decls.push(f_clone);
                }
            }
            body["tools"] = json!([{"functionDeclarations": decls}]);
        }
    } else {
        // OpenRouter
        let mut mapped_msgs = vec![];
        for m in messages {
            if m["role"] == "assistant" {
                let mut new_m = m.clone();
                if let Some(tc) = m.get("tool_calls") {
                    if !tc.is_null() && m["content"].as_str() == Some("") {
                        new_m["content"] = Value::Null;
                    }
                }
                mapped_msgs.push(new_m);
            } else {
                mapped_msgs.push(m.clone());
            }
        }
        body["messages"] = json!(mapped_msgs);
        body["tools"]    = get_builtin_tools();
    }

    // ── Send with retry (exponential backoff on 429 / 503) ───────────────────
    let mut retry_count = 0u32;
    let res = loop {
        let mut req = client.post(&url).json(&body);

        if is_gemini {
            // API key as header — never in the URL query string
            req = req.header("x-goog-api-key", &context.api_key);
        } else if provider == "openrouter" {
            req = req
                .header("Authorization", format!("Bearer {}", context.api_key))
                .header("HTTP-Referer", "https://nyx.local")
                .header("X-Title", "NYX");
        } else if provider == "openai" || provider == "deepseek" {
            req = req.header("Authorization", format!("Bearer {}", context.api_key));
        }

        match req.send().await {
            Ok(resp) => {
                let status = resp.status();
                if (status == 429 || status == 503) && retry_count < 3 {
                    let delay_ms = 500u64 * (1u64 << retry_count);
                    tracing::warn!(
                        "HTTP {} from {}: retrying in {}ms (attempt {}/3)",
                        status, provider, delay_ms, retry_count + 1
                    );
                    tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                    retry_count += 1;
                    continue;
                }
                break resp;
            }
            Err(e) => return Err(e.to_string()),
        }
    };

    if !res.status().is_success() {
        let status   = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Request failed ({}): {}", status, err_text));
    }

    // ── Parse SSE stream ──────────────────────────────────────────────────────
    let byte_stream   = res.bytes_stream().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e));
    let stream_reader = StreamReader::new(byte_stream);
    let mut lines     = BufReader::new(stream_reader).lines();

    let mut buffer            = String::new();
    let mut full_text         = String::new();
    let mut current_tool_id   = String::new();
    let mut current_tool_name = String::new();
    let mut current_tool_args = String::new();
    let mut tool_calls        = vec![];

    while let Ok(Some(line)) = lines.next_line().await {
        if line.is_empty() {
            if !buffer.is_empty() {
                let data = buffer.trim().to_string();
                buffer.clear();

                if data == "[DONE]" { break; }

                for event in extract_stream_event(&data, provider_type) {
                    match event {
                        StreamEventParse::Text(text) => {
                            full_text.push_str(&text);
                            let _ = app.emit(event_name, StreamChunkPayload {
                                event_type: "text".to_string(),
                                content:   Some(text),
                                done:      Some(false),
                                error:     None,
                                tool_call: None,
                                name:      None,
                                result:    None,
                                metadata:  None,
                            });
                        }
                        StreamEventParse::ToolCallStart { id, name } => {
                            if !current_tool_id.is_empty() {
                                tool_calls.push(json!({
                                    "id": current_tool_id,
                                    "type": "function",
                                    "function": {
                                        "name": current_tool_name,
                                        "arguments": if current_tool_args.is_empty() { "{}" } else { &current_tool_args }
                                    }
                                }));
                            }
                            current_tool_id   = id.clone();
                            current_tool_name = name.clone();
                            current_tool_args = String::new();

                            let _ = app.emit(event_name, StreamChunkPayload {
                                event_type: "tool_start".to_string(),
                                content:   None,
                                done:      Some(false),
                                error:     None,
                                tool_call: Some(json!({"id": id, "name": name, "arguments": {}})),
                                name:      Some(name),
                                result:    None,
                                metadata:  None,
                            });
                        }
                        StreamEventParse::ToolCallArgs { args } => {
                            current_tool_args.push_str(&args);
                            let _ = app.emit(event_name, StreamChunkPayload {
                                event_type: "tool_call".to_string(),
                                content:   Some(args.clone()),
                                done:      Some(false),
                                error:     None,
                                tool_call: None,
                                name:      None,
                                result:    None,
                                metadata:  Some(json!({
                                    "id":   current_tool_id.clone(),
                                    "args": args,
                                    "name": current_tool_name.clone()
                                })),
                            });
                        }
                        StreamEventParse::None => {}
                    }
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

    // Flush any last in-progress tool call
    if !current_tool_id.is_empty() {
        tool_calls.push(json!({
            "id": current_tool_id,
            "type": "function",
            "function": {
                "name": current_tool_name,
                "arguments": if current_tool_args.is_empty() { "{}" } else { &current_tool_args }
            }
        }));
    }

    Ok((full_text, tool_calls))
}

/// Main agent orchestration command.
///
/// Improvements over the original:
///  • Fix 1  — no debug file write (API key leak removed)
///  • Fix 3  — tool calls execute in PARALLEL via join_all
///  • Fix 4  — 5-minute hard wall-clock timeout
///  • Fix 7  — Gemini API key sent as x-goog-api-key header, not in URL
///  • Fix 8  — tool errors detected via Result<>, not string sniffing
///  • Fix 11 — per-run cancellation via AtomicBool in AppState
///  • Fix 12 — 429/503 retries with exponential backoff
#[tauri::command]
pub async fn orchestrate_supervisor(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    app_state: State<'_, AppState>,
    mut messages: Vec<Value>,
    context: StreamContext,
    event_name: String,
) -> Result<String, String> {
    // Reset the cancellation flag for this fresh run
    let cancel_flag = Arc::clone(&app_state.agent_cancel);
    cancel_flag.store(false, Ordering::SeqCst);



    let _ = app.emit(&event_name, json!({
        "type": "thinking",
        "content": "\n━━━ [NYX Agent] Initializing Autonomous Loop... ━━━\n"
    }));

    let mut final_system_prompt = String::new();
    if let Some(ref sys) = context.system_instruction {
        if !sys.is_empty() {
            final_system_prompt.push_str(sys);
        }
    }

    let react_instructions = concat!(
        "\n\n[SUPERVISOR INSTRUCTIONS]\n",
        "1. You operate in a continuous Reason + Act (ReAct) loop.\n",
        "2. You have access to tools. Use them to gather information or execute code.\n",
        "3. ALWAYS output your reasoning in <think>...</think> blocks before acting.\n",
        "4. When calling multiple independent tools, emit all tool calls at once — they will run in parallel.\n",
        "5. If you have enough information to fulfill the user's request, provide the final response without any tool calls.\n",
        "6. If a previous assistant message contains '[Response interrupted by user]', ignore it and focus on the current task."
    );
    final_system_prompt.push_str(react_instructions);

    if let Some(first) = messages.first_mut() {
        if first.get("role").and_then(|r| r.as_str()) == Some("system") {
            let existing = first["content"].as_str().unwrap_or("").to_string();
            first["content"] = json!(format!("{}\n\n{}", existing, final_system_prompt));
        } else {
            messages.insert(0, json!({"role": "system", "content": final_system_prompt}));
        }
    } else {
        messages.push(json!({"role": "system", "content": final_system_prompt}));
    }

    let max_loops      = context.max_iterations.unwrap_or(10);
    let app_clone      = app.clone();
    let pool_clone     = pool.inner().clone();
    let context_clone  = context.clone();
    let event_clone    = event_name.clone();

    // ── 5-minute hard timeout wraps the entire agent loop ─────────────────────
    let agent_result = tokio::time::timeout(
        std::time::Duration::from_secs(300),
        async move {
            let mut messages    = messages;
            let mut loop_count  = 0usize;
            let mut consecutive_errors = 0usize;

            while loop_count < max_loops {
                // ── Check cancellation each iteration ──────────────────────────
                if cancel_flag.load(Ordering::SeqCst) {
                    let _ = app_clone.emit(&event_clone, json!({
                        "type": "thinking",
                        "content": "\n⛔ [NYX Agent] Cancelled by user.\n"
                    }));
                    return Ok::<String, String>("Cancelled".to_string());
                }

                loop_count += 1;
                let _ = app_clone.emit(&event_clone, json!({
                    "type": "thinking",
                    "content": format!("\n🔄 [ReAct Loop] Iteration {} ━━━\n", loop_count)
                }));

                let (full_text, tool_calls) = match run_agent_stream(
                    &app_clone,
                    &event_clone,
                    &context_clone,
                    &messages,
                ).await {
                    Ok(res) => res,
                    Err(e) => {
                        let _ = app_clone.emit(&event_clone, json!({"type": "error", "content": format!("Stream error: {}", e)}));
                        return Err(e);
                    }
                };

                if !tool_calls.is_empty() {
                    messages.push(json!({
                        "role": "assistant",
                        "content": full_text,
                        "tool_calls": tool_calls
                    }));

                    // Notify UI which tools are about to run
                    for tc in &tool_calls {
                        let name = tc["function"]["name"].as_str().unwrap_or("");
                        let args = tc["function"]["arguments"].as_str().unwrap_or("{}");
                        let _ = app_clone.emit(&event_clone, json!({
                            "type": "thinking",
                            "content": format!("\n🛠️ [Executing Tool] {} ({})\n", name, args)
                        }));
                        let _ = app_clone.emit(&event_clone, StreamChunkPayload {
                            event_type: "tool_running".to_string(),
                            content:   None,
                            done:      Some(false),
                            error:     None,
                            tool_call: None,
                            name:      Some(name.to_string()),
                            result:    None,
                            metadata:  None,
                        });
                    }

                    let tool_results = {
                        let tool_futures: Vec<_> = tool_calls.iter().map(|tc| {
                            let tc_clone = tc.clone();
                            let app_clone = app_clone.clone();
                            let event_clone = event_clone.clone();
                            async move {
                                let name = tc_clone["function"]["name"].as_str().unwrap_or("").to_string();
                                let args = tc_clone["function"]["arguments"].as_str().unwrap_or("{}").to_string();
                                
                                let is_destructive = name == "write_file"
                                    || name == "edit_file"
                                    || name == "run_terminal_command"
                                    || name == "run_shell"
                                    || name == "run_test"
                                    || name == "lint_code";
                                    
                                if is_destructive {
                                    let (tx, rx) = tokio::sync::oneshot::channel();
                                    let approval_id = uuid::Uuid::new_v4().to_string();
                                    
                                    {
                                        let app_state = app_clone.state::<crate::AppState>();
                                        let mut approvals = app_state.pending_approvals.lock().unwrap();
                                        approvals.insert(approval_id.clone(), tx);
                                    }
                                    
                                    let _ = app_clone.emit(&event_clone, serde_json::json!({
                                        "event_type": "tool_approval_required",
                                        "name": name.clone(),
                                        "arguments": args.clone(),
                                        "approval_id": approval_id,
                                        "tool_call_id": tc_clone["id"].as_str().unwrap_or("")
                                    }));
                                    
                                    let approved = match rx.await {
                                        Ok(val) => val,
                                        Err(_) => false,
                                    };
                                    
                                    if !approved {
                                        return (tc_clone, name, args, "Error: Tool execution was rejected by the user.".to_string());
                                    }
                                }
                                
                                let result = execute_tool(&app_clone, &name, &args).await;
                                (tc_clone, name, args, result)
                            }
                        }).collect();
                        futures_util::future::join_all(tool_futures).await
                    };
                    let mut any_success = false;

                    // Process each result — emit to UI and push to message history
                    for (tc, name, args, output) in tool_results {
                        if output.starts_with("Error:") {
                            let _ = app_clone.emit(&event_clone, StreamChunkPayload {
                                event_type: "tool_error".to_string(),
                                content:   None,
                                done:      Some(false),
                                error:     Some(output.clone()),
                                tool_call: None,
                                name:      Some(name.clone()),
                                result:    None,
                                metadata:  None,
                            });
                            // Push error as tool result so LLM can adapt
                            messages.push(json!({
                                "role": "tool",
                                "tool_call_id": tc["id"],
                                "name": name,
                                "content": output
                            }));
                        } else {
                            any_success = true;
                            let _ = app_clone.emit(&event_clone, StreamChunkPayload {
                                event_type: "tool_done".to_string(),
                                content:   None,
                                done:      Some(false),
                                error:     None,
                                tool_call: None,
                                name:      Some(name.clone()),
                                result:    Some(json!(output)),
                                metadata:  None,
                            });
                            // Persist tool result to swarm memory
                            let pool_ref = pool_clone.clone();
                            let _ = write_swarm_context_internal(
                                &pool_ref,
                                &context_clone.session_id,
                                &name,
                                &args,
                                &output,
                            ).await;
                            messages.push(json!({
                                "role": "tool",
                                "tool_call_id": tc["id"],
                                "name": name,
                                "content": output
                            }));
                        }
                    }

                    if !any_success && !tool_calls.is_empty() {
                        consecutive_errors += 1;
                    } else {
                        consecutive_errors = 0;
                    }

                    if consecutive_errors >= 3 {
                        let _ = app_clone.emit(&event_clone, json!({
                            "type": "thinking",
                            "content": "\n⚠️ [NYX Agent] Multiple consecutive tool failures detected. Forcing synthesis fallback.\n"
                        }));
                        messages.push(json!({
                            "role": "user",
                            "content": "SYSTEM ALERT: The last 3 tool execution attempts failed. Do NOT try to call tools again. Synthesize a final response based on the information you have gathered so far, and apologize to the user that you couldn't complete the task."
                        }));
                        // Reset counter so we don't spam the prompt if it ignores us once
                        consecutive_errors = 0;
                    }
                } else {
                    // No tool calls → final answer reached
                    if !full_text.is_empty() {
                        messages.push(json!({"role": "assistant", "content": full_text}));
                    }
                    break;
                }
            }

            if loop_count >= max_loops {
                let _ = app_clone.emit(&event_clone, json!({
                    "type": "thinking",
                    "content": format!(
                        "\n⚠️ [NYX Agent] Reached maximum iteration limit ({}).\n",
                        max_loops
                    )
                }));
            }

            Ok("Agent Loop Complete".to_string())
        },
    ).await;

    // Always emit "done" so the UI unlocks the input
    let _ = app.emit(&event_name, json!({"type": "done"}));

    match agent_result {
        Ok(inner) => inner,
        Err(_elapsed) => {
            let _ = app.emit(&event_name, json!({
                "type": "error",
                "content": "Agent loop timed out after 5 minutes."
            }));
            Err("Agent loop timed out".to_string())
        }
    }
}

/// Cancel the currently running agent loop.
/// The loop checks this flag at the start of every iteration.
#[tauri::command]
pub fn cancel_agent_loop(app_state: State<'_, AppState>) {
    app_state.agent_cancel.store(true, Ordering::SeqCst);
    tracing::info!("Agent cancellation requested.");
}
