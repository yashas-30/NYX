use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE_NAME: &str = "com.nyx.desktop";

#[derive(Serialize)]
pub struct VaultResult<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

#[derive(Deserialize)]
pub struct StoreKeyPayload { pub provider: String, pub key: String }

#[derive(Deserialize)]
pub struct ProviderPayload { pub provider: String }

#[tauri::command(rename = "vault:store-key")]
pub async fn vault_store_key(payload: StoreKeyPayload) -> VaultResult<()> {
    let entry = match Entry::new(SERVICE_NAME, &payload.provider) {
        Ok(e) => e,
        Err(err) => return VaultResult { success: false, data: None, error: Some(format!("Keyring error: {}", err)) },
    };
    match entry.set_password(&payload.key) {
        Ok(_) => VaultResult { success: true, data: Some(()), error: None },
        Err(err) => VaultResult { success: false, data: None, error: Some(format!("Failed to store key: {}", err)) },
    }
}

#[tauri::command(rename = "vault:get-key")]
pub async fn vault_get_key(payload: ProviderPayload) -> VaultResult<String> {
    let entry = match Entry::new(SERVICE_NAME, &payload.provider) {
        Ok(e) => e,
        Err(err) => return VaultResult { success: false, data: None, error: Some(format!("Keyring error: {}", err)) },
    };
    match entry.get_password() {
        Ok(key) => VaultResult { success: true, data: Some(key), error: None },
        Err(keyring::Error::NoEntry) => VaultResult { success: true, data: None, error: None },
        Err(err) => VaultResult { success: false, data: None, error: Some(format!("Failed to get key: {}", err)) },
    }
}

#[tauri::command(rename = "vault:delete-key")]
pub async fn vault_delete_key(payload: ProviderPayload) -> VaultResult<()> {
    let entry = match Entry::new(SERVICE_NAME, &payload.provider) {
        Ok(e) => e,
        Err(err) => return VaultResult { success: false, data: None, error: Some(format!("Keyring error: {}", err)) },
    };
    match entry.delete_credential() {
        Ok(_) => VaultResult { success: true, data: Some(()), error: None },
        Err(keyring::Error::NoEntry) => VaultResult { success: true, data: Some(()), error: None },
        Err(err) => VaultResult { success: false, data: None, error: Some(format!("Failed to delete key: {}", err)) },
    }
}

#[derive(Serialize)]
pub struct VaultStatus {
    pub gemini: bool,
    pub scrapling: bool,
}

#[tauri::command(rename = "vault:status")]
pub async fn vault_status() -> VaultResult<VaultStatus> {
    let gemini_entry = Entry::new(SERVICE_NAME, "gemini").ok();
    let scrapling_entry = Entry::new(SERVICE_NAME, "scrapling").ok();

    let has_gemini = gemini_entry.and_then(|e| e.get_password().ok()).is_some();
    let has_scrapling = scrapling_entry.and_then(|e| e.get_password().ok()).is_some();

    VaultResult {
        success: true,
        data: Some(VaultStatus {
            gemini: has_gemini,
            scrapling: has_scrapling,
        }),
        error: None,
    }
}
