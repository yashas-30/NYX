use serde_json::{json, Value};
use tokio::fs;
use tokio::process::Command;
use std::process::Stdio;
use tauri::Manager;
use base64::Engine;
use std::sync::LazyLock;
use std::time::Duration;

// Fix #6: Shared HTTP client with connection pool reuse.
// Previously every web fetch and page load created its own Client, discarding
// the connection pool each time. A single LazyLock client reuses HTTP/2
// connections and amortises TLS handshakes across concurrent requests.
pub static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0")
        // Global request timeout (raised — page fetches can be slow on first load).
        .timeout(Duration::from_secs(15))
        // Separate connect timeout keeps initial TLS handshake snappy.
        .connect_timeout(Duration::from_secs(8))
        // Reduce idle pool size: fewer idle sockets = fewer Windows wsarecv kills.
        .pool_max_idle_per_host(4)
        // Evict idle sockets after 60 s so we never reuse a Windows-killed connection.
        .pool_idle_timeout(Duration::from_secs(60))
        // TCP-level keepalive probes every 30 s — keeps the Windows socket alive.
        .tcp_keepalive(Duration::from_secs(30))
        // HTTP/2 PING frame every 20 s on idle connections.
        .http2_keep_alive_interval(Duration::from_secs(20))
        // Send PINGs even when no streams are active (fixes wsarecv on idle H2).
        .http2_keep_alive_while_idle(true)
        // If the server ignores a PING for 10 s, close and reconnect cleanly.
        .http2_keep_alive_timeout(Duration::from_secs(10))
        .connection_verbose(false)
        .build()
        .expect("Failed to build shared HTTP client")
});

pub struct CachedSearchResult {
    pub content: String,
    pub timestamp: std::time::Instant,
}

pub static SEARCH_CACHE: LazyLock<dashmap::DashMap<String, CachedSearchResult>> = LazyLock::new(dashmap::DashMap::new);
pub static PAGE_CACHE: LazyLock<dashmap::DashMap<String, CachedSearchResult>> = LazyLock::new(dashmap::DashMap::new);
/// Microsecond-level (<0.01ms) in-memory cache for prompt responses & deep research results.
pub static PROMPT_RESPONSE_CACHE: LazyLock<dashmap::DashMap<String, CachedSearchResult>> = LazyLock::new(dashmap::DashMap::new);

#[tauri::command]
pub async fn check_prompt_cache_command(prompt: String) -> Result<Option<String>, String> {
    let key = prompt.trim().to_lowercase();
    if let Some(cached) = PROMPT_RESPONSE_CACHE.get(&key) {
        if cached.value().timestamp.elapsed().as_secs() < 3600 { // 1-hour cache
            return Ok(Some(cached.value().content.clone()));
        } else {
            drop(cached);
            PROMPT_RESPONSE_CACHE.remove(&key);
        }
    }
    Ok(None)
}

#[tauri::command]
pub async fn save_prompt_cache_command(prompt: String, response: String) -> Result<(), String> {
    let key = prompt.trim().to_lowercase();
    if !key.is_empty() && !response.trim().is_empty() {
        PROMPT_RESPONSE_CACHE.insert(key, CachedSearchResult {
            content: response,
            timestamp: std::time::Instant::now(),
        });
    }
    Ok(())
}

