// ─────────────────────────────────────────────────────────────────────────────
// NYX — Dynamic Model Registry, Live Quota Ledger & Resilient Gateway
// ─────────────────────────────────────────────────────────────────────────────

use chrono::{DateTime, Utc};
use reqwest::header::HeaderMap;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

// ─────────────────────────────────────────────────────────────────────────────
// Abstract Cognitive Roles (Zero Hardcoded Model Strings)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ModelRole {
    FastIntentClassifier,    // Sub-200ms, strict JSON schema output, high RPM
    DeepResearchSynthesizer, // 100K+ context window, deep factual synthesis
    CodeAndArtifactEngine,   // High coding accuracy, Slidev & Mermaid grammar
    ReasoningAndReflection,  // Thinking tokens, verification, gap analysis
    UniversalFallback,       // Resilient free-tier fallback
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DynamicModelSpec {
    pub id: String,
    pub provider: String,
    pub context_window: usize,
    pub supports_json: bool,
    pub supports_tools: bool,
    pub is_free_tier: bool,
    pub capability_score: f32,
    pub is_local: bool,
}

// ─────────────────────────────────────────────────────────────────────────────
// Live Quota & Rate-Limit Tracking State
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderQuotaState {
    pub provider: String,
    pub api_key_hash: String,
    pub remaining_requests: Option<u32>,
    pub remaining_tokens: Option<u32>,
    pub limit_requests: Option<u32>,
    pub limit_tokens: Option<u32>,
    pub reset_at: Option<DateTime<Utc>>,
    pub consecutive_429s: u32,
    pub is_healthy: bool,
    pub latency_ema_ms: f64,
}

impl Default for ProviderQuotaState {
    fn default() -> Self {
        Self {
            provider: String::new(),
            api_key_hash: String::new(),
            remaining_requests: None,
            remaining_tokens: None,
            limit_requests: None,
            limit_tokens: None,
            reset_at: None,
            consecutive_429s: 0,
            is_healthy: true,
            latency_ema_ms: 0.0,
        }
    }
}

#[derive(Clone, Default)]
pub struct LiveQuotaLedger {
    pub states: Arc<RwLock<HashMap<String, ProviderQuotaState>>>,
}

impl LiveQuotaLedger {
    /// Intercepts response headers and updates the live quota ledger
    pub async fn update_from_headers(&self, provider: &str, key_hash: &str, headers: &HeaderMap, latency_ms: f64) {
        let mut lock = self.states.write().await;
        let entry = lock.entry(format!("{}:{}", provider, key_hash)).or_insert_with(|| ProviderQuotaState {
            provider: provider.to_string(),
            api_key_hash: key_hash.to_string(),
            is_healthy: true,
            ..Default::default()
        });

        // 1. Remaining requests
        if let Some(val) = headers.get("x-ratelimit-remaining-requests")
            .or_else(|| headers.get("ratelimit-remaining"))
            .or_else(|| headers.get("x-ratelimit-remaining-req-minute")) 
        {
            if let Ok(s) = val.to_str() {
                if let Ok(num) = s.parse::<u32>() {
                    entry.remaining_requests = Some(num);
                    entry.is_healthy = num > 2; // Preemptive threshold before 429
                }
            }
        }

        // 2. Remaining tokens
        if let Some(val) = headers.get("x-ratelimit-remaining-tokens")
            .or_else(|| headers.get("x-ratelimit-remaining-tokens-minute")) 
        {
            if let Ok(s) = val.to_str() {
                if let Ok(num) = s.parse::<u32>() {
                    entry.remaining_tokens = Some(num);
                }
            }
        }

        // 3. Rate limit ceilings
        if let Some(val) = headers.get("x-ratelimit-limit-requests").or_else(|| headers.get("ratelimit-limit")) {
            if let Ok(s) = val.to_str() {
                if let Ok(num) = s.parse::<u32>() {
                    entry.limit_requests = Some(num);
                }
            }
        }

        // 4. Update latency moving average (alpha = 0.2)
        if entry.latency_ema_ms == 0.0 {
            entry.latency_ema_ms = latency_ms;
        } else {
            entry.latency_ema_ms = (0.2 * latency_ms) + (0.8 * entry.latency_ema_ms);
        }

        entry.consecutive_429s = 0;
    }

    /// Records a 429 rate-limit error with backoff cooldown
    pub async fn record_rate_limit(&self, provider: &str, key_hash: &str, retry_after_secs: u64) {
        let mut lock = self.states.write().await;
        let entry = lock.entry(format!("{}:{}", provider, key_hash)).or_insert_with(|| ProviderQuotaState {
            provider: provider.to_string(),
            api_key_hash: key_hash.to_string(),
            ..Default::default()
        });

        entry.consecutive_429s += 1;
        entry.is_healthy = false;
        let cooldown = if retry_after_secs > 0 { retry_after_secs } else { 10 * (1 << entry.consecutive_429s.min(5)) };
        entry.reset_at = Some(Utc::now() + chrono::Duration::seconds(cooldown as i64));
    }

    /// Checks if a provider has sufficient headroom for execution
    pub async fn is_provider_ready(&self, provider: &str, key_hash: &str) -> bool {
        let lock = self.states.read().await;
        if let Some(entry) = lock.get(&format!("{}:{}", provider, key_hash)) {
            if let Some(reset) = entry.reset_at {
                if Utc::now() < reset {
                    return false;
                }
            }
            return entry.is_healthy;
        }
        true
    }

