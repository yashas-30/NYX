// ─────────────────────────────────────────────────────────────────────────────
// NYX — Web Search Orchestrator & Multi-Engine Intelligence
// ─────────────────────────────────────────────────────────────────────────────

use std::sync::LazyLock;
use std::time::Duration;
use super::cache::{HTTP_CLIENT, SEARCH_CACHE, CachedSearchResult, insert_bounded_cache};
use super::scraper::fetch_page_content;
use super::media_search::{execute_duckduckgo_image_search, execute_duckduckgo_video_search};

#[derive(Debug, Clone, Default)]
pub struct QueryIntent {
    pub temporal: bool,
    pub weather_city: Option<String>,
    pub scientific: bool,
    pub github_query: Option<String>,
    pub arxiv_query: Option<String>,
    pub stock_ticker: Option<String>,
    pub news_query: bool,
    pub skip_search: bool,
}

pub fn classify_query(q: &str) -> QueryIntent {
    static WEATHER_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?i)(?:weather|temperature|forecast|rain|sunny|humidity|wind)\s+(?:in|at|for|near)?\s+([\w\s]+?)(?:\?|$)").unwrap()
    });
    static TEMPORAL_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?i)\b(?:latest|recent|today|current|now|2025|2026|breaking|live|right now|this week|this month|news about|just released|just announced|this year)\b").unwrap()
    });
    static SCIENCE_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?i)\b(?:research paper|arxiv|study|published|journal|doi|preprint|scientific paper|machine learning paper|ai paper)\b").unwrap()
    });
    static GITHUB_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?i)\b(?:github|repository|repo|open.?source|crate|npm package|pypi)\b").unwrap()
    });
    static STOCK_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?i)\b(?:stock price|share price|market cap|ticker|nasdaq|nyse|\$[A-Z]{1,5}|price of [A-Z]{1,5})\b").unwrap()
    });
    static NEWS_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?i)\b(?:news|headlines|breaking|happened|update on|latest on|what happened|announcement)\b").unwrap()
    });
    static SKIP_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?i)^\s*(?:hi|hello|hey|greetings|howdy|yo|sup|thanks|thank you|good\s+(?:morning|afternoon|evening)|who are you|what are you|what can you do|how are you|test|ping|help|calculate|compute|what is \d|\d+\s*[+\-\*/]|write (?:a |the )?code|translate to|convert \d)").unwrap()
    });

    let mut intent = QueryIntent::default();

    if let Some(cap) = WEATHER_RE.captures(q) {
        let city = cap.get(1).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
        if !city.is_empty() {
            intent.weather_city = Some(city);
            intent.temporal = true;
        }
    }

    if TEMPORAL_RE.is_match(q) {
        intent.temporal = true;
    }

    if SCIENCE_RE.is_match(q) {
        intent.scientific = true;
        let arxiv_terms: String = q.split_whitespace()
            .filter(|w| !matches!(w.to_lowercase().as_str(),
                "research" | "paper" | "papers" | "arxiv" | "study" | "find" | "show" | "get" | "the" | "a" | "an"))
            .collect::<Vec<_>>()
            .join(" ");
        if !arxiv_terms.is_empty() {
            intent.arxiv_query = Some(arxiv_terms);
        }
    }

    if GITHUB_RE.is_match(q) {
        let terms: String = q.split_whitespace()
            .filter(|w| !matches!(w.to_lowercase().as_str(),
                "github" | "repo" | "repository" | "find" | "show" | "the" | "a" | "an" | "best" | "top" | "open" | "source"))
            .collect::<Vec<_>>()
            .join(" ");
        if !terms.is_empty() {
            intent.github_query = Some(terms);
        }
        intent.temporal = true;
    }

    if STOCK_RE.is_match(q) {
        static TICKER_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
            regex::Regex::new(r"\$?\b([A-Z]{1,5})\b").unwrap()
        });
        if let Some(cap) = TICKER_RE.captures(q) {
            intent.stock_ticker = Some(cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default());
        }
        intent.temporal = true;
    }

    if NEWS_RE.is_match(q) {
        intent.news_query = true;
        intent.temporal = true;
    }

    if SKIP_RE.is_match(q) && q.split_whitespace().count() < 10 {
        intent.skip_search = true;
    }

    intent
}

#[allow(dead_code)]
pub fn bm25_score(query: &str, document: &str) -> f32 {
    let k1: f32 = 1.5;
    let b: f32 = 0.75;
    let avg_doc_len: f32 = 100.0;

    let doc_words: Vec<&str> = document.split_whitespace().collect();
    let doc_len = doc_words.len() as f32;

    static SHORT_WHITELIST: LazyLock<std::collections::HashSet<&'static str>> = LazyLock::new(|| {
        ["us", "uk", "eu", "ai", "ml", "db", "io", "os", "ip", "pr", "ca", "va", "un", "qa", "who", "ceo", "potus"].into_iter().collect()
    });

    let query_terms: Vec<String> = query.split_whitespace()
        .map(|w| w.to_lowercase().trim_matches(|c: char| !c.is_alphanumeric()).to_string())
        .filter(|w| w.len() >= 3 || SHORT_WHITELIST.contains(w.as_str()))
        .collect();

    if query_terms.is_empty() || doc_words.is_empty() {
        return 0.0;
    }

    let doc_lower = document.to_lowercase();
    let mut score: f32 = 0.0;

    for term in &query_terms {
        let tf = doc_words.iter()
            .filter(|w| w.to_lowercase().trim_matches(|c: char| !c.is_alphanumeric()) == *term)
            .count() as f32;

        let idf = if doc_lower.contains(term.as_str()) { 2.3_f32 } else { 0.0_f32 };
        let normalized_tf = (tf * (k1 + 1.0)) / (tf + k1 * (1.0 - b + b * doc_len / avg_doc_len));
        score += idf * normalized_tf;
    }

    let clean_query_lower = query.to_lowercase().trim_end_matches('?').to_string();
    if doc_lower.contains(&clean_query_lower) {
        score += 3.0;
    }

    (score / 10.0_f32).min(1.0)
}

