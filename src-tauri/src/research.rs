use serde_json::json;
use tauri::ipc::Channel;

use serde::{Deserialize, Serialize};
use crate::commands::llm::{execute_llm_stream, UnifiedRequest, UnifiedMessage};
use futures_util::future::join_all;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchQuery {
    pub prompt: String,
    pub depth_limit: u32,
    pub provider: Option<String>,
    pub model_id: Option<String>,
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubQuery {
    pub query: String,
    pub intent: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannerResponse {
    pub sub_queries: Vec<SubQuery>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchState {
    pub original_prompt: String,
    pub current_depth: u32,
    pub max_depth: u32,
    pub gathered_context: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceEntry {
    pub url: String,
    pub title: String,
    pub snippet: String,
}


async fn run_planner(
    query: &str,
    provider: String,
    model_id: String,
    api_key: String,
) -> Result<PlannerResponse, String> {
    let req = UnifiedRequest {
        provider,
        endpoint_override: None,
        model_id,
        messages: vec![UnifiedMessage { role: "user".to_string(), content: json!(query) }],
        system_instruction: Some("You are an expert research planner. Break down the user's prompt into 2-4 objective, targeted search queries. Output strictly valid JSON matching this schema: { \"sub_queries\": [ { \"query\": \"search query here\", \"intent\": \"why this is needed\" } ] }".to_string()),
        api_key,
        temperature: Some(0.3),
        max_tokens: Some(1024),
        event_name: None,
        tools: None,
    };
    
    let mut rx = execute_llm_stream(&req).await?;
    let mut full_text = String::new();
    while let Some(msg) = rx.recv().await {
        match msg {
            Ok(payload) => {
                if payload.event_type == "text" {
                    if let Some(c) = payload.content {
                        full_text.push_str(&c);
                    }
                }
            }
            Err(e) => return Err(e),
        }
    }
    
    let cleaned = full_text.trim().trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
    let response: PlannerResponse = serde_json::from_str(cleaned).map_err(|e| format!("Failed to parse planner JSON: {}. Response: {}", e, cleaned))?;
    Ok(response)
}

async fn get_search_urls(query: &str) -> Vec<String> {
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10)).build().unwrap_or_default();
    let url = format!("https://html.duckduckgo.com/html/?q={}", urlencoding::encode(query));
    let mut urls = Vec::new();
    
    if let Ok(res) = client.get(&url).header("User-Agent", "Mozilla/5.0").send().await {
        if let Ok(text) = res.text().await {
            let re = regex::Regex::new(r#"(?s)<a[^>]*class="result__url"[^>]*href="([^"]+)"[^>]*>"#).unwrap();
            for cap in re.captures_iter(&text) {
                if let Some(m) = cap.get(1) {
                    let mut decoded = m.as_str().to_string();
                    if decoded.starts_with("//duckduckgo.com/l/?uddg=") {
                        let parts: Vec<&str> = decoded.split("uddg=").collect();
                        if parts.len() > 1 {
                            let url_part = parts[1].split('&').next().unwrap_or("");
                            if let Ok(dec) = urlencoding::decode(url_part) {
                                decoded = dec.to_string();
                            }
                        }
                    }
                    if !urls.contains(&decoded) && !decoded.contains("duckduckgo") {
                        urls.push(decoded);
                    }
                }
                if urls.len() >= 2 { // Keep it fast, top 2 URLs per query
                    break;
                }
            }
        }
    }
    urls
}

async fn fetch_jina_markdown(url: &str) -> String {
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(30)).build().unwrap_or_default();
    let jina_url = format!("https://r.jina.ai/{}", url);
    match client.get(&jina_url).send().await {
        Ok(res) => res.text().await.unwrap_or_default(),
        Err(_) => "".to_string(),
    }
}

async fn run_publisher(
    prompt: &str,
    context: Vec<String>,
    provider: String,
    model_id: String,
    api_key: String,
    on_progress: Channel<serde_json::Value>,
) -> Result<String, String> {
    let context_text = context.join("\n\n---\n\n");
    let system_instruction = format!(
        "You are an expert deep research analyst. Using ONLY the provided context, write a comprehensive and structured markdown report answering the user's prompt. Use clear headings, bullet points, and comparative tables where appropriate. Ensure you insert inline citation markers (e.g., [1], [2]) corresponding to the 'Source: <URL>' blocks provided in the context.\n\nContext:\n{}",
        context_text
    );

    let req = UnifiedRequest {
        provider,
        endpoint_override: None,
        model_id,
        messages: vec![UnifiedMessage { role: "user".to_string(), content: json!(prompt) }],
        system_instruction: Some(system_instruction),
        api_key,
        temperature: Some(0.4),
        max_tokens: Some(8000),
        event_name: None,
        tools: None,
    };
    
    let mut rx = execute_llm_stream(&req).await?;
    let mut final_report = String::new();
    while let Some(msg) = rx.recv().await {
        match msg {
            Ok(payload) => {
                if payload.event_type == "text" {
                    if let Some(c) = payload.content {
                        final_report.push_str(&c);
                        let _ = on_progress.send(json!({
                            "type": "result_chunk",
                            "content": c
                        }));
                    }
                }
            }
            Err(e) => return Err(e),
        }
    }
    
    Ok(final_report)
}

#[tauri::command]
pub async fn start_deep_research(
    query: ResearchQuery,
    on_progress: Channel<serde_json::Value>
) -> Result<serde_json::Value, String> {
    let _ = on_progress.send(json!({
        "type": "progress",
        "message": format!("Starting deep research for: {}", query.prompt)
    }));

    let provider = query.provider.unwrap_or_else(|| "openrouter".to_string());
    let model_id = query.model_id.unwrap_or_else(|| "google/gemini-2.5-flash".to_string());
    let api_key = query.api_key.unwrap_or_default();
    
    if api_key.is_empty() && provider != "nyx-native" {
        return Err("API key is required for cloud providers".to_string());
    }

    let _ = on_progress.send(json!({
        "type": "progress",
        "message": "Planner Agent is breaking down the query..."
    }));

    let planner_res = run_planner(&query.prompt, provider.clone(), model_id.clone(), api_key.clone()).await?;
    
    let _ = on_progress.send(json!({
        "type": "progress",
        "message": format!("Planner generated {} sub-queries. Starting Execution Agents...", planner_res.sub_queries.len())
    }));

    let mut tasks = vec![];
    for sq in planner_res.sub_queries {
        let prog = on_progress.clone();
        let query = sq.query.clone();
        tasks.push(tokio::spawn(async move {
            // Hard 20s timeout per sub-query so one slow/hung request
            // doesn't block the entire pipeline.
            let task_result = tokio::time::timeout(
                std::time::Duration::from_secs(20),
                async move {
                    let _ = prog.send(json!({
                        "type": "progress",
                        "message": format!("Searching for: {}", query)
                    }));

                    let urls = get_search_urls(&query).await;
                    let mut page_texts = vec![];
                    let mut page_sources: Vec<SourceEntry> = vec![];

                    for url in urls {
                        let _ = prog.send(json!({
                            "type": "progress",
                            "message": format!("Reading: {}", url)
                        }));
                        let md = fetch_jina_markdown(&url).await;
                        if !md.is_empty() {
                            let title = md.lines()
                                .find(|l| !l.trim().is_empty())
                                .unwrap_or(&url)
                                .trim_start_matches('#')
                                .trim()
                                .to_string();
                            let snippet: String = md.chars().take(200).collect();
                            page_texts.push(format!("Source: {}\n\n{}", url, md));
                            page_sources.push(SourceEntry { url: url.clone(), title, snippet });
                        }
                    }
                    (page_texts, page_sources)
                }
            ).await;

            // On timeout return empty results rather than propagating an error.
            task_result.unwrap_or_default()
        }));

    }
    
    // Each sub-query runs in its own task with a hard 20-second timeout.
    // If DuckDuckGo or Jina hangs, that task fails gracefully rather than
    // stalling the entire pipeline for up to the reqwest 120s timeout.
    let results = join_all(tasks).await;
    let mut all_context = vec![];
    let mut all_sources: Vec<SourceEntry> = vec![];
    
    for (texts, sources) in results.into_iter().flatten() {
        all_context.extend(texts);
        all_sources.extend(sources);
    }

    let _ = on_progress.send(json!({
        "type": "progress",
        "message": format!("Execution complete. Read {} sources. Synthesizing final report...", all_context.len())
    }));

    let final_report = run_publisher(
        &query.prompt,
        all_context,
        provider,
        model_id,
        api_key,
        on_progress.clone(),
    ).await?;

    let _ = on_progress.send(json!({
        "type": "progress",
        "message": "Deep Research complete."
    }));

    Ok(json!({
        "source": "publisher-agent",
        "data": final_report,
        "sources": all_sources
    }))
}

