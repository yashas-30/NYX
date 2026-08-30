use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;


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
    "nvidia-nim",
    "nvidia",
    "groq",
    "mistral",
    "huggingface",
];

pub fn sync_provider_env_var(provider: &str, key: Option<&str>) {
    let prov = provider.to_lowercase();
    match key {
        Some(k) if !k.is_empty() => match prov.as_str() {
            "gemini" => std::env::set_var("GEMINI_API_KEY", k),
            "openrouter" => std::env::set_var("OPENROUTER_API_KEY", k),
            "groq" => std::env::set_var("GROQ_API_KEY", k),
            "mistral" => std::env::set_var("MISTRAL_API_KEY", k),
            "huggingface" => std::env::set_var("HF_TOKEN", k),
            "nvidia-nim" | "nvidia" => {
                std::env::set_var("NVIDIA_API_KEY", k);
                std::env::set_var("NVIDIA_NIM_API_KEY", k);
            }
            _ => {}
        },
        _ => match prov.as_str() {
            "gemini" => std::env::remove_var("GEMINI_API_KEY"),
            "openrouter" => std::env::remove_var("OPENROUTER_API_KEY"),
            "groq" => std::env::remove_var("GROQ_API_KEY"),
            "mistral" => std::env::remove_var("MISTRAL_API_KEY"),
            "huggingface" => std::env::remove_var("HF_TOKEN"),
            "nvidia-nim" | "nvidia" => {
                std::env::remove_var("NVIDIA_API_KEY");
                std::env::remove_var("NVIDIA_NIM_API_KEY");
            }
            _ => {}
        },
    }
}

fn get_vault_file_path() -> std::path::PathBuf {
    let base_dir = dirs::config_dir()
        .or_else(dirs::data_dir)
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let nyx_dir = base_dir.join("com.nyx.desktop");
    let _ = std::fs::create_dir_all(&nyx_dir);
    nyx_dir.join("vault.json")
}

fn load_file_vault() -> HashMap<String, String> {
    let path = get_vault_file_path();
    if let Ok(data) = std::fs::read_to_string(&path) {
        if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&data) {
            return map;
        }
    }
    HashMap::new()
}

fn save_file_vault(map: &HashMap<String, String>) {
    let path = get_vault_file_path();
    if let Ok(json_str) = serde_json::to_string_pretty(map) {
        let _ = std::fs::write(&path, json_str);
    }
}

pub fn restore_all_vault_keys_to_env() {
    let file_vault = load_file_vault();
    for &provider in KNOWN_PROVIDERS {
        // 1. Try OS Keyring
        let key_opt = if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, provider) {
            entry.get_password().ok().filter(|k| !k.trim().is_empty())
        } else {
            None
        };

        // 2. Try file vault fallback
        let final_key = key_opt.or_else(|| file_vault.get(provider).cloned().filter(|k| !k.trim().is_empty()));

        if let Some(ref key) = final_key {
            sync_provider_env_var(provider, Some(key));
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

    // 2. Dual-redundant backup store in persistent AppData vault file
    let mut file_vault = load_file_vault();
    file_vault.insert(prov.clone(), val.clone());
    save_file_vault(&file_vault);

    sync_provider_env_var(&prov, Some(&val));

    VaultResult {
        success: true,
        data: Some(()),
        error: if keyring_saved { None } else { Some("Saved to local vault backup".to_string()) },
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

    // 2. Try persistent file vault fallback
    let file_vault = load_file_vault();
    if let Some(key) = file_vault.get(&prov).filter(|k| !k.trim().is_empty()) {
        sync_provider_env_var(&prov, Some(key));
        // Restore back to OS Keyring if available
        if let Ok(entry) = Entry::new(SERVICE_NAME, &prov) {
            let _ = entry.set_password(key);
        }
        return VaultResult {
            success: true,
            data: Some(key.clone()),
            error: None,
        };
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

    // 2. Delete from file vault
    let mut file_vault = load_file_vault();
    file_vault.remove(&prov);
    save_file_vault(&file_vault);

    sync_provider_env_var(&prov, None);

    VaultResult {
        success: true,
        data: Some(()),
        error: None,
    }
}

#[tauri::command(rename = "vault:status")]
pub async fn vault_status() -> VaultResult<HashMap<String, bool>> {
    let mut status_map = HashMap::new();
    let file_vault = load_file_vault();

    for &provider in KNOWN_PROVIDERS {
        let in_keyring = Entry::new(SERVICE_NAME, provider)
            .ok()
            .and_then(|e| e.get_password().ok())
            .map(|k| !k.trim().is_empty())
            .unwrap_or(false);

        let in_file = file_vault.get(provider).map(|k| !k.trim().is_empty()).unwrap_or(false);

        status_map.insert(provider.to_string(), in_keyring || in_file);
    }

    VaultResult {
        success: true,
        data: Some(status_map),
        error: None,
    }
}

#[tauri::command(rename = "vault:list-keys")]
pub async fn vault_list_keys() -> VaultResult<Vec<String>> {
    let mut keys_set = std::collections::HashSet::new();
    let file_vault = load_file_vault();

    for (k, v) in file_vault {
        if !v.trim().is_empty() {
            keys_set.insert(k);
        }
    }

    for &provider in KNOWN_PROVIDERS {
        if let Ok(entry) = Entry::new(SERVICE_NAME, provider) {
            if let Ok(key) = entry.get_password() {
                if !key.trim().is_empty() {
                    keys_set.insert(provider.to_string());
                }
            }
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
        "groq" => key_trimmed.starts_with("gsk_") || key_trimmed.len() > 10,
        "mistral" => key_trimmed.len() > 10,
        "openrouter" => key_trimmed.starts_with("sk-or-") || key_trimmed.len() > 10,
        "nvidia-nim" | "nvidia" => key_trimmed.starts_with("nvapi-") || key_trimmed.len() > 10,
        "huggingface" => key_trimmed.starts_with("hf_") || key_trimmed.len() > 10,
        _ => true,
    };
    VaultResult {
        success: valid,
        data: Some(valid),
        error: if valid { None } else { Some("Invalid API key format".to_string()) },
    }
}