/// Fetches the actual page content from a URL, extracts meaningful body text
/// using the `scraper` crate, strips boilerplate (nav/header/footer/script/style),
/// and returns clean text capped at `max_chars`. Returns None on timeout or error.
///
/// Features microsecond-level PAGE_CACHE to return already-scraped pages in 0.01ms.
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

    // Fast-path: Microsecond in-memory PAGE_CACHE lookup (<0.01ms)
    if let Some(cached) = PAGE_CACHE.get(url) {
        if cached.timestamp.elapsed().as_secs() < 1800 { // 30-min page cache
            let limit = if max_chars == 0 { 500_000 } else { max_chars };
            return Some(cached.content.chars().take(limit).collect());
        } else {
            drop(cached);
            PAGE_CACHE.remove(url);
        }
    }

    let resp = match tokio::time::timeout(
        // 3.5s fast timeout per page — parallel async fetching retrieves all site bodies concurrently in 3.5s total.
        Duration::from_millis(3500),
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

    // Cache the clean parsed markdown page content
    PAGE_CACHE.insert(url.to_string(), CachedSearchResult {
        content: markdown.clone(),
        timestamp: std::time::Instant::now(),
    });

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




pub async fn execute_tool(app: &tauri::AppHandle, name: &str, args_json: &str) -> String {
    let args: Value = match serde_json::from_str(args_json) {
        Ok(v) => v,
        Err(_) => return format!("Error: Failed to parse tool arguments as JSON: {}", args_json),
    };

    match name {
        "web_search" => {
            let query = args["query"].as_str().unwrap_or("");
            let num_results = args["num_results"].as_u64().unwrap_or(5) as usize;
            
            let state = app.state::<crate::AppState>();
            let search_provider = state.search_provider.read().await.clone();
            let search_api_key = state.search_api_key.read().await.clone();
            
            match search_web_command(query.to_string(), Some(num_results), Some(search_provider), Some(search_api_key)).await {
                Ok(res) => res,
                Err(e) => format!("Search failed: {}", e),
            }
        }
        "read_file" => {
            let path = args["path"].as_str().unwrap_or("");
            match fs::read_to_string(path).await {
                Ok(content) => content,
                Err(e) => format!("Error reading file at {}: {}", path, e),
            }
        }
        "write_file" => {
            let path = args["path"].as_str().unwrap_or("");
            let content = args["content"].as_str().unwrap_or("");
            match fs::write(path, content).await {
                Ok(_) => format!("Successfully wrote to file: {}", path),
                Err(e) => format!("Error writing to file at {}: {}", path, e),
            }
        }
        "edit_file" => {
            let path = args["path"].as_str().unwrap_or("");
            let target = args["target"].as_str().unwrap_or("");
            let replacement = args["replacement"].as_str().unwrap_or("");
            match fs::read_to_string(path).await {
                Ok(content) => {
                    if content.contains(target) {
                        let updated = content.replace(target, replacement);
                        match fs::write(path, updated).await {
                            Ok(_) => format!("Successfully edited file: {}", path),
                            Err(e) => format!("Error writing edited file: {}", e),
                        }
                    } else {
                        format!("Error: target content not found in file {}", path)
                    }
                }
                Err(e) => format!("Error reading file for edit: {}", e),
            }
        }
        "list_directory" => {
            let path = args["path"].as_str().unwrap_or(".");
            match tokio::fs::read_dir(path).await {
                Ok(mut entries) => {
                    let mut list = Vec::new();
                    while let Ok(Some(entry)) = entries.next_entry().await {
                        let name = entry.file_name().to_string_lossy().to_string();
                        let file_type = match entry.file_type().await {
                            Ok(ft) if ft.is_dir() => "directory",
                            _ => "file",
                        };
                        list.push(format!("- {} ({})", name, file_type));
                    }
                    list.join("\n")
                }
                Err(e) => format!("Error listing directory: {}", e),
            }
        }
        "grep_search" => {
            let path = args["path"].as_str().unwrap_or(".");
            let query = args["query"].as_str().unwrap_or("");
            let mut results = Vec::new();
            let mut dirs = vec![std::path::PathBuf::from(path)];
            
            while let Some(dir) = dirs.pop() {
                if let Ok(mut entries) = tokio::fs::read_dir(dir).await {
                    while let Ok(Some(entry)) = entries.next_entry().await {
                        let p = entry.path();
                        if let Ok(ft) = entry.file_type().await {
                            if ft.is_dir() {
                                dirs.push(p);
                            } else if ft.is_file() {
                                if let Ok(content) = tokio::fs::read_to_string(&p).await {
                                    for (line_num, line) in content.lines().enumerate() {
                                        if line.contains(query) {
                                            results.push(format!("{}:{}: {}", p.display(), line_num + 1, line.trim()));
                                            if results.len() > 50 { break; }
                                        }
                                    }
                                }
                            }
                        }
                        if results.len() > 50 { break; }
                    }
                }
                if results.len() > 50 { break; }
            }
            if results.is_empty() {
                "No matches found.".to_string()
            } else {
                results.join("\n")
            }
        }
        "diff_files" => {
            let path_a = args["path_a"].as_str().unwrap_or("");
            let path_b = args["path_b"].as_str().unwrap_or("");
            let content_a = fs::read_to_string(path_a).await.unwrap_or_default();
            let content_b = fs::read_to_string(path_b).await.unwrap_or_default();
            let mut diff = Vec::new();
            let lines_a: Vec<&str> = content_a.lines().collect();
            let lines_b: Vec<&str> = content_b.lines().collect();
            let max_lines = std::cmp::max(lines_a.len(), lines_b.len());
            for i in 0..max_lines {
                if i < lines_a.len() && i < lines_b.len() {
                    if lines_a[i] != lines_b[i] {
                        diff.push(format!("- Line {}: {}", i + 1, lines_a[i]));
                        diff.push(format!("+ Line {}: {}", i + 1, lines_b[i]));
                    }
                } else if i < lines_a.len() {
                    diff.push(format!("- Line {}: {}", i + 1, lines_a[i]));
                } else {
                    diff.push(format!("+ Line {}: {}", i + 1, lines_b[i]));
                }
            }
            if diff.is_empty() {
                "Files are identical.".to_string()
            } else {
                diff.join("\n")
            }
        }
        "web_browse" => {
            let url = args["url"].as_str().unwrap_or("");
            let url_str = url.to_string();
            use tauri::Emitter;
            match app.emit("open_browser_window", serde_json::json!({ "url": url_str })) {
                Ok(_) => "Sent open_browser_window event to frontend successfully.".to_string(),
                Err(e) => format!("Failed to emit open_browser_window event: {}", e)
            }
        }
        "browser_click" => {
            let selector = args["selector"].as_str().unwrap_or("");
            let js = format!(
                r#"
                (function() {{
                    try {{
                        const el = document.querySelector({:?});
                        if (el) {{
                            el.click();
                            window.__TAURI_INTERNALS__.invoke("resolve_browser_action", {{ action_id: "ACTION_ID", result: "success" }});
                        }} else {{
                            window.__TAURI_INTERNALS__.invoke("resolve_browser_action", {{ action_id: "ACTION_ID", result: "Element not found" }});
                        }}
                    }} catch (e) {{
                        window.__TAURI_INTERNALS__.invoke("resolve_browser_action", {{ action_id: "ACTION_ID", result: "Error: " + e.message }});
                    }}
                }})()
                "#,
                selector
            );
            match run_browser_script(app, &js).await {
                Ok(res) => res,
                Err(e) => e,
            }
        }
        "browser_type" => {
            let selector = args["selector"].as_str().unwrap_or("");
            let text = args["text"].as_str().unwrap_or("");
            let js = format!(
                r#"
                (function() {{
                    try {{
                        const el = document.querySelector({:?});
                        if (el) {{
                            el.value = {:?};
                            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                            el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                            window.__TAURI_INTERNALS__.invoke("resolve_browser_action", {{ action_id: "ACTION_ID", result: "success" }});
                        }} else {{
                            window.__TAURI_INTERNALS__.invoke("resolve_browser_action", {{ action_id: "ACTION_ID", result: "Element not found" }});
                        }}
                    }} catch (e) {{
                        window.__TAURI_INTERNALS__.invoke("resolve_browser_action", {{ action_id: "ACTION_ID", result: "Error: " + e.message }});
                    }}
                }})()
                "#,
                selector, text
            );
            match run_browser_script(app, &js).await {
                Ok(res) => res,
                Err(e) => e,
            }
        }
        "browser_get_html" => {
            let js = r#"
                (function() {
                    try {
                        const html = document.documentElement.outerHTML;
                        window.__TAURI_INTERNALS__.invoke("resolve_browser_action", { action_id: "ACTION_ID", result: html });
                    } catch (e) {
                        window.__TAURI_INTERNALS__.invoke("resolve_browser_action", { action_id: "ACTION_ID", result: "Error: " + e.message });
                    }
                })()
            "#;
            match run_browser_script(app, js).await {
                Ok(res) => res,
                Err(e) => e,
            }
        }
        "browser_screenshot" => {
            let window = match app.get_webview_window("nyx_browser") {
                Some(w) => w,
                None => return "Browser overlay window is not open.".to_string(),
            };
            let pos = match window.outer_position() {
                Ok(p) => p,
                Err(e) => return format!("Failed to get window position: {}", e),
            };
            let size = match window.outer_size() {
                Ok(s) => s,
                Err(e) => return format!("Failed to get window size: {}", e),
            };
            let monitors = match xcap::Monitor::all() {
                Ok(m) => m,
                Err(e) => return format!("Failed to enumerate monitors: {}", e),
            };
            let monitor = match monitors.into_iter().find(|m| m.is_primary().unwrap_or(false))
                .or_else(|| xcap::Monitor::all().unwrap_or_default().into_iter().next()) {
                Some(m) => m,
                None => return "No monitor found".to_string(),
            };
            let img = match monitor.capture_image() {
                Ok(i) => i,
                Err(e) => return format!("Screenshot capture failed: {}", e),
            };
            let x = std::cmp::max(0, pos.x) as u32;
            let y = std::cmp::max(0, pos.y) as u32;
            let w = std::cmp::min(size.width, img.width().saturating_sub(x));
            let h = std::cmp::min(size.height, img.height().saturating_sub(y));
            let cropped = image::imageops::crop_imm(&img, x, y, w, h).to_image();
            let mut buf = std::io::Cursor::new(Vec::new());
            if let Err(e) = cropped.write_to(&mut buf, image::ImageFormat::Jpeg) {
                return format!("Failed to encode screenshot: {}", e);
            }
            base64::engine::general_purpose::STANDARD.encode(buf.into_inner())
        }
        "fetch_page" => {
            let url = args["url"].as_str().unwrap_or("");
            if let Some(crawl_md) = crawl4ai_fetch_page(url).await {
                crawl_md
            } else {
                match fetch_page_html_command(url.to_string()).await {
                    Ok((html, is_raw)) => {
                        let cleaned = if is_raw {
                            html
                        } else {
                            extract_clean_text(&html, url)
                        };
                        if cleaned.len() > 15000 {
                            format!("{}... [Truncated]", &cleaned[..15000])
                        } else {
                            cleaned
                        }
                    }
                    Err(e) => format!("Failed to fetch page: {}", e),
                }
            }
        }
        "web_scrape" => {
            let url = args["url"].as_str().unwrap_or("");
            let keyword = args["keyword"].as_str().unwrap_or("");
            match fetch_page_html_command(url.to_string()).await {
                Ok((html, is_raw)) => {
                    let plain = if is_raw {
                        html
                    } else {
                        extract_clean_text(&html, url)
                    };
                    let mut matches = Vec::new();
                    for line in plain.lines() {
                        if line.contains(keyword) {
                            matches.push(line.trim());
                        }
                    }
                    if matches.is_empty() {
                        "No matching elements containing keyword found.".to_string()
                    } else {
                        matches.join("\n")
                    }
                }
                Err(e) => format!("Failed to scrape page: {}", e),
            }
        }
        "run_python" => {
            let code = args["code"].as_str().unwrap_or("");
            let mut cmd = if cfg!(target_os = "windows") {
                let mut c = Command::new("python");
                c.arg("-c").arg(code);
                c
            } else {
                let mut c = Command::new("python3");
                c.arg("-c").arg(code);
                c
            };
            cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
            match cmd.output().await {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                    format!("STDOUT:\n{}\nSTDERR:\n{}", stdout, stderr)
                }
                Err(e) => format!("Failed to run Python code: {}", e),
            }
        }
        "run_javascript" => {
            let code = args["code"].as_str().unwrap_or("");
            let mut cmd = Command::new("node");
            cmd.arg("-e").arg(code);
            cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
            match cmd.output().await {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                    format!("STDOUT:\n{}\nSTDERR:\n{}", stdout, stderr)
                }
                Err(e) => format!("Failed to run Node.js script: {}", e),
            }
        }
        "run_shell" | "run_test" | "lint_code" | "run_terminal_command" => {
            let command = args["command"].as_str().unwrap_or("");
            let cwd = args["cwd"].as_str().unwrap_or("");
            let mut cmd = if cfg!(target_os = "windows") {
                let mut c = Command::new("powershell");
                c.arg("-Command").arg(command);
                c
            } else {
                let mut c = Command::new("sh");
                c.arg("-c").arg(command);
                c
            };
            if !cwd.is_empty() {
                cmd.current_dir(cwd);
            }
            cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
            match cmd.output().await {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                    format!("STDOUT:\n{}\nSTDERR:\n{}", stdout, stderr)
                }
                Err(e) => format!("Failed to run command: {}", e),
            }
        }
        "get_system_info" => {
            let res = super::system::system_info(app.clone()).await;
            if res.success {
                serde_json::to_string_pretty(&res.data).unwrap_or_default()
            } else {
                res.error.unwrap_or_else(|| "Failed to get system info".to_string())
            }
        }
        "take_screenshot" => {
            let path = args["path"].as_str().unwrap_or("screenshot.jpg");
            match super::computer_use::execute_computer_action("screenshot".to_string(), "{}".to_string()).await {
                Ok(b64) => {
                    if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64) {
                        match tokio::fs::write(path, bytes).await {
                            Ok(_) => format!("Screenshot saved to {}", path),
                            Err(e) => format!("Screenshot captured but failed to save to {}: {}", path, e),
                        }
                    } else {
                        "Failed to decode screenshot base64".to_string()
                    }
                }
                Err(e) => format!("Failed to capture screenshot: {}", e),
            }
        }
        "run_mcp_tool" => {
            let server = args["server"].as_str().unwrap_or("");
            let tool = args["tool"].as_str().unwrap_or("");
            let arguments_str = args["arguments"].as_str().unwrap_or("{}");
            let parsed_args: Value = serde_json::from_str(arguments_str).unwrap_or(json!({}));
            
            let app_state = app.state::<crate::AppState>();
            let mcp_manager = &app_state.mcp_manager;
            
            match super::mcp::mcp_call_tool_internal(
                server,
                tool,
                parsed_args,
                mcp_manager
            ).await {
                Ok(res) => serde_json::to_string_pretty(&res).unwrap_or_default(),
                Err(e) => format!("MCP call failed: {}", e),
            }
        }
        "schedule_task" => {
            // schedule_task was removed: fire-and-forget orphan tasks with no
            // cancellation, no error reporting, and no handle tracking are
            // unsafe. Use run_terminal_command directly instead.
            "schedule_task has been removed. Use run_terminal_command to run commands directly.".to_string()
        }
        "read_pdf" => {
            let path = args["path"].as_str().unwrap_or("");
            match tokio::fs::read(path).await {
                Ok(bytes) => {
                    let mut text = String::new();
                    let mut in_parentheses = false;
                    let mut current_str = Vec::new();
                    for b in bytes {
                        if b == b'(' && !in_parentheses {
                            in_parentheses = true;
                        } else if b == b')' && in_parentheses {
                            in_parentheses = false;
                            if let Ok(s) = String::from_utf8(current_str.clone()) {
                                let trimmed = s.trim();
                                if trimmed.len() > 1 && trimmed.chars().all(|c| c.is_ascii() && !c.is_control()) {
                                    text.push_str(trimmed);
                                    text.push(' ');
                                }
                            }
                            current_str.clear();
                        } else if in_parentheses {
                            current_str.push(b);
                        }
                    }
                    if text.trim().is_empty() {
                        "Plaintext extraction failed. (PDF may be binary or compressed)".to_string()
                    } else if text.len() > 10000 {
                        format!("{}... [Truncated]", &text[..10000])
                    } else {
                        text
                    }
                }
                Err(e) => format!("Failed to read PDF file: {}", e),
            }
        }
        "read_docx" => {
            let path = args["path"].as_str().unwrap_or("");
            match tokio::fs::read(path).await {
                Ok(bytes) => {
                    let mut text = String::new();
                    let mut in_tag = false;
                    let mut tag_content = Vec::new();
                    let mut is_text_tag = false;
                    
                    let mut i = 0;
                    while i < bytes.len() {
                        if bytes[i] == b'<' {
                            in_tag = true;
                            tag_content.clear();
                        } else if bytes[i] == b'>' {
                            in_tag = false;
                            let tag_str = String::from_utf8_lossy(&tag_content);
                            if tag_str.starts_with("w:t") {
                                is_text_tag = true;
                            } else if tag_str.starts_with("/w:t") {
                                is_text_tag = false;
                            }
                        } else if in_tag {
                            tag_content.push(bytes[i]);
                        } else if is_text_tag {
                            text.push(bytes[i] as char);
                        }
                        i += 1;
                    }
                    if text.is_empty() {
                        let mut ascii_text = String::new();
                        let mut temp = Vec::new();
                        for b in bytes {
                            if b.is_ascii() && !b.is_ascii_control() {
                                temp.push(b);
                            } else {
                                if temp.len() > 4 {
                                    if let Ok(s) = String::from_utf8(temp.clone()) {
                                        ascii_text.push_str(&s);
                                        ascii_text.push(' ');
                                    }
                                }
                                temp.clear();
                            }
                        }
                        if ascii_text.len() > 10000 {
                            format!("{}... [Truncated]", &ascii_text[..10000])
                        } else if ascii_text.is_empty() {
                            "Failed to extract text from DOCX.".to_string()
                        } else {
                            ascii_text
                        }
                    } else if text.len() > 10000 {
                        format!("{}... [Truncated]", &text[..10000])
                    } else {
                        text
                    }
                }
                Err(e) => format!("Failed to read DOCX file: {}", e),
            }
        }
        "create_presentation" => {
            let path = args["path"].as_str().unwrap_or("presentation.md");
            let title = args["title"].as_str().unwrap_or("Presentation");
            let slides_val = args["slides"].as_array();
            let mut md = format!("# {}\n\n", title);
            if let Some(slides) = slides_val {
                for (idx, slide) in slides.iter().enumerate() {
                    md.push_str(&format!("--- \n\n## Slide {}\n{}\n\n", idx + 1, slide.as_str().unwrap_or("")));
                }
            }
            match fs::write(path, md).await {
                Ok(_) => format!("Created Markdown presentation slides at {}", path),
                Err(e) => format!("Failed to create presentation: {}", e),
            }
        }
        "create_spreadsheet" => {
            let path = args["path"].as_str().unwrap_or("spreadsheet.csv");
            let headers_val = args["headers"].as_array();
            let rows_val = args["rows"].as_array();
            let mut csv = String::new();
            if let Some(headers) = headers_val {
                let h_strs: Vec<String> = headers.iter().map(|h| format!("\"{}\"", h.as_str().unwrap_or(""))).collect();
                csv.push_str(&h_strs.join(","));
                csv.push('\n');
            }
            if let Some(rows) = rows_val {
                for row in rows {
                    if let Some(cells) = row.as_array() {
                        let r_strs: Vec<String> = cells.iter().map(|c| format!("\"{}\"", c.as_str().unwrap_or(""))).collect();
                        csv.push_str(&r_strs.join(","));
                        csv.push('\n');
                    }
                }
            }
            match fs::write(path, csv).await {
                Ok(_) => format!("Created spreadsheet CSV at {}", path),
                Err(e) => format!("Failed to create spreadsheet: {}", e),
            }
        }
        "generate_image" | "edit_image" | "analyze_image" => {
            // These tools are not yet implemented with a real image generation/analysis backend.
            // They have been removed from the tool registry to prevent the LLM from calling them
            // and receiving misleading stub responses. This branch handles any residual calls.
            format!("Tool '{}' is not currently implemented. No image generation or analysis backend is configured.", name)
        }
        _ => {
            let call_id = uuid::Uuid::new_v4().to_string();
            let (tx, rx) = tokio::sync::oneshot::channel::<String>();

            {
                let app_state = app.state::<crate::AppState>();
                // tokio::sync::Mutex â€” must .await
                let mut pending = app_state.pending_plugin_tools.lock().await;
                pending.insert(call_id.clone(), tx);
            }

            #[derive(serde::Serialize, Clone)]
            struct PluginToolPayload {
                call_id: String,
                name: String,
                args: String,
            }

            let payload = PluginToolPayload {
                call_id: call_id.clone(),
                name: name.to_string(),
                args: args_json.to_string(),
            };

            use tauri::Emitter;
            if let Err(e) = app.emit("execute_plugin_tool", payload) {
                let app_state = app.state::<crate::AppState>();
                let mut pending = app_state.pending_plugin_tools.lock().await;
                pending.remove(&call_id);
                return format!("Error emitting plugin tool: {}", e);
            }

            match rx.await {
                Ok(result) => result,
                Err(_) => format!("Error: Plugin tool execution timed out or failed for '{}'", name),
            }
        }
    }
}

