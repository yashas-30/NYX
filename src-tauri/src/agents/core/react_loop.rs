// ─────────────────────────────────────────────────────────────────────────────
// NYX — ReAct Autonomous Tool Execution Loop (Safe Execution Engine)
// ─────────────────────────────────────────────────────────────────────────────

use crate::agents::tools::WorkspaceFsTools;
use crate::guardrails::{args_fingerprint, check_loop_detection, sanitize_output, validate_agent_input, validate_generated_output, validate_tool_args};
use crate::llm::gateway::{DynamicModelRegistry, LiveQuotaLedger, ModelRole};
use crate::llm::{execute_any_stream, UnifiedMessage, UnifiedRequest};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallRequest {
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentExecutionStep {
    pub iteration: u32,
    pub thought: String,
    pub tool_name: Option<String>,
    pub tool_args: Option<serde_json::Value>,
    pub tool_result: Option<String>,
    pub is_error: bool,
    pub is_finished: bool,
}

pub struct ReActLoopEngine {
    pub fs_tools: Arc<WorkspaceFsTools>,
    pub registry: Arc<DynamicModelRegistry>,
    pub quota_ledger: Arc<LiveQuotaLedger>,
    pub cancel_flag: Arc<AtomicBool>,
}

impl ReActLoopEngine {
    pub fn new(
        fs_tools: Arc<WorkspaceFsTools>,
        registry: Arc<DynamicModelRegistry>,
        quota_ledger: Arc<LiveQuotaLedger>,
        cancel_flag: Arc<AtomicBool>,
    ) -> Self {
        Self {
            fs_tools,
            registry,
            quota_ledger,
            cancel_flag,
        }
    }

    /// Executes an autonomous ReAct loop on a specific task
    pub async fn execute_task(
        &self,
        app: &AppHandle,
        task_description: &str,
        max_iterations: u32,
        on_step: Channel<AgentExecutionStep>,
    ) -> Result<String, String> {
        let validated_task = validate_agent_input(task_description);
        if !validated_task.allowed {
            return Err(validated_task.violation.unwrap_or_else(|| "Agent input rejected".to_string()));
        }

        let mut conversation_history: Vec<UnifiedMessage> = Vec::new();
        let mut final_answer = String::new();
        let mut tool_history: Vec<(String, String)> = Vec::new();

        let system_instruction = r#"You are an expert autonomous software engineer and problem solver working within a sandboxed codebase.
You have access to the following safe tools:
1. `read_file`: {"path": "relative/path"} - Read a file with line numbers.
2. `write_to_file`: {"path": "relative/path", "content": "file content"} - Create or overwrite a file in the project.
3. `replace_in_file`: {"path": "relative/path", "search": "exact code block", "replace": "new code block"} - Surgical diff modification.
4. `delete_file`: {"path": "relative/path"} - Delete a file in the project.
5. `list_directory`: {"path": "relative/dir", "recursive": boolean} - List files in the workspace.
6. `grep_search`: {"query": "text to search", "path_filter": optional "subfolder"} - Search text in project files.
7. `web_search`: {"query": "search query"} - Search the web for documentation or technical facts.
8. `search_memory`: {"query": "search query"} - Search the agent's episodic memory for relevant past context.
9. `run_terminal_command`: {"command": "command string"} - Execute build, test, or inspection commands safely.
10. `call_mcp_tool`: {"server": "server_name", "tool": "tool_name", "arguments": {}} - Call external MCP tools.

REPRESENT YOUR THOUGHT PROCESS AND TOOL ACTION USING STRICT JSON:
If you need to call a tool:
```json
{
  "thought": "Your detailed reasoning on what to inspect or modify next",
  "tool": "tool_name",
  "args": { ... tool parameters ... },
  "finish": false
}
```

When your task is completely done and verified:
```json
{
  "thought": "Summary of what was completed and verified",
  "tool": null,
  "args": null,
  "finish": true,
  "final_response": "Comprehensive description of changes made"
}
```

RULES:
- Always read a file before modifying it with `replace_in_file`.
- Keep diffs surgical and minimal.
- If a tool returns an error, carefully inspect the feedback and correct your search block or path."#;

        let mut task_context = validated_task.sanitized.unwrap_or_else(|| task_description.to_string());
        if let Some(scanner) = app.try_state::<Arc<crate::rag::scanner::CodebaseScanner>>() {
            if scanner.is_indexed() {
                if let Ok(results) = scanner.search(task_description, 5).await {
                    let context = results.into_iter()
                        .map(|(path, content, _)| format!("[Workspace: {}]\n{}", path, content))
                        .collect::<Vec<_>>()
                        .join("\n\n");
                    if !context.is_empty() {
                        task_context.push_str("\n\n[Workspace RAG Context]\n");
                        task_context.push_str(&context.chars().take(12000).collect::<String>());
                    }
                }
            }
        }
        if let Some(memory) = app.try_state::<Arc<crate::rag::turbovec_store::TurbovecStore>>() {
            let memories = memory.search_memory(task_description, 5).await;
            if !memories.is_empty() {
                task_context.push_str("\n\n[Relevant Agent Memory]\n");
                task_context.push_str(&memories.into_iter()
                    .map(|(text, _)| text)
                    .collect::<Vec<_>>()
                    .join("\n\n")
                    .chars().take(12000).collect::<String>());
            }
        }

        conversation_history.push(UnifiedMessage {
            role: "user".to_string(),
            content: json!(format!("Task to execute: {}", task_context)),
        });

        for iteration in 1..=max_iterations {
            if self.cancel_flag.load(Ordering::Relaxed) {
                return Err("Agent execution cancelled by user".to_string());
            }

            // Select the healthiest Code/Artifact model dynamically
            let model_spec = self
                .registry
                .select_model_for_role(ModelRole::CodeAndArtifactEngine, &self.quota_ledger)
                .await?;

            let req = UnifiedRequest {
                provider: model_spec.provider,
                endpoint_override: None,
                model_id: model_spec.id,
                messages: conversation_history.clone(),
                system_instruction: Some(system_instruction.to_string()),
                api_key: String::new(), // Will be restored from vault in gateway
                temperature: Some(0.2),
                max_tokens: Some(4096),
                event_name: None,
                tools: None,
                response_format: None,
                stop: None,
                repeat_penalty: None,
                presence_penalty: None,
                frequency_penalty: None,
                top_k: None,
                top_p: None,
                execution_mode: Some("chat".to_string()),
                reasoning_enabled: Some(false),
                thinking_level: None,
                context_window: None,
                capabilities: None,
                tool_choice: None,
                web_search_enabled: false,
                agent_mode: None,
            };

            let mut rx = execute_any_stream(app, &req).await?;
            let mut step_response = String::new();

            while let Some(msg) = rx.recv().await {
                if let Ok(payload) = msg {
                    if payload.event_type == "text" {
                        if let Some(c) = payload.content {
                            step_response.push_str(&c);
                        }
                    }
                }
            }

            // Parse ReAct JSON block
            let cleaned = extract_json_block(&step_response);
            let parsed_action: serde_json::Value = match serde_json::from_str(&cleaned) {
                Ok(v) => v,
                Err(_) => {
                    // If the model responded in plain natural language without invoking tools, treat it as immediate final response
                    final_answer = sanitize_output(step_response.trim()).0;
                    validate_generated_output(&final_answer)?;
                    let _ = on_step.send(AgentExecutionStep {
                        iteration,
                        thought: "Direct response".to_string(),
                        tool_name: None,
                        tool_args: None,
                        tool_result: Some(final_answer.clone()),
                        is_error: false,
                        is_finished: true,
                    });
                    break;
                }
            };

            let thought = parsed_action["thought"].as_str().unwrap_or("").to_string();
            let is_finish = parsed_action["finish"].as_bool().unwrap_or(false);

            if is_finish {
                final_answer = parsed_action["final_response"]
                    .as_str()
                    .unwrap_or(&thought)
                    .to_string();
                final_answer = sanitize_output(&final_answer).0;
                validate_generated_output(&final_answer)?;

                let _ = on_step.send(AgentExecutionStep {
                    iteration,
                    thought,
                    tool_name: None,
                    tool_args: None,
                    tool_result: Some(final_answer.clone()),
                    is_error: false,
                    is_finished: true,
                });
                break;
            }

            let tool_name = parsed_action["tool"].as_str().unwrap_or("").to_string();
            let tool_args = parsed_action.get("args").cloned().unwrap_or(json!({}));

            if tool_name.is_empty() {
                return Err("Agent produced an empty tool name without finishing".to_string());
            }
            validate_tool_args(&tool_name, &tool_args)?;
            let fingerprint = args_fingerprint(&tool_args);
            if check_loop_detection(&tool_history, &tool_name, &fingerprint, 3) {
                return Err(format!("Agent loop detected for tool '{}'", tool_name));
            }
            tool_history.push((tool_name.clone(), fingerprint));

            let _ = on_step.send(AgentExecutionStep {
                iteration,
                thought: thought.clone(),
                tool_name: Some(tool_name.clone()),
                tool_args: Some(tool_args.clone()),
                tool_result: None,
                is_error: false,
                is_finished: false,
            });

            // Execute the selected safe tool
            let (tool_result, is_error) = self.dispatch_safe_tool(app, &tool_name, &tool_args).await;

            // Cap observation text at 4,000 characters to prevent context window bloat
            let bounded_result: String = tool_result.chars().take(4000).collect();

            let _ = on_step.send(AgentExecutionStep {
                iteration,
                thought: thought.clone(),
                tool_name: Some(tool_name.clone()),
                tool_args: Some(tool_args),
                tool_result: Some(bounded_result.clone()),
                is_error,
                is_finished: false,
            });

            conversation_history.push(UnifiedMessage {
                role: "assistant".to_string(),
                content: json!(step_response),
            });

            conversation_history.push(UnifiedMessage {
                role: "user".to_string(),
                content: json!(format!("Tool Observation ({}):\n{}", tool_name, bounded_result)),
            });
        }

        if final_answer.is_empty() {
            final_answer = "Agent reached maximum iteration limit.".to_string();
        }

        let sanitized = sanitize_output(&final_answer).0;
        validate_generated_output(&sanitized)?;
        Ok(sanitized)
    }

    async fn dispatch_safe_tool(&self, app: &AppHandle, name: &str, args: &serde_json::Value) -> (String, bool) {
        match name {
            "read_file" => {
                let path = args["path"].as_str().unwrap_or("");
                match self.fs_tools.read_file(path).await {
                    Ok(res) => (res.content, false),
                    Err(e) => (e, true),
                }
            }
            "write_to_file" => {
                let path = args["path"].as_str().unwrap_or("");
                let content = args["content"].as_str().unwrap_or("");
                match self.fs_tools.write_to_file(path, content).await {
                    Ok(msg) => (msg, false),
                    Err(e) => (e, true),
                }
            }
            "replace_in_file" => {
                let path = args["path"].as_str().unwrap_or("");
                let search = args["search"].as_str().unwrap_or("");
                let replace = args["replace"].as_str().unwrap_or("");
                match self.fs_tools.replace_in_file(path, search, replace).await {
                    Ok(msg) => (msg, false),
                    Err(e) => (e, true),
                }
            }
            "delete_file" => {
                let path = args["path"].as_str().unwrap_or("");
                match self.fs_tools.delete_file(path).await {
                    Ok(msg) => (msg, false),
                    Err(e) => (e, true),
                }
            }
            "list_directory" => {
                let path = args["path"].as_str().unwrap_or(".");
                let recursive = args["recursive"].as_bool().unwrap_or(false);
                match self.fs_tools.list_directory(path, recursive).await {
                    Ok(list) => (list.join("\n"), false),
                    Err(e) => (e, true),
                }
            }
            "grep_search" => {
                let query = args["query"].as_str().unwrap_or("");
                let filter = args["path_filter"].as_str();
                match self.fs_tools.grep_search(query, filter).await {
                    Ok(matches) => (matches.join("\n"), false),
                    Err(e) => (e, true),
                }
            }
            "web_search" => {
                let query = args["query"].as_str().unwrap_or("");
                match crate::commands::tools::search_web_command(query.to_string(), Some(5), None, None).await {
                    Ok(res) => (res, false),
                    Err(e) => (format!("Search error: {}", e), true),
                }
            }
            "search_memory" => {
                let query = args["query"].as_str().unwrap_or("");
                if let Some(memory_store) = app.try_state::<Arc<crate::rag::turbovec_store::TurbovecStore>>() {
                    let results = memory_store.search_memory(query, 5).await;
                    if results.is_empty() {
                        ("No relevant memories found.".to_string(), false)
                    } else {
                        let text = results.into_iter().map(|(t, _)| t).collect::<Vec<_>>().join("\n");
                        (text, false)
                    }
                } else {
                    ("Memory store not available.".to_string(), true)
                }
            }
            "run_terminal_command" | "execute_command" => {
                let cmd_str = args["command"].as_str().unwrap_or("");
                if cmd_str.trim().is_empty() {
                    ("Error: Command is empty".to_string(), true)
                } else {
                    let res = crate::commands::tools::agent_execution::execute_tool(
                        app,
                        "run_terminal_command",
                        &args.to_string(),
                    ).await;
                    let is_err = res.starts_with("Error") || res.starts_with("Security blocked") || res.starts_with("Command failed");
                    (res, is_err)
                }
            }
            "call_mcp_tool" => {
                let server = args["server"].as_str().unwrap_or("");
                let tool = args["tool"].as_str().unwrap_or("");
                let tool_args = args.get("arguments").cloned().unwrap_or(serde_json::json!({}));
                let state = app.state::<crate::AppState>();
                match crate::commands::mcp::mcp_call_tool_internal(server, tool, tool_args, &state.mcp_manager).await {
                    Ok(val) => (val.to_string(), false),
                    Err(e) => (format!("MCP error: {}", e), true),
                }
            }
            other => (
                format!("Error: Tool '{}' is unknown or disabled for safety.", other),
                true,
            ),
        }
    }
}

fn extract_json_block(raw: &str) -> String {
    // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
    let stripped = if let Some(inner) = raw
        .trim()
        .strip_prefix("```json")
        .or_else(|| raw.trim().strip_prefix("```"))
    {
        inner.trim_end_matches('`').trim().to_string()
    } else {
        raw.trim().to_string()
    };

    // Find outermost JSON object
    if let (Some(s), Some(e)) = (stripped.find('{'), stripped.rfind('}')) {
        if s < e {
            return stripped[s..=e].to_string();
        }
    }
    stripped
}
