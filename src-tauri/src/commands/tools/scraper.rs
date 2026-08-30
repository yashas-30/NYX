// ─────────────────────────────────────────────────────────────────────────────
// NYX — Web Scraper & HTML Clean Content Extractor
// ─────────────────────────────────────────────────────────────────────────────

use std::sync::LazyLock;
use std::time::Duration;
use scraper::ElementRef;
use super::cache::{HTTP_CLIENT, PAGE_CACHE, CachedSearchResult, insert_bounded_cache};

/// Fetches the actual page content from a URL, extracts meaningful body text
/// using the `scraper` crate, strips boilerplate (nav/header/footer/script/style),
/// and returns clean text capped at `max_chars`. Returns None on timeout or error.
pub async fn fetch_page_content(url: &str, max_chars: usize) -> Option<String> {
    if !url.starts_with("http") {
        return None;
    }
    let lower = url.to_lowercase();
    if lower.ends_with(".pdf") || lower.ends_with(".jpg") || lower.ends_with(".png")
        || lower.ends_with(".mp4") || lower.ends_with(".zip") || lower.ends_with(".exe")
    {
        return None;
    }

    if let Some(cached) = PAGE_CACHE.get(url) {
        if cached.timestamp.elapsed().as_secs() < 1800 {
            let limit = if max_chars == 0 { 500_000 } else { max_chars };
            return Some(cached.content.chars().take(limit).collect());
        } else {
            drop(cached);
            PAGE_CACHE.remove(url);
        }
    }

    let resp = match tokio::time::timeout(
        Duration::from_millis(2500),
        HTTP_CLIENT
            .get(url)
            .header("Accept", "text/html,application/xhtml+xml")
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
            .header("Accept-Language", "en-US,en;q=0.9")
            .send(),
    )
    .await
    {
        Ok(Ok(r)) => r,
        _ => return None,
    };

    if !resp.status().is_success() {
        return None;
    }

    if let Some(len) = resp.content_length() {
        if len > 20_000_000 {
            return None;
        }
    }

    let html = resp.text().await.ok()?;
    let markdown = extract_clean_text(&html, url);
    if markdown.trim().is_empty() {
        return None;
    }

    insert_bounded_cache(&PAGE_CACHE, url.to_string(), CachedSearchResult {
        content: markdown.clone(),
        timestamp: std::time::Instant::now(),
    }, 50);

    let limit = if max_chars == 0 { 500_000 } else { max_chars };
    let result: String = markdown.chars().take(limit).collect();
    Some(result)
}