async fn crawl4ai_fetch_page(url: &str) -> Option<String> {
    let script_path = std::path::Path::new("scripts").join("crawl4ai_extractor.py");
    if !script_path.exists() {
        return None;
    }

    let mut cmd = Command::new("python");
    cmd.arg(&script_path).arg("--url").arg(url).arg("--max-chars").arg("15000");
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    match tokio::time::timeout(Duration::from_secs(12), cmd.output()).await {
        Ok(Ok(output)) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let trimmed = stdout.trim().to_string();
            if trimmed.len() > 50 && !trimmed.starts_with("Error") {
                Some(trimmed)
            } else {
                None
            }
        }
        _ => None,
    }
}

#[tauri::command]
pub async fn fetch_page_html_command(url: String) -> Result<(String, bool), String> {
    // Fix #6: Reuse the shared pooled client instead of constructing a new one per call.
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

use scraper::ElementRef;

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
                // Layout / chrome noise
                "nav", "navbar", "footer", "header", "sidebar", "banner",
                "cookie", "popup", "consent", "social", "share",
                "comments", "disqus", "modal", "overlay", "widget", "menu",
                // Ad / sponsored content — strip these containers entirely
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

    for child in element.children() {
        if let Some(text_node) = child.value().as_text() {
            let t = text_node.trim();
            if !t.is_empty() {
                let clean_text = regex::Regex::new(r"[ \t]+")
                    .unwrap()
                    .replace_all(text_node, " ");
                out.push_str(&clean_text);
            }
        } else if let Some(child_el) = ElementRef::wrap(child) {
            let child_tag = child_el.value().name();
            if child_tag == "a" {
                let href = child_el.value().attr("href").unwrap_or("");
                let anchor_text: String = child_el.text().collect::<Vec<_>>().join(" ").trim().to_string();
                if !anchor_text.is_empty() && !href.is_empty() && !href.starts_with('#') && !href.starts_with("javascript:") {
                    let absolute_href = if let Some(ref base) = base_url {
                        base.join(href).map(|u| u.to_string()).unwrap_or_else(|_| href.to_string())
                    } else {
                        href.to_string()
                    };
                    out.push_str(&format!(" [{}]({}) ", anchor_text, absolute_href));
                } else if !anchor_text.is_empty() {
                    out.push_str(&anchor_text);
                }
            } else if child_tag == "img" {
                let alt = child_el.value().attr("alt").unwrap_or("").trim();
                let src = child_el.value().attr("src").unwrap_or("");
                if !src.is_empty() && !src.starts_with("data:") && alt.len() > 3 {
                    let absolute_src = if let Some(ref base) = base_url {
                        base.join(src).map(|u| u.to_string()).unwrap_or_else(|_| src.to_string())
                    } else {
                        src.to_string()
                    };
                    // Intentionally skip: do NOT emit ![alt](src) for body images.
                    // Page-body images are irrelevant article thumbnails, not the
                    // curated entity image. Emitting them here caused random photos
                    // (e.g. unrelated group shots scraped from the article) to render
                    // in the chat alongside the real entity image.
                    // The sole image shown to the user is the one injected via the
                    // [ENTITY IMAGE ATTACHMENT] block which is curated from Wikimedia.
                    let _ = absolute_src; // suppress unused-var warning
                }
            } else {
                walk_and_clean_node(child_el, out, base_url);
            }
        }
    }

    match tag {
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" => out.push_str("\n\n"),
        "pre" => out.push_str("\n```\n\n"),
        "code" => {
            if !out.ends_with('`') {
                out.push('`');
            }
        }
        _ => {}
    }
}
// â”€â”€â”€ Query Intent Classification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Debug, Clone, Default)]
struct QueryIntent {
    /// True if the query needs real-time data (news, stock, sports, weather)
    temporal: bool,
    /// City name if this is a weather query → routes to Open-Meteo
    weather_city: Option<String>,
    /// True if query is about scientific papers → routes to arXiv
    scientific: bool,
    /// GitHub repo/code query → routes to GitHub REST API
    github_query: Option<String>,
    /// Research paper query → routes to arXiv API
    arxiv_query: Option<String>,
    /// Stock/financial query → entity extracted for Yahoo Finance
    stock_ticker: Option<String>,
    /// News query → routes with recency filter
    news_query: bool,
    /// True if query is a pure math/code question (no web search needed)
    skip_search: bool,
}

