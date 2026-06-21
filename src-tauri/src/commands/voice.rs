use reqwest::Client;
use serde_json::json;
use tauri::AppHandle;

// Gets the API key from the system keyring, same as the vault
fn get_openai_key(_app: &AppHandle) -> Result<String, String> {
    let key = keyring::Entry::new("nyx-vault", "openai")
        .map_err(|e| e.to_string())?
        .get_password()
        .map_err(|e| e.to_string())?;
    Ok(key)
}

#[tauri::command]
pub async fn voice_tts(app: AppHandle, text: String, voice: String) -> Result<Vec<u8>, String> {
    let api_key = match get_openai_key(&app) {
        Ok(k) => k,
        Err(_) => return Err("OpenAI API key not found in vault".to_string()),
    };

    let client = Client::new();
    let res = client
        .post("https://api.openai.com/v1/audio/speech")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&json!({
            "model": "tts-1",
            "input": text,
            "voice": voice
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err = res.text().await.unwrap_or_default();
        return Err(format!("TTS API Error: {}", err));
    }

    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

#[tauri::command]
pub async fn voice_stt(app: AppHandle, audio_data: Vec<u8>) -> Result<String, String> {
    let api_key = match get_openai_key(&app) {
        Ok(k) => k,
        Err(_) => return Err("OpenAI API key not found in vault".to_string()),
    };

    let client = Client::new();
    
    let part = reqwest::multipart::Part::bytes(audio_data)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| e.to_string())?;
        
    let form = reqwest::multipart::Form::new()
        .text("model", "whisper-1")
        .part("file", part);

    let res = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err = res.text().await.unwrap_or_default();
        return Err(format!("STT API Error: {}", err));
    }

    #[derive(serde::Deserialize)]
    struct SttResponse {
        text: String,
    }

    let parsed: SttResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(parsed.text)
}
