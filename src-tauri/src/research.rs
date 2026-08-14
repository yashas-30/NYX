use serde_json::json;
use tauri::ipc::Channel;
use tauri::Manager;

use serde::{Deserialize, Serialize};
use crate::llm::{execute_cloud_stream, UnifiedRequest, UnifiedMessage};
use futures_util::future::join_all;
use std::time::Duration;
use std::collections::HashSet;
use std::sync::{Arc, LazyLock};
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
    query: &str,
    provider: String,
    model_id: String,
    api_key: String,
) -> Result<PlannerResponse, String> {
    let planner_prompt = format!(
        "Topic to research: {}\n\n\
        Generate 5-7 targeted search queries covering these angles:\n\
        1. Core definition and overview\n\
        2. Recent developments and news (2024/2025)\n\
        3. Technical details and implementation\n\
        4. Expert opinions, analysis, critiques\n\
        5. Statistical data and benchmarks\n\
        6. Real-world applications and use cases\n\
        7. Comparison with alternatives\n\n\
        Output ONLY valid JSON: {{\"sub_queries\": [{{\"query\": \"specific search query\", \"intent\": \"why this angle matters\"}}]}}",
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
    };

    let mut rx = execute_cloud_stream(&req).await?;
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

    // Strip markdown fences if present
    let cleaned = full_text
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let response: PlannerResponse = serde_json::from_str(cleaned)
        .map_err(|e| format!("Planner parse error: {}. Raw: {}", e, cleaned))?;
    Ok(response)
}

// ── Gap Finder: LLM identifies missing information after first hop ────────────

async fn run_gap_finder(
    original_prompt: &str,
    gathered_context_summary: &str,
    provider: String,
    model_id: String,
    api_key: String,
) -> Result<GapFinderResponse, String> {
    let gap_prompt = format!(
        "Research Topic: {}\n\nContext gathered so far (summary):\n{}\n\n\
         Identify 3-5 important aspects still missing or insufficiently covered. \
         Generate specific follow-up search queries to fill those gaps. \
         Output ONLY valid JSON: {{\"gaps\": [\"description\"], \"follow_up_queries\": [\"specific query\"]}}",
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
    };

    let mut rx = execute_cloud_stream(&req).await?;
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

    let cleaned = full_text
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let response: GapFinderResponse = serde_json::from_str(cleaned)
        .map_err(|e| format!("Gap finder parse error: {}. Raw: {}", e, cleaned))?;
    Ok(response)
}

// ── URL extraction from search results ───────────────────────────────────────

/// Fetches search results and extracts up to `max_urls` unique valid URLs across distinct websites.
async fn get_search_urls(query: &str, max_urls: usize) -> Vec<String> {
    let mut urls = Vec::new();
    let num_results = (max_urls * 2).max(12);
    if let Ok(raw_res) = crate::commands::agent::search_web_command(
        query.to_string(),
        Some(num_results),
        None,
        None,
    )
    .await
    {
        static URL_REGEX: LazyLock<regex::Regex> = LazyLock::new(|| {
            regex::Regex::new(r"https?://[^\s\)\>\]]+").unwrap()
        });

        for line in raw_res.lines() {
            if urls.len() >= max_urls {
                break;
            }
            for cap in URL_REGEX.find_iter(line) {
                let url = cap.as_str().trim_end_matches('.').trim_end_matches(',').to_string();
                if url.is_empty()
                    || url.contains("duckduckgo.com")
                    || url.contains("google.com/search")
                    || url.ends_with(".pdf")
                    || url.ends_with(".jpg")
                    || url.ends_with(".png")
                    || url.ends_with(".mp4")
                    || url.ends_with(".zip")
                {
                    continue;
                }

                if !urls.contains(&url) {
                    urls.push(url);
                    if urls.len() >= max_urls {
                        break;
                    }
                }
            }
        }
    }
    urls
}


// ── Full page fetching with robust timeout ────────────────────────────────────

