use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

pub const SERVICE_NAME: &str = "com.nyx.desktop";

#[derive(Serialize)]
pub struct VaultResult<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct StoreKeyPayload {
    pub provider: String,
    pub key: String,
}

#[derive(Deserialize, Debug)]
pub struct ProviderPayload {
    pub provider: String,
}

pub const KNOWN_PROVIDERS: &[&str] = &[
    "gemini",
    "openrouter",
    "tavily",
    "openai",
    "anthropic",
    "deepseek",
    "groq",
    "mistral",
    "huggingface",
];

// ── Machine-Bound Encrypted File Storage Fallback ───────────────────────────
// Guarantees persistence even if Windows Credential Manager / Keyring fails
// or loses credentials across OS restarts / power cycles.

fn get_machine_vault_path() -> std::path::PathBuf {
    let base = dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let dir = base.join("nyx").join(".nyx-vault");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("keys.vault")
}

fn derive_keystream(len: usize) -> Vec<u8> {
    let user = std::env::var("USERNAME").or_else(|_| std::env::var("USER")).unwrap_or_else(|_| "nyx-user".to_string());
    let machine = sysinfo::System::host_name().unwrap_or_else(|| "nyx-desktop".to_string());
    let salt = format!("nyx-device-key-salt-2026:{}:{}", user, machine);
    
    let mut key_bytes = Vec::with_capacity(len);
    let salt_bytes = salt.as_bytes();
    for i in 0..len {
        let b = salt_bytes[i % salt_bytes.len()];
        let rot = ((i * 31 + 17) ^ (b as usize)) as u8;
        key_bytes.push(rot);
    }
    key_bytes
}

fn encrypt_bytes(data: &[u8]) -> Vec<u8> {
    let keystream = derive_keystream(data.len());
    data.iter().zip(keystream.iter()).map(|(d, k)| d ^ k).collect()
}

fn decrypt_bytes(data: &[u8]) -> Vec<u8> {
    encrypt_bytes(data) // Symmetric XOR cipher
}

fn read_file_vault() -> HashMap<String, String> {
    let path = get_machine_vault_path();
    if !path.exists() {
        return HashMap::new();
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => {
            if let Ok(cipher_bytes) = BASE64.decode(content.trim()) {
                let plain_bytes = decrypt_bytes(&cipher_bytes);
                if let Ok(json_str) = String::from_utf8(plain_bytes) {
                    if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&json_str) {
                        return map;
                    }
                }
            }
            HashMap::new()
        }
        Err(_) => HashMap::new(),
    }
}

fn write_file_vault(map: &HashMap<String, String>) -> Result<(), String> {
    let path = get_machine_vault_path();
    let json_str = serde_json::to_string(map).map_err(|e| e.to_string())?;
    let cipher_bytes = encrypt_bytes(json_str.as_bytes());
    let encoded = BASE64.encode(cipher_bytes);
    std::fs::write(&path, encoded).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn sync_provider_env_var(provider: &str, key: Option<&str>) {
    let prov = provider.to_lowercase();
    match key {
        Some(k) if !k.is_empty() => match prov.as_str() {
            "tavily" => std::env::set_var("TAVILY_API_KEY", k),
            "gemini" => std::env::set_var("GEMINI_API_KEY", k),
            "openrouter" => std::env::set_var("OPENROUTER_API_KEY", k),
            "openai" => std::env::set_var("OPENAI_API_KEY", k),
            "anthropic" => std::env::set_var("ANTHROPIC_API_KEY", k),
            "deepseek" => std::env::set_var("DEEPSEEK_API_KEY", k),
            "groq" => std::env::set_var("GROQ_API_KEY", k),
            "mistral" => std::env::set_var("MISTRAL_API_KEY", k),
            "huggingface" => std::env::set_var("HF_TOKEN", k),
            _ => {}
        },
        _ => match prov.as_str() {
            "tavily" => std::env::remove_var("TAVILY_API_KEY"),
            "gemini" => std::env::remove_var("GEMINI_API_KEY"),
            "openrouter" => std::env::remove_var("OPENROUTER_API_KEY"),
            "openai" => std::env::remove_var("OPENAI_API_KEY"),
            "anthropic" => std::env::remove_var("ANTHROPIC_API_KEY"),
            "deepseek" => std::env::remove_var("DEEPSEEK_API_KEY"),
            "groq" => std::env::remove_var("GROQ_API_KEY"),
            "mistral" => std::env::remove_var("MISTRAL_API_KEY"),
            "huggingface" => std::env::remove_var("HF_TOKEN"),
            _ => {}
        },
    }
}

pub fn restore_all_vault_keys_to_env() {
    let file_keys = read_file_vault();
    for &provider in KNOWN_PROVIDERS {
        // Try keyring first
        let mut resolved_key: Option<String> = None;
        if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, provider) {
            if let Ok(key) = entry.get_password() {
                if !key.trim().is_empty() {
                    resolved_key = Some(key);
                }
            }
        }
        // If not in keyring, check encrypted file vault
        if resolved_key.is_none() {
            if let Some(key) = file_keys.get(provider) {
                if !key.trim().is_empty() {
                    resolved_key = Some(key.clone());
                    // Backfill to keyring
                    if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, provider) {
                        let _ = entry.set_password(key);
                    }
                }
            }
        }
        if let Some(ref k) = resolved_key {
            sync_provider_env_var(provider, Some(k));
        }
    }
}