    /// Returns a snapshot of all tracked provider quota states for the UI
    pub async fn get_all_states(&self) -> Vec<ProviderQuotaState> {
        let lock = self.states.read().await;
        lock.values().cloned().collect()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic Model Registry
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Clone, Default)]
pub struct DynamicModelRegistry {
    pub models: Arc<RwLock<Vec<DynamicModelSpec>>>,
    pub role_bindings: Arc<RwLock<HashMap<ModelRole, Vec<String>>>>,
}

impl DynamicModelRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Discovers active models from provider `/models` endpoints dynamically
    pub async fn sync_provider_models(&self, provider: &str, api_key: &str) -> Result<Vec<DynamicModelSpec>, String> {
        if provider == "nyx-native" || provider.contains("local") {
            return Ok(vec![]);
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(6))
            .build()
            .map_err(|e| e.to_string())?;

        let url = match provider {
            "groq" => "https://api.groq.com/openai/v1/models",
            "mistral" => "https://api.mistral.ai/v1/models",
            "openrouter" => "https://openrouter.ai/api/v1/models",
            _ => return Ok(vec![]),
        };

        let resp = client.get(url)
            .bearer_auth(api_key)
            .send()
            .await
            .map_err(|e| format!("Failed to reach {} model endpoint: {}", provider, e))?;

        if !resp.status().is_success() {
            return Err(format!("{} model query failed: {}", provider, resp.status()));
        }

        let json_val: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        let mut discovered = Vec::new();

        if let Some(data) = json_val.get("data").and_then(|d| d.as_array()) {
            for m in data {
                if let Some(id) = m.get("id").and_then(|i| i.as_str()) {
                    let context_len = m.get("context_window").and_then(|c| c.as_u64()).unwrap_or(8192) as usize;
                    let is_free = id.contains(":free") || provider == "groq";
                    discovered.push(DynamicModelSpec {
                        id: id.to_string(),
                        provider: provider.to_string(),
                        context_window: context_len,
                        supports_json: true,
                        supports_tools: true,
                        is_free_tier: is_free,
                        capability_score: Self::infer_capability_score(id),
                        is_local: false,
                    });
                }
            }
        }

        let mut pool = self.models.write().await;
        pool.retain(|m| m.provider != provider);
        pool.extend(discovered.clone());

        Ok(discovered)
    }

    fn infer_capability_score(model_id: &str) -> f32 {
        let lower = model_id.to_lowercase();
        if lower.contains("70b") || lower.contains("r1") || lower.contains("pro") || lower.contains("large") {
            0.95
        } else if lower.contains("32b") || lower.contains("flash") || lower.contains("small") || lower.contains("coder") {
            0.85
        } else if lower.contains("8b") || lower.contains("7b") || lower.contains("mini") {
            0.75
        } else {
            0.60
        }
    }

    /// Selects the best available model for a cognitive role based on live quota readiness
    pub async fn select_model_for_role(
        &self,
        role: ModelRole,
        quota_ledger: &LiveQuotaLedger,
    ) -> Result<DynamicModelSpec, String> {
        let pool = self.models.read().await;

        let mut candidates: Vec<&DynamicModelSpec> = pool.iter().filter(|m| match role {
            ModelRole::FastIntentClassifier => {
                m.supports_json && (m.id.contains("8b") || m.id.contains("mini") || m.id.contains("flash") || m.id.contains("instant"))
            }
            ModelRole::DeepResearchSynthesizer => m.context_window >= 16000 || m.capability_score >= 0.8,
            ModelRole::CodeAndArtifactEngine => {
                m.id.contains("code") || m.id.contains("codestral") || m.capability_score >= 0.8
            }
            ModelRole::ReasoningAndReflection => {
                m.id.contains("r1") || m.id.contains("reason") || m.capability_score >= 0.9
            }
            ModelRole::UniversalFallback => m.is_free_tier,
        }).collect();

        // Sort by capability score descending
        candidates.sort_by(|a, b| b.capability_score.partial_cmp(&a.capability_score).unwrap_or(std::cmp::Ordering::Equal));

        // Find first healthy candidate
        for candidate in candidates {
            if quota_ledger.is_provider_ready(&candidate.provider, "").await {
                return Ok(candidate.clone());
            }
        }

        // Fallback to any healthy model in pool
        for candidate in pool.iter() {
            if quota_ledger.is_provider_ready(&candidate.provider, "").await {
                return Ok(candidate.clone());
            }
        }

        // Default synthetic fallback if pool is empty
        Ok(DynamicModelSpec {
            id: match role {
                ModelRole::FastIntentClassifier => "openai/gpt-oss-20b".to_string(),
                ModelRole::DeepResearchSynthesizer => "gemini-3.5-flash-lite".to_string(),
                ModelRole::CodeAndArtifactEngine => "codestral-latest".to_string(),
                ModelRole::ReasoningAndReflection => "openai/gpt-oss-120b".to_string(),
                ModelRole::UniversalFallback => "nvidia/nemotron-3-super-120b-a12b:free".to_string(),
            },
            provider: match role {
                ModelRole::FastIntentClassifier => "groq".to_string(),
                ModelRole::DeepResearchSynthesizer => "gemini".to_string(),
                ModelRole::CodeAndArtifactEngine => "mistral".to_string(),
                ModelRole::ReasoningAndReflection => "groq".to_string(),
                ModelRole::UniversalFallback => "openrouter".to_string(),
            },
            context_window: 128000,
            supports_json: true,
            supports_tools: true,
            is_free_tier: true,
            capability_score: 0.85,
            is_local: false,
        })
    }
}