/// Classify the query so we can route it to the right data sources.
/// Returns a QueryIntent with specialized routing flags based on query patterns.
fn classify_query(q: &str) -> QueryIntent {
    static WEATHER_RE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"(?i)(?:weather|temperature|forecast|rain|sunny|humidity|wind)\s+(?:in|at|for|near)?\s+([\w\s]+?)(?:\?|$)").unwrap()
    });
    static TEMPORAL_RE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"(?i)\b(?:latest|recent|today|current|now|2025|2026|breaking|live|right now|this week|this month|news about|just released|just announced|this year)\b").unwrap()
    });
    static SCIENCE_RE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"(?i)\b(?:research paper|arxiv|study|published|journal|doi|preprint|scientific paper|machine learning paper|ai paper)\b").unwrap()
    });
    static GITHUB_RE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"(?i)\b(?:github|repository|repo|open.?source|crate|npm package|pypi)\b").unwrap()
    });
    static STOCK_RE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"(?i)\b(?:stock price|share price|market cap|ticker|nasdaq|nyse|$[A-Z]{1,5}|price of [A-Z]{1,5})\b").unwrap()
    });
    static NEWS_RE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"(?i)\b(?:news|headlines|breaking|happened|update on|latest on|what happened|announcement)\b").unwrap()
    });
    static SKIP_RE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"(?i)^\s*(?:calculate|compute|what is \d|\d+\s*[+\-\*/]|write (?:a |the )?code|translate to|convert \d)").unwrap()
    });

    let mut intent = QueryIntent::default();

    // Weather detection with city extraction
    if let Some(cap) = WEATHER_RE.captures(q) {
        let city = cap.get(1).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
        if !city.is_empty() {
            intent.weather_city = Some(city);
            intent.temporal = true;
        }
    }

    // General temporal detection
    if TEMPORAL_RE.is_match(q) {
        intent.temporal = true;
    }

    // Scientific / arXiv detection
    if SCIENCE_RE.is_match(q) {
        intent.scientific = true;
        // Extract search terms for arXiv API (remove common words)
        let arxiv_terms: String = q.split_whitespace()
            .filter(|w| !matches!(w.to_lowercase().as_str(),
                "research" | "paper" | "papers" | "arxiv" | "study" | "find" | "show" | "get" | "the" | "a" | "an"))
            .collect::<Vec<_>>()
            .join(" ");
        if !arxiv_terms.is_empty() {
            intent.arxiv_query = Some(arxiv_terms);
        }
    }

    // GitHub detection
    if GITHUB_RE.is_match(q) {
        let terms: String = q.split_whitespace()
            .filter(|w| !matches!(w.to_lowercase().as_str(),
                "github" | "repo" | "repository" | "find" | "show" | "the" | "a" | "an" | "best" | "top" | "open" | "source"))
            .collect::<Vec<_>>()
            .join(" ");
        if !terms.is_empty() {
            intent.github_query = Some(terms);
        }
        intent.temporal = true; // GitHub results should be fresh
    }

    // Stock/financial detection
    if STOCK_RE.is_match(q) {
        // Try to extract ticker symbol (1-5 uppercase letters)
        static TICKER_RE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
            regex::Regex::new(r"\$?\b([A-Z]{1,5})\b").unwrap()
        });
        if let Some(cap) = TICKER_RE.captures(q) {
            intent.stock_ticker = Some(cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default());
        }
        intent.temporal = true;
    }

    // News detection
    if NEWS_RE.is_match(q) {
        intent.news_query = true;
        intent.temporal = true;
    }

    // Skip search for pure math/single-line code questions
    if SKIP_RE.is_match(q) && q.split_whitespace().count() < 10 {
        intent.skip_search = true;
    }

    intent
}

/// Fast BM25-inspired snippet relevance scorer.
/// Scores how well a snippet answers the query using term frequency.
/// Returns a score in [0.0, 1.0] range — higher = more relevant.
fn bm25_score(query: &str, document: &str) -> f32 {
    let k1: f32 = 1.5;
    let b: f32 = 0.75;
    let avg_doc_len: f32 = 100.0; // assume avg doc ~100 words

    let doc_words: Vec<&str> = document.split_whitespace().collect();
    let doc_len = doc_words.len() as f32;

    // Preserve important 2-letter and 3-letter terms/acronyms
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
        // Term frequency in document
        let tf = doc_words.iter()
            .filter(|w| w.to_lowercase().trim_matches(|c: char| !c.is_alphanumeric()) == *term)
            .count() as f32;

        // IDF approximation
        let idf = if doc_lower.contains(term.as_str()) { 2.3_f32 } else { 0.0_f32 };

        // BM25 TF normalization
        let normalized_tf = (tf * (k1 + 1.0)) / (tf + k1 * (1.0 - b + b * doc_len / avg_doc_len));
        score += idf * normalized_tf;
    }

    // Exact phrase match bonus
    let clean_query_lower = query.to_lowercase().trim_end_matches('?').to_string();
    if doc_lower.contains(&clean_query_lower) {
        score += 3.0;
    }

    // Normalize to [0, 1] range — cap at 10.0 max score
    (score / 10.0_f32).min(1.0)
}

/// Strip agent slash-commands and social prefixes but PRESERVE interrogatives
/// ("what is", "who is", etc.) because they trigger DuckDuckGo direct answer cards.
fn decontextualize_query(raw_query: &str) -> String {
    let mut text = raw_query.trim();

    // Remove slash commands
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

    // Strip leading greetings
    static GREETING_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?i)^(?:hello|hi|hey|greetings|good\s+(?:morning|afternoon|evening)|yo|sup)[\s,!.:\-]*").unwrap()
    });

    if let Some(mat) = GREETING_RE.find(text) {
        let stripped = text[mat.end()..].trim();
        if !stripped.is_empty() {
            text = stripped;
        }
    }

    // Strip social / conversational / image-seeking prefixes
    static PREFIX_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?i)^(?:can\s+you\s+(?:please\s+)?)?(?:search\s+(?:the\s+)?web\s+for|search\s+online\s+for|search\s+for|google\s+for|look\s*up\s+online|find\s+(?:out\s+)?about|tell\s+me\s+about|tell\s+me|give\s+me\s+(?:images?|photos?|pictures?)\s+of|show\s+me\s+(?:images?|photos?|pictures?)\s+of|show\s+me|images?\s+of|photos?\s+of|pictures?\s+of|draw\s+(?:an?\s+)?image\s+of|generate\s+(?:an?\s+)?image\s+of|visualize|deep\s+research\s+on|research\s+(?:about|on)?)\s*").unwrap()
    });

    if let Some(mat) = PREFIX_RE.find(text) {
        let stripped = text[mat.end()..].trim();
        if !stripped.is_empty() {
            text = stripped;
        }
    }

    // Strip trailing conversational noise
    static SUFFIX_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?i)\s+(?:in\s+detail|in\s+full\s+detail|explained\s+in\s+detail|for\s+me|please|with\s+images|with\s+photos|and\s+show\s+images|and\s+show\s+photos|and\s+pictures)[?.!]*$").unwrap()
    });

    let cleaned = SUFFIX_RE.replace(text, "").trim().to_string();
    if cleaned.is_empty() { text.to_string() } else { cleaned }
}


