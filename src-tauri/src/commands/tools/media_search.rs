// ─────────────────────────────────────────────────────────────────────────────
// NYX — Media Search (Bing/DDG Image, DDG Video, YouTube, Image Proxy)
// ─────────────────────────────────────────────────────────────────────────────

use std::time::Duration;
use base64::Engine;
use super::cache::HTTP_CLIENT;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ExtractedImagePayload {
    pub url: String,
    pub title: String,
    pub source: String,
}

pub fn is_blocked_stock_image_domain(url: &str) -> bool {
    let lower = url.to_lowercase();
    const BLOCKED_DOMAINS: &[&str] = &[
        "dreamstime.com",
        "depositphotos.com",
        "shutterstock.com",
        "istockphoto.com",
        "alamy.com",
        "123rf.com",
        "vectorstock.com",
        "gettyimages.com",
        "stock.adobe.com",
        "ftcdn.net",
        "clipart.com",
        "freepik.com",
        "canstockphoto.com",
        "bigstockphoto.com",
        "cleanpng.com",
        "pngtree.com",
        "pngwing.com",
        "pngfind.com",
        "pngitem.com",
        "doubleclick",
        "googleads",
        "adservice",
    ];
    BLOCKED_DOMAINS.iter().any(|d| lower.contains(d))
}

