use serde_json::json;
use tauri::ipc::Channel;
use tauri::Manager;

use serde::{Deserialize, Serialize};
use crate::llm::{execute_any_stream, UnifiedRequest, UnifiedMessage};
use futures_util::future::join_all;
use std::time::Duration;
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchQuery {
    pub prompt: String,
    pub depth_limit: u32,
    pub provider: Option<String>,
    pub model_id: Option<String>,
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SubQuery {
    pub query: String,
    pub intent: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PlannerResponse {
    pub sub_queries: Vec<SubQuery>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GapFinderResponse {
    pub gaps: Vec<String>,
    pub follow_up_queries: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceEntry {
    pub url: String,
    pub title: String,
    pub snippet: String,
}

// ── Planner: decomposes the query into targeted sub-queries ──────────────────

async fn run_planner(
    app: &tauri::AppHandle,
    query: &str,
    provider: String,
    model_id: String,
    api_key: String,
) -> Result<PlannerResponse, String> {
    let planner_prompt = format!(
        r#"Topic to research: {}

Generate 5-7 targeted search queries covering these angles:
1. Core definition and overview
2. Recent developments and news (2024/2025/2026)
3. Technical details and implementation
4. Expert opinions, analysis, critiques
5. Statistical data and benchmarks
6. Real-world applications and use cases
7. Comparison with alternatives

Output ONLY valid JSON: {{"sub_queries": [{{"query": "specific search query", "intent": "why this angle matters"}}]}}"#,
        query
    );

    let req = UnifiedRequest {
        provider,
        endpoint_override: None,
        model_id,
        messages: vec![UnifiedMessage { role: "user".to_string(), content: json!(planner_prompt) }],
        system_instruction: Some(
            "You are a professional research planner. Generate diverse, targeted search queries \
             to comprehensively research a topic. Cover multiple perspectives and angles. \
             Output ONLY valid JSON with no markdown code fences or extra text."
                .to_string(),
        ),
        api_key,
        temperature: Some(0.3),
        max_tokens: Some(2048),
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
        reasoning_enabled: None,
        context_window: None,
        capabilities: None,
        tool_choice: None,
        web_search_enabled: false,
        agent_mode: None,
    };

    let mut rx = execute_any_stream(app, &req).await?;

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

    let cleaned = extract_json_payload(&full_text);

    let response: PlannerResponse = match serde_json::from_str::<PlannerResponse>(cleaned) {
        Ok(r) if !r.sub_queries.is_empty() => r,
        _ => {
            if let Ok(sqs) = serde_json::from_str::<Vec<SubQuery>>(cleaned) {
                PlannerResponse { sub_queries: sqs }
            } else if let Ok(strings) = serde_json::from_str::<Vec<String>>(cleaned) {
                PlannerResponse {
                    sub_queries: strings.into_iter().map(|q| SubQuery { intent: "research angle".to_string(), query: q }).collect()
                }
            } else {
                let angles = vec![
                    format!("{} overview architecture", query),
                    format!("{} technical specifications benchmarks", query),
                    format!("{} latest developments news 2025 2026", query),
                    format!("{} comparisons trade-offs", query),
                ];
                PlannerResponse {
                    sub_queries: angles.into_iter().map(|q| SubQuery { intent: "fallback angle".to_string(), query: q }).collect()
                }
            }
        }
    };
    Ok(response)
}

fn extract_json_payload(raw: &str) -> &str {
    let trimmed = raw.trim();
    if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
        if start < end {
            return &trimmed[start..=end];
        }
    }
    trimmed
}

// ── Gap Finder: LLM identifies missing aspects ───────────────────────────────

async fn run_gap_finder(
    app: &tauri::AppHandle,
    original_prompt: &str,
    gathered_context_summary: &str,
    provider: String,
    model_id: String,
    api_key: String,
) -> Result<GapFinderResponse, String> {
    let gap_prompt = format!(
        r#"Research Topic: {}

Context gathered so far (summary):
{}

Identify 3-5 important aspects still missing or insufficiently covered.
Generate specific follow-up search queries to fill those gaps.
Output ONLY valid JSON: {{"gaps": ["description"], "follow_up_queries": ["specific query"]}}"#,
        original_prompt,
        gathered_context_summary.chars().take(8000).collect::<String>()
    );

    let req = UnifiedRequest {
        provider,
        endpoint_override: None,
        model_id,
        messages: vec![UnifiedMessage { role: "user".to_string(), content: json!(gap_prompt) }],
        system_instruction: Some(
            "You are a research gap analyst. Identify what key information is missing from the \
             gathered context and generate targeted follow-up search queries. \
             Output ONLY valid JSON with no markdown fences or extra text."
                .to_string(),
        ),
        api_key,
        temperature: Some(0.3),
        max_tokens: Some(1024),
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
        reasoning_enabled: None,
        context_window: None,
        capabilities: None,
        tool_choice: None,
        web_search_enabled: false,
        agent_mode: None,
    };

    let mut rx = execute_any_stream(app, &req).await?;
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

    let cleaned = extract_json_payload(&full_text);

    let response: GapFinderResponse = match serde_json::from_str::<GapFinderResponse>(cleaned) {
        Ok(r) => r,
        _ => {
            if let Ok(queries) = serde_json::from_str::<Vec<String>>(cleaned) {
                GapFinderResponse {
                    gaps: vec!["Identified missing coverage angle".to_string()],
                    follow_up_queries: queries,
                }
            } else {
                GapFinderResponse {
                    gaps: vec![],
                    follow_up_queries: vec![],
                }
            }
        }
    };
    Ok(response)
}

#[derive(Debug, Clone)]
struct DiscoveredSearchResult {
    pub url: String,
    pub title: String,
    pub snippet: String,
}

/// Fetches search results and extracts up to `max_urls` unique valid URLs across distinct websites with metadata.
async fn get_search_results_meta(query: &str, max_urls: usize) -> Vec<DiscoveredSearchResult> {
    let mut items = Vec::new();
    let num_results = (max_urls * 2).max(15);
    if let Ok(raw_res) = crate::commands::tools::search_web_command(
        query.to_string(),
        Some(num_results),
        None,
        None,
    )
    .await
    {
        let blocks = raw_res.split("\n\n");
        for block in blocks {
            if items.len() >= max_urls {
                break;
            }
            let lines: Vec<&str> = block.lines().collect();
            if lines.is_empty() {
                continue;
            }
            let title_line = lines[0].trim();
            let title = title_line
                .trim_start_matches(|c: char| c == '[' || c.is_ascii_digit() || c == ']' || c == ' ')
                .trim()
                .to_string();

            let url = lines
                .iter()
                .find(|l| l.starts_with("URL:"))
                .map(|l| l.trim_start_matches("URL:").trim().to_string())
                .unwrap_or_default();

            let snippet = lines
                .iter()
                .filter(|l| l.starts_with("Content:"))
                .map(|l| l.trim_start_matches("Content:").trim())
                .collect::<Vec<_>>()
                .join(" ");

            if !url.is_empty() && url.starts_with("http") && !items.iter().any(|i: &DiscoveredSearchResult| i.url == url) {
                items.push(DiscoveredSearchResult {
                    url,
                    title: if title.is_empty() { "Web Source".to_string() } else { title },
                    snippet: if snippet.is_empty() { title_line.to_string() } else { snippet },
                });
            }
        }
    }
    items
}

// ── Full page fetching with robust timeout ───────────────────────────────────

/// Fetches a full page for research purposes.
/// - 8-second timeout for research deep extraction
/// - Returns (url, markdown_content) — empty string on any failure
async fn fetch_page_for_research(url: &str) -> (String, String) {
    let lower = url.to_lowercase();
    if lower.ends_with(".pdf")
        || lower.ends_with(".jpg")
        || lower.ends_with(".png")
        || lower.ends_with(".mp4")
        || lower.ends_with(".zip")
        || lower.ends_with(".exe")
    {
        return (url.to_string(), String::new());
    }

    // Check page cache first (populated by fetch_page_content)
    if let Some(cached) = crate::commands::tools::PAGE_CACHE.get(url) {
        if cached.timestamp.elapsed().as_secs() < 1800 {
            let content = cached.content.clone();
            drop(cached);
            return (url.to_string(), content);
        } else {
            drop(cached);
            crate::commands::tools::PAGE_CACHE.remove(url);
        }
    }

    let result = tokio::time::timeout(
        Duration::from_secs(8),
        crate::commands::tools::HTTP_CLIENT
            .get(url)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            )
            .header("Accept-Language", "en-US,en;q=0.9")
            .send(),
    )
    .await;

    match result {
        Ok(Ok(res)) if res.status().is_success() => {
            if let Some(len) = res.content_length() {
                if len > 15_000_000 {
                    return (url.to_string(), String::new());
                }
            }
            match res.text().await {
                Ok(html) => {
                    let markdown = crate::commands::tools::extract_clean_text(&html, url);
                    if markdown.trim().len() < 200 {
                        return (url.to_string(), String::new());
                    }
                    crate::commands::tools::PAGE_CACHE.insert(
                        url.to_string(),
                        crate::commands::tools::CachedSearchResult {
                            content: markdown.clone(),
                            timestamp: std::time::Instant::now(),
                        },
                    );
                    (url.to_string(), markdown)
                }
                Err(_) => (url.to_string(), String::new()),
            }
        }
        _ => (url.to_string(), String::new()),
    }
}

// ── Publisher: synthesizes the final research report ─────────────────────────

async fn run_publisher(
    app: &tauri::AppHandle,
    prompt: &str,
    context: Vec<String>,
    provider: String,
    model_id: String,
    api_key: String,
    on_progress: Channel<serde_json::Value>,
) -> Result<String, String> {
    let context_text = context.join("\n\n---\n\n");
    let system_instruction = format!(
        r#"You are a world-class principal research scientist and technical writer. Using ONLY the provided source context below (scraped web pages + vector memory), write an EXHAUSTIVE, DEEP, LONG-FORM RESEARCH PAPER answering the user's research topic.

CRITICAL INSTRUCTIONS FOR THINKING & RICH REPORT FORMATTING:
1. THINKING PROCESS: First, perform step-by-step reasoning evaluating EVERY source, comparing conflicting claims, analyzing methodologies, and planning section structure.
2. EXHAUSTIVE LENGTH: Target 3,000+ words for the report. Do NOT write brief summaries, short bullet lists, or high-level overviews. Provide deep, granular analysis.
3. EXECUTIVE SUMMARY: Include an executive summary callout block at the very top: > **EXECUTIVE SUMMARY**.
4. COMPARATIVE TABLES: Build comprehensive Markdown comparison tables, statistics tables, pros & cons, and technical specs.
5. MERMAID DIAGRAMS: Use Graphical Mermaid Diagrams (```mermaid\nflowchart TD ... \n```) when illustrating multi-step processes, timelines, or architectures. Do not output raw ASCII text box art. Always use clean Markdown formatting.
6. KEY TAKEAWAYS: Include highlighted callout cards (**KEY TAKEAWAYS**) in key chapters.
7. CHAPTER STRUCTURE: Organize into 6-10 distinct chapters with clear H2 (##) and H3 (###) headings and visual dividers (---).
8. CITATIONS & SOURCES: Cite every claim inline using [Source N](URL) and include a clean 'References & Sources' section at the end.

Source Context ({} sources):

{}"#,
        context.len(),
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
        max_tokens: Some(16000),
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
        reasoning_enabled: Some(true),
        context_window: None,
        capabilities: None,
        tool_choice: None,
        web_search_enabled: false,
        agent_mode: None,
    };

    let mut rx = execute_any_stream(app, &req).await?;
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
                } else if payload.event_type == "thinking" {
                    if let Some(c) = payload.content {
                        let _ = on_progress.send(json!({
                            "type": "thinking",
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

// ── Constants ────────────────────────────────────────────────────────────────

/// Max characters per page. 50K chars ≈ 10,000 words — full long-form article coverage.
const MAX_CHARS_PER_PAGE: usize = 50_000;

/// Max unique URLs to fetch per sub-query in the first hop.
const MAX_URLS_PER_QUERY: usize = 6;

/// Max concurrent page fetches within a batch.
const MAX_CONCURRENT_FETCHES: usize = 6;

// ── Main Deep Research Command ───────────────────────────────────────────────

#[tauri::command]
pub async fn start_deep_research(
    app: tauri::AppHandle,
    query: ResearchQuery,
    on_progress: Channel<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let _ = on_progress.send(json!({
        "type": "progress",
        "message": format!(r#"Starting deep research: "{}""#, query.prompt)
    }));

    let provider = query.provider.unwrap_or_else(|| "nyx-native".to_string());
    let is_local = provider == "nyx-native" || provider.contains("local");
    let model_id = query.model_id.unwrap_or_else(|| {
        if is_local { "local-default".to_string() } else { "google/gemini-2.5-flash".to_string() }
    });
    let api_key = query.api_key.unwrap_or_default();

    if api_key.is_empty() && !is_local {
        return Err("API key is required for cloud providers".to_string());
    }

    // ── STEP 1: Plan — LLM decomposes topic into 5-7 sub-queries ─────────────

    let _ = on_progress.send(json!({
        "type": "progress",
        "message": "Planning research strategy..."
    }));

    let planner_res = run_planner(
        &app,
        &query.prompt,
        provider.clone(),
        model_id.clone(),
        api_key.clone(),
    )
    .await?;

    let _ = on_progress.send(json!({
        "type": "progress",
        "message": format!(
            "Generated {} research angles. Launching parallel search agents...",
            planner_res.sub_queries.len()
        )
    }));

    // ── STEP 2: Search & Scrape — parallel across all sub-queries ─────────────

    let visited_urls: Arc<Mutex<HashSet<String>>> = Arc::new(Mutex::new(HashSet::new()));
    let mut search_tasks = vec![];

    for sq in &planner_res.sub_queries {
        let prog = on_progress.clone();
        let query_text = sq.query.clone();
        let visited = visited_urls.clone();

        search_tasks.push(tokio::spawn(async move {
            let _ = prog.send(json!({
                "type": "progress",
                "message": format!(r#"Searching: "{}""#, query_text)
            }));

            let search_results = get_search_results_meta(&query_text, MAX_URLS_PER_QUERY).await;
            let mut unique_results: Vec<DiscoveredSearchResult> = vec![];
            {
                let mut set = visited.lock().await;
                for item in search_results {
                    if set.insert(item.url.clone()) {
                        unique_results.push(item);
                    }
                }
            }

            let mut page_texts: Vec<String> = vec![];
            let mut page_sources: Vec<SourceEntry> = vec![];

            // Fetch pages in batches of MAX_CONCURRENT_FETCHES
            for batch in unique_results.chunks(MAX_CONCURRENT_FETCHES) {
                let batch_tasks: Vec<_> = batch
                    .iter()
                    .map(|item| {
                        let pg = prog.clone();
                        let item_clone = item.clone();
                        tokio::spawn(async move {
                            let _ = pg.send(json!({
                                "type": "progress",
                                "message": format!("Reading: {}", item_clone.url)
                            }));
                            let (_url, md) = fetch_page_for_research(&item_clone.url).await;
                            (item_clone, md)
                        })
                    })
                    .collect();

                let batch_results = join_all(batch_tasks).await;
                for result in batch_results.into_iter().flatten() {
                    let (item, markdown) = result;
                    let title = if !item.title.is_empty() { item.title.clone() } else { item.url.clone() };
                    let snippet = if !item.snippet.is_empty() { item.snippet.clone() } else { title.clone() };

                    let bounded_md = if markdown.trim().len() >= 200 {
                        markdown.chars().take(MAX_CHARS_PER_PAGE).collect::<String>()
                    } else {
                        format!("Title: {}\nSnippet: {}", title, snippet)
                    };

                    page_texts.push(format!("Source: {}\n\n{}", item.url, bounded_md));
                    page_sources.push(SourceEntry { url: item.url, title, snippet });
                }
            }

            (page_texts, page_sources)
        }));
    }

    let results = join_all(search_tasks).await;
    let mut all_context: Vec<String> = vec![];
    let mut all_sources: Vec<SourceEntry> = vec![];

    for (texts, sources) in results.into_iter().flatten() {
        all_context.extend(texts);
        all_sources.extend(sources);
    }

    let _ = on_progress.send(json!({
        "type": "progress",
        "message": format!(
            "First research pass: {} sources read. Analyzing for gaps...",
            all_context.len()
        )
    }));

    // ── STEP 3: Reflect — LLM identifies gaps, executes follow-up searches ────

    if all_context.len() >= 2 && (!api_key.is_empty() || is_local) {
        let context_summary = all_context
            .iter()
            .enumerate()
            .map(|(i, ctx)| {
                let snippet: String = ctx.chars().take(500).collect();
                format!("[Source {}]: {}", i + 1, snippet)
            })
            .collect::<Vec<_>>()
            .join("\n\n");

        let _ = on_progress.send(json!({
            "type": "progress",
            "message": "Reflection Agent identifying research gaps..."
        }));

        match run_gap_finder(
            &app,
            &query.prompt,
            &context_summary,
            provider.clone(),
            model_id.clone(),
            api_key.clone(),
        )
        .await
        {
            Ok(gaps) if !gaps.follow_up_queries.is_empty() => {
                let _ = on_progress.send(json!({
                    "type": "progress",
                    "message": format!(
                        "Found {} gaps. Executing {} follow-up searches...",
                        gaps.gaps.len(),
                        gaps.follow_up_queries.len()
                    )
                }));

                // Execute follow-up gap queries in parallel (2nd hop)
                let mut hop2_tasks = vec![];
                for follow_up_query in gaps.follow_up_queries.iter().take(5) {
                    let fq = follow_up_query.clone();
                    let pg = on_progress.clone();
                    let visited = visited_urls.clone();

                    hop2_tasks.push(tokio::spawn(async move {
                        let _ = pg.send(json!({
                            "type": "progress",
                            "message": format!(r#"Follow-up: "{}""#, fq)
                        }));

                        let search_results = get_search_results_meta(&fq, MAX_URLS_PER_QUERY).await;
                        let mut unique_results: Vec<DiscoveredSearchResult> = vec![];
                        {
                            let mut set = visited.lock().await;
                            for item in search_results {
                                if set.insert(item.url.clone()) {
                                    unique_results.push(item);
                                }
                            }
                        }

                        let mut hop2_texts: Vec<String> = vec![];
                        let mut hop2_sources: Vec<SourceEntry> = vec![];

                        for batch in unique_results.chunks(MAX_CONCURRENT_FETCHES) {
                            let batch_tasks: Vec<_> = batch
                                .iter()
                                .map(|item| {
                                    let p = pg.clone();
                                    let item_clone = item.clone();
                                    tokio::spawn(async move {
                                        let _ = p.send(json!({
                                            "type": "progress",
                                            "message": format!("Reading: {}", item_clone.url)
                                        }));
                                        let (_url, md) = fetch_page_for_research(&item_clone.url).await;
                                        (item_clone, md)
                                    })
                                })
                                .collect();

                            let batch_results = join_all(batch_tasks).await;
                            for result in batch_results.into_iter().flatten() {
                                let (item, markdown) = result;
                                let title = if !item.title.is_empty() { item.title.clone() } else { item.url.clone() };
                                let snippet = if !item.snippet.is_empty() { item.snippet.clone() } else { title.clone() };

                                let bounded_md = if markdown.trim().len() >= 200 {
                                    markdown.chars().take(MAX_CHARS_PER_PAGE).collect::<String>()
                                } else {
                                    format!("Title: {}\nSnippet: {}", title, snippet)
                                };

                                hop2_texts.push(format!("Source: {}\n\n{}", item.url, bounded_md));
                                hop2_sources.push(SourceEntry { url: item.url, title, snippet });
                            }
                        }

                        (hop2_texts, hop2_sources)
                    }));
                }

                let hop2_results = join_all(hop2_tasks).await;
                for (texts, sources) in hop2_results.into_iter().flatten() {
                    all_context.extend(texts);
                    all_sources.extend(sources);
                }

                let _ = on_progress.send(json!({
                    "type": "progress",
                    "message": format!(
                        "Gap-fill complete. Total sources: {}",
                        all_context.len()
                    )
                }));
            }
            Ok(_) => {
                let _ = on_progress.send(json!({
                    "type": "progress",
                    "message": "Research coverage looks comprehensive — no major gaps found."
                }));
            }
            Err(e) => {
                let _ = on_progress.send(json!({
                    "type": "progress",
                    "message": format!("Gap analysis skipped ({}). Proceeding.", e)
                }));
            }
        }
    }

    // Index all scraped website sources into LanceDB TurboVec vector memory for future turns & model grounding
    if let Some(tv_store) = app.try_state::<Arc<crate::rag::turbovec_store::TurbovecStore>>() {
        for (i, ctx) in all_context.iter().enumerate() {
            let url = all_sources.get(i).map(|s| s.url.as_str()).unwrap_or("web-source");
            let title = all_sources.get(i).map(|s| s.title.as_str()).unwrap_or("Scraped Document");
            tv_store.add_scraped_document(url, title, ctx).await;
        }
    }

    // ── STEP 4: Query TurboVec Vector Memory & SQLite Memory ─────────────────

    let mut memory_facts: Vec<String> = Vec::new();
    if let Some(tv_store) = app.try_state::<Arc<crate::rag::turbovec_store::TurbovecStore>>() {
        let tv_results = tv_store.search_memory(&query.prompt, 6).await;
        for (_id, text) in tv_results {
            let fact = text.trim().to_string();
            if !fact.is_empty() && !memory_facts.contains(&fact) {
                memory_facts.push(format!("[TurboVec Vector RAG Memory]: {}", fact));
            }
        }
    }
    let pool = app.state::<sqlx::SqlitePool>();
    if let Ok(memories) = crate::commands::db::db_search_memories(pool, Some(query.prompt.clone()), None, Some(5)).await {
        for m in memories {
            let fact = m.fact.trim().to_string();
            if !fact.is_empty() && !memory_facts.contains(&fact) {
                memory_facts.push(format!("[SQLite Episodic Memory]: {}", fact));
            }
        }
    }

    if !memory_facts.is_empty() {
        let memory_block = format!("Source: TurboVec/Episodic Vector Memory\n\n[TURBOVEC VECTOR RAG & EPISODIC MEMORIES]\n{}", memory_facts.join("\n\n"));
        all_context.insert(0, memory_block);
    }

    // ── STEP 5: Synthesize Final Report ──────────────────────────────────────

    if all_context.is_empty() {
        return Err(
            "No content could be retrieved from the web or memory. \
             Try a different query or check your internet connection."
                .to_string(),
        );
    }

    let _ = on_progress.send(json!({
        "type": "progress",
        "message": format!(
            "Writing comprehensive report from {} sources...",
            all_context.len()
        )
    }));

    let final_report = run_publisher(
        &app,
        &query.prompt,
        all_context,
        provider,
        model_id,
        api_key,
        on_progress.clone(),
    )
    .await?;

    let _ = on_progress.send(json!({
        "type": "progress",
        "message": "Deep Research complete!"
    }));

    Ok(json!({
        "source": "publisher-agent",
        "data": final_report,
        "sources": all_sources
    }))
}
