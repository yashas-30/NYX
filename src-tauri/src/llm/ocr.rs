// src-tauri/src/llm/ocr.rs
// Real OCR implementation using tesseract CLI subprocess with base64 decode support
use serde::{Deserialize, Serialize};
use base64::Engine;
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrResult {
    pub success: bool,
    pub extracted_text: String,
    pub line_count: usize,
    pub confidence: f32,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn run_local_ocr(image_data_or_path: String) -> Result<OcrResult, String> {
    if image_data_or_path.is_empty() {
        return Err("Empty image data provided for OCR analysis".to_string());
    }

    // Resolve input: either a file path or a base64-encoded image
    let image_path: std::path::PathBuf = if image_data_or_path.starts_with("data:image")
        || image_data_or_path.len() > 260
        || !std::path::Path::new(&image_data_or_path).exists()
    {
        // Decode base64 payload → temp file
        let raw_b64 = image_data_or_path
            .split_once(',') // strip "data:image/png;base64," prefix if present
            .map(|(_, b)| b)
            .unwrap_or(&image_data_or_path);

        let bytes = base64::engine::general_purpose::STANDARD
            .decode(raw_b64.trim())
            .map_err(|e| format!("base64 decode failed: {}", e))?;

        let tmp_path = std::env::temp_dir().join(format!("nyx_ocr_{}.png", uuid_now()));
        std::fs::write(&tmp_path, &bytes)
            .map_err(|e| format!("Failed to write temp OCR image: {}", e))?;
        tmp_path
    } else {
        std::path::PathBuf::from(&image_data_or_path)
    };

    // Output base path (tesseract appends .txt)
    let out_base = std::env::temp_dir().join(format!("nyx_ocr_out_{}", uuid_now()));
    let out_txt = out_base.with_extension("txt");

    // Run: tesseract <image> <output_base> -l eng
    let status = Command::new("tesseract")
        .arg(&image_path)
        .arg(&out_base)
        .arg("-l")
        .arg("eng")
        .status()
        .await
        .map_err(|e| format!("Tesseract not found or failed to start: {}. Install Tesseract OCR to enable this feature.", e))?;

    // Clean up temp input file if we created it
    let _ = tokio::fs::remove_file(&image_path).await;

    if !status.success() {
        return Ok(OcrResult {
            success: false,
            extracted_text: String::new(),
            line_count: 0,
            confidence: 0.0,
            error: Some(format!("Tesseract exited with status: {}", status)),
        });
    }

    let text = tokio::fs::read_to_string(&out_txt)
        .await
        .unwrap_or_default();
    let _ = tokio::fs::remove_file(&out_txt).await;

    let trimmed = text.trim().to_string();
    let line_count = trimmed.lines().count();

    Ok(OcrResult {
        success: !trimmed.is_empty(),
        line_count,
        confidence: if trimmed.is_empty() { 0.0 } else { 0.90 },
        extracted_text: trimmed,
        error: None,
    })
}

fn uuid_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    format!("{:x}", nanos)
}