/// Fetches a full page for research purposes.
/// - 12-second timeout (vs 3s for normal chat — research needs more time)
/// - No arbitrary character truncation here; callers cap content themselves
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
    if let Some(cached) = crate::commands::agent::PAGE_CACHE.get(url) {
        if cached.timestamp.elapsed().as_secs() < 1800 {
            let content = cached.content.clone();
            drop(cached);
            return (url.to_string(), content);
        } else {
            drop(cached);
            crate::commands::agent::PAGE_CACHE.remove(url);
        }
    }

    let result = tokio::time::timeout(
        Duration::from_secs(12),
        crate::commands::agent::HTTP_CLIENT
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
            // Skip extremely large pages (> 15 MB)
            if let Some(len) = res.content_length() {
                if len > 15_000_000 {
                    return (url.to_string(), String::new());
                }
            }
            match res.text().await {
                Ok(html) => {
                    let markdown = crate::commands::agent::extract_clean_text(&html, url);
                    if markdown.trim().len() < 200 {
                        return (url.to_string(), String::new());
                    }
                    // Cache the result
                    crate::commands::agent::PAGE_CACHE.insert(
                        url.to_string(),
                        crate::commands::agent::CachedSearchResult {
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
    prompt: &str,
    context: Vec<String>,
    provider: String,
    model_id: String,
    api_key: String,
    on_progress: Channel<serde_json::Value>,
) -> Result<String, String> {
    let context_text = context.join("\n\n---\n\n");
    let system_instruction = format!(
        "You are a world-class principal research scientist and technical writer. Using ONLY the \
         provided source context below (scraped web pages + vector memory), write an EXHAUSTIVE, \
         DEEP, LONG-FORM RESEARCH PAPER answering the user's research topic.\n\n\
         CRITICAL INSTRUCTIONS FOR THINKING & RICH REPORT FORMATTING:\n\
         1. THINKING PROCESS: First, perform step-by-step reasoning evaluating EVERY source, \
            comparing conflicting claims, analyzing methodologies, and planning section structure.\n\
         2. EXHAUSTIVE LENGTH: Target 3,000+ words for the report. Do NOT write brief summaries, \
            short bullet lists, or high-level overviews. Provide deep, granular analysis.\n\
         3. EXECUTIVE SUMMARY: Include an executive summary callout block at the very top: > 💡 **EXECUTIVE SUMMARY**.\n\
         4. COMPARATIVE TABLES: Build comprehensive Markdown comparison tables, statistics tables, pros & cons, and technical specs.\n\
         5. MERMAID DIAGRAMS: Use Graphical Mermaid Diagrams (```mermaid\nflowchart TD ... \n```) when illustrating multi-step processes, timelines, or architectures. Do not output raw ASCII text box art. Always use clean Markdown formatting.\n\
         6. KEY TAKEAWAYS: Include highlighted callout cards (🎯 **KEY TAKEAWAYS**) in key chapters.\n\
         7. CHAPTER STRUCTURE: Organize into 6-10 distinct chapters with clear H2 (##) and H3 (###) headings and visual dividers (---).\n\
         8. CITATIONS & SOURCES: Cite every claim inline using [Source N](URL) and include a clean 'References & Sources' section at the end.\n\n\
         Source Context ({} sources):\n\n{}",
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
    };

    let mut rx = execute_cloud_stream(&req).await?;
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

// ── Constants ─────────────────────────────────────────────────────────────────

/// Max characters per page. 50K chars ≈ 10,000 words — full long-form article coverage.
const MAX_CHARS_PER_PAGE: usize = 50_000;

/// Max unique URLs to fetch per sub-query in the first hop.
const MAX_URLS_PER_QUERY: usize = 6;

/// Max concurrent page fetches within a batch.
const MAX_CONCURRENT_FETCHES: usize = 6;

// ── Main Deep Research Command ────────────────────────────────────────────────

#[tauri::command]
pub async fn start_deep_research(
    app: tauri::AppHandle,
    query: ResearchQuery,
    on_progress: Channel<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let _ = on_progress.send(json!({
        "type": "progress",
        "message": format!("🔬 Starting deep research: \"{}\"", query.prompt)
    }));

    let provider = query.provider.unwrap_or_else(|| "openrouter".to_string());
    let model_id = query.model_id.unwrap_or_else(|| "google/gemini-3.6-flash".to_string());
    let api_key = query.api_key.unwrap_or_default();

    if api_key.is_empty() && provider != "nyx-native" {
        return Err("API key is required for cloud providers".to_string());
    }

    // ── STEP 1: Plan — LLM decomposes topic into 5-7 sub-queries ────────────

    let _ = on_progress.send(json!({
        "type": "progress",
        "message": "🧠 Planning research strategy..."
    }));

    let planner_res = run_planner(
        &query.prompt,
        provider.clone(),
        model_id.clone(),
        api_key.clone(),
    )
    .await?;

    let _ = on_progress.send(json!({
        "type": "progress",
        "message": format!(
            "📋 Generated {} research angles. Launching parallel search agents...",
            planner_res.sub_queries.len()
        )
    }));

    // ── STEP 2: Search & Scrape — parallel across all sub-queries ────────────

    let visited_urls: Arc<Mutex<HashSet<String>>> = Arc::new(Mutex::new(HashSet::new()));
    let mut search_tasks = vec![];

    for sq in &planner_res.sub_queries {
        let prog = on_progress.clone();
        let query_text = sq.query.clone();
        let visited = visited_urls.clone();

        search_tasks.push(tokio::spawn(async move {
            let _ = prog.send(json!({
                "type": "progress",
                "message": format!("🔍 Searching: \"{}\"", query_text)
            }));

            let urls = get_search_urls(&query_text, MAX_URLS_PER_QUERY).await;
            let mut unique_urls = vec![];
            {
                let mut set = visited.lock().await;
                for u in urls {
                    if set.insert(u.clone()) {
                        unique_urls.push(u);
                    }
                }
            }

            let mut page_texts: Vec<String> = vec![];
            let mut page_sources: Vec<SourceEntry> = vec![];

            // Fetch pages in batches of MAX_CONCURRENT_FETCHES
            for batch in unique_urls.chunks(MAX_CONCURRENT_FETCHES) {
                let batch_tasks: Vec<_> = batch
                    .iter()
                    .map(|url| {
                        let pg = prog.clone();
                        let u = url.clone();
                        tokio::spawn(async move {
                            let _ = pg.send(json!({
                                "type": "progress",
                                "message": format!("📄 Reading: {}", u)
                            }));
                            fetch_page_for_research(&u).await
                        })
                    })
                    .collect();

                let batch_results = join_all(batch_tasks).await;
                for result in batch_results.into_iter().flatten() {
                    let (url, markdown) = result;
                    if markdown.len() < 200 {
                        continue; // Skip empty or minimal pages
                    }

                    let title = markdown
                        .lines()
                        .find(|l| !l.trim().is_empty())
                        .unwrap_or(&url)
                        .trim_start_matches('#')
                        .trim()
                        .to_string();

                    let snippet: String = markdown.chars().take(300).collect();
                    // Cap per-page content to prevent context explosion
                    let bounded_md: String = markdown.chars().take(MAX_CHARS_PER_PAGE).collect();
                    page_texts.push(format!("Source: {}\n\n{}", url, bounded_md));
                    page_sources.push(SourceEntry { url, title, snippet });
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
            "✅ First research pass: {} sources read. Analyzing for gaps...",
            all_context.len()
        )
    }));

    // ── STEP 3: Reflect — LLM identifies gaps, executes follow-up searches ────

    if all_context.len() >= 2 && !api_key.is_empty() {
        // Build a compact summary for the gap finder (first 500 chars per source)
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
            "message": "🤔 Reflection Agent identifying research gaps..."
        }));

        match run_gap_finder(
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
                        "🔄 Found {} gaps. Executing {} follow-up searches...",
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
                            "message": format!("🔍 Follow-up: \"{}\"", fq)
                        }));

                        let urls = get_search_urls(&fq, MAX_URLS_PER_QUERY).await;
                        let mut unique_urls = vec![];
                        {
                            let mut set = visited.lock().await;
                            for u in urls {
                                if set.insert(u.clone()) {
                                    unique_urls.push(u);
                                }
                            }
                        }

                        let mut hop2_texts: Vec<String> = vec![];
                        let mut hop2_sources: Vec<SourceEntry> = vec![];

                        for batch in unique_urls.chunks(MAX_CONCURRENT_FETCHES) {
                            let batch_tasks: Vec<_> = batch
                                .iter()
                                .map(|url| {
                                    let p = pg.clone();
                                    let u = url.clone();
                                    tokio::spawn(async move {
                                        let _ = p.send(json!({
                                            "type": "progress",
                                            "message": format!("📄 Reading: {}", u)
                                        }));
                                        fetch_page_for_research(&u).await
                                    })
                                })
                                .collect();

                            let batch_results = join_all(batch_tasks).await;
                            for result in batch_results.into_iter().flatten() {
                                let (url, markdown) = result;
                                if markdown.len() < 200 {
                                    continue;
                                }
                                let title = markdown
                                    .lines()
                                    .find(|l| !l.trim().is_empty())
                                    .unwrap_or(&url)
                                    .trim_start_matches('#')
                                    .trim()
                                    .to_string();
                                let snippet: String = markdown.chars().take(300).collect();
                                let bounded_md: String =
                                    markdown.chars().take(MAX_CHARS_PER_PAGE).collect();
                                hop2_texts
                                    .push(format!("Source: {}\n\n{}", url, bounded_md));
                                hop2_sources.push(SourceEntry { url, title, snippet });
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
                        "✅ Gap-fill complete. Total sources: {}",
                        all_context.len()
                    )
                }));
            }
            Ok(_) => {
                let _ = on_progress.send(json!({
                    "type": "progress",
                    "message": "✅ Research coverage looks comprehensive — no major gaps found."
                }));
            }
            Err(e) => {
                let _ = on_progress.send(json!({
                    "type": "progress",
                    "message": format!("⚠️ Gap analysis skipped ({}). Proceeding.", e)
                }));
            }
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
    if let Some(pool) = app.try_state::<sqlx::SqlitePool>() {
        if let Ok(memories) = crate::commands::db::db_search_memories(pool.clone(), Some(query.prompt.clone()), None, Some(5)).await {
            for m in memories {
                let fact = m.fact.trim().to_string();
                if !fact.is_empty() && !memory_facts.contains(&fact) {
                    memory_facts.push(format!("[SQLite Episodic Memory]: {}", fact));
                }
            }
        }
    }

    if !memory_facts.is_empty() {
        let memory_block = format!("Source: TurboVec/Episodic Vector Memory\n\n[TURBOVEC VECTOR RAG & EPISODIC MEMORIES]\n{}", memory_facts.join("\n\n"));
        all_context.insert(0, memory_block);
    }

    // ── STEP 5: Synthesize ────────────────────────────────────────────────────

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
            "📝 Writing comprehensive report from {} sources...",
            all_context.len()
        )
    }));

    let final_report = run_publisher(
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
        "message": "🎉 Deep Research complete!"
    }));

    Ok(json!({
        "source": "publisher-agent",
        "data": final_report,
        "sources": all_sources
    }))
}