pub fn extract_image_search_term(raw_query: &str) -> String {
    let trimmed = raw_query.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let sanitized = trimmed
        .replace(['"', '\'', '`', '#', '*', '<', '>', '{', '}', '\n', '\r', '\t'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if sanitized.len() > 120 {
        sanitized.chars().take(120).collect()
    } else if !sanitized.is_empty() {
        sanitized
    } else {
        trimmed.to_string()
    }
}

pub async fn execute_bing_image_search(query: &str, limit: usize) -> Vec<ExtractedImagePayload> {
    let mut results = Vec::new();
    let clean_q = extract_image_search_term(query);
    if clean_q.is_empty() {
        return results;
    }

    let url = format!(
        "https://www.bing.com/images/async?q={}&first=1&count={}&scenario=ImageBasicHover&datsrc=N_A&layout=RowBased&mmasync=1",
        urlencoding::encode(&clean_q),
        (limit * 2).clamp(4, 24)
    );

    if let Ok(Ok(resp)) = tokio::time::timeout(
        Duration::from_millis(5000),
        HTTP_CLIENT.get(&url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            .header("Accept-Language", "en-US,en;q=0.9")
            .send()
    ).await {
        if let Ok(html) = resp.text().await {
            let mut seen = std::collections::HashSet::new();
            for part in html.split("m=\"") {
                if let Some(end_idx) = part.find('"') {
                    let json_str = &part[..end_idx];
                    let decoded = json_str.replace("&quot;", "\"").replace("&amp;", "&");
                    if decoded.starts_with('{') {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&decoded) {
                            if let Some(murl) = v.get("murl").and_then(|u| u.as_str()) {
                                if murl.starts_with("http") && !seen.contains(murl) && !is_blocked_stock_image_domain(murl) {
                                    seen.insert(murl.to_string());
                                    let title = v.get("t")
                                        .or_else(|| v.get("desc"))
                                        .and_then(|t| t.as_str())
                                        .unwrap_or(&clean_q);
                                    let clean_title = title
                                        .replace("<b>", "")
                                        .replace("</b>", "")
                                        .trim()
                                        .to_string();
                                    results.push(ExtractedImagePayload {
                                        url: murl.to_string(),
                                        title: if clean_title.is_empty() { clean_q.clone() } else { clean_title },
                                        source: "Web (Bing Images)".to_string(),
                                    });
                                    if results.len() >= limit {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    results
}

pub async fn execute_duckduckgo_image_search(query: &str, limit: usize) -> Vec<ExtractedImagePayload> {
    let mut results = Vec::new();
    let clean_q = extract_image_search_term(query);
    if clean_q.is_empty() {
        return results;
    }

    let token_url = format!(
        "https://duckduckgo.com/?q={}&t=h_&iar=images&iax=images&ia=images",
        urlencoding::encode(&clean_q)
    );

    let vqd_opt: Option<String> = async {
        let resp = tokio::time::timeout(
            Duration::from_millis(5000),
            HTTP_CLIENT.get(&token_url)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .header("Accept-Language", "en-US,en;q=0.9")
                .send()
        ).await.ok()?.ok()?;

        let html = resp.text().await.ok()?;
        if let Some(pos) = html.find("vqd=\"") {
            let rest = &html[pos + 5..];
            if let Some(end) = rest.find('"') {
                return Some(rest[..end].to_string());
            }
        }
        if let Some(pos) = html.find("vqd=") {
            let rest = &html[pos + 4..];
            let token: String = rest.chars().take_while(|c| c.is_ascii_digit() || *c == '-' || *c == '_').collect();
            if !token.is_empty() {
                return Some(token);
            }
        }
        None
    }.await;

    let vqd = match vqd_opt {
        Some(v) => v,
        None => return results,
    };

    let i_url = format!(
        "https://duckduckgo.com/i.js?l=us-en&o=json&q={}&vqd={}&f=,,,;&p=1",
        urlencoding::encode(&clean_q),
        vqd
    );

    if let Ok(Ok(resp)) = tokio::time::timeout(
        Duration::from_millis(5000),
        HTTP_CLIENT.get(&i_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            .header("Referer", format!("https://duckduckgo.com/?q={}", urlencoding::encode(&clean_q)))
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .send()
    ).await {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(items) = json.get("results").and_then(|r| r.as_array()) {
                let mut seen = std::collections::HashSet::new();
                for item in items {
                    if let Some(img_url) = item.get("image").and_then(|u| u.as_str()) {
                        if img_url.starts_with("http") && !seen.contains(img_url) && !is_blocked_stock_image_domain(img_url) {
                            seen.insert(img_url.to_string());
                            let title = item.get("title").and_then(|t| t.as_str()).unwrap_or(&clean_q);
                            let clean_title = title
                                .replace("<b>", "")
                                .replace("</b>", "")
                                .trim()
                                .to_string();
                            results.push(ExtractedImagePayload {
                                url: img_url.to_string(),
                                title: if clean_title.is_empty() { clean_q.clone() } else { clean_title },
                                source: "DuckDuckGo Images".to_string(),
                            });
                            if results.len() >= limit {
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    results
}

#[tauri::command]
pub async fn search_images_command(
    query: String,
    limit: Option<usize>,
) -> Result<String, String> {
    let limit = limit.unwrap_or(6);
    let cleaned = extract_image_search_term(&query);
    let mut results: Vec<ExtractedImagePayload> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    let (ddg_images, bing_images) = tokio::join!(
        execute_duckduckgo_image_search(&cleaned, limit),
        execute_bing_image_search(&cleaned, limit)
    );

    let max_len = ddg_images.len().max(bing_images.len());
    for i in 0..max_len {
        if i < ddg_images.len() {
            let item = &ddg_images[i];
            if !seen.contains(&item.url) {
                seen.insert(item.url.clone());
                results.push(item.clone());
                if results.len() >= limit {
                    break;
                }
            }
        }
        if i < bing_images.len() {
            let item = &bing_images[i];
            if !seen.contains(&item.url) {
                seen.insert(item.url.clone());
                results.push(item.clone());
                if results.len() >= limit {
                    break;
                }
            }
        }
    }

    serde_json::to_string(&results).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ExtractedVideoPayload {
    pub url: String,
    pub title: String,
    pub uploader: String,
    pub duration: String,
    pub thumbnail_url: String,
    pub video_id: String,
    pub source: String,
}

pub fn extract_youtube_id(url: &str) -> Option<String> {
    if let Some(pos) = url.find("watch?v=") {
        let rest = &url[pos + 8..];
        let id: String = rest.chars().take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '_').collect();
        if id.len() == 11 {
            return Some(id);
        }
    }
    if let Some(pos) = url.find("youtu.be/") {
        let rest = &url[pos + 9..];
        let id: String = rest.chars().take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '_').collect();
        if id.len() == 11 {
            return Some(id);
        }
    }
    if let Some(pos) = url.find("/embed/") {
        let rest = &url[pos + 7..];
        let id: String = rest.chars().take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '_').collect();
        if id.len() == 11 {
            return Some(id);
        }
    }
    if let Some(pos) = url.find("/shorts/") {
        let rest = &url[pos + 8..];
        let id: String = rest.chars().take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '_').collect();
        if id.len() == 11 {
            return Some(id);
        }
    }
    None
}

fn parse_duration_to_seconds(duration_str: &str) -> u64 {
    let parts: Vec<&str> = duration_str.trim().split(':').collect();
    match parts.len() {
        1 => parts[0].parse::<u64>().unwrap_or(0),
        2 => {
            let mins = parts[0].parse::<u64>().unwrap_or(0);
            let secs = parts[1].parse::<u64>().unwrap_or(0);
            mins * 60 + secs
        }
        3 => {
            let hours = parts[0].parse::<u64>().unwrap_or(0);
            let mins = parts[1].parse::<u64>().unwrap_or(0);
            let secs = parts[2].parse::<u64>().unwrap_or(0);
            hours * 3600 + mins * 60 + secs
        }
        _ => 0,
    }
}

fn contains_non_latin_scripts(text: &str) -> bool {
    text.chars().any(|c| {
        let u = c as u32;
        (0x0400..=0x04FF).contains(&u)
            || (0x4E00..=0x9FFF).contains(&u)
            || (0x3040..=0x30FF).contains(&u)
            || (0xAC00..=0xD7AF).contains(&u)
            || (0x0600..=0x06FF).contains(&u)
            || (0x0900..=0x0DFF).contains(&u)
            || (0x0E00..=0x0E7F).contains(&u)
            || (0x0590..=0x05FF).contains(&u)
    })
}

fn is_youtube_shorts(url: &str, title: &str, description: &str, duration_secs: u64) -> bool {
    if url.contains("/shorts/") {
        return true;
    }
    let lower_title = title.to_lowercase();
    if lower_title.contains("#shorts")
        || lower_title.contains("#short")
        || lower_title.contains("youtube shorts")
        || lower_title.contains("yt shorts")
    {
        return true;
    }
    let lower_desc = description.to_lowercase();
    if lower_desc.contains("#shorts") || lower_desc.contains("#short") {
        return true;
    }
    if duration_secs > 0 && duration_secs < 75 {
        return true;
    }
    false
}

fn calculate_explanation_video_score(
    view_count: u64,
    duration_secs: u64,
    title: &str,
    uploader: &str,
) -> f64 {
    let mut score = if view_count > 0 {
        (view_count as f64).log10() * 10.0
    } else {
        10.0
    };

    if (180..=2100).contains(&duration_secs) {
        score += 15.0;
    } else if (120..=3600).contains(&duration_secs) {
        score += 8.0;
    } else if duration_secs > 3600 {
        score += 2.0;
    }

    let lower_title = title.to_lowercase();
    let keywords = [
        "explained", "explanation", "how it works", "architecture", "deep dive",
        "tutorial", "lecture", "course", "guide", "demonstration", "breakdown",
        "understanding", "complete", "overview", "fundamentals", "introduction",
        "walkthrough", "step by step",
    ];
    for kw in &keywords {
        if lower_title.contains(kw) {
            score += 6.0;
            break;
        }
    }

    let lower_uploader = uploader.to_lowercase();
    let authority_channels = [
        "ibm", "microsoft", "google", "mit", "stanford", "veritasium", "3blue1brown",
        "kurzgesagt", "computerphile", "fireship", "lex fridman", "two minute papers",
        "khan academy", "freecodecamp", "real engineering", "scientific american",
        "crashcourse", "ted-ed", "pbs space time", "numberphile", "sabine hossenfelder",
        "statquest", "cosden solutions", "neetcode", "quanta magazine",
    ];
    for auth in &authority_channels {
        if lower_uploader.contains(auth) {
            score += 10.0;
            break;
        }
    }

    score
}

pub async fn execute_duckduckgo_video_search(query: &str, limit: usize) -> Vec<ExtractedVideoPayload> {
    let mut results = Vec::new();
    let clean_q = extract_image_search_term(query);
    if clean_q.is_empty() {
        return results;
    }

    let token_url = format!(
        "https://duckduckgo.com/?q={}&t=h_&iar=videos&iax=videos&ia=videos",
        urlencoding::encode(&clean_q)
    );

    let vqd_opt: Option<String> = async {
        let resp = tokio::time::timeout(
            Duration::from_millis(5000),
            HTTP_CLIENT.get(&token_url)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .header("Accept-Language", "en-US,en;q=0.9")
                .send()
        ).await.ok()?.ok()?;

        let html = resp.text().await.ok()?;
        if let Some(pos) = html.find("vqd=\"") {
            let rest = &html[pos + 5..];
            if let Some(end) = rest.find('"') {
                return Some(rest[..end].to_string());
            }
        }
        if let Some(pos) = html.find("vqd=") {
            let rest = &html[pos + 4..];
            let token: String = rest.chars().take_while(|c| c.is_ascii_digit() || *c == '-' || *c == '_').collect();
            if !token.is_empty() {
                return Some(token);
            }
        }
        None
    }.await;

    let vqd = match vqd_opt {
        Some(v) => v,
        None => return results,
    };

    let v_url = format!(
        "https://duckduckgo.com/v.js?l=us-en&o=json&q={}&vqd={}&p=1&s=0",
        urlencoding::encode(&clean_q),
        vqd
    );

    struct ScoredCandidate {
        payload: ExtractedVideoPayload,
        score: f64,
    }

    let mut candidates: Vec<ScoredCandidate> = Vec::new();

    if let Ok(Ok(resp)) = tokio::time::timeout(
        Duration::from_millis(5000),
        HTTP_CLIENT.get(&v_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            .header("Referer", format!("https://duckduckgo.com/?q={}", urlencoding::encode(&clean_q)))
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("Accept-Language", "en-US,en;q=0.9")
            .send()
    ).await {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(items) = json.get("results").and_then(|r| r.as_array()) {
                let mut seen_ids = std::collections::HashSet::new();
                for item in items {
                    let content_url = item.get("content").and_then(|u| u.as_str()).unwrap_or("");
                    if let Some(vid_id) = extract_youtube_id(content_url) {
                        if !seen_ids.contains(&vid_id) {
                            seen_ids.insert(vid_id.clone());

                            let raw_title = item.get("title").and_then(|t| t.as_str()).unwrap_or(&clean_q);
                            let title = raw_title.replace("<b>", "").replace("</b>", "").replace("&amp;", "&").replace("&quot;", "\"").trim().to_string();
                            let uploader = item.get("uploader").and_then(|u| u.as_str()).unwrap_or("YouTube").trim().to_string();
                            let description = item.get("description").and_then(|d| d.as_str()).unwrap_or("").to_string();
                            let duration_str = item.get("duration").and_then(|d| d.as_str()).unwrap_or("").trim().to_string();

                            if contains_non_latin_scripts(&title) || contains_non_latin_scripts(&uploader) {
                                continue;
                            }

                            let duration_secs = parse_duration_to_seconds(&duration_str);
                            if is_youtube_shorts(content_url, &title, &description, duration_secs) {
                                continue;
                            }

                            let view_count = item.get("statistics")
                                .and_then(|s| s.get("viewCount"))
                                .and_then(|v| v.as_u64())
                                .or_else(|| {
                                    item.get("views").and_then(|v| {
                                        if let Some(n) = v.as_u64() {
                                            Some(n)
                                        } else if let Some(s) = v.as_str() {
                                            s.replace(',', "").parse::<u64>().ok()
                                        } else {
                                            None
                                        }
                                    })
                                })
                                .unwrap_or(0);

                            let score = calculate_explanation_video_score(
                                view_count,
                                duration_secs,
                                &title,
                                &uploader,
                            );

                            let thumbnail = item.get("images")
                                .and_then(|imgs| imgs.get("large").or_else(|| imgs.get("medium")).or_else(|| imgs.get("small")))
                                .and_then(|img| img.as_str())
                                .map(|s| s.to_string())
                                .unwrap_or_else(|| format!("https://img.youtube.com/vi/{}/hqdefault.jpg", vid_id));

                            let canonical_url = format!("https://www.youtube.com/watch?v={}", vid_id);

                            candidates.push(ScoredCandidate {
                                payload: ExtractedVideoPayload {
                                    url: canonical_url,
                                    title: if title.is_empty() { clean_q.clone() } else { title },
                                    uploader,
                                    duration: duration_str,
                                    thumbnail_url: thumbnail,
                                    video_id: vid_id,
                                    source: "YouTube (DuckDuckGo Video Search)".to_string(),
                                },
                                score,
                            });
                        }
                    }
                }
            }
        }
    }

    candidates.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    for cand in candidates.into_iter().take(limit) {
        results.push(cand.payload);
    }

    results
}

#[tauri::command]
pub async fn search_videos_command(
    query: String,
    limit: Option<usize>,
) -> Result<String, String> {
    let limit = limit.unwrap_or(4);
    let videos = execute_duckduckgo_video_search(&query, limit).await;
    serde_json::to_string(&videos).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct FetchedImagePayload {
    pub base64: String,
    pub mime_type: String,
}

#[tauri::command]
pub async fn fetch_image_base64(url: String) -> Result<FetchedImagePayload, String> {
    if !url.starts_with("http") {
        return Err("Invalid URL: must start with http".to_string());
    }

    let resp = HTTP_CLIENT
        .get(&url)
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .map_err(|e| format!("Fetch failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP error: {}", resp.status()));
    }

    let mime_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .split(';')
        .next()
        .unwrap_or("image/jpeg")
        .trim()
        .to_string();

    if !mime_type.starts_with("image/") {
        return Err(format!("Not an image (content-type: {})", mime_type));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("Body read failed: {}", e))?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);

    Ok(FetchedImagePayload { base64: encoded, mime_type })
}

#[tauri::command]
pub async fn fetch_image_data_url_command(url: String) -> Result<String, String> {
    let target_url = if url.starts_with("//") {
        format!("https:{}", url)
    } else {
        url
    };

    if !target_url.starts_with("http") {
        return Err("Invalid URL scheme".to_string());
    }

    let is_pollinations = target_url.contains("pollinations.ai");
    let timeout_secs = if is_pollinations { 60 } else { 25 };

    let mut req = HTTP_CLIENT
        .get(&target_url)
        .header("Accept", "image/avif,image/webp,image/apng,image/png,image/jpeg,image/*,*/*;q=0.8")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");

    if !is_pollinations {
        req = req
            .header("Referer", "https://en.wikipedia.org/")
            .header("Origin", "https://en.wikipedia.org");
    }

    let resp = tokio::time::timeout(
        Duration::from_secs(timeout_secs),
        req.send(),
    )
    .await
    .map_err(|_| format!("Timeout after {}s fetching image", timeout_secs))?
    .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP error {}", resp.status()));
    }

    let raw_ct = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg");

    let content_type = if raw_ct.contains("png") {
        "image/png"
    } else if raw_ct.contains("webp") {
        "image/webp"
    } else if raw_ct.contains("gif") {
        "image/gif"
    } else if raw_ct.contains("svg") {
        "image/svg+xml"
    } else {
        "image/jpeg"
    };

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    if bytes.is_empty() || bytes.len() > 25_000_000 {
        return Err("Invalid image bytes size".to_string());
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", content_type, b64))
}

#[allow(dead_code)]
async fn query_entity_image_api(term: &str) -> Option<(String, String)> {
    let ov_url = format!(
        "https://api.openverse.org/v1/images/?q={}&page_size=1",
        urlencoding::encode(term)
    );

    if let Ok(Ok(resp)) = tokio::time::timeout(
        Duration::from_millis(1500),
        HTTP_CLIENT.get(&ov_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .send()
    ).await {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(results) = json.get("results").and_then(|r| r.as_array()) {
                if let Some(first) = results.first() {
                    if let (Some(url), Some(title)) = (
                        first.get("url").and_then(|u| u.as_str()),
                        first.get("title").and_then(|t| t.as_str()),
                    ) {
                        return Some((url.to_string(), title.to_string()));
                    }
                }
            }
        }
    }
    None
}

#[allow(dead_code)]
pub async fn fetch_entity_image(query: &str) -> Option<(String, String)> {
    let cleaned = super::web_search::decontextualize_query(query);
    if cleaned.trim().is_empty() {
        return None;
    }

    let lower = cleaned.to_lowercase();
    let prefixes = [
        "who is the ", "who is ", "who was the ", "who was ", "who's the ", "who's ",
        "what is the ", "what is ", "tell me about ", "picture of ", "photo of ", "image of "
    ];
    let mut stripped = cleaned.clone();
    for p in &prefixes {
        if lower.starts_with(p) {
            stripped = cleaned[p.len()..].trim().to_string();
            break;
        }
    }

    if let Some(res) = query_entity_image_api(&stripped).await {
        return Some(res);
    }
    if stripped != cleaned {
        if let Some(res) = query_entity_image_api(&cleaned).await {
            return Some(res);
        }
    }

    None
}