#[tauri::command(rename = "vault:store-key")]
pub async fn vault_store_key(
    provider: Option<String>,
    key: Option<String>,
    payload: Option<StoreKeyPayload>,
) -> VaultResult<()> {
    let (target_provider, target_key) = if let (Some(p), Some(k)) = (provider, key) {
        (p, k)
    } else if let Some(pl) = payload {
        (pl.provider, pl.key)
    } else {
        return VaultResult {
            success: false,
            data: None,
            error: Some("Missing provider or key parameter".to_string()),
        };
    };

    let prov = target_provider.trim().to_lowercase();
    let val = target_key.trim().to_string();

    // 1. Store in OS Keyring
    let keyring_saved = match Entry::new(SERVICE_NAME, &prov) {
        Ok(entry) => entry.set_password(&val).is_ok(),
        Err(_) => false,
    };

    // 2. Store in Machine-Bound Encrypted Vault File
    let mut file_keys = read_file_vault();
    file_keys.insert(prov.clone(), val.clone());
    let file_saved = write_file_vault(&file_keys).is_ok();

    sync_provider_env_var(&prov, Some(&val));

    if keyring_saved || file_saved {
        VaultResult {
            success: true,
            data: Some(()),
            error: None,
        }
    } else {
        VaultResult {
            success: false,
            data: None,
            error: Some("Failed to store key in secure device vault".to_string()),
        }
    }
}

#[tauri::command(rename = "vault:get-key")]
pub async fn vault_get_key(
    provider: Option<String>,
    payload: Option<ProviderPayload>,
) -> VaultResult<String> {
    let target_provider = if let Some(p) = provider {
        p
    } else if let Some(pl) = payload {
        pl.provider
    } else {
        return VaultResult {
            success: false,
            data: None,
            error: Some("Missing provider parameter".to_string()),
        };
    };

    let prov = target_provider.trim().to_lowercase();

    // 1. Try OS Keyring
    if let Ok(entry) = Entry::new(SERVICE_NAME, &prov) {
        if let Ok(key) = entry.get_password() {
            if !key.trim().is_empty() {
                sync_provider_env_var(&prov, Some(&key));
                return VaultResult {
                    success: true,
                    data: Some(key),
                    error: None,
                };
            }
        }
    }

    // 2. Fallback to Machine-Bound Encrypted Vault File
    let file_keys = read_file_vault();
    if let Some(key) = file_keys.get(&prov) {
        if !key.trim().is_empty() {
            sync_provider_env_var(&prov, Some(key));
            // Backfill into keyring
            if let Ok(entry) = Entry::new(SERVICE_NAME, &prov) {
                let _ = entry.set_password(key);
            }
            return VaultResult {
                success: true,
                data: Some(key.clone()),
                error: None,
            };
        }
    }

    VaultResult {
        success: true,
        data: None,
        error: None,
    }
}

#[tauri::command(rename = "vault:delete-key")]
pub async fn vault_delete_key(
    provider: Option<String>,
    payload: Option<ProviderPayload>,
) -> VaultResult<()> {
    let target_provider = if let Some(p) = provider {
        p
    } else if let Some(pl) = payload {
        pl.provider
    } else {
        return VaultResult {
            success: false,
            data: None,
            error: Some("Missing provider parameter".to_string()),
        };
    };

    let prov = target_provider.trim().to_lowercase();

    // 1. Delete from Keyring
    if let Ok(entry) = Entry::new(SERVICE_NAME, &prov) {
        let _ = entry.delete_credential();
    }

    // 2. Delete from Encrypted File Vault
    let mut file_keys = read_file_vault();
    file_keys.remove(&prov);
    let _ = write_file_vault(&file_keys);

    sync_provider_env_var(&prov, None);

    VaultResult {
        success: true,
        data: Some(()),
        error: None,
    }
}

