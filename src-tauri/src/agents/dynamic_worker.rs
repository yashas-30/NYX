use super::protocol::{ConductorMessage, WorkerMessage};
use tokio::sync::mpsc;
use genai::chat::{ChatRequest, ChatMessage};
use genai::Client;

pub struct DynamicWorkerActor {
    pub node_id: String,
    pub receiver: mpsc::Receiver<WorkerMessage>,
    pub conductor_tx: mpsc::Sender<ConductorMessage>,
    pub local_model: String,
    pub role: String,
    pub mcp_manager: std::sync::Arc<crate::commands::mcp::McpManager>,
    pub tool_filters: Option<Vec<String>>,
}

impl DynamicWorkerActor {
    pub fn new(
        node_id: String,
        receiver: mpsc::Receiver<WorkerMessage>,
        conductor_tx: mpsc::Sender<ConductorMessage>,
        local_model: String,
        role: String,
        mcp_manager: std::sync::Arc<crate::commands::mcp::McpManager>,
        tool_filters: Option<Vec<String>>,
    ) -> Self {
        Self {
            node_id,
            receiver,
            conductor_tx,
            local_model,
            role,
            mcp_manager,
            tool_filters,
        }
    }

    pub async fn run(&mut self) {
        let _ = self
            .conductor_tx
            .send(ConductorMessage::WorkerUpdate {
                node_id: self.node_id.clone(),
                status: "Worker booted. Waiting for tasks...".to_string(),
            })
            .await;

        while let Some(msg) = self.receiver.recv().await {
            match msg {
                WorkerMessage::ExecuteTask {
                    task_description,
                    context_refs,
                } => {
                    self.execute_task(task_description, context_refs).await;
                }
            }
        }
    }