pub fn decontextualize_query(raw_query: &str) -> String {
    let mut text = raw_query.trim();

    if text.starts_with("/web") {
        text = text.trim_start_matches("/web").trim();
    } else if text.starts_with("/search") {
        text = text.trim_start_matches("/search").trim();
    } else if text.starts_with("/deep") {
        text = text.trim_start_matches("/deep").trim();
    } else if text.starts_with("/image") {
        text = text.trim_start_matches("/image").trim();
    } else if text.starts_with("/img") {
        text = text.trim_start_matches("/img").trim();
    }

    static GREETING_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?i)^(?:hello|hi|hey|greetings|good\s+(?:morning|afternoon|evening)|yo|sup)[\s,!.:\-]*").unwrap()
    });

    if let Some(mat) = GREETING_RE.find(text) {
        let stripped = text[mat.end()..].trim();
        if !stripped.is_empty() {
            text = stripped;
        }
    }

    static PREFIX_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?i)^(?:can\s+you\s+(?:please\s+)?)?(?:search\s+(?:the\s+)?web\s+for|search\s+online\s+for|search\s+for|google\s+for|look\s*up\s+online|find\s+(?:out\s+)?about|tell\s+me\s+about|tell\s+me|give\s+me\s+(?:images?|photos?|pictures?)\s+of|show\s+me\s+(?:images?|photos?|pictures?)\s+of|show\s+me|images?\s+of|photos?\s+of|pictures?\s+of|draw\s+(?:an?\s+)?image\s+of|generate\s+(?:an?\s+)?image\s+of|visualize|deep\s+research\s+on|research\s+(?:about|on)?)\s*").unwrap()
    });

    if let Some(mat) = PREFIX_RE.find(text) {
        let stripped = text[mat.end()..].trim();
        if !stripped.is_empty() {
            text = stripped;
        }
    }

    static SUFFIX_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?i)\s+(?:in\s+detail|in\s+full\s+detail|explained\s+in\s+detail|for\s+me|please|with\s+images|with\s+photos|and\s+show\s+images|and\s+show\s+photos|and\s+pictures)[?.!]*$").unwrap()
    });

    let cleaned = SUFFIX_RE.replace(text, "").trim().to_string();
    if cleaned.is_empty() { text.to_string() } else { cleaned }
}

pub fn decode_html_entities(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&nbsp;", " ")
}

pub fn parse_duckduckgo_lite(html: &str, num_results: usize) -> Vec<(String, String, String)> {
    let mut results = Vec::new();
    let mut seen_urls = std::collections::HashSet::new();
    let document = scraper::Html::parse_document(html);

    if let (Ok(result_sel), Ok(link_sel), Ok(snip_sel)) = (
        scraper::Selector::parse(".result, .web-result, .results_links, .result--standard"),
        scraper::Selector::parse("a.result__a, h2 a, a.result-link, .result__title a"),
        scraper::Selector::parse(".result__snippet, a.result__snippet, td.result-snippet, .result__body"),
    ) {
        for el in document.select(&result_sel) {
            if let Some(link_el) = el.select(&link_sel).next() {
                let raw_url = link_el.value().attr("href").unwrap_or("");
                let raw_title: String = link_el.text().collect::<Vec<_>>().join(" ").trim().to_string();
                let title = decode_html_entities(&raw_title);

                if title.is_empty() || title.len() < 2 || title.contains("DuckDuckGo") || title.eq_ignore_ascii_case("images") {
                    continue;
                }

                let real_url = if let Some(pos) = raw_url.find("uddg=") {
                    let encoded = &raw_url[pos + 5..];
                    let end_pos = encoded.find('&').unwrap_or(encoded.len());
                    urlencoding::decode(&encoded[..end_pos]).unwrap_or(std::borrow::Cow::Borrowed(raw_url)).to_string()
                } else if raw_url.starts_with("http") && !raw_url.contains("duckduckgo.com") {
                    raw_url.to_string()
                } else {
                    continue;
                };

                if real_url.is_empty() || real_url.contains("duckduckgo.com") || seen_urls.contains(&real_url) {
                    continue;
                }

                let snippet = if let Some(snip_el) = el.select(&snip_sel).next() {
                    let raw_snip: String = snip_el.text().collect::<Vec<_>>().join(" ").trim().to_string();
                    decode_html_entities(&raw_snip)
                } else {
                    title.clone()
                };

                seen_urls.insert(real_url.clone());
                results.push((title, real_url, snippet));
                if results.len() >= num_results {
                    return results;
                }
            }
        }
    }

    if results.is_empty() {
        if let (Ok(link_sel), Ok(snip_sel)) = (
            scraper::Selector::parse("a.result-link, a.result__url, table a"),
            scraper::Selector::parse("td.result-snippet, .result-snippet"),
        ) {
            let links: Vec<_> = document.select(&link_sel).collect();
            let snips: Vec<_> = document.select(&snip_sel).collect();

            for (i, link_el) in links.iter().enumerate() {
                let raw_url = link_el.value().attr("href").unwrap_or("");
                let raw_title: String = link_el.text().collect::<Vec<_>>().join(" ").trim().to_string();
                let title = decode_html_entities(&raw_title);

                if title.is_empty() || title.len() < 2 || title.contains("DuckDuckGo") {
                    continue;
                }

                let real_url = if let Some(pos) = raw_url.find("uddg=") {
                    let encoded = &raw_url[pos + 5..];
                    let end_pos = encoded.find('&').unwrap_or(encoded.len());
                    urlencoding::decode(&encoded[..end_pos]).unwrap_or(std::borrow::Cow::Borrowed(raw_url)).to_string()
                } else if raw_url.starts_with("http") && !raw_url.contains("duckduckgo.com") {
                    raw_url.to_string()
                } else {
                    continue;
                };

                if real_url.is_empty() || real_url.contains("duckduckgo.com") || seen_urls.contains(&real_url) {
                    continue;
                }

                let snippet = if let Some(snip_el) = snips.get(i) {
                    let raw_snip: String = snip_el.text().collect::<Vec<_>>().join(" ").trim().to_string();
                    decode_html_entities(&raw_snip)
                } else {
                    title.clone()
                };

                seen_urls.insert(real_url.clone());
                results.push((title, real_url, snippet));
                if results.len() >= num_results {
                    return results;
                }
            }
        }
    }

    results
}