#[tauri::command(rename = "vault:status")]
pub async fn vault_status() -> VaultResult<HashMap<String, bool>> {
    let file_keys = read_file_vault();
    let mut status_map = HashMap::new();

    for &provider in KNOWN_PROVIDERS {
        let in_file = file_keys.get(provider).map(|k| !k.trim().is_empty()).unwrap_or(false);
        let in_keyring = Entry::new(SERVICE_NAME, provider)
            .ok()
            .and_then(|e| e.get_password().ok())
            .map(|k| !k.trim().is_empty())
            .unwrap_or(false);

        status_map.insert(provider.to_string(), in_file || in_keyring);
    }

    VaultResult {
        success: true,
        data: Some(status_map),
        error: None,
    }
}

#[tauri::command(rename = "vault:list-keys")]
pub async fn vault_list_keys() -> VaultResult<Vec<String>> {
    let file_keys = read_file_vault();
    let mut keys_set = std::collections::HashSet::new();

    for &provider in KNOWN_PROVIDERS {
        if let Ok(entry) = Entry::new(SERVICE_NAME, provider) {
            if let Ok(key) = entry.get_password() {
                if !key.trim().is_empty() {
                    keys_set.insert(provider.to_string());
                }
            }
        }
        if let Some(key) = file_keys.get(provider) {
            if !key.trim().is_empty() {
                keys_set.insert(provider.to_string());
            }
        }
    }

    // Also include any extra custom providers in file vault
    for (k, v) in file_keys {
        if !v.trim().is_empty() {
            keys_set.insert(k);
        }
    }

    VaultResult {
        success: true,
        data: Some(keys_set.into_iter().collect()),
        error: None,
    }
}

#[tauri::command]
pub async fn vault_validate(provider: String, api_key: String) -> VaultResult<bool> {
    let key_trimmed = api_key.trim();
    if key_trimmed.is_empty() {
        return VaultResult {
            success: false,
            data: Some(false),
            error: Some("Key is empty".to_string()),
        };
    }
    let valid = match provider.as_str() {
        "gemini" => key_trimmed.len() > 10,
        "tavily" => key_trimmed.starts_with("tvly-") || key_trimmed.len() > 10,
        "openai" => key_trimmed.starts_with("sk-") || key_trimmed.len() > 10,
        "anthropic" => key_trimmed.starts_with("sk-ant-") || key_trimmed.len() > 10,
        "deepseek" => key_trimmed.starts_with("sk-") || key_trimmed.len() > 10,
        "groq" => key_trimmed.starts_with("gsk_") || key_trimmed.len() > 10,
        "mistral" => key_trimmed.len() > 10,
        "openrouter" => key_trimmed.starts_with("sk-or-") || key_trimmed.len() > 10,
        "huggingface" => key_trimmed.starts_with("hf_") || key_trimmed.len() > 10,
        _ => true,
    };
    VaultResult {
        success: valid,
        data: Some(valid),
        error: if valid { None } else { Some("Invalid API key format".to_string()) },
    }
}

#[tauri::command(rename = "vault:encrypt")]
pub async fn vault_encrypt(plaintext: String) -> VaultResult<String> {
    let cipher = encrypt_bytes(plaintext.as_bytes());
    VaultResult {
        success: true,
        data: Some(BASE64.encode(cipher)),
        error: None,
    }
}

#[tauri::command(rename = "vault:decrypt")]
pub async fn vault_decrypt(ciphertext: String) -> VaultResult<String> {
    match BASE64.decode(ciphertext.trim()) {
        Ok(cipher_bytes) => {
            let plain_bytes = decrypt_bytes(&cipher_bytes);
            match String::from_utf8(plain_bytes) {
                Ok(plain_str) => VaultResult {
                    success: true,
                    data: Some(plain_str),
                    error: None,
                },
                Err(e) => VaultResult {
                    success: false,
                    data: None,
                    error: Some(format!("UTF-8 decode failed: {}", e)),
                },
            }
        }
        Err(e) => VaultResult {
            success: false,
            data: None,
            error: Some(format!("Base64 decode failed: {}", e)),
        },
    }
}
