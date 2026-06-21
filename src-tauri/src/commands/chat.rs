use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};
use sqlx::SqlitePool;
use reqwest::Client;
use std::time::Instant;
use crate::commands::llm::{execute_llm_stream, UnifiedRequest};
use tiktoken_rs::cl100k_base;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatConfig {
    pub provider: String,
    pub model: String,
    pub prompt: String,
    pub history: Vec<Value>,
    pub api_key: Option<String>,
    pub system_instruction: Option<String>,
    pub settings: Option<Value>,
    pub max_search_results: Option<usize>,
    pub max_context_length: Option<usize>,
    pub web_search_enabled: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TavilySearchResponse {
    pub query: String,
    pub results: Vec<TavilySearchResult>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TavilySearchResult {
    pub title: String,
    pub url: String,
    pub content: String,
    pub score: f64,
}

fn count_tokens(text: &str) -> usize {
    if let Ok(bpe) = cl100k_base() {
        bpe.encode_with_special_tokens(text).len()
    } else {
        text.len() / 4 // Fallback
    }
}

async fn perform_tavily_search(query: &str, api_key: &str) -> Result<Vec<TavilySearchResult>, String> {
    let client = Client::new();
    let res = client
        .post("https://api.tavily.com/search")
        .json(&json!({
            "api_key": api_key,
            "query": query,
            "search_depth": "advanced",
            "include_answer": false,
            "include_images": false,
            "include_raw_content": false,
            "max_results": 5
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Tavily search failed: {}", res.status()));
    }

    let parsed: TavilySearchResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(parsed.results)
}

#[tauri::command]
pub async fn stream_chat(
    app: AppHandle,
    _pool: State<'_, SqlitePool>,
    config: ChatConfig,
    event_name: String,
) -> Result<(), String> {
    let start_time = Instant::now();
    let _ = app.emit(&event_name, json!({"type": "thinking", "content": "Initializing chat context..."}));

    let system_prompt = config.system_instruction.unwrap_or_else(|| "You are NYX, an advanced AI assistant.".to_string());
    
    // 1. Context Truncation
    let mut current_tokens = count_tokens(&system_prompt);
    let max_tokens = config.max_context_length.unwrap_or(8000);
    
    let mut included_history = vec![];
    for msg in config.history.iter().rev() {
        let content = msg["content"].as_str().unwrap_or("");
        let msg_tokens = count_tokens(content);
        if current_tokens + msg_tokens > max_tokens {
            break;
        }
        current_tokens += msg_tokens;
        included_history.push(msg.clone());
    }
    included_history.reverse();

    // 2. Web Search
    let mut web_search_results = String::new();
    if config.web_search_enabled.unwrap_or(false) {
        let _ = app.emit(&event_name, json!({"type": "thinking", "content": "Searching the web with Tavily..."}));
        
        let tavily_api_key = std::env::var("TAVILY_API_KEY").unwrap_or_default();
        if !tavily_api_key.is_empty() {
            match perform_tavily_search(&config.prompt, &tavily_api_key).await {
                Ok(results) => {
                    let mut search_context = String::from("\n\n[WEB SEARCH RESULTS]\n");
                    for (i, res) in results.iter().enumerate() {
                        search_context.push_str(&format!("[{}] {}\nURL: {}\n{}\n\n", i + 1, res.title, res.url, res.content));
                        
                        // Emit citation
                        let _ = app.emit(&event_name, json!({
                            "type": "citation",
                            "metadata": {
                                "id": (i + 1).to_string(),
                                "url": res.url,
                                "title": res.title,
                                "snippet": res.content,
                                "source": "Tavily"
                            }
                        }));
                    }
                    search_context.push_str("[END WEB SEARCH]\nPlease cite your sources.\n");
                    web_search_results = search_context;
                }
                Err(e) => {
                    let _ = app.emit(&event_name, json!({"type": "error", "content": format!("Web search failed: {}", e)}));
                }
            }
        } else {
            let _ = app.emit(&event_name, json!({"type": "error", "content": "Tavily API key not configured (set TAVILY_API_KEY env var)"}));
        }
    }

    let final_prompt = if !web_search_results.is_empty() {
        format!("{}\n\n{}", web_search_results, config.prompt)
    } else {
        config.prompt.clone()
    };

    // Prepare unified request
    let mut messages = included_history;
    messages.push(json!({
        "role": "user",
        "content": final_prompt
    }));

    let mut unified_messages = vec![];
    for m in messages {
        unified_messages.push(crate::commands::llm::UnifiedMessage {
            role: m["role"].as_str().unwrap_or("user").to_string(),
            content: m["content"].clone(),
        });
    }

    let req = UnifiedRequest {
        provider: config.provider.clone(),
        endpoint_override: None,
        model_id: config.model.clone(),
        messages: unified_messages,
        system_instruction: Some(system_prompt),
        api_key: config.api_key.unwrap_or_default(),
        temperature: config.settings.as_ref().and_then(|s| s["temperature"].as_f64()).map(|f| f as f32),
        max_tokens: config.settings.as_ref().and_then(|s| s["max_tokens"].as_u64()).map(|u| u as u32),
        event_name: event_name.clone(),
        tools: None,
    };

    // 3. Stream Execution
    let _ = app.emit(&event_name, json!({"type": "thinking", "content": "Generating response..."}));

    let stream_result = execute_llm_stream(&req).await;

    let mut rx = match stream_result {
        Ok(rx) => rx,
        Err(e) => {
            let _ = app.emit(&event_name, json!({"type": "error", "content": format!("LLM Stream Error: {}", e)}));
            return Err(e);
        }
    };

    // Spawn task to forward events from rx to app.emit
    let app_clone = app.clone();
    let event_name_clone = event_name.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(msg) = rx.recv().await {
            match msg {
                Ok(payload) => {
                    let _ = app_clone.emit(&event_name_clone, payload);
                }
                Err(e) => {
                    let _ = app_clone.emit(&event_name_clone, json!({"type": "error", "content": e}));
                }
            }
        }
    });

    // 4. Send metrics (we don't wait for stream to finish here, but for simple chat it's fine)
    let latency = start_time.elapsed().as_millis();
    let _ = app.emit(&event_name, json!({
        "type": "metrics",
        "metadata": {
            "latencyMs": latency as u64,
            "modelName": config.model
        }
    }));
    let _ = app.emit(&event_name, json!({"type": "done"}));

    Ok(())
}