/// Extracts the primary OpenGraph or Twitter meta image URL directly from webpage HTML.
#[allow(dead_code)]
pub fn extract_opengraph_image(html: &str) -> Option<String> {
    let document = scraper::Html::parse_document(html);
    let meta_sel = scraper::Selector::parse("meta").ok()?;
    for el in document.select(&meta_sel) {
        let val = el.value();
        let property = val.attr("property").or_else(|| val.attr("name")).unwrap_or("");
        if property.eq_ignore_ascii_case("og:image")
            || property.eq_ignore_ascii_case("og:image:url")
            || property.eq_ignore_ascii_case("twitter:image")
            || property.eq_ignore_ascii_case("twitter:image:src")
        {
            if let Some(content) = val.attr("content") {
                let trimmed = content.trim();
                if trimmed.starts_with("http") && !trimmed.ends_with(".svg") {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    None
}

#[tauri::command]
pub async fn fetch_page_html_command(url: String) -> Result<(String, bool), String> {
    let res = HTTP_CLIENT.get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Fetch failed with status: {}", res.status()));
    }

    let is_raw = url.to_lowercase().ends_with(".md")
        || url.to_lowercase().ends_with(".txt")
        || url.to_lowercase().ends_with(".csv")
        || url.to_lowercase().ends_with(".json")
        || res.headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|s| {
                let s = s.to_lowercase();
                s.contains("text/markdown") || s.contains("text/plain") || s.contains("text/csv") || s.contains("application/json")
            })
            .unwrap_or(false);

    let html = res.text().await.map_err(|e| e.to_string())?;
    Ok((html, is_raw))
}

pub fn extract_clean_text(html: &str, base_url: &str) -> String {
    let document = scraper::Html::parse_document(html);
    let base_url_parsed = url::Url::parse(base_url).ok();

    let main_selectors = [
        "article", "main", "[role=\"main\"]", "#content", "#main",
        ".main-content", ".post-content", ".article-body", ".entry-content"
    ];

    let mut target_element = document.root_element();
    for sel_str in &main_selectors {
        if let Ok(selector) = scraper::Selector::parse(sel_str) {
            if let Some(el) = document.select(&selector).next() {
                let el_text_len: usize = el.text().map(|t| t.len()).sum();
                if el_text_len > 200 {
                    target_element = el;
                    break;
                }
            }
        }
    }

    let mut markdown = String::with_capacity(html.len() / 2);
    walk_and_clean_node(target_element, &mut markdown, &base_url_parsed);

    let lines: Vec<&str> = markdown
        .lines()
        .map(|l| l.trim_end())
        .collect();

    let mut cleaned_lines = Vec::new();
    let mut blank_count = 0;

    for line in lines {
        if line.trim().is_empty() {
            blank_count += 1;
            if blank_count <= 2 {
                cleaned_lines.push("");
            }
        } else {
            blank_count = 0;
            cleaned_lines.push(line);
        }
    }

    cleaned_lines.join("\n").trim().to_string()
}

fn is_noise_element(el: &ElementRef) -> bool {
    let tag = el.value().name();

    let noise_tags = [
        "script", "style", "noscript", "svg", "nav", "header", "footer",
        "aside", "form", "iframe", "head", "dialog", "template", "menu", "button"
    ];
    if noise_tags.contains(&tag) {
        return true;
    }

    let attr_check = |attr_val: Option<&str>| -> bool {
        if let Some(val) = attr_val {
            let lower = val.to_lowercase();
            let keywords = [
                "nav", "navbar", "footer", "header", "sidebar", "banner",
                "cookie", "popup", "consent", "social", "share",
                "comments", "disqus", "modal", "overlay", "widget", "menu",
                "ad-", "adsense", "advertisement", "advert", "adslot",
                "ad_unit", "ad-unit", "ad-container", "ad-wrapper",
                "adsbygoogle", "adsystem", "ad_label", "dfp-", "gpt-ad",
                "prebid", "taboola", "outbrain", "revcontent", "sponsored",
                "promo", "promoted",
            ];
            for kw in &keywords {
                if lower.contains(kw) {
                    return true;
                }
            }
        }
        false
    };

    if attr_check(el.value().attr("class"))
        || attr_check(el.value().attr("id"))
        || attr_check(el.value().attr("role"))
    {
        return true;
    }

    false
}

fn walk_and_clean_node(
    element: ElementRef,
    out: &mut String,
    base_url: &Option<url::Url>,
) {
    if is_noise_element(&element) {
        return;
    }

    let tag = element.value().name();

    match tag {
        "h1" => out.push_str("\n\n# "),
        "h2" => out.push_str("\n\n## "),
        "h3" => out.push_str("\n\n### "),
        "h4" => out.push_str("\n\n#### "),
        "h5" => out.push_str("\n\n##### "),
        "h6" => out.push_str("\n\n###### "),
        "p" => out.push_str("\n\n"),
        "br" => out.push('\n'),
        "li" => out.push_str("\n- "),
        "blockquote" => out.push_str("\n\n> "),
        "pre" | "code" => {
            if tag == "pre" {
                out.push_str("\n\n```\n");
            } else if !out.ends_with("```\n") && !out.ends_with('`') {
                out.push('`');
            }
        }
        "tr" => out.push('\n'),
        "td" | "th" => out.push_str(" | "),
        "hr" => out.push_str("\n\n---\n\n"),
        "img" => {
            if let Some(src) = element.value().attr("src") {
                let alt = element.value().attr("alt").unwrap_or("Web Image");
                let abs_url = if src.starts_with("http") {
                    Some(src.to_string())
                } else if let Some(base) = base_url {
                    base.join(src).ok().map(|u| u.to_string())
                } else {
                    None
                };
                if let Some(abs) = abs_url {
                    if abs.starts_with("http") && !abs.ends_with(".svg") {
                        out.push_str(&format!("\n\n![{}]({})\n\n", alt, abs));
                    }
                }
            }
        }
        _ => {}
    }

    static WS_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"[ \t]+").unwrap());
    for child in element.children() {
        if let Some(text_node) = child.value().as_text() {
            let t = text_node.trim();
            if !t.is_empty() {
                let clean_text = WS_RE.replace_all(text_node, " ");
                out.push_str(&clean_text);
            }
        } else if let Some(child_el) = ElementRef::wrap(child) {
            walk_and_clean_node(child_el, out, base_url);
        }
    }

    match tag {
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "blockquote" => out.push_str("\n\n"),
        "li" => out.push('\n'),
        "pre" => out.push_str("\n```\n\n"),
        "code" => {
            if !out.ends_with('`') {
                out.push('`');
            }
        }
        _ => {}
    }
}

#[tauri::command]
pub async fn fetch_multiple_pages_command(
    app: tauri::AppHandle,
    urls: Vec<String>,
    max_chars_per_page: Option<usize>,
) -> Result<Vec<(String, Option<String>)>, String> {
    use tauri::Manager;
    let limit = max_chars_per_page.unwrap_or(100_000);
    let mut unique_urls = Vec::new();
    let mut domain_counts = std::collections::HashMap::new();

    for url in urls {
        if let Ok(parsed) = url::Url::parse(&url) {
            if let Some(host) = parsed.host_str() {
                let count = domain_counts.entry(host.to_string()).or_insert(0);
                if *count < 4 && unique_urls.len() < 80 {
                    *count += 1;
                    unique_urls.push(url);
                }
            }
        }
    }

    let fetch_futs: Vec<_> = unique_urls
        .into_iter()
        .map(|u| {
            let target_url = u.clone();
            async move {
                let content = fetch_page_content(&target_url, limit).await;
                (target_url, content)
            }
        })
        .collect();

    let results = futures_util::future::join_all(fetch_futs).await;

    // Non-blocking background vector embedding & storage in TurboVec
    if let Some(tv_store) = app.try_state::<std::sync::Arc<crate::rag::turbovec_store::TurbovecStore>>() {
        let tv_store_clone = tv_store.inner().clone();
        let items: Vec<(String, String)> = results.iter()
            .filter_map(|(u, c)| c.as_ref().map(|text| (u.clone(), text.clone())))
            .collect();

        tokio::spawn(async move {
            for (url, content) in items {
                let meta = format!("web|{}", url);
                tv_store_clone.add_document_chunks(&content, &meta).await;
            }
        });
    }

    Ok(results)
}
