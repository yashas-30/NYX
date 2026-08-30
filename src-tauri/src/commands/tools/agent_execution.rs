// ─────────────────────────────────────────────────────────────────────────────
// NYX — Agent Tool Execution & Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

use serde_json::{json, Value};
use tokio::fs;
use tokio::process::Command;
use std::process::Stdio;
use tauri::Manager;
use base64::Engine;
use std::time::Duration;

use super::scraper::{extract_clean_text, fetch_page_html_command};
use super::web_search::search_web_command;
use super::media_search::{search_images_command, search_videos_command};

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
            let res = crate::commands::system::system_info(app.clone()).await;
            if res.success {
                serde_json::to_string_pretty(&res.data).unwrap_or_default()
            } else {
                res.error.unwrap_or_else(|| "Failed to get system info".to_string())
            }
        }
        "take_screenshot" => {
            let path = args["path"].as_str().unwrap_or("screenshot.jpg");
            match crate::commands::computer_use::execute_computer_action("screenshot".to_string(), "{}".to_string()).await {
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
            
            match crate::commands::mcp::mcp_call_tool_internal(
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
        "generate_image" => {
            let prompt = args["prompt"].as_str().unwrap_or("");
            let aspect_ratio = args["aspect_ratio"].as_str().unwrap_or("1:1");
            let (w, h) = match aspect_ratio {
                "16:9" => (1280, 720),
                "9:16" => (720, 1280),
                "4:3" => (1024, 768),
                _ => (1024, 1024),
            };
            match crate::llm::diffusers::generate_local_image(app.clone(), prompt.to_string(), None, Some(w), Some(h)).await {
                Ok(res) => format!("Image successfully generated via {} at '{}'", res.engine.unwrap_or_else(|| "Local Diffusers".to_string()), res.image_path),
                Err(e) => format!("Image generation failed: {}", e),
            }
        }
        "search_images" | "search_media" => {
            let query = args["query"].as_str().unwrap_or("");
            let limit = args["limit"].as_u64().unwrap_or(4) as usize;
            let images = search_images_command(query.to_string(), Some(limit)).await.unwrap_or_default();
            format!("Web image results for '{}':\n{}", query, images)
        }
        "search_videos" => {
            let query = args["query"].as_str().unwrap_or("");
            let limit = args["limit"].as_u64().unwrap_or(3) as usize;
            let videos = search_videos_command(query.to_string(), Some(limit)).await.unwrap_or_default();
            format!("Web video results for '{}':\n{}", query, videos)
        }
        "fetch_page_content" => {
            let url = args["url"].as_str().unwrap_or("");
            match fetch_page_html_command(url.to_string()).await {
                Ok((content, _)) => content,
                Err(e) => format!("Failed to fetch page content: {}", e),
            }
        }
        "calculate" => {
            let expr = args["expression"].as_str().unwrap_or("");
            format!("Calculated expression: {}", expr)
        }
        "synthesize_voice" => {
            format!("Voice synthesis is not active.")
        }
        "edit_image" | "analyze_image" => {
            format!("Tool '{}' is not currently implemented. Use generate_image for local image creation.", name)
        }
        _ => {
            let call_id = uuid::Uuid::new_v4().to_string();
            let (tx, rx) = tokio::sync::oneshot::channel::<String>();

            {
                let app_state = app.state::<crate::AppState>();
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
        let mut pending = app_state.pending_browser_actions.lock().await;
        pending.insert(action_id.clone(), tx);
    }

    let js = js_template.replace("ACTION_ID", &action_id);
    window.eval(&js).map_err(|e| format!("Failed to evaluate script: {}", e))?;

    match tokio::time::timeout(std::time::Duration::from_secs(10), rx).await {
        Ok(Ok(res)) => Ok(res),
        Ok(Err(_)) => Err("Browser action channel closed unexpectedly.".to_string()),
        Err(_) => {
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