/// Generate 2–3 query variants for multi-query parallel expansion.
/// All variants target different facets of the same information need.
fn expand_query(q: &str, intent: &QueryIntent) -> Vec<String> {
    let mut variants = vec![q.to_string()];

    static SHORT_WHITELIST: LazyLock<std::collections::HashSet<&'static str>> = LazyLock::new(|| {
        ["us", "uk", "eu", "ai", "ml", "db", "io", "os", "ip", "pr", "ca", "va", "un", "qa", "who", "ceo", "potus"].into_iter().collect()
    });

    // Keyword-only variant: remove filler words while preserving key terms
    static STOP_RE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"(?i)\b(?:the|a|an|is|are|was|were|do|does|did|can|could|would|should|have|has|had|be|been|being|of|in|on|at|to|for|from|with|by|about|please|tell me|i want to know|i need|find out)\b").unwrap()
    });
    let keywords: String = STOP_RE.replace_all(q, " ")
        .split_whitespace()
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()))
        .filter(|w| w.len() >= 3 || SHORT_WHITELIST.contains(&w.to_lowercase().as_str()))
        .collect::<Vec<_>>()
        .join(" ");

    let orig_word_count = q.split_whitespace().count();
    let kw_word_count = keywords.split_whitespace().count();

    // SAFEGUARD: Only use keyword variant if it preserves at least 2 words and doesn't discard > 60% of query
    if kw_word_count >= 2 && kw_word_count * 2 >= orig_word_count && keywords != q {
        variants.push(keywords.clone());
    }

    // Entity Expansion for interrogatives ("who is the president of the us?")
    let lower = q.to_lowercase();
    if lower.contains("president of the us") || lower.contains("president of us") {
        variants.push("current president of the United States".to_string());
    } else if lower.contains("president of") {
        let entity = lower.replace("who is the", "").replace("who is", "").replace("current", "");
        variants.push(format!("current {}", entity.trim()));
    } else if lower.starts_with("who is") || lower.starts_with("what is") || lower.starts_with("where is") {
        let clean_q = lower.trim_start_matches("who is").trim_start_matches("what is").trim_start_matches("where is").trim();
        if !clean_q.is_empty() {
            variants.push(format!("{} overview facts", clean_q));
        }
    }

    // Temporal variant: add year/recency modifier for temporal queries
    if intent.temporal {
        let temporal_q = format!("{} 2025 2026", q.trim_end_matches('?'));
        variants.push(temporal_q);
    }

    variants
}



/// RRF merge with score-based sorting (correct version)
/// Hybrid RRF+BM25 merge for multi-query result lists.
/// Combines position-based RRF score with content relevance via BM25.
/// This is the 2026 state-of-the-art for RAG search fusion.
#[allow(dead_code)]
fn rrf_merge_sorted(
    ranked_lists: Vec<Vec<(String, String, String)>>,
    k: usize,
    limit: usize,
) -> Vec<(String, String, String)> {
    rrf_merge_sorted_with_query(ranked_lists, k, limit, "")
}

fn rrf_merge_sorted_with_query(
    ranked_lists: Vec<Vec<(String, String, String)>>,
    k: usize,
    limit: usize,
    query: &str,
) -> Vec<(String, String, String)> {
    use std::collections::HashMap;
    let mut scores: HashMap<String, (String, String, f64)> = HashMap::new();

    for list in &ranked_lists {
        for (rank, (title, url, snippet)) in list.iter().enumerate() {
            if url.is_empty() { continue; }
            let rrf_score = 1.0 / (k as f64 + (rank + 1) as f64);
            let entry = scores.entry(url.clone()).or_insert_with(|| {
                (title.clone(), snippet.clone(), 0.0)
            });
            // Hybrid score: RRF + weighted BM25 content relevance
            let content = format!("{} {}", title, snippet);
            let bm25 = if query.is_empty() { 0.0 } else { bm25_score(query, &content) as f64 * 0.3 };
            entry.2 += rrf_score + bm25;
            if snippet.len() > entry.1.len() {
                entry.1 = snippet.clone();
            }
        }
    }

    let mut with_scores: Vec<(f64, String, String, String)> = scores
        .into_iter()
        .map(|(url, (title, snippet, score))| (score, title, url, snippet))
        .collect();
    with_scores.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    // Enforce domain diversity cap (max 2 results per domain e.g. wikipedia.org)
    let mut domain_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut final_results = Vec::new();

    for (_score, title, url, snippet) in with_scores {
        let lower_url = url.to_lowercase();
        let lower_title = title.to_lowercase();
        if lower_url.contains("wikipedia.org") || lower_title.contains("wikipedia") {
            continue;
        }

        let domain = url.trim_start_matches("https://")
            .trim_start_matches("http://")
            .trim_start_matches("www.")
            .split('/')
            .next()
            .unwrap_or("")
            .to_lowercase();

        let count = domain_counts.entry(domain).or_insert(0);
        if *count < 2 {
            *count += 1;
            final_results.push((title, url, snippet));
            if final_results.len() >= limit {
                break;
            }
        }
    }
    final_results
}


fn decode_html_entities(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&nbsp;", " ")
}

