import re
with open(r'e:\NYX\src-tauri\src\commands\agent.rs', 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find('#[tauri::command]\npub async fn search_web_command')
end_idx = content.find('#[tauri::command]\npub async fn resolve_plugin_tool')

if start_idx != -1 and end_idx != -1:
    new_code = """#[tauri::command]
pub async fn search_web_command(
    query: String,
    num_results: Option<usize>,
    provider: Option<String>,
    api_key: Option<String>,
) -> Result<String, String> {
    let search_provider = provider.unwrap_or_else(|| "duckduckgo".to_string());
    let limit = num_results.unwrap_or(5);

    let embedder = crate::rag::embeddings::Embedder::new().map_err(|e| e.to_string())?;
    let query_embedding = embedder.embed(vec![query.clone()]).await.map_err(|e| e.to_string())?.into_iter().next().unwrap_or_default();

    if search_provider == "tavily" {
        let key = api_key.ok_or_else(|| "Tavily API key is missing".to_string())?;
        if key.trim().is_empty() {
            return Err("Tavily API key is empty".to_string());
        }
        let client = reqwest::Client::new();
        let res = client.post("https://api.tavily.com/search")
            .header("Authorization", format!("Bearer {}", key))
            .json(&serde_json::json!({
                "query": query,
                "max_results": limit,
                "include_raw_content": true
            }))
            .send()
            .await
            .map_err(|e| format!("Tavily request failed: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let err_text = res.text().await.unwrap_or_default();
            return Err(format!("Tavily search failed ({}): {}", status, err_text));
        }

        let response_data: serde_json::Value = res.json().await.map_err(|e| format!("Tavily response parsing failed: {}", e))?;
        let results = response_data["results"].as_array().ok_or_else(|| "Tavily results is not an array".to_string())?;
        
        let mut all_chunks = Vec::new();
        for (i, r) in results.iter().enumerate() {
            let title = r["title"].as_str().unwrap_or("").to_string();
            let url = r["url"].as_str().unwrap_or("").to_string();
            let content = r["content"].as_str().unwrap_or("").to_string();
            let raw_content = r["raw_content"].as_str().unwrap_or("");
            
            let display_content = if !raw_content.is_empty() {
                let is_raw = url.to_lowercase().ends_with(".md")
                    || url.to_lowercase().ends_with(".txt")
                    || url.to_lowercase().ends_with(".csv")
                    || url.to_lowercase().ends_with(".json");
                if is_raw {
                    raw_content.to_string()
                } else {
                    extract_clean_text(raw_content)
                }
            } else {
                content.to_string()
            };
            
            let chunks = chunk_text(&display_content, 1000, 200);
            for chunk in chunks {
                all_chunks.push((title.clone(), url.clone(), chunk));
            }
        }
        
        let chunk_texts: Vec<String> = all_chunks.iter().map(|(_, _, c)| c.clone()).collect();
        let chunk_embeddings = embedder.embed(chunk_texts).await.unwrap_or_default();
        
        let mut scored_chunks: Vec<(f32, String, String, String)> = Vec::new();
        for (i, emb) in chunk_embeddings.iter().enumerate() {
            if i >= all_chunks.len() { break; }
            let score = cosine_similarity(&query_embedding, emb);
            let (title, url, content) = &all_chunks[i];
            scored_chunks.push((score, title.clone(), url.clone(), content.clone()));
        }
        
        scored_chunks.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        
        let mut formatted_results = Vec::new();
        for (i, (_score, title, url, content)) in scored_chunks.into_iter().take(limit).enumerate() {
            formatted_results.push(format!("[{}] {}\\n{}\\n{}", i + 1, title, url, content));
        }

        if formatted_results.is_empty() {
            Ok("No results found.".to_string())
        } else {
            Ok(formatted_results.join("\\n\\n"))
        }

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
        let parsed_items = parse_duckduckgo_html(&html, limit);
        
        let fetch_futures = parsed_items.into_iter().enumerate().map(|(i, (title, page_url, snippet))| {
            async move {
                let display_content = match fetch_page_html_command(page_url.clone()).await {
                    Ok((page_html, is_raw)) => {
                        if is_raw {
                            page_html
                        } else {
                            extract_clean_text(&page_html)
                        }
                    }
                    Err(_) => snippet,
                };
                (title, page_url, display_content)
            }
        });

        let fetched_pages = futures::future::join_all(fetch_futures).await;
        
        let mut all_chunks = Vec::new();
        for (title, url, content) in fetched_pages {
            let chunks = chunk_text(&content, 1000, 200);
            for chunk in chunks {
                all_chunks.push((title.clone(), url.clone(), chunk));
            }
        }
        
        let chunk_texts: Vec<String> = all_chunks.iter().map(|(_, _, c)| c.clone()).collect();
        let chunk_embeddings = embedder.embed(chunk_texts).await.unwrap_or_default();
        
        let mut scored_chunks: Vec<(f32, String, String, String)> = Vec::new();
        for (i, emb) in chunk_embeddings.iter().enumerate() {
            if i >= all_chunks.len() { break; }
            let score = cosine_similarity(&query_embedding, emb);
            let (title, url, content) = &all_chunks[i];
            scored_chunks.push((score, title.clone(), url.clone(), content.clone()));
        }
        
        scored_chunks.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        
        let mut formatted_results = Vec::new();
        for (i, (_score, title, url, content)) in scored_chunks.into_iter().take(limit).enumerate() {
            formatted_results.push(format!("[{}] {}\\n{}\\n{}", i + 1, title, url, content));
        }

        if formatted_results.is_empty() {
            Ok("No results found.".to_string())
        } else {
            Ok(formatted_results.join("\\n\\n"))
        }
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

"""
    final_content = content[:start_idx] + new_code + content[end_idx:]
    with open(r'e:\NYX\src-tauri\src\commands\agent.rs', 'w', encoding='utf-8') as f:
        f.write(final_content)
    print("Fixed!")
else:
    print("Could not find boundaries")
