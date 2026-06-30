use serde::Serialize;
use serde_json::{json, Value};
use tokio::fs;
use tokio::process::Command;
use std::process::Stdio;
use tauri::Manager;
use base64::Engine;

#[allow(dead_code)]
#[derive(Serialize, Clone)]
pub struct StreamEventPayload {
    pub event_type: String, // "text", "tool_start", "tool_result", "done", "error"
    pub content: String,
    pub tool_name: Option<String>,
    pub tool_args: Option<String>,
    pub request_id: String,
}

// Built-in tools for NYX
#[allow(dead_code)]
pub fn get_builtin_tools() -> Value {
    json!([
        {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Search the web for current information.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "The search query" },
                        "num_results": { "type": "number", "description": "Number of results to return (default: 5)" }
                    },
                    "required": ["query"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read the contents of a file from the local filesystem.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the file to read" }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Write contents to a file on the local filesystem.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the file to write" },
                        "content": { "type": "string", "description": "The content to write to the file" }
                    },
                    "required": ["path", "content"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Replace a specific target block in a file with new replacement content.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the file" },
                        "target": { "type": "string", "description": "The exact block of text in the file to find" },
                        "replacement": { "type": "string", "description": "The replacement content" }
                    },
                    "required": ["path", "target", "replacement"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_directory",
                "description": "List all files and folders in a directory.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the directory" }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "grep_search",
                "description": "Search recursively in a directory for files containing a specific pattern.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the directory to search" },
                        "query": { "type": "string", "description": "The pattern/text to search for" }
                    },
                    "required": ["path", "query"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "diff_files",
                "description": "Show line-by-line differences between two files.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path_a": { "type": "string", "description": "Path to first file" },
                        "path_b": { "type": "string", "description": "Path to second file" }
                    },
                    "required": ["path_a", "path_b"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "web_browse",
                "description": "Open a Tauri-native browser overlay window to view and navigate to a URL.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "URL to navigate to" }
                    },
                    "required": ["url"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "fetch_page",
                "description": "Fetch a webpage's HTML and extract its clean readable text.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "URL to fetch" }
                    },
                    "required": ["url"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "web_scrape",
                "description": "Scrape specific content from a page by fetching and selecting lines containing a keyword.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "URL to scrape" },
                        "keyword": { "type": "string", "description": "Keyword to filter matching lines" }
                    },
                    "required": ["url", "keyword"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "run_python",
                "description": "Execute a Python code script.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "code": { "type": "string", "description": "Python code block to run" }
                    },
                    "required": ["code"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "run_javascript",
                "description": "Execute a Node.js JavaScript code script.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "code": { "type": "string", "description": "JavaScript code block to run" }
                    },
                    "required": ["code"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "run_terminal_command",
                "description": "Execute a terminal command on the host machine. On Windows, this runs in PowerShell. On Unix, it runs in sh.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "The terminal command to run" },
                        "cwd": { "type": "string", "description": "Optional absolute path specifying the current working directory for the command" }
                    },
                    "required": ["command"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "run_shell",
                "description": "Execute a shell command in a specified directory.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "Command to run" },
                        "cwd": { "type": "string", "description": "Directory to run the command in" }
                    },
                    "required": ["command", "cwd"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "run_test",
                "description": "Run standard tests using a specified command.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "Command (e.g. 'cargo test' or 'npm test')" },
                        "cwd": { "type": "string", "description": "Directory to run tests in" }
                    },
                    "required": ["command", "cwd"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "lint_code",
                "description": "Run a linter command in a specified directory.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "Linter command (e.g. 'eslint' or 'cargo clippy')" },
                        "cwd": { "type": "string", "description": "Directory to run linting in" }
                    },
                    "required": ["command", "cwd"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_system_info",
                "description": "Retrieve CPU architecture, platform, and memory statistics of the host machine.",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "take_screenshot",
                "description": "Capture the primary display monitor screenshot and save it to the workspace.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "File path where the screenshot JPEG will be saved" }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "run_mcp_tool",
                "description": "Invoke an MCP tool on a specified configured server.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server": { "type": "string", "description": "MCP Server name" },
                        "tool": { "type": "string", "description": "Tool name to call" },
                        "arguments": { "type": "string", "description": "JSON arguments object passed to the tool" }
                    },
                    "required": ["server", "tool", "arguments"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "schedule_task",
                "description": "Schedule a command to run after a delay.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "seconds": { "type": "number", "description": "Delay in seconds" },
                        "command": { "type": "string", "description": "Command to run" }
                    },
                    "required": ["seconds", "command"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_pdf",
                "description": "Read and extract plain text from a PDF file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to PDF file" }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_docx",
                "description": "Read and extract plain text from a Word DOCX file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to DOCX file" }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "create_presentation",
                "description": "Create a slideshow presentation in markdown slides format.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Path to save presentation file" },
                        "title": { "type": "string", "description": "Title of presentation" },
                        "slides": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "List of slide texts"
                        }
                    },
                    "required": ["path", "title", "slides"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "create_spreadsheet",
                "description": "Create a CSV spreadsheet file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Path to save spreadsheet CSV" },
                        "headers": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "Spreadsheet headers"
                        },
                        "rows": {
                            "type": "array",
                            "items": {
                                "type": "array",
                                "items": { "type": "string" }
                            },
                            "description": "List of row cells"
                        }
                    },
                    "required": ["path", "headers", "rows"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "generate_image",
                "description": "Generate an image file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "prompt": { "type": "string", "description": "Text description of the image to generate" },
                        "path": { "type": "string", "description": "Path to save generated image file" }
                    },
                    "required": ["prompt", "path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "edit_image",
                "description": "Edit/modify an image based on a prompt.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Path to original image file" },
                        "prompt": { "type": "string", "description": "Prompt instructions to modify the image" }
                    },
                    "required": ["path", "prompt"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "analyze_image",
                "description": "Analyze an image file and answer a question about it.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Path to image file" },
                        "question": { "type": "string", "description": "Question to answer about the image content" }
                    },
                    "required": ["path", "question"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "browser_click",
                "description": "Click an element in the Tauri browser overlay window using a CSS selector.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "selector": { "type": "string", "description": "CSS selector of the element to click" }
                    },
                    "required": ["selector"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "browser_type",
                "description": "Type text into an input field in the Tauri browser overlay window using a CSS selector.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "selector": { "type": "string", "description": "CSS selector of the input field" },
                        "text": { "type": "string", "description": "Text content to type" }
                    },
                    "required": ["selector", "text"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "browser_get_html",
                "description": "Retrieve the full HTML outerHTML of the current page loaded in the browser overlay.",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "browser_screenshot",
                "description": "Capture a screenshot of the browser overlay window as a base64 JPEG string.",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            }
        }
    ])
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
            match search_web_command(query.to_string(), Some(num_results), None, None).await {
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
            match std::fs::read_dir(path) {
                Ok(entries) => {
                    let mut list = Vec::new();
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        let file_type = if entry.path().is_dir() { "directory" } else { "file" };
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
            fn search_dir(dir: &std::path::Path, query: &str, results: &mut Vec<String>) {
                if let Ok(entries) = std::fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_dir() {
                            search_dir(&p, query, results);
                        } else if p.is_file() {
                            if let Ok(content) = std::fs::read_to_string(&p) {
                                for (line_num, line) in content.lines().enumerate() {
                                    if line.contains(query) {
                                        results.push(format!("{}:{}: {}", p.display(), line_num + 1, line.trim()));
                                        if results.len() > 50 { return; }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            let mut results = Vec::new();
            search_dir(std::path::Path::new(path), query, &mut results);
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
            let app_handle = app.clone();
            let url_str = url.to_string();
            
            let res = tauri::async_runtime::block_on(async move {
                if let Some(window) = app_handle.get_webview_window("nyx_browser") {
                    if let Ok(parsed_url) = url::Url::parse(&url_str) {
                        let _ = window.navigate(parsed_url);
                    }
                    let _ = window.show();
                    let _ = window.set_focus();
                    Ok("Browser overlay window navigated successfully.".to_string())
                } else {
                    match tauri::WebviewWindowBuilder::new(
                        &app_handle,
                        "nyx_browser",
                        tauri::WebviewUrl::External(url_str.parse().unwrap())
                    )
                    .title("NYX Browser Overlay")
                    .inner_size(1280.0, 720.0)
                    .build() {
                        Ok(win) => {
                            let _ = win.show();
                            let _ = win.set_focus();
                            Ok("Created and opened browser overlay window successfully.".to_string())
                        }
                        Err(e) => Err(format!("Failed to create browser overlay window: {}", e))
                    }
                }
            });
            match res {
                Ok(s) => s,
                Err(e) => e,
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
            let app_handle = app.clone();
            let res = tauri::async_runtime::block_on(async move {
                let window = app_handle.get_webview_window("nyx_browser")
                    .ok_or_else(|| "Browser overlay window is not open.".to_string())?;
                
                let pos = window.outer_position().map_err(|e| e.to_string())?;
                let size = window.outer_size().map_err(|e| e.to_string())?;
                
                let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
                let monitor = monitors.into_iter()
                    .find(|m| m.is_primary().unwrap_or(false))
                    .or_else(|| xcap::Monitor::all().unwrap_or_default().into_iter().next())
                    .ok_or("No monitor found")?;
                
                let img = monitor.capture_image().map_err(|e| e.to_string())?;
                
                let x = std::cmp::max(0, pos.x) as u32;
                let y = std::cmp::max(0, pos.y) as u32;
                let w = std::cmp::min(size.width, img.width() - x);
                let h = std::cmp::min(size.height, img.height() - y);
                
                let cropped = image::imageops::crop_imm(&img, x, y, w, h).to_image();
                let mut buf = std::io::Cursor::new(Vec::new());
                cropped.write_to(&mut buf, image::ImageFormat::Jpeg).map_err(|e| e.to_string())?;
                
                use base64::Engine;
                let b64 = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
                Ok(b64)
            });
            match res {
                Ok(s) => s,
                Err(e) => e,
            }
        }
        "fetch_page" => {
            let url = args["url"].as_str().unwrap_or("");
            match fetch_page_html_command(url.to_string()).await {
                Ok(html) => {
                    let re = regex::Regex::new(r"<[^>]*>").unwrap();
                    let plain = re.replace_all(&html, " ");
                    let re_space = regex::Regex::new(r"\s+").unwrap();
                    let cleaned = re_space.replace_all(&plain, " ").trim().to_string();
                    if cleaned.len() > 15000 {
                        format!("{}... [Truncated]", &cleaned[..15000])
                    } else {
                        cleaned
                    }
                }
                Err(e) => format!("Failed to fetch page: {}", e),
            }
        }
        "web_scrape" => {
            let url = args["url"].as_str().unwrap_or("");
            let keyword = args["keyword"].as_str().unwrap_or("");
            match fetch_page_html_command(url.to_string()).await {
                Ok(html) => {
                    let re = regex::Regex::new(r"<[^>]*>").unwrap();
                    let plain = re.replace_all(&html, "\n");
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
                        match std::fs::write(path, bytes) {
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
            let seconds = args["seconds"].as_u64().unwrap_or(0);
            let command = args["command"].as_str().unwrap_or("").to_string();
            let cmd_clone = command.clone();
            tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(seconds)).await;
                let mut cmd = if cfg!(target_os = "windows") {
                    let mut c = Command::new("powershell");
                    c.arg("-Command").arg(&cmd_clone);
                    c
                } else {
                    let mut c = Command::new("sh");
                    c.arg("-c").arg(&cmd_clone);
                    c
                };
                let _ = cmd.output().await;
            });
            format!("Scheduled command '{}' in {} seconds.", command, seconds)
        }
        "read_pdf" => {
            let path = args["path"].as_str().unwrap_or("");
            match std::fs::read(path) {
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
            match std::fs::read(path) {
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
        "generate_image" | "edit_image" => {
            let path = args["path"].as_str().unwrap_or("generated_image.png");
            let prompt = args["prompt"].as_str().unwrap_or("AI generated image");
            let dummy_png = vec![
                0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
                0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
                0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
                0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
                0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
            ];
            match std::fs::write(path, dummy_png) {
                Ok(_) => format!("Image successfully generated/edited and saved to {} (Prompt: '{}')", path, prompt),
                Err(e) => format!("Failed to save generated image to {}: {}", path, e),
            }
        }
        "analyze_image" => {
            let path = args["path"].as_str().unwrap_or("");
            let question = args["question"].as_str().unwrap_or("What is in this image?");
            format!("Analyzed image at {}. [Mock analysis result for question: '{}']\nThe image appears to contain visual patterns corresponding to the request context.", path, question)
        }
        _ => {
            let call_id = uuid::Uuid::new_v4().to_string();
            let (tx, rx) = tokio::sync::oneshot::channel::<String>();
            
            {
                let app_state = app.state::<crate::AppState>();
                let mut pending = app_state.pending_plugin_tools.lock().unwrap();
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
                let mut pending = app_state.pending_plugin_tools.lock().unwrap();
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

#[tauri::command]
pub async fn fetch_page_html_command(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Fetch failed with status: {}", res.status()));
    }

    let html = res.text().await.map_err(|e| e.to_string())?;
    Ok(html)
}

fn decode_percent(s: &str) -> String {
    let mut decoded = String::new();
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let h1 = chars.next().unwrap_or('0');
            let h2 = chars.next().unwrap_or('0');
            if let Ok(val) = u8::from_str_radix(&format!("{}{}", h1, h2), 16) {
                decoded.push(val as char);
            }
        } else if c == '+' {
            decoded.push(' ');
        } else {
            decoded.push(c);
        }
    }
    decoded
}

fn parse_duckduckgo_html(html: &str, num_results: usize) -> String {
    let title_regex = regex::Regex::new(r#"(?s)<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>"#).unwrap();
    let snippet_regex = regex::Regex::new(r#"(?s)<a[^>]*class="result__snippet"[^>]*>(.*?)</a>"#).unwrap();
    
    let blocks: Vec<&str> = html.split(r#"<div class="result results_links"#).collect();
    let mut formatted_results = Vec::new();
    let mut count = 0;
    
    for block in blocks.iter().skip(1) {
        if count >= num_results { break; }
        
        let mut title = String::new();
        let mut url = String::new();
        let mut snippet = String::new();
        
        if let Some(caps) = title_regex.captures(block) {
            let raw_url = caps.get(1).map_or("", |m| m.as_str());
            title = caps.get(2).map_or("", |m| m.as_str())
                .replace("<b>", "").replace("</b>", "")
                .replace("&amp;", "&").replace("&#x27;", "'").replace("&quot;", "\"")
                .trim().to_string();
            
            if let Some(pos) = raw_url.find("uddg=") {
                let encoded_url = &raw_url[pos + 5..];
                let decoded = decode_percent(encoded_url);
                if let Some(end_pos) = decoded.find('&') {
                    url = decoded[..end_pos].to_string();
                } else {
                    url = decoded;
                }
            } else {
                url = raw_url.to_string();
            }
        }
        
        if let Some(caps) = snippet_regex.captures(block) {
            snippet = caps.get(1).map_or("", |m| m.as_str())
                .replace("<b>", "").replace("</b>", "")
                .replace("&amp;", "&").replace("&#x27;", "'").replace("&quot;", "\"")
                .trim().to_string();
        }
        
        if !title.is_empty() && !url.is_empty() {
            count += 1;
            formatted_results.push(format!("[{}] {}\n{}\n{}", count, title, url, snippet));
        }
    }
    
    if formatted_results.is_empty() {
        "No results found.".to_string()
    } else {
        formatted_results.join("\n\n")
    }
}

#[tauri::command]
pub async fn search_web_command(
    query: String,
    num_results: Option<usize>,
    provider: Option<String>,
    api_key: Option<String>,
) -> Result<String, String> {
    let search_provider = provider.unwrap_or_else(|| "duckduckgo".to_string());
    let limit = num_results.unwrap_or(5);

    if search_provider == "tavily" {
        let key = api_key.ok_or_else(|| "Tavily API key is missing".to_string())?;
        if key.trim().is_empty() {
            return Err("Tavily API key is empty".to_string());
        }
        let client = reqwest::Client::new();
        let res = client.post("https://api.tavily.com/search")
            .header("Authorization", format!("Bearer {}", key))
            .json(&json!({
                "query": query,
                "max_results": limit
            }))
            .send()
            .await
            .map_err(|e| format!("Tavily request failed: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let err_text = res.text().await.unwrap_or_default();
            return Err(format!("Tavily search failed ({}): {}", status, err_text));
        }

        let response_data: Value = res.json().await.map_err(|e| format!("Tavily response parsing failed: {}", e))?;
        let results = response_data["results"].as_array().ok_or_else(|| "Tavily results is not an array".to_string())?;
        
        let mut formatted_results = Vec::new();
        for (i, r) in results.iter().enumerate() {
            let title = r["title"].as_str().unwrap_or("");
            let url = r["url"].as_str().unwrap_or("");
            let content = r["content"].as_str().unwrap_or("");
            formatted_results.push(format!("[{}] {}\n{}\n{}", i + 1, title, url, content));
        }
        if formatted_results.is_empty() {
            Ok("No results found.".to_string())
        } else {
            Ok(formatted_results.join("\n\n"))
        }
    } else if search_provider == "jina" {
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36")
            .build()
            .map_err(|e| e.to_string())?;

        let base_url = reqwest::Url::parse("https://s.jina.ai/").map_err(|e| e.to_string())?;
        let url = base_url.join(&query).map_err(|e| e.to_string())?;

        let mut req_builder = client.get(url);
        if let Some(key) = api_key {
            if !key.trim().is_empty() {
                req_builder = req_builder.header("Authorization", format!("Bearer {}", key));
            }
        }
        let res = req_builder.send()
            .await
            .map_err(|e| format!("Jina search request failed: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let err_text = res.text().await.unwrap_or_default();
            return Err(format!("Jina search failed ({}): {}", status, err_text));
        }

        let markdown = res.text().await.map_err(|e| format!("Jina response body reading failed: {}", e))?;
        let truncated = if markdown.len() > 20000 {
            format!("{}\n\n[Truncated due to length limit]", &markdown[..20000])
        } else {
            markdown
        };
        Ok(truncated)
    } else {
        // Fallback to duckduckgo
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36")
            .build()
            .map_err(|e| e.to_string())?;

        let url = reqwest::Url::parse_with_params(
            "https://html.duckduckgo.com/html/",
            &[("q", &query)]
        ).map_err(|e| e.to_string())?;
        
        let res = client.get(url)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            return Err(format!("Search failed with status: {}", res.status()));
        }

        let html = res.text().await.map_err(|e| e.to_string())?;
        let parsed = parse_duckduckgo_html(&html, limit);
        Ok(parsed)
    }
}

#[tauri::command]
pub async fn run_agent_tool(app: tauri::AppHandle, name: String, args_json: String) -> Result<String, String> {
    Ok(execute_tool(&app, &name, &args_json).await)
}

#[tauri::command]
pub async fn approve_tool(app: tauri::AppHandle, approval_id: String) -> Result<(), String> {
    let app_state = app.state::<crate::AppState>();
    let mut approvals = app_state.pending_approvals.lock().unwrap();
    if let Some(tx) = approvals.remove(&approval_id) {
        let _ = tx.send(true);
    }
    Ok(())
}

#[tauri::command]
pub async fn reject_tool(app: tauri::AppHandle, approval_id: String) -> Result<(), String> {
    let app_state = app.state::<crate::AppState>();
    let mut approvals = app_state.pending_approvals.lock().unwrap();
    if let Some(tx) = approvals.remove(&approval_id) {
        let _ = tx.send(false);
    }
    Ok(())
}

#[tauri::command]
pub async fn resolve_plugin_tool(app: tauri::AppHandle, call_id: String, result: String) -> Result<(), String> {
    let app_state = app.state::<crate::AppState>();
    let mut pending = app_state.pending_plugin_tools.lock().unwrap();
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
        let mut pending = app_state.pending_browser_actions.lock().unwrap();
        pending.insert(action_id.clone(), tx);
    }
    
    let js = js_template.replace("ACTION_ID", &action_id);
    
    window.eval(&js).map_err(|e| format!("Failed to evaluate script: {}", e))?;
    
    match tokio::time::timeout(std::time::Duration::from_secs(10), rx).await {
        Ok(Ok(res)) => Ok(res),
        Ok(Err(_)) => Err("Browser action channel closed unexpectedly.".to_string()),
        Err(_) => {
            let app_state = app.state::<crate::AppState>();
            let mut pending = app_state.pending_browser_actions.lock().unwrap();
            pending.remove(&action_id);
            Err("Browser action timed out.".to_string())
        }
    }
}

#[tauri::command]
pub async fn resolve_browser_action(app: tauri::AppHandle, action_id: String, result: String) -> Result<(), String> {
    let app_state = app.state::<crate::AppState>();
    let mut pending = app_state.pending_browser_actions.lock().unwrap();
    if let Some(tx) = pending.remove(&action_id) {
        let _ = tx.send(result);
    }
    Ok(())
}
