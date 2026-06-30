use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

/// Environment state passed to the planner for context-aware DAG generation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentState {
    pub available_pipelines: Vec<String>,
    pub local_models: Vec<String>,
    pub cloud_models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubTask {
    pub id: String,
    pub description: String,
    pub depends_on: Vec<String>,
    pub preferred_model: String,
    pub role: String, // "Worker" | "Thinker" | "Verifier"
    #[serde(default)]
    pub tool_filters: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FuguPlan {
    pub subtasks: Vec<SubTask>,
}

/// The Gemini-powered Conductor. Replaces the Qwen/Candle local planner.
/// Uses a direct Gemini API call to decompose a user prompt into a parallel
/// Directed Acyclic Graph (DAG) of sub-tasks for the worker swarm.
pub struct LocalOrchestrator;

impl LocalOrchestrator {
    pub fn new() -> Self {
        Self
    }

    pub async fn generate_swarm_plan(
        &self,
        env: &EnvironmentState,
        prompt: &str,
        nyx_memory_context: &str,
        rag_context: &str,
    ) -> Result<FuguPlan> {
        info!("Generating Swarm DAG via Gemini Conductor...");

        let api_key = crate::agents::api_key_store::get_key("GEMINI_API_KEY");
        if api_key.is_empty() {
            warn!("No GEMINI_API_KEY found — falling back to single-task linear plan.");
            return Ok(single_task_plan(prompt, env));
        }

        let system_prompt = format!(
            "You are the NYX Swarm Conductor. You are a meta-planner ONLY. You do NOT solve problems.
Your ONLY job is to decompose the user's request into a parallel Directed Acyclic Graph (DAG) of sub-tasks.
Use parallel tasks (empty depends_on) wherever possible to maximize throughput.
Route complex reasoning to cloud models, repetitive execution to local models.

Environment State:
  Local Models: {:?}
  Cloud Models: {:?}

NYX Long-Term Memory:
{}

RAG Codebase Context:
{}

CRITICAL: Output ONLY valid JSON. No explanation, no markdown fences. Strictly this schema:
{{
  \"subtasks\": [
    {{
      \"id\": \"task_1\",
      \"description\": \"Precise description of what this worker should do\",
      \"depends_on\": [],
      \"preferred_model\": \"<select from available models above>\",
      \"role\": \"Worker\"
    }}
  ]
}}

Rules:
- Use 1 subtask for simple prompts (greetings, factual Q&A, single-question answers).
- Use 2-4 parallel subtasks for multi-part or complex research/coding tasks.
- Never create circular dependencies.
- roles must be exactly one of: Worker, Thinker, Verifier",
            env.local_models,
            env.cloud_models,
            nyx_memory_context,
            rag_context
        );

        // Use the first available cloud model as the conductor
        let conductor_model = env
            .cloud_models
            .first()
            .map(|s| s.as_str())
            .unwrap_or("gemini-2.5-flash");

        let endpoint = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            conductor_model
        );

        let mut contents = vec![serde_json::json!({
            "role": "user",
            "parts": [{"text": prompt}]
        })];

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .context("Failed to build reqwest client")?;

        for attempt in 1..=3 {
            let body = serde_json::json!({
                "system_instruction": {
                    "parts": [{"text": system_prompt}]
                },
                "contents": contents,
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 2048,
                    "responseMimeType": "application/json"
                }
            });

            let response = client
                .post(&endpoint)
                .header("x-goog-api-key", &api_key)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .context("Gemini Conductor API call failed")?;

            let response_json: serde_json::Value = response
                .json()
                .await
                .context("Failed to parse Gemini Conductor response")?;

            // Extract text from Gemini response structure
            let raw_text = response_json
                .pointer("/candidates/0/content/parts/0/text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();

            if raw_text.is_empty() {
                warn!("Gemini Conductor returned empty plan. Falling back to single-task.");
                return Ok(single_task_plan(prompt, env));
            }

            info!("Gemini Conductor raw plan (Attempt {}): {}", attempt, &raw_text[..raw_text.len().min(500)]);

            match serde_json::from_str::<FuguPlan>(&raw_text) {
                Ok(plan) => return Ok(plan),
                Err(e) => {
                    warn!("Failed to parse Conductor JSON on attempt {}: {}", attempt, e);
                    contents.push(serde_json::json!({
                        "role": "model",
                        "parts": [{"text": raw_text.clone()}]
                    }));
                    contents.push(serde_json::json!({
                        "role": "user",
                        "parts": [{"text": format!("Your JSON was invalid. Error: {}. Please fix it and output ONLY valid JSON matching the schema.", e)}]
                    }));
                }
            }
        }

        warn!("Failed to get valid JSON after 3 attempts. Falling back to single-task.");
        Ok(single_task_plan(prompt, env))
    }
}

/// Fallback plan when the Conductor cannot generate a multi-step plan.
/// Creates a single worker task assigned to the best available cloud model.
fn single_task_plan(prompt: &str, env: &EnvironmentState) -> FuguPlan {
    let mut model = env.local_models.first().cloned().unwrap_or_default();
    if model.is_empty() {
        model = env.cloud_models.first().cloned().unwrap_or_else(|| "gemini-2.5-flash".to_string());
    }

    FuguPlan {
        subtasks: vec![SubTask {
            id: "task_1".to_string(),
            description: prompt.to_string(),
            depends_on: vec![],
            preferred_model: model,
            role: "Worker".to_string(),
            tool_filters: None,
        }],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_single_task_fallback() {
        let env = EnvironmentState {
            local_models: vec!["llama-3.2-3b-native".to_string()],
            cloud_models: vec!["gemini-2.5-flash".to_string()],
            available_pipelines: vec!["chat".into()],
        };
        let plan = single_task_plan("Hello world", &env);
        assert_eq!(plan.subtasks.len(), 1);
        assert_eq!(plan.subtasks[0].role, "Worker");
    }
}