    async fn execute_task(&self, task_description: String, context_refs: Vec<String>) {
        let constraints = parse_constraints(&task_description);
        
        let mut attempts = 0;
        let max_attempts = 3;
        
        // Inject context references into the prompt
        let mut injected_task_description = task_description.clone();
        if !context_refs.is_empty() {
            injected_task_description.push_str("\n\n--- REQUIRED CONTEXT (From Upstream Tasks) ---\n");
            for ctx in &context_refs {
                injected_task_description.push_str(ctx);
                injected_task_description.push_str("\n");
            }
        }
        
        let mut current_task_description = injected_task_description.clone();

        loop {
            attempts += 1;
            
            let _ = self
                .conductor_tx
                .send(ConductorMessage::WorkerUpdate {
                    node_id: self.node_id.clone(),
                    status: format!("Executing task (Attempt {}/{})...", attempts, max_attempts),
                })
                .await;

            let is_nyx_native = self.local_model.ends_with("-native")
                || self.local_model.starts_with("nyx-");
                
            let is_nyx_local = self.local_model.ends_with("-local") || self.local_model.ends_with(".gguf");

            let api_key = if is_nyx_native {
                // nyx-native models run via HuggingFace Inference API
                crate::agents::api_key_store::get_key("HUGGINGFACE_API_KEY")
            } else {
                match self.local_model.as_str() {
                    m if m.starts_with("gemini") || m.starts_with("gemma") =>
                        crate::agents::api_key_store::get_key("GEMINI_API_KEY"),
                    m if m.starts_with("gpt") || m.starts_with("o1") || m.starts_with("o3") =>
                        crate::agents::api_key_store::get_key("OPENAI_API_KEY"),
                    m if m.starts_with("claude") =>
                        crate::agents::api_key_store::get_key("ANTHROPIC_API_KEY"),
                    m if m.starts_with("groq") =>
                        crate::agents::api_key_store::get_key("GROQ_API_KEY"),
                    m if m.starts_with("openrouter/") || m.contains("/") =>
                        crate::agents::api_key_store::get_key("OPENROUTER_API_KEY"),
                    _ => String::new(),
                }
            };

            let client = if !api_key.is_empty() {
                use genai::resolver::{AuthData, AuthResolver};
                let ak = api_key.clone();
                let resolver = AuthResolver::from_resolver_fn(move |_| {
                    Ok(Some(AuthData::from_single(ak.clone())))
                });
                Client::builder().with_auth_resolver(resolver).build()
            } else {
                Client::default()
            };
            
            let sys_prompt = if self.role == "Synthesizer" {
                "You are the Synthesizer Agent in a state-of-the-art multi-agent DAG. 
Your ONLY job is to ingest the raw output from the upstream dependency tasks and synthesize them into a pristine, uncluttered, premium, user-facing final response.
Do NOT output any tool logs, internal thoughts, or XML blocks. Output ONLY the polished answer.".to_string()
            } else if self.role == "Chatbot" {
                "You are a helpful AI assistant. Answer the user's queries concisely and conversationally. Do not use any tools.".to_string()
            } else {
                let mut tools = crate::agents::tools::get_all_tools(&self.mcp_manager).await;
                if let Some(filters) = &self.tool_filters {
                    tools.retain(|t| filters.contains(&t.name));
                }
                let mut tools_xml = String::new();
                for t in tools {
                    tools_xml.push_str(&format!(
                        "<tool>\n  <name>{}</name>\n  <description>{}</description>\n  <parameters>{}</parameters>\n</tool>\n",
                        t.name, t.description, t.parameters.to_string()
                    ));
                }

                format!("You are a Worker Agent in the NYX swarm. Execute the given task. Return your results cleanly formatted (preferably in markdown or JSON). 
You have access to the following tools:
{}
To call a tool, output exactly this XML block:
<tool_call><name>tool_name</name><args>{{\"param\": \"value\"}}</args></tool_call>
Wait for the tool response before continuing.
If you are asked to adhere to strict character, word, or formatting constraints, you MUST use the verify_output tool to run a Python script to verify your output against those constraints before providing your final answer. Do not guess.", tools_xml)
            };
            
            let mut messages = vec![
                ChatMessage::system(&sys_prompt),
                ChatMessage::user(current_task_description.clone()),
            ];

            let model = if self.local_model.is_empty() {
                return; // We shouldn't execute if no model is provided
            } else {
                &self.local_model
            };

            let mut final_content = String::new();
            let mut full_trajectory = String::new();
            let mut success = true;

            // ReAct Loop for Tool Calling
            loop {
                let chat_req = ChatRequest::new(messages.clone());
                use futures_util::StreamExt;

                // --- Route: nyx-local → llama-server sidecar (on-device) ---
                if is_nyx_local {
                    let content_buf = call_local_inference(
                        model,
                        &messages,
                        &self.node_id,
                        &self.conductor_tx,
                    ).await;
                    let content = if content_buf.trim().is_empty() {
                        "No response generated.".to_string()
                    } else {
                        content_buf
                    };
                    messages.push(ChatMessage::assistant(content.clone()));
                    full_trajectory.push_str(&content);
                    // Check for tool call (make closing tag optional for smaller local models)
                    if let Some(caps) = regex::Regex::new(r"(?s)<tool_call>\s*<name>(.*?)</name>\s*<args>(.*?)</args>(?:\s*</tool_call>)?").unwrap().captures(&content) {
                        let tool_name = caps.get(1).unwrap().as_str().trim();
                        let tool_args_str = caps.get(2).unwrap().as_str().trim();
                        let parsed_args = serde_json::from_str(tool_args_str).unwrap_or_else(|_| {
                            serde_json::json!({"script": tool_args_str})
                        });
                        let dummy_scanner = crate::rag::scanner::CodebaseScanner::new(std::path::PathBuf::from(".")).await.unwrap();
                        let tool_res = crate::agents::tools::execute_tool(tool_name, parsed_args, &dummy_scanner, &self.mcp_manager).await;
                        let tool_output = match tool_res {
                            Ok(out) => out,
                            Err(e) => format!("Tool Execution Error: {}", e),
                        };
                        let tool_response_str = format!("\n<tool_response>\n{}\n</tool_response>\n", tool_output);
                        messages.push(ChatMessage::user(tool_response_str.clone()));
                        full_trajectory.push_str(&tool_response_str);
                        continue;
                    } else {
                        final_content = content;
                        break;
                    }
                }

                // --- Route: nyx-native → HuggingFace Inference API ---
                if is_nyx_native {
                    let content_buf = call_hf_inference(
                        &api_key,
                        model,
                        &messages,
                        &self.node_id,
                        &self.conductor_tx,
                    ).await;
                    let content = if content_buf.trim().is_empty() {
                        "No response generated.".to_string()
                    } else {
                        content_buf
                    };
                    messages.push(ChatMessage::assistant(content.clone()));
                    full_trajectory.push_str(&content);
                    // Check for tool call (make closing tag optional for smaller local models)
                    if let Some(caps) = regex::Regex::new(r"(?s)<tool_call>\s*<name>(.*?)</name>\s*<args>(.*?)</args>(?:\s*</tool_call>)?").unwrap().captures(&content) {
                        let tool_name = caps.get(1).unwrap().as_str().trim();
                        let tool_args_str = caps.get(2).unwrap().as_str().trim();
                        let parsed_args = serde_json::from_str(tool_args_str).unwrap_or_else(|_| {
                            serde_json::json!({"script": tool_args_str})
                        });
                        let dummy_scanner = crate::rag::scanner::CodebaseScanner::new(std::path::PathBuf::from(".")).await.unwrap();
                        let tool_res = crate::agents::tools::execute_tool(tool_name, parsed_args, &dummy_scanner, &self.mcp_manager).await;
                        let tool_output = match tool_res {
                            Ok(out) => out,
                            Err(e) => format!("Tool Execution Error: {}", e),
                        };
                        let tool_response_str = format!("\n<tool_response>\n{}\n</tool_response>\n", tool_output);
                        messages.push(ChatMessage::user(tool_response_str.clone()));
                        full_trajectory.push_str(&tool_response_str);
                        continue;
                    } else {
                        final_content = content;
                        break;
                    }
                }

                // --- Route: cloud models → genai ---
                match client.exec_chat_stream(model, chat_req, None).await {

                    Ok(mut stream) => {
                        let mut content_buf = String::new();
                        while let Some(chunk_res) = stream.stream.next().await {
                            match chunk_res {
                                Ok(event) => {
                                    if let genai::chat::ChatStreamEvent::Chunk(chunk) = event {
                                        let text = chunk.content;
                                        content_buf.push_str(&text);
                                        let _ = self.conductor_tx.send(ConductorMessage::WorkerChunk {
                                            node_id: self.node_id.clone(),
                                            content: text,
                                        }).await;
                                    }
                                }
                                Err(e) => {
                                    if content_buf.trim().is_empty() {
                                        let error_msg = clean_api_error(&e);
                                        let _ = self
                                            .conductor_tx
                                            .send(ConductorMessage::WorkerFailed {
                                                node_id: self.node_id.clone(),
                                                error: error_msg,
                                            })
                                            .await;
                                        success = false;
                                        break;
                                    } else {
                                        println!("[NYX] Ignored trailing stream error after successful chunks: {:?}", e);
                                    }
                                }
                            }
                        }
                        
                        let content = if content_buf.is_empty() {
                            "No response generated.".to_string()
                        } else {
                            content_buf
                        };
                        messages.push(ChatMessage::assistant(content.clone()));
                        full_trajectory.push_str(&content);
                        
                        // Check for tool call using regex
                        if let Some(caps) = regex::Regex::new(r"(?s)<tool_call>\s*<name>(.*?)</name>\s*<args>(.*?)</args>\s*</tool_call>").unwrap().captures(&content) {
                            let tool_name = caps.get(1).unwrap().as_str().trim();
                            let tool_args_str = caps.get(2).unwrap().as_str().trim();
                            
                            let _ = self
                                .conductor_tx
                                .send(ConductorMessage::WorkerUpdate {
                                    node_id: self.node_id.clone(),
                                    status: format!("Executing tool: {}", tool_name),
                                })
                                .await;
                                
                            // Parse args, fallback to raw string in case the LLM messes up JSON escaping
                            let parsed_args = serde_json::from_str(tool_args_str).unwrap_or_else(|_| {
                                serde_json::json!({"script": tool_args_str})
                            });

                            let dummy_scanner = crate::rag::scanner::CodebaseScanner::new(std::path::PathBuf::from(".")).await.unwrap();
                            let tool_res = crate::agents::tools::execute_tool(tool_name, parsed_args, &dummy_scanner, &self.mcp_manager).await;
                            
                            let tool_output = match tool_res {
                                Ok(out) => out,
                                Err(e) => format!("Tool Execution Error: {}", e),
                            };
                            
                            let tool_response_str = format!("\n<tool_response>\n{}\n</tool_response>\n", tool_output);
                            messages.push(ChatMessage::user(tool_response_str.clone()));
                            full_trajectory.push_str(&tool_response_str);
                            continue;
                        } else {
                            // No tool call, treat as final answer
                            final_content = content;
                            break;
                        }
                    }
                    Err(e) => {
                        let error_msg = clean_api_error(&e);
                        let _ = self
                            .conductor_tx
                            .send(ConductorMessage::WorkerFailed {
                                node_id: self.node_id.clone(),
                                error: error_msg,
                            })
                            .await;
                        success = false;
                        break;
                    }
                }
            }

            if !success {
                return;
            }

            // Programmatic Constraint Verification
            if let Err(violation) = validate_output(&final_content, &constraints) {
                if attempts >= max_attempts {
                    let _ = self
                        .conductor_tx
                        .send(ConductorMessage::WorkerFailed {
                            node_id: self.node_id.clone(),
                            error: format!("Constraint satisfaction failed after {} attempts. Last violation: {}", max_attempts, violation),
                        })
                        .await;
                    return;
                } else {
                    let _ = self
                        .conductor_tx
                        .send(ConductorMessage::WorkerUpdate {
                            node_id: self.node_id.clone(),
                            status: format!("Constraint violation: {}. Rejection sampling triggered...", violation),
                        })
                        .await;
                    
                    // Iterative Refinement Feedback
                    current_task_description = format!(
                        "{}\n\n[SYSTEM REJECTION]: Your previous output failed programmatic validation.\nViolation: {}\nYou must rewrite your response and strictly adhere to the constraints. Remember you can use verify_output to check your work first.", 
                        task_description, violation
                    );
                    continue;
                }
            }

            let _ = self
                .conductor_tx
                .send(ConductorMessage::WorkerComplete {
                    node_id: self.node_id.clone(),
                    result: full_trajectory,
                })
                .await;
            return;
        }
    }
}

// -----------------------------------------------------------------------------
// Deterministic Validation Middleware
// -----------------------------------------------------------------------------

struct Constraints {
    forbidden_strings: Vec<String>,
    exact_lines: Option<usize>,
}

fn parse_constraints(task: &str) -> Constraints {
    let mut constraints = Constraints {
        forbidden_strings: Vec::new(),
        exact_lines: None,
    };
    let task_lower = task.to_lowercase();
    
    // Check for "e-blackout" or "no letter e"
    if task_lower.contains("e-blackout") || task_lower.contains("no letter e") || task_lower.contains("without the letter e") || task_lower.contains("e blackout") {
        constraints.forbidden_strings.push("e".to_string());
        constraints.forbidden_strings.push("E".to_string());
    }
    
    // Check for "no letter a"
    if task_lower.contains("no letter a") || task_lower.contains("without the letter a") {
        constraints.forbidden_strings.push("a".to_string());
        constraints.forbidden_strings.push("A".to_string());
    }
    
    // Check for "no letter o"
    if task_lower.contains("no letter o") || task_lower.contains("without the letter o") {
        constraints.forbidden_strings.push("o".to_string());
        constraints.forbidden_strings.push("O".to_string());
    }

    // Check for line counts: "exactly X lines"
    if let Some(idx) = task_lower.find("exactly ") {
        let remainder = &task_lower[idx + "exactly ".len()..];
        if let Some(space_idx) = remainder.find(" lines") {
            let num_str = &remainder[..space_idx];
            if let Ok(num) = num_str.parse::<usize>() {
                constraints.exact_lines = Some(num);
            }
        }
    }
    
    constraints
}

fn validate_output(output: &str, constraints: &Constraints) -> Result<(), String> {
    for forbidden in &constraints.forbidden_strings {
        if output.contains(forbidden) {
            // Provide a precise error showing exactly where the violation occurred to help the LLM fix it
            let words: Vec<&str> = output.split_whitespace().filter(|w| w.contains(forbidden)).take(5).collect();
            return Err(format!("Output contains forbidden character/string '{}'. Found in words: {:?}", forbidden, words));
        }
    }
    
    if let Some(exact) = constraints.exact_lines {
        // Strip markdown code block wrappers for more accurate line counting of the code itself
        let mut clean_output = output.to_string();
        if clean_output.starts_with("```") {
            clean_output = clean_output.lines().skip(1).filter(|l| !l.starts_with("```")).collect::<Vec<&str>>().join("\n");
        }
        
        let lines: Vec<&str> = clean_output.lines().filter(|l| !l.trim().is_empty()).collect();
        if lines.len() != exact {
            return Err(format!("Output must be exactly {} lines of code/text, but was {} lines", exact, lines.len()));
        }
    }
    
    Ok(())
}

/// Calls the HuggingFace Inference API (OpenAI-compatible chat completions endpoint).
/// Used for nyx-native models (ending in -native or starting with nyx-).
/// Streams response chunks back through the conductor sender.
///
/// Model ID format: the `-native` suffix is stripped and the rest is used as the HF model ID.
/// Example: "meta-llama/Llama-3.2-3B-Instruct-native" → "meta-llama/Llama-3.2-3B-Instruct"
async fn call_hf_inference(
    api_key: &str,
    model_id: &str,
    messages: &[genai::chat::ChatMessage],
    node_id: &str,
    conductor_tx: &tokio::sync::mpsc::Sender<super::protocol::ConductorMessage>,
) -> String {
    // Strip the -native suffix if present
    let hf_model = model_id.strip_suffix("-native").unwrap_or(model_id);

    // Build messages in OpenAI format
    let hf_messages: Vec<serde_json::Value> = messages.iter().map(|m| {
        let role = match m.role {
            genai::chat::ChatRole::System => "system",
            genai::chat::ChatRole::User => "user",
            genai::chat::ChatRole::Assistant => "assistant",
            genai::chat::ChatRole::Tool => "tool",
        };
        serde_json::json!({
            "role": role,
            "content": m.content.text_as_str().unwrap_or("")
        })
    }).collect();

    let body = serde_json::json!({
        "model": hf_model,
        "messages": hf_messages,
        "stream": false,
        "max_tokens": 4096
    });

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
    {
        Ok(c) => c,
        Err(e) => return format!("[HF Error: Failed to build client: {}]", e),
    };

    let result = client
        .post("https://api-inference.huggingface.co/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await;

    let response = match result {
        Ok(r) => r,
        Err(e) => return format!("[HF Error: Request failed: {}]", e),
    };

    let json: serde_json::Value = match response.json().await {
        Ok(j) => j,
        Err(e) => return format!("[HF Error: Failed to parse response: {}]", e),
    };

    let content = json
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if !content.is_empty() {
        // Forward as a single chunk so the frontend sees it
        let _ = conductor_tx.send(super::protocol::ConductorMessage::WorkerChunk {
            node_id: node_id.to_string(),
            content: content.clone(),
        }).await;
    }

    content
}

/// Calls the local llama-server sidecar (running on 127.0.0.1:8080).
/// Used for nyx-local models (ending in -local).
async fn call_local_inference(
    _model_id: &str, // llama-server ignores this and uses the loaded model
    messages: &[genai::chat::ChatMessage],
    node_id: &str,
    conductor_tx: &tokio::sync::mpsc::Sender<super::protocol::ConductorMessage>,
) -> String {
    // Build messages in OpenAI format
    let local_messages: Vec<serde_json::Value> = messages.iter().map(|m| {
        let role = match m.role {
            genai::chat::ChatRole::System => "system",
            genai::chat::ChatRole::User => "user",
            genai::chat::ChatRole::Assistant => "assistant",
            genai::chat::ChatRole::Tool => "tool",
        };
        serde_json::json!({
            "role": role,
            "content": m.content.text_as_str().unwrap_or("")
        })
    }).collect();

    let body = serde_json::json!({
        "messages": local_messages,
        "stream": true,
        "max_tokens": 4096,
        "temperature": 0.2
    });

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300)) // Local inference can be slow
        .build()
    {
        Ok(c) => c,
        Err(e) => return format!("[Local Error: Failed to build client: {}]", e),
    };

    let result = client
        .post("http://127.0.0.1:8080/v1/chat/completions")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await;

    let mut response = match result {
        Ok(r) => r,
        Err(e) => return format!("[Local Error: Request failed (Is the local model server running?): {}]", e),
    };


    let mut full_content = String::new();
    let mut buffer = String::new();

    while let Some(chunk_res) = response.chunk().await.unwrap_or(None) {
        let chunk_str = String::from_utf8_lossy(&chunk_res);
        buffer.push_str(&chunk_str);

        // Process full lines
        while let Some(newline_idx) = buffer.find('\n') {
            let line = buffer[..newline_idx].trim().to_string();
            buffer = buffer[newline_idx + 1..].to_string();

            if line.starts_with("data: ") {
                let data = &line[6..];
                if data == "[DONE]" {
                    continue;
                }
                
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(content) = json.pointer("/choices/0/delta/content").and_then(|v| v.as_str()) {
                        if !content.is_empty() {
                            full_content.push_str(content);
                            let _ = conductor_tx.send(super::protocol::ConductorMessage::WorkerChunk {
                                node_id: node_id.to_string(),
                                content: content.to_string(),
                            }).await;
                        }
                    }
                }
            }
        }
    }

    full_content
}

fn clean_api_error(err: &genai::Error) -> String {
    let err_str = format!("{:?}", err);
    
    // Try to find the message in the "message": String("...") format
    if let Some(caps) = regex::Regex::new(r#""message":\s*String\("([^"]+)"\)"#).unwrap().captures(&err_str) {
        return caps.get(1).unwrap().as_str().to_string();
    }
    
    // Fallback: try to find standard JSON "message": "..."
    if let Some(caps) = regex::Regex::new(r#""message":\s*"([^"]+)"#).unwrap().captures(&err_str) {
        return caps.get(1).unwrap().as_str().to_string();
    }
    
    // Check for common status codes if parsing fails
    if err_str.contains("503") || err_str.contains("UNAVAILABLE") {
        "This model is currently experiencing high demand. Please try again later.".to_string()
    } else if err_str.contains("429") || err_str.contains("RESOURCE_EXHAUSTED") {
        "Rate limit reached (429). Please wait a moment or switch models.".to_string()
    } else if err_str.contains("403") || err_str.contains("PERMISSION_DENIED") {
        "Access Denied (403). Please verify your API key is correct and valid.".to_string()
    } else {
        err_str
    }
}

