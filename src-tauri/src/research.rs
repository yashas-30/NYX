use reqwest::Client;
use serde_json::json;
use tauri::ipc::Channel;
use std::time::Duration;

#[tauri::command]
pub async fn start_deep_research(query: String, on_progress: Channel<serde_json::Value>) -> Result<serde_json::Value, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    // Send start progress
    let _ = on_progress.send(json!({
        "type": "progress",
        "message": format!("Starting deep research for: {}", query)
    }));

    // Simulating deep reasoning trace
    let _ = on_progress.send(json!({
        "type": "progress",
        "message": "Initializing native Rust search engine adapter..."
    }));
    
    tokio::time::sleep(Duration::from_millis(500)).await;

    // We fallback to a direct DDG HTML scrape or simple request since Firecrawl is Node-only
    let url = format!("https://html.duckduckgo.com/html/?q={}", urlencoding::encode(&query));
    
    let _ = on_progress.send(json!({
        "type": "progress",
        "message": format!("Fetching search results from {}", url)
    }));

    let response = match client.get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send()
        .await {
            Ok(res) => res,
            Err(e) => {
                let _ = on_progress.send(json!({
                    "type": "error",
                    "message": format!("Network error: {}", e)
                }));
                return Err(e.to_string());
            }
        };

    let text = response.text().await.unwrap_or_default();
    
    let _ = on_progress.send(json!({
        "type": "progress",
        "message": "Parsing search results natively..."
    }));

    // Simple regex/substring parsing for duckduckgo html
    let mut results = Vec::new();
    let split_chunks: Vec<&str> = text.split("class=\"result__snippet\"").collect();
    
    for chunk in split_chunks.iter().skip(1).take(5) {
        if let Some(start) = chunk.find('>') {
            if let Some(end) = chunk[start..].find("</a>") {
                let mut snippet = chunk[start + 1..start + end].to_string();
                // cleanup html tags
                snippet = snippet.replace("<b>", "").replace("</b>", "").trim().to_string();
                results.push(snippet);
            }
        }
    }

    let _ = on_progress.send(json!({
        "type": "progress",
        "message": "Search complete. Returning context."
    }));

    Ok(json!({
        "source": "native-rust-scraper",
        "data": results
    }))
}