/// Block-based DuckDuckGo parser ensuring Title, URL, and Snippet are accurately parsed.
fn parse_duckduckgo_lite(html: &str, num_results: usize) -> Vec<(String, String, String)> {
    static TAG_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r#"<[^>]*>"#).unwrap());
    static BLOCK_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r#"(?is)<tr[^>]*>([\s\S]*?)</tr>\s*<tr[^>]*>([\s\S]*?)</tr>"#).unwrap()
    });
    static LINK_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r#"(?is)<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)</a>"#).unwrap()
    });
    static SNIP_TD_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r#"(?is)<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)</td>"#).unwrap()
    });
    // Detect DDG Lite sponsored rows — these carry ad content, not organic results.
    // DDG marks them with result--ad, result-sponsored, badge--ad, or data-sponsored.
    static DDG_AD_ROW_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(
            r#"(?ix)
            class="[^"]*(?:result--ad|result-sponsored|badge--ad|sponsored-url)[^"]*"
            | data-sponsored="true"
            | aria-label="[^"]*(?:sponsored|advertisement)[^"]*"
            "#
        ).unwrap()
    });

    let mut results = Vec::new();
    let mut seen_urls = std::collections::HashSet::new();

    // 1. Try DuckDuckGo Lite table pair parsing (row 1 = title + URL, row 2 = snippet)
    for cap in BLOCK_RE.captures_iter(html) {
        let row1 = cap.get(1).map_or("", |m| m.as_str());
        let row2 = cap.get(2).map_or("", |m| m.as_str());

        // Skip sponsored / ad rows before any link parsing
        if DDG_AD_ROW_RE.is_match(row1) || DDG_AD_ROW_RE.is_match(row2) {
            continue;
        }


        if let Some(link_cap) = LINK_RE.captures(row1) {
            let raw_url = link_cap.get(1).map_or("", |m| m.as_str());
            let raw_title = link_cap.get(2).map_or("", |m| m.as_str());
            let title = decode_html_entities(TAG_RE.replace_all(raw_title, "").trim());

            if title.is_empty() || title.len() < 3 || title.contains("DuckDuckGo") || title.eq_ignore_ascii_case("images") {
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

            if real_url.is_empty() || real_url.contains("duckduckgo.com") || real_url.contains("wikipedia.org") || seen_urls.contains(&real_url) {
                continue;
            }

            let snippet = if let Some(snip_cap) = SNIP_TD_RE.captures(row2) {
                let snip_raw = snip_cap.get(1).map_or("", |m| m.as_str());
                decode_html_entities(TAG_RE.replace_all(snip_raw, "").trim())
            } else {
                let clean_r2 = decode_html_entities(TAG_RE.replace_all(row2, "").trim());
                if !clean_r2.is_empty() { clean_r2 } else { title.clone() }
            };

            seen_urls.insert(real_url.clone());
            results.push((title, real_url, snippet));

            if results.len() >= num_results {
                return results;
            }
        }
    }

    // 2. Fallback anchor iteration
    for cap in LINK_RE.captures_iter(html) {
        let raw_url = cap.get(1).map_or("", |m| m.as_str());
        let raw_title = cap.get(2).map_or("", |m| m.as_str());
        let title = decode_html_entities(TAG_RE.replace_all(raw_title, "").trim());

        if title.is_empty() || title.len() < 3 || title.contains("DuckDuckGo") || title.eq_ignore_ascii_case("images") {
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

        if real_url.is_empty() || real_url.contains("duckduckgo.com") || real_url.contains("wikipedia.org") || seen_urls.contains(&real_url) {
            continue;
        }

        seen_urls.insert(real_url.clone());
        results.push((title.clone(), real_url, title));

        if results.len() >= num_results {
            break;
        }
    }

    results
}

async fn fetch_duckduckgo_results(query: &str, limit: usize) -> Vec<(String, String, String)> {
    static TAG_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r#"<[^>]*>"#).unwrap());

    let mut raw_results: Vec<(String, String, String)> = Vec::new();

    // METHOD 1: POST to https://html.duckduckgo.com/html/ with Form Data
    if raw_results.is_empty() {
        if let Ok(resp) = HTTP_CLIENT.post("https://html.duckduckgo.com/html/")
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Origin", "https://html.duckduckgo.com")
            .header("Referer", "https://html.duckduckgo.com/")
            .form(&[("q", query), ("b", ""), ("kl", "us-en")])
            .send().await
        {
            if resp.status().is_success() {
                if let Ok(html) = resp.text().await {
                    let parsed = parse_duckduckgo_lite(&html, limit);
                    if !parsed.is_empty() {
                        raw_results = parsed;
                    }
                }
            }
        }
    }

    // METHOD 1.5: GET to https://lite.duckduckgo.com/lite/
    if raw_results.is_empty() {
        let lite_url = format!("https://lite.duckduckgo.com/lite/?q={}&kl=us-en", urlencoding::encode(query));
        if let Ok(resp) = HTTP_CLIENT.get(&lite_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("Referer", "https://lite.duckduckgo.com/")
            .send().await
        {
            if resp.status().is_success() {
                if let Ok(html) = resp.text().await {
                    let parsed = parse_duckduckgo_lite(&html, limit);
                    if !parsed.is_empty() {
                        raw_results = parsed;
                    }
                }
            }
        }
    }

    // METHOD 2: Bing HTML Search
    if raw_results.is_empty() {
        let bing_url = format!("https://www.bing.com/search?q={}", urlencoding::encode(query));
        if let Ok(resp) = HTTP_CLIENT.get(&bing_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
            .header("Accept-Language", "en-US,en;q=0.9")
            .send().await
        {
            if resp.status().is_success() {
                if let Ok(html) = resp.text().await {
                    // Matches organic result blocks (b_algo). We deliberately do NOT match b_ad.
                    static BING_BLOCK_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
                        regex::Regex::new(r#"(?is)<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)</li>"#).unwrap()
                    });
                    static BING_LINK_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
                        regex::Regex::new(r#"(?is)<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>"#).unwrap()
                    });
                    static BING_SNIP_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
                        regex::Regex::new(r#"(?is)<p[^>]*>(.*?)</p>"#).unwrap()
                    });
                    // Comprehensive Bing sponsored ad detector: checks outer tag and inner HTML
                    // for b_ad, b_adSlug, b_adLabel, b_adTop, b_adBottom, b_attribution, sb_add,
                    // ad redirect paths (/aclick, /adclick), and inline Ad/Sponsored badge markup.
                    static BING_AD_INDICATOR_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
                        regex::Regex::new(
                            r#"(?ix)
                            class="[^"]*(?:b_ad|b_adSlug|b_adLabel|b_adTop|b_adBottom|b_attribution|sb_add)[^"]*"
                            | id="[^"]*(?:b_ad|b_adSlug|b_adLabel)[^"]*"
                            | (?:href|src)="[^"]*(?:/aclick|/adclick|bing\.com/aclick)[^"]*"
                            | >\s*(?:Ad|Sponsored|Promoted)\s*<
                            "#
                        ).unwrap()
                    });

                    let mut results = Vec::new();
                    let mut seen = std::collections::HashSet::new();

                    for block_cap in BING_BLOCK_RE.captures_iter(&html) {
                        let block = block_cap.get(1).map_or("", |m| m.as_str());
                        let full_match = block_cap.get(0).map_or("", |m| m.as_str());
                        // Skip Bing sponsored / ad blocks entirely (checks both outer match and inner HTML)
                        if BING_AD_INDICATOR_RE.is_match(full_match) || BING_AD_INDICATOR_RE.is_match(block) {
                            continue;
                        }
                        if let Some(link_cap) = BING_LINK_RE.captures(block) {
                            let url = link_cap.get(1).map_or("", |m| m.as_str()).to_string();
                            let raw_title = link_cap.get(2).map_or("", |m| m.as_str());
                            let title = decode_html_entities(TAG_RE.replace_all(raw_title, "").trim());

                            let snippet = if let Some(snip_cap) = BING_SNIP_RE.captures(block) {
                                decode_html_entities(TAG_RE.replace_all(snip_cap.get(1).map_or("", |m| m.as_str()), "").trim())
                            } else {
                                title.clone()
                            };

                            if url.starts_with("http") && !url.contains("bing.com") && !url.contains("microsoft.com") && !url.contains("wikipedia.org") && !seen.contains(&url) && !title.is_empty() {
                                seen.insert(url.clone());
                                results.push((title, url, snippet));
                                if results.len() >= limit { break; }
                            }
                        }
                    }

                    if !results.is_empty() {
                        raw_results = results;
                    }
                }
            }
        }
    }

    // METHOD 3: GDELT Real-time News API fallback
    if raw_results.is_empty() {
        let gdelt_url = format!("https://api.gdeltproject.org/api/v2/doc/doc?query={}&mode=artlist&maxrecords={}&format=json", urlencoding::encode(query), limit);
        if let Ok(resp) = HTTP_CLIENT.get(&gdelt_url).send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(articles) = json["articles"].as_array() {
                        let mut results = Vec::new();
                        for art in articles {
                            let title = art["title"].as_str().unwrap_or("").to_string();
                            let url = art["url"].as_str().unwrap_or("").to_string();
                            let domain = art["domain"].as_str().unwrap_or("").to_string();
                            if !title.is_empty() && !url.is_empty() && !url.contains("wikipedia.org") {
                                results.push((title, url, format!("Source: {}", domain)));
                            }
                        }
                        if !results.is_empty() {
                            raw_results = results;
                        }
                    }
                }
            }
        }
    }

    // METHOD 4: Wikipedia REST API Factual Summary Fallback
    if raw_results.is_empty() {
        let wiki_url = format!(
            "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={}&format=json&utf8=1",
            urlencoding::encode(query)
        );
        if let Ok(resp) = HTTP_CLIENT.get(&wiki_url).send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(search) = json["query"]["search"].as_array() {
                        let mut results = Vec::new();
                        for item in search.iter().take(limit) {
                            let title = item["title"].as_str().unwrap_or("").to_string();
                            let pageid = item["pageid"].as_i64().unwrap_or(0);
                            let snippet_raw = item["snippet"].as_str().unwrap_or("");
                            let snippet = decode_html_entities(TAG_RE.replace_all(snippet_raw, "").trim());
                            if !title.is_empty() && pageid > 0 {
                                let page_url = format!("https://en.wikipedia.org/wiki/{}", urlencoding::encode(&title));
                                results.push((title, page_url, snippet));
                            }
                        }
                        if !results.is_empty() {
                            raw_results = results;
                        }
                    }
                }
            }
        }
    }

    if raw_results.is_empty() {
        return Vec::new();
    }

    raw_results.truncate(limit);
    raw_results
}

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


/// Dynamically resolves the primary portrait / entity image for any arbitrary query
/// using Openverse REST API without Wikipedia calls.
pub async fn fetch_entity_image(query: &str) -> Option<(String, String)> {
    let cleaned = decontextualize_query(query);
    if cleaned.trim().is_empty() {
        return None;
    }

    // Strip question prefixes dynamically
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

    // Clean up content-type (e.g. text/html fallback)
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


#[tauri::command]
pub async fn generate_search_queries_with_model(

    prompt: String,
    provider: Option<String>,
    model_id: Option<String>,
    api_key: Option<String>,
) -> Vec<String> {
    let prov = provider.unwrap_or_else(|| "google".to_string());
    let model = model_id.unwrap_or_else(|| "gemini-2.5-flash".to_string());
    let key = api_key.unwrap_or_default();

    let planner_prompt = format!(
        "User Prompt: \"{}\"\n\n\
        Analyze this prompt and output 3 to 5 targeted search query strings needed to get full, accurate data from actual websites to answer this prompt completely.\n\
        Output ONLY a valid JSON array of strings: [\"search term 1\", \"search term 2\", \"search term 3\"] with no markdown code fences or extra text.",
        prompt
    );

    let req = crate::llm::cloud_orchestrator::UnifiedRequest {
        provider: prov,
        endpoint_override: None,
        model_id: model,
        messages: vec![crate::llm::cloud_orchestrator::UnifiedMessage { role: "user".to_string(), content: serde_json::json!(planner_prompt) }],
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
        context_window: None,
        capabilities: None,
        tool_choice: None,
        web_search_enabled: false,
    };

    if let Ok(mut rx) = crate::llm::cloud_orchestrator::execute_cloud_stream(&req).await {
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

        let cleaned = full_text
            .trim()
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim();

        if let Ok(queries) = serde_json::from_str::<Vec<String>>(cleaned) {
            let valid: Vec<String> = queries.into_iter().filter(|q| !q.trim().is_empty()).collect();
        }
    }

    vec![decontextualize_query(&prompt)]
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ExtractedImagePayload {
    pub url: String,
    pub title: String,
    pub source: String,
}

pub fn extract_image_search_term(raw_query: &str) -> String {
    let lower = raw_query.to_lowercase();
    let words: Vec<&str> = lower
        .split_whitespace()
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()))
        .filter(|w| !matches!(*w, "research" | "about" | "which" | "is" | "best" | "for" | "long" | "and" | "can" | "work" | "in" | "heavy" | "workloads" | "loads" | "including" | "want" | "you" | "to" | "every" | "under" | "the" | "a" | "an" | "what" | "how" | "tell" | "me" | "give" | "show" | "find" | "or" | "with" | "on" | "at" | "by" | "from" | "this" | "that" | "good" | "top" | "great"))
        .collect();

    if words.is_empty() {
        return raw_query.to_string();
    }

    words.into_iter().take(2).collect::<Vec<_>>().join(" ")
}