pub async fn fetch_duckduckgo_results(query: &str, limit: usize) -> Vec<(String, String, String)> {
    static TAG_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r#"<[^>]*>"#).unwrap());

    let q_wiki = query.to_string();
    let wiki_fut = async move {
        let wiki_url = format!(
            "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={}&srlimit=15&format=json&utf8=1",
            urlencoding::encode(&q_wiki)
        );
        if let Ok(Ok(resp)) = tokio::time::timeout(Duration::from_millis(4500), HTTP_CLIENT.get(&wiki_url).send()).await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(search) = json["query"]["search"].as_array() {
                        let mut list = Vec::new();
                        for item in search.iter().take(limit) {
                            let title = item["title"].as_str().unwrap_or("").to_string();
                            let snippet_raw = item["snippet"].as_str().unwrap_or("");
                            let snippet = decode_html_entities(&TAG_RE.replace_all(snippet_raw, "").trim());
                            if !title.is_empty() {
                                let page_url = format!("https://en.wikipedia.org/wiki/{}", urlencoding::encode(&title));
                                list.push((title, page_url, snippet));
                            }
                        }
                        return list;
                    }
                }
            }
        }
        Vec::new()
    };

    let q_ddg = query.to_string();
    let ddg_fut = async move {
        if let Ok(Ok(resp)) = tokio::time::timeout(
            Duration::from_millis(4500),
            HTTP_CLIENT.post("https://html.duckduckgo.com/html/")
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .header("Content-Type", "application/x-www-form-urlencoded")
                .form(&[("q", q_ddg.as_str()), ("b", ""), ("kl", "us-en")])
                .send()
        ).await {
            if resp.status().is_success() {
                if let Ok(html) = resp.text().await {
                    let parsed = parse_duckduckgo_lite(&html, limit);
                    if !parsed.is_empty() {
                        return parsed;
                    }
                }
            }
        }

        let lite_url = format!("https://lite.duckduckgo.com/lite/?q={}&kl=us-en", urlencoding::encode(&q_ddg));
        if let Ok(Ok(resp)) = tokio::time::timeout(
            Duration::from_millis(4000),
            HTTP_CLIENT.get(&lite_url)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
                .send()
        ).await {
            if resp.status().is_success() {
                if let Ok(html) = resp.text().await {
                    let parsed = parse_duckduckgo_lite(&html, limit);
                    if !parsed.is_empty() {
                        return parsed;
                    }
                }
            }
        }
        Vec::new()
    };

    let q_bing = query.to_string();
    let bing_fut = async move {
        let bing_url = format!("https://www.bing.com/search?q={}&count=20", urlencoding::encode(&q_bing));
        if let Ok(Ok(resp)) = tokio::time::timeout(
            Duration::from_millis(4500),
            HTTP_CLIENT.get(&bing_url)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
                .header("Accept-Language", "en-US,en;q=0.9")
                .send()
        ).await {
            if resp.status().is_success() {
                if let Ok(html) = resp.text().await {
                    let document = scraper::Html::parse_document(&html);
                    let mut results = Vec::new();
                    let mut seen = std::collections::HashSet::new();

                    if let (Ok(block_sel), Ok(link_sel), Ok(snip_sel)) = (
                        scraper::Selector::parse("li.b_algo, .b_algo"),
                        scraper::Selector::parse("h2 a, .b_title a"),
                        scraper::Selector::parse("p, .b_caption p, .b_snippet"),
                    ) {
                        for block in document.select(&block_sel) {
                            if let Some(link_el) = block.select(&link_sel).next() {
                                let url = link_el.value().attr("href").unwrap_or("").to_string();
                                let raw_title: String = link_el.text().collect::<Vec<_>>().join(" ").trim().to_string();
                                let title = decode_html_entities(&raw_title);

                                let snippet = if let Some(snip_el) = block.select(&snip_sel).next() {
                                    let raw_snip: String = snip_el.text().collect::<Vec<_>>().join(" ").trim().to_string();
                                    decode_html_entities(&raw_snip)
                                } else {
                                    title.clone()
                                };

                                if url.starts_with("http") && !url.contains("bing.com") && !url.contains("microsoft.com") && !seen.contains(&url) && !title.is_empty() {
                                    seen.insert(url.clone());
                                    results.push((title, url, snippet));
                                    if results.len() >= limit { break; }
                                }
                            }
                        }
                    }
                    return results;
                }
            }
        }
        Vec::new()
    };

    let (wiki_res, ddg_res, bing_res) = tokio::join!(wiki_fut, ddg_fut, bing_fut);

    let mut combined = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for item in ddg_res.into_iter().chain(bing_res.into_iter()).chain(wiki_res.into_iter()) {
        if !seen.contains(&item.1) && !item.0.is_empty() {
            seen.insert(item.1.clone());
            combined.push(item);
            if combined.len() >= limit * 2 {
                break;
            }
        }
    }

    combined.truncate(limit);
    combined
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SectionalTopicPlan {
    pub section_title: String,
    pub photo_query: String,
    pub video_query: Option<String>,
    pub source_preference: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ModelQueryPlan {
    pub intent: Option<String>,
    pub requires_search: Option<bool>,
    pub web_search_query: String,
    pub deep_research_queries: Vec<String>,
    pub photo_search_query: String,
    pub video_search_query: String,
    pub audio_music_query: Option<String>,
    pub sectional_topics: Option<Vec<SectionalTopicPlan>>,
    pub primary_subject: String,
    pub domain_category: String,
    pub source_preference: Option<String>,
    pub response_style: Option<String>,
    pub target_depth: Option<String>,
}

#[tauri::command]
pub async fn generate_search_queries_with_model(
    app: tauri::AppHandle,
    prompt: String,
    provider: Option<String>,
    model_id: Option<String>,
    api_key: Option<String>,
) -> Vec<String> {
    let prov = provider.unwrap_or_else(|| "nyx-native".to_string());
    let is_local = prov == "nyx-native" || prov.contains("local");
    let model = model_id.unwrap_or_else(|| if is_local { "local-default".to_string() } else { "gemini-3.5-flash-lite".to_string() });
    let key = api_key.unwrap_or_default();

    let planner_prompt = format!(
        "User Prompt: \"{}\"\n\n\
        Analyze this prompt and output 3 to 5 targeted search query strings needed to get full, accurate data from actual websites to answer this prompt completely.\n\
        Output ONLY a valid JSON array of strings: [\"search term 1\", \"search term 2\", \"search term 3\"] with no markdown code fences or extra text.",
        prompt
    );

    let req = crate::llm::types::UnifiedRequest {
        provider: prov,
        endpoint_override: None,
        model_id: model,
        messages: vec![crate::llm::types::UnifiedMessage { role: "user".to_string(), content: serde_json::json!(planner_prompt) }],
        system_instruction: Some(
            "You are an expert Web Search Planner. Output ONLY valid JSON array of search query strings."
                .to_string(),
        ),
        api_key: key,
        temperature: Some(0.2),
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
        thinking_level: None,
        context_window: None,
        capabilities: None,
        tool_choice: None,
        web_search_enabled: false,
        agent_mode: None,
    };

    if let Ok(mut rx) = crate::llm::execute_any_stream(&app, &req).await {
        let mut full_text = String::new();
        while let Some(msg) = rx.recv().await {
            if let Ok(payload) = msg {
                if payload.event_type == "text" {
                    if let Some(c) = payload.content {
                        full_text.push_str(&c);
                    }
                }
            }
        }

        let trimmed = full_text.trim();
        let array_str = if let (Some(s), Some(e)) = (trimmed.find('['), trimmed.rfind(']')) {
            if s < e { &trimmed[s..=e] } else { trimmed }
        } else {
            trimmed
                .trim_start_matches("```json")
                .trim_start_matches("```")
                .trim_end_matches("```")
                .trim()
        };

        if let Ok(queries) = serde_json::from_str::<Vec<String>>(array_str) {
            let valid: Vec<String> = queries.into_iter().filter(|q| !q.trim().is_empty()).collect();
            if !valid.is_empty() {
                return valid;
            }
        }
    }

    vec![decontextualize_query(&prompt)]
}

#[tauri::command]
pub async fn generate_intelligent_query_plan_command(
    app: tauri::AppHandle,
    prompt: String,
    provider: Option<String>,
    model_id: Option<String>,
    api_key: Option<String>,
) -> ModelQueryPlan {
    let prov = provider.unwrap_or_else(|| "nyx-native".to_string());
    let is_local = prov == "nyx-native" || prov.contains("local");
    let model = model_id.unwrap_or_else(|| if is_local { "local-default".to_string() } else { "gemini-3.5-flash-lite".to_string() });
    let key = api_key.unwrap_or_default();

    let planner_prompt = format!(
        r#"Analyze this user prompt: "{}"

Decompose this inquiry into specialized execution instructions and high-accuracy web search vectors:
1. "intent": One of "fictional_lore", "factual_overview", "historical_biography", "code_engineering", "deep_research", "conversational".
2. "requires_search": true if prompt requires real-time facts, current news, recent data, or external references; false for pure reasoning, common knowledge, or greeting.
3. "web_search_query": Clean, high-precision search query for web search engines. Strip conversational prefixes and focus on key terms.
4. "deep_research_queries": Array of 3 to 4 ORTHOGONAL search queries covering foundational origins, key story/technical arcs, benchmarks, or implementations.
5. "photo_search_query": Exact named entity or specific subject query for DuckDuckGo & Bing Web Image search.
6. "video_search_query": Dynamic motion, action, or cinematic timelapse query for video footage.
7. "audio_music_query": Atmospheric soundtrack, ambient soundscape, or musical mood query for background audio.
8. "sectional_topics": Array of 3 to 5 distinct subtopics for response headings with sharp subtopic image queries.
9. "primary_subject": The exact named entity or core subject.
10. "domain_category": One of "technology", "science", "automotive", "space", "nature", "business", "history", "entertainment", "general".
11. "target_depth": "exhaustive" for multi-part breakdowns, research, lore, or architectural guides; "concise" for simple factual questions.

Output ONLY a valid JSON object matching this exact schema:
{{
  "intent": "...",
  "requires_search": true,
  "web_search_query": "...",
  "deep_research_queries": ["...", "...", "..."],
  "photo_search_query": "...",
  "video_search_query": "...",
  "audio_music_query": "...",
  "sectional_topics": [
    {{ "section_title": "...", "photo_query": "..." }}
  ],
  "primary_subject": "...",
  "domain_category": "...",
  "target_depth": "exhaustive"
}}"#,
        prompt
    );

    let req = crate::llm::types::UnifiedRequest {
        provider: prov,
        endpoint_override: None,
        model_id: model,
        messages: vec![crate::llm::types::UnifiedMessage { role: "user".to_string(), content: serde_json::json!(planner_prompt) }],
        system_instruction: Some("You are the Lucifer Master Search Specialist. Output ONLY valid JSON matching the requested schema.".to_string()),
        api_key: key,
        temperature: Some(0.1),
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
        thinking_level: None,
        context_window: None,
        capabilities: None,
        tool_choice: None,
        web_search_enabled: false,
        agent_mode: None,
    };

    if let Ok(mut rx) = crate::llm::execute_any_stream(&app, &req).await {
        let mut full_text = String::new();
        while let Some(msg) = rx.recv().await {
            if let Ok(payload) = msg {
                if payload.event_type == "text" {
                    if let Some(c) = payload.content {
                        full_text.push_str(&c);
                    }
                }
            }
        }

        let trimmed = full_text.trim();
        let obj_str = if let (Some(s), Some(e)) = (trimmed.find('{'), trimmed.rfind('}')) {
            if s < e { &trimmed[s..=e] } else { trimmed }
        } else {
            trimmed
                .trim_start_matches("```json")
                .trim_start_matches("```")
                .trim_end_matches("```")
                .trim()
        };

        if let Ok(plan) = serde_json::from_str::<ModelQueryPlan>(obj_str) {
            if !plan.web_search_query.trim().is_empty() {
                return plan;
            }
        }
    }

    let raw_clean = prompt
        .replace(['?', '!', '"', '`', '#', '*', ';', ':'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    let primary = if raw_clean.len() > 100 {
        raw_clean.chars().take(100).collect::<String>()
    } else {
        raw_clean.clone()
    };

    let sub_parts: Vec<String> = prompt
        .split(|c| c == ',' || c == ';' || c == '?' || c == '.' || c == '\n')
        .map(|s| s.trim())
        .filter(|s| s.len() > 4)
        .map(|s| s.to_string())
        .collect();

    let sub_queries = if sub_parts.len() >= 2 {
        sub_parts.into_iter().take(4).collect()
    } else {
        vec![primary.clone()]
    };

    let sectional_topics = sub_queries.iter().map(|q| SectionalTopicPlan {
        section_title: q.clone(),
        photo_query: q.clone(),
        video_query: None,
        source_preference: Some("all".to_string()),
    }).collect();

    ModelQueryPlan {
        intent: Some("factual_overview".to_string()),
        requires_search: Some(true),
        web_search_query: primary.clone(),
        deep_research_queries: sub_queries,
        photo_search_query: primary.clone(),
        video_search_query: primary.clone(),
        audio_music_query: Some(primary.clone()),
        sectional_topics: Some(sectional_topics),
        primary_subject: primary,
        domain_category: "general".to_string(),
        source_preference: Some("all".to_string()),
        response_style: Some("textbook".to_string()),
        target_depth: Some("exhaustive".to_string()),
    }
}

#[tauri::command]
pub async fn search_web_command(
    query: String,
    num_results: Option<usize>,
    search_provider: Option<String>,
    api_key: Option<String>,
) -> Result<String, String> {
    let search_provider = search_provider.unwrap_or_else(|| "duckduckgo".to_string());
    let limit = num_results.unwrap_or(5);
    let cleaned_query = decontextualize_query(&query);
    let intent = classify_query(&cleaned_query);

    if intent.skip_search {
        return Ok(String::new());
    }

    let cache_ttl_secs: u64 = if intent.temporal { 30 } else { 120 };
    let cache_key = format!("{}:{}:{}", search_provider, limit, cleaned_query.to_lowercase());
    if let Some(cached) = SEARCH_CACHE.get(&cache_key) {
        if cached.value().timestamp.elapsed().as_secs() < cache_ttl_secs {
            return Ok(cached.value().content.clone());
        }
        drop(cached);
        SEARCH_CACHE.remove(&cache_key);
    }

    let mut tavily_failed = false;
    let mut tavily_result = String::new();
    if search_provider == "tavily" {
        if let Some(key) = api_key.as_ref().filter(|k| !k.trim().is_empty()) {
            match HTTP_CLIENT.post("https://api.tavily.com/search")
                .header("Authorization", format!("Bearer {}", key))
                .json(&serde_json::json!({
                    "query": cleaned_query,
                    "max_results": limit,
                    "include_raw_content": false,
                    "search_depth": if intent.temporal { "advanced" } else { "basic" }
                }))
                .send()
                .await
            {
                Ok(res) if res.status().is_success() => {
                    if let Ok(data) = res.json::<serde_json::Value>().await {
                        if let Some(results) = data["results"].as_array() {
                            let mut formatted = Vec::new();
                            for (idx, r) in results.iter().enumerate() {
                                let title = r["title"].as_str().unwrap_or("").to_string();
                                let url = r["url"].as_str().unwrap_or("").to_string();
                                let content = r["content"].as_str().unwrap_or("").to_string();
                                if !title.is_empty() && !url.is_empty() {
                                    formatted.push(format!("[Source {}] {}\nURL: {}\nContent: {}", idx + 1, title, url, content));
                                }
                            }
                            if !formatted.is_empty() {
                                tavily_result = formatted.join("\n\n");
                            } else {
                                tavily_failed = true;
                            }
                        } else { tavily_failed = true; }
                    } else { tavily_failed = true; }
                }
                _ => { tavily_failed = true; }
            }
        } else { tavily_failed = true; }
    } else {
        tavily_failed = true;
    }

    if search_provider == "tavily" && !tavily_failed && !tavily_result.is_empty() {
        let result = tavily_result;
        insert_bounded_cache(&SEARCH_CACHE, cache_key, CachedSearchResult { content: result.clone(), timestamp: std::time::Instant::now() }, 50);
        return Ok(result);
    }

    // Weather routing: Open-Meteo
    if let Some(ref city) = intent.weather_city.clone() {
        let city_clone = city.clone();
        let geo_url = format!("https://geocoding-api.open-meteo.com/v1/search?name={}&count=1&language=en&format=json", urlencoding::encode(&city_clone));
        if let Ok(geo_resp) = HTTP_CLIENT.get(&geo_url).send().await {
            if let Ok(geo_json) = geo_resp.json::<serde_json::Value>().await {
                if let Some(loc) = geo_json["results"].get(0) {
                    let lat = loc["latitude"].as_f64().unwrap_or(0.0);
                    let lon = loc["longitude"].as_f64().unwrap_or(0.0);
                    let country = loc["country"].as_str().unwrap_or("");
                    let weather_url = format!(
                        "https://api.open-meteo.com/v1/forecast?latitude={}&longitude={}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,precipitation,windspeed_10m&forecast_days=1",
                        lat, lon
                    );
                    if let Ok(wx_resp) = HTTP_CLIENT.get(&weather_url).send().await {
                        if let Ok(wx_json) = wx_resp.json::<serde_json::Value>().await {
                            let cw = &wx_json["current_weather"];
                            let temp = cw["temperature"].as_f64().unwrap_or(0.0);
                            let windspeed = cw["windspeed"].as_f64().unwrap_or(0.0);
                            let is_day = cw["is_day"].as_i64().unwrap_or(1);
                            let weather_desc = match cw["weathercode"].as_i64().unwrap_or(0) {
                                0 => "Clear sky",
                                1..=3 => "Partly cloudy",
                                45 | 48 => "Foggy",
                                51..=67 => "Rainy/Drizzle",
                                71..=77 => "Snowy",
                                80..=82 => "Rain showers",
                                85 | 86 => "Snow showers",
                                95..=99 => "Thunderstorm",
                                _ => "Variable",
                            };
                            let time_of_day = if is_day == 1 { "daytime" } else { "nighttime" };
                            let weather_text = format!(
                                "[Source 1] Live Weather in {}, {}\nURL: https://open-meteo.com\nContent: Current weather in {} as of {} (UTC): {}°C, {}. Wind speed: {} km/h. It is currently {}.",
                                city_clone, country,
                                city_clone,
                                chrono::Utc::now().format("%Y-%m-%d %H:%M"),
                                temp, weather_desc, windspeed, time_of_day
                            );
                            let result = weather_text;
                            SEARCH_CACHE.insert(cache_key, CachedSearchResult { content: result.clone(), timestamp: std::time::Instant::now() });
                            return Ok(result);
                        }
                    }
                }
            }
        }
    }

    if let Some(ref arxiv_q) = intent.arxiv_query.clone() {
        let arxiv_url = format!(
            "http://export.arxiv.org/api/query?search_query=all:{}&start=0&max_results=3&sortBy=submittedDate&sortOrder=descending",
            urlencoding::encode(arxiv_q)
        );
        if let Ok(Ok(resp)) = tokio::time::timeout(
            Duration::from_secs(8),
            HTTP_CLIENT.get(&arxiv_url).send()
        ).await {
            if let Ok(xml_text) = resp.text().await {
                static ENTRY_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"(?s)<entry>(.*?)</entry>").unwrap());
                static ATITLE_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"(?s)<title>(.*?)</title>").unwrap());
                static SUMMARY_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"(?s)<summary>(.*?)</summary>").unwrap());
                static AID_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"(?s)<id>(.*?)</id>").unwrap());
                static PUBLISHED_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"(?s)<published>(.*?)</published>").unwrap());

                let mut arxiv_results: Vec<String> = Vec::new();
                for entry_cap in ENTRY_RE.captures_iter(&xml_text) {
                    let entry = entry_cap.get(1).map(|m| m.as_str()).unwrap_or("");
                    let title = ATITLE_RE.captures(entry)
                        .and_then(|c| c.get(1)).map(|m| m.as_str().trim().to_string())
                        .unwrap_or_default();
                    let summary = SUMMARY_RE.captures(entry)
                        .and_then(|c| c.get(1)).map(|m| {
                            let s = m.as_str().trim().replace('\n', " ");
                            s.chars().take(1500).collect::<String>()
                        })
                        .unwrap_or_default();
                    let id_url = AID_RE.captures(entry)
                        .and_then(|c| c.get(1)).map(|m| m.as_str().trim().to_string())
                        .unwrap_or_default();
                    let published = PUBLISHED_RE.captures(entry)
                        .and_then(|c| c.get(1)).map(|m| {
                            let s = m.as_str().trim();
                            s.get(..10).unwrap_or(s).to_string()
                        })
                        .unwrap_or_default();
                    if !title.is_empty() && !summary.is_empty() {
                        arxiv_results.push(format!(
                            "[Source {}] {} ({})\nURL: {}\nContent: {}",
                            arxiv_results.len() + 1, title, published, id_url, summary
                        ));
                    }
                }
                if !arxiv_results.is_empty() {
                    let date_str = chrono::Utc::now().format("%Y-%m-%d %H:%M UTC").to_string();
                    let result = format!(
                        "⚡ REAL-TIME SEARCH RESULTS (retrieved: {}) — arXiv Research Papers:\n\n{}",
                        date_str, arxiv_results.join("\n\n")
                    );
                    SEARCH_CACHE.insert(cache_key, CachedSearchResult { content: result.clone(), timestamp: std::time::Instant::now() });
                    return Ok(result);
                }
            }
        }
    }

    if let Some(ref gh_q) = intent.github_query.clone() {
        let gh_url = format!(
            "https://api.github.com/search/repositories?q={}&sort=stars&order=desc&per_page=4",
            urlencoding::encode(gh_q)
        );
        if let Ok(Ok(resp)) = tokio::time::timeout(
            Duration::from_secs(6),
            HTTP_CLIENT.get(&gh_url)
                .header("Accept", "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2022-11-28")
                .send()
        ).await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(items) = json["items"].as_array() {
                        let mut gh_results: Vec<String> = Vec::new();
                        for (idx, repo) in items.iter().take(4).enumerate() {
                            let name = repo["full_name"].as_str().unwrap_or("").to_string();
                            let desc = repo["description"].as_str().unwrap_or("No description").to_string();
                            let stars = repo["stargazers_count"].as_i64().unwrap_or(0);
                            let url = repo["html_url"].as_str().unwrap_or("").to_string();
                            let lang = repo["language"].as_str().unwrap_or("Unknown").to_string();
                            let updated = repo["updated_at"].as_str().unwrap_or("").get(..10).unwrap_or("").to_string();
                            if !name.is_empty() {
                                gh_results.push(format!(
                                    "[Source {}] {} ⭐ {} stars | {} | Updated: {}\nURL: {}\nContent: {}",
                                    idx + 1, name, stars, lang, updated, url, desc
                                ));
                            }
                        }
                        if !gh_results.is_empty() {
                            let date_str = chrono::Utc::now().format("%Y-%m-%d %H:%M UTC").to_string();
                            let result = format!(
                                "⚡ REAL-TIME SEARCH RESULTS (retrieved: {}) — GitHub Repositories:\n\n{}",
                                date_str, gh_results.join("\n\n")
                            );
                            SEARCH_CACHE.insert(cache_key, CachedSearchResult { content: result.clone(), timestamp: std::time::Instant::now() });
                            return Ok(result);
                        }
                    }
                }
            }
        }
    }

    if intent.news_query {
        let gdelt_url = format!(
            "https://api.gdeltproject.org/api/v2/doc/doc?query={}%20sourcelang:eng&mode=artlist&format=json&maxrecords=5&timespan=24H",
            urlencoding::encode(&cleaned_query)
        );
        if let Ok(Ok(resp)) = tokio::time::timeout(
            Duration::from_secs(8),
            HTTP_CLIENT.get(&gdelt_url).send()
        ).await {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(articles) = json["articles"].as_array() {
                    let top_articles: Vec<(String, String, String, String)> = articles
                        .iter()
                        .take(5)
                        .filter_map(|a| {
                            let title = a["title"].as_str()?.to_string();
                            let url = a["url"].as_str()?.to_string();
                            if title.is_empty() || url.is_empty() { return None; }
                            let seen_date = a["seendate"].as_str().unwrap_or("").to_string();
                            let domain = a["domain"].as_str().unwrap_or("").to_string();
                            Some((title, url, seen_date, domain))
                        })
                        .collect();

                    let fetch_futs: Vec<_> = top_articles.iter().take(3).map(|(_, url, _, _)| {
                        let u = url.clone();
                        async move { fetch_page_content(&u, 2000).await }
                    }).collect();
                    let fetched_bodies = futures_util::future::join_all(fetch_futs).await;

                    let mut news_results: Vec<String> = Vec::new();
                    for (idx, (title, url, seen_date, domain)) in top_articles.iter().enumerate() {
                        let content = if idx < fetched_bodies.len() {
                            fetched_bodies[idx].clone().unwrap_or_default()
                        } else {
                            String::new()
                        };
                        let content_field = if content.is_empty() {
                            format!("Source: {} ({})", domain, seen_date)
                        } else {
                            content
                        };
                        news_results.push(format!(
                            "[Source {}] {} — {} ({})\nURL: {}\nContent: {}",
                            idx + 1, title, domain, seen_date, url, content_field
                        ));
                    }
                    if !news_results.is_empty() {
                        let date_str = chrono::Utc::now().format("%Y-%m-%d %H:%M UTC").to_string();
                        let result = format!(
                            "⚡ REAL-TIME SEARCH RESULTS (retrieved: {}) — Live News (last 24h):\n\n{}",
                            date_str, news_results.join("\n\n")
                        );
                        SEARCH_CACHE.insert(cache_key, CachedSearchResult { content: result.clone(), timestamp: std::time::Instant::now() });
                        return Ok(result);
                    }
                }
            }
        }
    }

    let ddg_instant_fut = {
        let q = cleaned_query.clone();
        async move {
            let url = format!("https://api.duckduckgo.com/?q={}&format=json&no_html=1&skip_disambig=1", urlencoding::encode(&q));
            if let Ok(resp) = HTTP_CLIENT.get(&url).send().await {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    let abstract_text = json["AbstractText"].as_str().unwrap_or("").to_string();
                    let abstract_url = json["AbstractURL"].as_str().unwrap_or("").to_string();
                    let heading = json["Heading"].as_str().unwrap_or("").to_string();
                    if !abstract_text.is_empty() {
                        return Some((heading, abstract_url, abstract_text));
                    }
                }
            }
            None
        }
    };

    let ddg_html_fut = {
        let q = cleaned_query.clone();
        let candidate_limit = (limit * 2).max(30);
        async move {
            fetch_duckduckgo_results(&q, candidate_limit).await
        }
    };

    let (ddg_results, instant_answer) = tokio::join!(ddg_html_fut, ddg_instant_fut);
    let mut parsed_items = ddg_results;

    if let Some((heading, abs_url, abs_text)) = instant_answer {
        if !heading.is_empty() && !abs_text.is_empty() {
            let url_not_dup = !parsed_items.iter().any(|(_, u, _)| u == &abs_url);
            if url_not_dup {
                parsed_items.insert(0, (heading, abs_url, abs_text));
            }
        }
    }

    if parsed_items.is_empty() {
        let wiki_url = format!(
            "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={}&format=json&utf8=1",
            urlencoding::encode(&cleaned_query)
        );
        if let Ok(Ok(resp)) = tokio::time::timeout(Duration::from_millis(800), HTTP_CLIENT.get(&wiki_url).send()).await {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(arr) = json["query"]["search"].as_array() {
                    static TAG_RE2: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"<[^>]*>").unwrap());
                    for item in arr.iter().take(limit) {
                        let title = item["title"].as_str().unwrap_or("").to_string();
                        let snippet = TAG_RE2.replace_all(item["snippet"].as_str().unwrap_or(""), "").to_string();
                        let url = format!("https://en.wikipedia.org/wiki/{}", urlencoding::encode(&title));
                        if !title.is_empty() { parsed_items.push((title, url, snippet)); }
                    }
                }
            }
        }
    }

    const AD_DOMAINS: &[&str] = &[
        "doubleclick.net", "googlesyndication.com", "adnxs.com",
        "adsrvr.org", "rubiconproject.com", "pubmatic.com",
        "taboola.com", "outbrain.com", "revcontent.com",
        "ads.yahoo.com", "bing.com/aclick", "googleadservices.com",
        "adservice.google", "ad.doubleclick", "adfarm.mediaplex.com",
    ];

    static SPONSORED_PREFIX_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?i)^(?:sponsored|ad|promoted|advertisement)\s*[·•\-\u2013:]+\s*").unwrap()
    });

    let result = if parsed_items.is_empty() {
        "No web search results found for query.".to_string()
    } else {
        let now = chrono::Utc::now();
        let date_str = now.format("%Y-%m-%d %H:%M UTC").to_string();
        let temporal_marker = if intent.temporal {
            format!("REAL-TIME SEARCH RESULTS (retrieved: {}) — Use this data; do NOT rely on pre-trained knowledge:\n\n", date_str)
        } else {
            format!("WEB SEARCH RESULTS (retrieved: {}):\n\n", date_str)
        };

        let mut seen_domains = std::collections::HashSet::new();
        let mut candidate_sources: Vec<(String, String, String)> = Vec::new();

        for (title, page_url, snippet) in parsed_items {
            if AD_DOMAINS.iter().any(|d| page_url.contains(d)) {
                continue;
            }
            let domain = page_url
                .split("://")
                .nth(1)
                .unwrap_or(&page_url)
                .split('/')
                .next()
                .unwrap_or("")
                .to_string();
            if !domain.is_empty() && seen_domains.insert(domain) {
                let clean_snip = SPONSORED_PREFIX_RE
                    .replace(&snippet, "")
                    .chars()
                    .take(1500)
                    .collect::<String>();
                if clean_snip.trim().len() > 20 {
                    candidate_sources.push((title, page_url, clean_snip));
                }
            }
            if candidate_sources.len() >= limit {
                break;
            }
        }

        // Concurrently deep-scrape top websites into clean Markdown and retrieve verified media
        let scrape_futs = candidate_sources.iter().take(4).map(|(_, url, _)| {
            let u = url.clone();
            async move {
                fetch_page_content(&u, 10_000).await
            }
        });

        let images_fut = {
            let q = cleaned_query.clone();
            async move {
                execute_duckduckgo_image_search(&q, 6).await
            }
        };

        let videos_fut = {
            let q = cleaned_query.clone();
            async move {
                execute_duckduckgo_video_search(&q, 4).await
            }
        };

        let (scraped_docs, verified_images, verified_videos) = tokio::join!(
            futures::future::join_all(scrape_futs),
            images_fut,
            videos_fut,
        );

        let mut sources_text_vec = Vec::new();
        for (i, (title, page_url, snippet)) in candidate_sources.into_iter().enumerate() {
            let full_md = if i < scraped_docs.len() {
                scraped_docs[i].as_ref().filter(|doc| doc.trim().len() > 100)
            } else {
                None
            };

            if let Some(md) = full_md {
                sources_text_vec.push(format!(
                    "[Source {}] {}\nURL: {}\nFull Webpage Content (Markdown):\n{}",
                    i + 1,
                    title,
                    page_url,
                    md.trim()
                ));
            } else {
                sources_text_vec.push(format!(
                    "[Source {}] {}\nURL: {}\nContent:\n{}",
                    i + 1,
                    title,
                    page_url,
                    snippet.trim()
                ));
            }
        }

        let mut media_sections = Vec::new();

        if !verified_images.is_empty() {
            let mut img_lines = Vec::new();
            img_lines.push("### [VERIFIED DUCKDUCKGO WEB IMAGES]".to_string());
            img_lines.push("(Naturally embed relevant verified images using `![Descriptive Caption](url)` and explain in detail what the image illustrates):\n".to_string());
            for img in &verified_images {
                img_lines.push(format!("- ![{}]({}) — {} ({})", img.title, img.url, img.title, img.source));
            }
            media_sections.push(img_lines.join("\n"));
        }

        if !verified_videos.is_empty() {
            let mut vid_lines = Vec::new();
            vid_lines.push("### [VERIFIED YOUTUBE EXPLANATION VIDEOS]".to_string());
            vid_lines.push("(Reference relevant verified videos using markdown previews or watch links):\n".to_string());
            for vid in &verified_videos {
                vid_lines.push(format!(
                    "- [![{}]({})]({}) — **{}** by {} ({})",
                    vid.title, vid.thumbnail_url, vid.url, vid.title, vid.uploader, vid.duration
                ));
            }
            media_sections.push(vid_lines.join("\n"));
        }

        let media_json_block = if !verified_images.is_empty() || !verified_videos.is_empty() {
            let payload = serde_json::json!({
                "images": verified_images,
                "videos": verified_videos,
            });
            format!("\n\n<!-- NYX_MEDIA_DATA: {} -->", payload)
        } else {
            String::new()
        };

        let sources_text = sources_text_vec.join("\n\n---\n\n");
        let media_text = if !media_sections.is_empty() {
            format!("\n\n---\n\n{}", media_sections.join("\n\n---\n\n"))
        } else {
            String::new()
        };

        format!("{}{}{}{}", temporal_marker, sources_text, media_text, media_json_block)
    };

    if !result.is_empty() && !result.starts_with("No web search") {
        SEARCH_CACHE.insert(cache_key, CachedSearchResult {
            content: result.clone(),
            timestamp: std::time::Instant::now(),
        });
    }
    Ok(result)
}