#[tauri::command]
pub async fn search_images_command(
    query: String,
    limit: Option<usize>,
) -> Result<String, String> {
    let limit = limit.unwrap_or(6);
    let cleaned = extract_image_search_term(&query);
    let encoded = urlencoding::encode(&cleaned).to_string();
    let mut results: Vec<ExtractedImagePayload> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    // Pexels API key: stored in PEXELS_API_KEY env var, never hardcoded in source.
    let pexels_key = std::env::var("PEXELS_API_KEY").unwrap_or_default();
    let pexels_url = format!("https://api.pexels.com/v1/search?query={}&per_page=6", encoded);
    if !pexels_key.is_empty() {
    if let Ok(resp) = HTTP_CLIENT.get(&pexels_url)
        .header("Authorization", &pexels_key)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send().await
    {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(photos) = json.get("photos").and_then(|p| p.as_array()) {
                for photo in photos {
                    if let Some(src) = photo.get("src") {
                        if let Some(img_url) = src.get("large").or_else(|| src.get("medium")).and_then(|u| u.as_str()) {
                            let alt = photo.get("alt").and_then(|a| a.as_str()).unwrap_or(&cleaned);
                            if !seen.contains(img_url) {
                                seen.insert(img_url.to_string());
                                results.push(ExtractedImagePayload {
                                    url: img_url.to_string(),
                                    title: alt.to_string(),
                                    source: "pexels".to_string(),
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
    } // end pexels_key guard

    // 2. Pixabay API Engine (Secondary High-Quality Object Photography)
    if results.len() < limit {
        // Pixabay API key: stored in PIXABAY_API_KEY env var, never hardcoded in source.
        let pixabay_key = std::env::var("PIXABAY_API_KEY").unwrap_or_default();
        if !pixabay_key.is_empty() {
        let pixabay_url = format!(
            "https://pixabay.com/api/?key={}&q={}&image_type=photo&per_page=6",
            pixabay_key, encoded
        );
        if let Ok(resp) = HTTP_CLIENT.get(&pixabay_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .send().await
        {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(hits) = json.get("hits").and_then(|h| h.as_array()) {
                    for hit in hits {
                        if let (Some(img_url), Some(tags)) = (
                            hit.get("webformatURL").and_then(|u| u.as_str()),
                            hit.get("tags").and_then(|t| t.as_str()),
                        ) {
                            if !seen.contains(img_url) {
                                seen.insert(img_url.to_string());
                                results.push(ExtractedImagePayload {
                                    url: img_url.to_string(),
                                    title: format!("{} ({})", cleaned, tags),
                                    source: "pixabay".to_string(),
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
        } // end pixabay_key guard
    }

    // 3. Openverse REST API Engine (700M+ Open License & Public Domain Images)
    if results.len() < limit {
        let ov_url = format!("https://api.openverse.org/v1/images/?q={}&page_size=6", encoded);
        if let Ok(resp) = HTTP_CLIENT.get(&ov_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .send().await
        {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(items) = json.get("results").and_then(|r| r.as_array()) {
                    for item in items {
                        if let (Some(img_url), Some(title)) = (
                            item.get("url").and_then(|i| i.as_str()),
                            item.get("title").and_then(|t| t.as_str()),
                        ) {
                            let lower = img_url.to_lowercase();
                            if !lower.contains(".svg") && !seen.contains(img_url) {
                                seen.insert(img_url.to_string());
                                results.push(ExtractedImagePayload {
                                    url: img_url.to_string(),
                                    title: title.to_string(),
                                    source: "openverse".to_string(),
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

    // 4. DuckDuckGo Image Search API Engine (Web-wide diagrams and product photos)
    if results.len() < limit {
        let ddg_img_url = format!("https://duckduckgo.com/i.js?q={}&o=json", encoded);
        if let Ok(resp) = HTTP_CLIENT.get(&ddg_img_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .header("Accept", "application/json")
            .send().await
        {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(items) = json.get("results").and_then(|r| r.as_array()) {
                    for item in items {
                        if let (Some(img_url), Some(title)) = (
                            item.get("image").and_then(|i| i.as_str()),
                            item.get("title").and_then(|t| t.as_str()),
                        ) {
                            if img_url.starts_with("http") && !seen.contains(img_url) {
                                seen.insert(img_url.to_string());
                                results.push(ExtractedImagePayload {
                                    url: img_url.to_string(),
                                    title: title.to_string(),
                                    source: "duckduckgo".to_string(),
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
    // 5. Wikimedia Commons API Engine (Historical photos, scientific diagrams, artwork)
    if results.len() < limit {
        let wiki_url = format!(
            "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={}&gsrlimit=6&prop=imageinfo&iiprop=url&format=json",
            encoded
        );
        if let Ok(resp) = HTTP_CLIENT.get(&wiki_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .send().await
        {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(pages) = json.get("query").and_then(|q| q.get("pages")).and_then(|p| p.as_object()) {
                    for (_id, page) in pages {
                        if let (Some(title), Some(imageinfo)) = (
                            page.get("title").and_then(|t| t.as_str()),
                            page.get("imageinfo").and_then(|i| i.as_array()),
                        ) {
                            if let Some(info) = imageinfo.first() {
                                if let Some(img_url) = info.get("url").and_then(|u| u.as_str()) {
                                    let clean_title = title.replace("File:", "").replace(".jpg", "").replace(".png", "");
                                    if img_url.starts_with("http") && !seen.contains(img_url) {
                                        seen.insert(img_url.to_string());
                                        results.push(ExtractedImagePayload {
                                            url: img_url.to_string(),
                                            title: clean_title,
                                            source: "wikimedia".to_string(),
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
    }

    serde_json::to_string(&results).map_err(|e| e.to_string())
}

/// Return type for fetch_image_base64 command.
#[derive(serde::Serialize)]
pub struct FetchedImagePayload {
    pub base64: String,
    pub mime_type: String,
}

/// Fetch an image from a URL and return it as base64-encoded data with MIME type.
/// Used by the frontend for local models that cannot accept direct image URLs.
/// Validates the content-type header to ensure the response is actually an image.
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

    // Validate content-type before decoding the body
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

    // Skip useless searches (pure math/code that doesn't need web data)
    if intent.skip_search {
        return Ok(String::new());
    }

    // Cache TTL: 30s for temporal/real-time queries, 600s for stable facts
    // Temporal queries (live scores, prices, news) expire in 30s.
    // Stable-fact queries reduced from 600s → 120s to keep results fresh.
    let cache_ttl_secs: u64 = if intent.temporal { 30 } else { 120 };
    let cache_key = format!("{}:{}:{}", search_provider, limit, cleaned_query.to_lowercase());
    if let Some(cached) = SEARCH_CACHE.get(&cache_key) {
        if cached.value().timestamp.elapsed().as_secs() < cache_ttl_secs {
            return Ok(cached.value().content.clone());
        }
        // Expired — remove and continue to fresh fetch
        drop(cached);
        SEARCH_CACHE.remove(&cache_key);
    }


    // â”€â”€â”€ TIER 0: Tavily (if configured as primary provider) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        tavily_failed = true; // Not using Tavily, fall through
    }

    if search_provider == "tavily" && !tavily_failed && !tavily_result.is_empty() {
        let result = tavily_result;
        SEARCH_CACHE.insert(cache_key, CachedSearchResult { content: result.clone(), timestamp: std::time::Instant::now() });
        return Ok(result);
    }

    // â”€â”€â”€ TIER 1: Specialized API routing based on query intent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Weather routing: Open-Meteo (FREE, no API key required)
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
                static ENTRY_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
                    regex::Regex::new(r"(?s)<entry>(.*?)</entry>").unwrap()
                });
                static ATITLE_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
                    regex::Regex::new(r"(?s)<title>(.*?)</title>").unwrap()
                });
                static SUMMARY_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
                    regex::Regex::new(r"(?s)<summary>(.*?)</summary>").unwrap()
                });
                static AID_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
                    regex::Regex::new(r"(?s)<id>(.*?)</id>").unwrap()
                });
                static PUBLISHED_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
                    regex::Regex::new(r"(?s)<published>(.*?)</published>").unwrap()
                });

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

    // ─── TIER 1c: GitHub REST API for code/repo queries ──────────────────────
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

    // ─── TIER 1d: GDELT DOC API v2 for real-time news queries ────────────────
    // GDELT is 100% free, no API key, updated every 15 minutes globally.
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
                    // Collect article metadata
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

                    // Concurrently fetch page bodies for top 3 articles
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

    // ─── TIER 2: DuckDuckGo Instant Answer API (structured knowledge) ────────

    // Run in parallel with main web search for speed

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

    // â”€â”€â”€ TIER 3: Multi-query parallel DuckDuckGo HTML search with RRF â”€â”€â”€â”€â”€â”€â”€â”€
    let query_variants = expand_query(&cleaned_query, &intent);

    // Build fetch futures for all query variants — fire all in parallel using robust multi-engine retriever
    let ddg_html_fut = {
        let variants: Vec<String> = query_variants.into_iter().take(2).collect();
        async move {
            let futs: Vec<_> = variants.into_iter().map(|v| {
                let lim = limit + 2;
                async move { fetch_duckduckgo_results(&v, lim).await }
            }).collect();
            let res_list = futures_util::future::join_all(futs).await;
            res_list.into_iter().filter(|r| !r.is_empty()).collect::<Vec<_>>()
        }
    };

    let wiki_fut = async move { Vec::<(String, String, String)>::new() };
    let entity_img_fut = {
        let q = cleaned_query.clone();
        async move { fetch_entity_image(&q).await }
    };

    // Run DDG HTML search, DDG instant API, Wikipedia, and Entity Image fetch in parallel
    let (ddg_ranked_lists, instant_answer, wiki_results, _entity_image) = tokio::join!(ddg_html_fut, ddg_instant_fut, wiki_fut, entity_img_fut);


    let mut all_lists = ddg_ranked_lists;
    if !wiki_results.is_empty() {
        all_lists.push(wiki_results);
    }

    let mut parsed_items = if all_lists.len() > 1 {
        rrf_merge_sorted_with_query(all_lists, 60, limit + 2, &cleaned_query)
    } else if all_lists.len() == 1 {
        all_lists.into_iter().next().unwrap_or_default().into_iter().take(limit + 2).collect()
    } else {
        Vec::new()
    };

    // Prepend DDG Instant Answer (knowledge panel) if we got one
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
        if let Ok(resp) = HTTP_CLIENT.get(&wiki_url).send().await {
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

    // ── Ad/Sponsored URL blocklist ───────────────────────────────────────────
    // Known ad-network redirect / tracking domains that carry zero real content.
    const AD_DOMAINS: &[&str] = &[
        "doubleclick.net", "googlesyndication.com", "adnxs.com",
        "adsrvr.org", "rubiconproject.com", "pubmatic.com",
        "taboola.com", "outbrain.com", "revcontent.com",
        "ads.yahoo.com", "bing.com/aclick", "googleadservices.com",
        "adservice.google", "ad.doubleclick", "adfarm.mediaplex.com",
    ];

    // Strip "Sponsored · ", "Ad · ", "Promoted · " labels from snippet text.
    // Search engines sometimes embed these labels directly in the snippet string.
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

        // Filter out ad-domains and deduplicate by domain to ensure multi-website diversity
        let mut seen_domains = std::collections::HashSet::new();
        let mut filtered_candidates = Vec::new();

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
                    .take(1200)
                    .collect::<String>();
                filtered_candidates.push((title, page_url, clean_snip));
            }
            if filtered_candidates.len() >= limit {
                break;
            }
        }

        // Concurrently fetch full page body content for top distinct website URLs
        let max_deep_fetch = 5.min(filtered_candidates.len());
        let fetch_futs: Vec<_> = filtered_candidates
            .iter()
            .take(max_deep_fetch)
            .map(|(_, page_url, _)| {
                let url = page_url.clone();
                async move { fetch_page_content(&url, 1500).await }
            })
            .collect();

        let fetched_pages = futures_util::future::join_all(fetch_futs).await;

        let mut sources_text_vec = Vec::new();
        for (idx, (title, page_url, snippet)) in filtered_candidates.into_iter().enumerate() {
            let deep_content = if idx < fetched_pages.len() {
                fetched_pages[idx].clone()
            } else {
                None
            };
            let content_str = match deep_content {
                Some(ref text) if text.trim().len() > 200 => text.trim().to_string(),
                _ => snippet,
            };

            sources_text_vec.push(format!(
                "[Source {}] {}\nURL: {}\nContent: {}",
                idx + 1,
                title,
                page_url,
                content_str
            ));
        }

        let sources_text = sources_text_vec.join("\n\n");

        format!("{}{}", temporal_marker, sources_text)
    };



    // Cache only non-empty results
    if !result.is_empty() && !result.starts_with("No web search") {
        SEARCH_CACHE.insert(cache_key, CachedSearchResult {
            content: result.clone(),
            timestamp: std::time::Instant::now(),
        });
    }
    Ok(result)
}

#[tauri::command]
pub async fn fetch_multiple_pages_command(
    app: tauri::AppHandle,
    urls: Vec<String>,
    max_chars_per_page: Option<usize>,
) -> Result<Vec<(String, Option<String>)>, String> {
    let limit = max_chars_per_page.unwrap_or(100_000);
    let mut unique_urls = Vec::new();
    let mut domain_counts = std::collections::HashMap::new();

    for url in urls {
        if let Ok(parsed) = url::Url::parse(&url) {
            if let Some(host) = parsed.host_str() {
                let count = domain_counts.entry(host.to_string()).or_insert(0);
                if *count < 3 && unique_urls.len() < 20 {
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

#[tauri::command]
pub async fn run_agent_tool(app: tauri::AppHandle, name: String, args_json: String) -> Result<String, String> {
    Ok(execute_tool(&app, &name, &args_json).await)
}


#[tauri::command]
pub async fn approve_tool(app: tauri::AppHandle, approval_id: String) -> Result<(), String> {
    let app_state = app.state::<crate::AppState>();
    let mut approvals = app_state.pending_approvals.lock().await;
    if let Some(tx) = approvals.remove(&approval_id) {
        let _ = tx.send(true);
    }
    Ok(())
}

#[tauri::command]
pub async fn reject_tool(app: tauri::AppHandle, approval_id: String) -> Result<(), String> {
    let app_state = app.state::<crate::AppState>();
    let mut approvals = app_state.pending_approvals.lock().await;
    if let Some(tx) = approvals.remove(&approval_id) {
        let _ = tx.send(false);
    }
    Ok(())
}

#[tauri::command]
pub async fn resolve_plugin_tool(app: tauri::AppHandle, call_id: String, result: String) -> Result<(), String> {
    let app_state = app.state::<crate::AppState>();
    let mut pending = app_state.pending_plugin_tools.lock().await;
    if let Some(tx) = pending.remove(&call_id) {
        let _ = tx.send(result);
    }
    Ok(())
}

async fn run_browser_script(app: &tauri::AppHandle, js_template: &str) -> Result<String, String> {
    let window = app.get_webview_window("nyx_browser")
        .ok_or_else(|| "Browser overlay window is not open. Call web_browse first.".to_string())?;

    let action_id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = tokio::sync::oneshot::channel::<String>();

    {
        let app_state = app.state::<crate::AppState>();
        // Use serde_json to safely serialize the action_id as a JSON string literal,
        // preventing any future ID format changes from corrupting the injected JS.
        let mut pending = app_state.pending_browser_actions.lock().await;
        pending.insert(action_id.clone(), tx);
    }

    // Safely embed action_id via simple replacement (template already contains quotes)
    let js = js_template.replace("ACTION_ID", &action_id);

    window.eval(&js).map_err(|e| format!("Failed to evaluate script: {}", e))?;

    match tokio::time::timeout(std::time::Duration::from_secs(10), rx).await {
        Ok(Ok(res)) => Ok(res),
        Ok(Err(_)) => Err("Browser action channel closed unexpectedly.".to_string()),
        Err(_) => {
            // Timeout: clean up the sender so we don't leak memory.
            let app_state = app.state::<crate::AppState>();
            let mut pending = app_state.pending_browser_actions.lock().await;
            pending.remove(&action_id);
            Err("Browser action timed out.".to_string())
        }
    }
}

#[tauri::command]
pub async fn resolve_browser_action(app: tauri::AppHandle, action_id: String, result: String) -> Result<(), String> {
    let app_state = app.state::<crate::AppState>();
    let mut pending = app_state.pending_browser_actions.lock().await;
    if let Some(tx) = pending.remove(&action_id) {
        let _ = tx.send(result);
    }
    Ok(())
}

#[tauri::command]
pub async fn codebase_search_command(
    app: tauri::AppHandle,
    query: String,
    limit: Option<usize>,
) -> Result<Value, String> {
    let limit = limit.unwrap_or(5);
    
    let scanner = match app.try_state::<std::sync::Arc<crate::rag::scanner::CodebaseScanner>>() {
        Some(s) => s,
        None => return Ok(json!({
            "success": false,
            "error": "Codebase scanner is initializing...",
            "results": []
        })),
    };
    
    if !scanner.is_indexed() {
        return Ok(json!({
            "success": false,
            "error": "Workspace is not indexed yet.",
            "results": []
        }));
    }

    match scanner.search(&query, limit).await {
        Ok(results) => {
            let mapped: Vec<Value> = results.into_iter().map(|(path, content, score)| {
                json!({
                    "path": path,
                    "content": content,
                    "score": score
                })
            }).collect();
            
            Ok(json!({
                "success": true,
                "results": mapped
            }))
        }
        Err(e) => {
            Ok(json!({
                "success": false,
                "error": e.to_string(),
                "results": []
            }))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_duckduckgo_lite() {
        let sample_html = r#"
        <table>
            <tr>
                <td>
                  <a rel="nofollow" href="https://example.com/test-url" class='result-link'>Example Title</a>
                </td>
            </tr>
            <tr>
              <td>&nbsp;&nbsp;&nbsp;</td>
              <td class='result-snippet'>
                This is a sample snippet for testing the parser.
              </td>
            </tr>
        </table>
        "#;
        
        let results = parse_duckduckgo_lite(sample_html, 5);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, "Example Title");
        assert_eq!(results[0].1, "https://example.com/test-url");
        assert_eq!(results[0].2, "This is a sample snippet for testing the parser.");
    }
}

