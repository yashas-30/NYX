// ─────────────────────────────────────────────────────────────────────────────
// NYX — Model Registry & Dynamic Capability Engine
// Merged with llm/gateway.rs: single source of truth for model specifications.
// ─────────────────────────────────────────────────────────────────────────────

pub use crate::llm::gateway::{DynamicModelRegistry, DynamicModelSpec, ModelRole};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModelTier {
    Frontier, // GPT-4o, Claude Sonnet/Opus, Gemini Pro
    Strong,   // Gemini Flash, GPT-4o-mini, Claude Haiku, Qwen-72B
    Mid,      // Mistral-7B, LLaMA-8B, Gemma-9B
    Weak,     // <4B GGUF models
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InstructionQuality {
    Excellent, // Follows complex multi-step instructions reliably
    Good,      // Follows most instructions, occasional drift
    Fair,      // Follows simple instructions, needs hand-holding
    Poor,      // Often ignores format/instruction constraints
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReasoningDepth {
    Extended, // Thinking / o-series models
    Standard, // General frontier models
    Basic,    // 7B-14B models
    Limited,  // Small <4B models
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PromptTemplate {
    ChatML,
    Llama3,
    Llama2,
    DeepSeek,
    Qwen,
    Gemma,
    Phi,
    CommandR,
    Standard,
}

#[derive(Debug, Clone)]
pub struct ModelCapabilityProfile {
    pub model_id: String,
    pub tier: ModelTier,
    pub context_window: usize,
    pub supports_function_calling: bool,
    pub supports_system_prompt: bool,
    pub instruction_following: InstructionQuality,
    pub reasoning_depth: ReasoningDepth,
    pub prompt_template: PromptTemplate,
    pub stop_sequences: Vec<String>,
    pub max_output_tokens: usize,
    pub supports_streaming: bool,
}

impl DynamicModelSpec {
    pub fn to_capability_profile(&self) -> ModelCapabilityProfile {
        get_profile(&self.id)
    }
}

/// Dynamically derives a model's capability profile based on structural name attributes
/// and parameter tiering without fragile brittle string branches.
pub fn get_profile(model_id: &str) -> ModelCapabilityProfile {
    let lower = model_id.to_lowercase();

    let tier = if lower.contains("pro") || lower.contains("opus") || lower.contains("sonnet") || lower.contains("o1") || lower.contains("o3") || lower.contains("r1") || lower.contains("70b") || lower.contains("72b") {
        ModelTier::Frontier
    } else if lower.contains("flash") || lower.contains("mini") || lower.contains("haiku") || lower.contains("32b") || lower.contains("coder") {
        ModelTier::Strong
    } else if lower.contains("1b") || lower.contains("2b") || lower.contains("3b") {
        ModelTier::Weak
    } else {
        ModelTier::Mid
    };

    let instruction_following = match tier {
        ModelTier::Frontier => InstructionQuality::Excellent,
        ModelTier::Strong => InstructionQuality::Good,
        ModelTier::Mid => InstructionQuality::Fair,
        ModelTier::Weak => InstructionQuality::Poor,
    };

    let reasoning_depth = if lower.contains("r1") || lower.contains("o1") || lower.contains("o3") || lower.contains("thinking") || lower.contains("reasoner") {
        ReasoningDepth::Extended
    } else {
        match tier {
            ModelTier::Frontier => ReasoningDepth::Standard,
            ModelTier::Strong => ReasoningDepth::Standard,
            ModelTier::Mid => ReasoningDepth::Basic,
            ModelTier::Weak => ReasoningDepth::Limited,
        }
    };

    let prompt_template = if lower.contains("llama-3") || lower.contains("llama3") {
        PromptTemplate::Llama3
    } else if lower.contains("qwen") {
        PromptTemplate::Qwen
    } else if lower.contains("deepseek") {
        PromptTemplate::DeepSeek
    } else if lower.contains("gemma") {
        PromptTemplate::Gemma
    } else if lower.contains("phi") {
        PromptTemplate::Phi
    } else if lower.contains("chatml") {
        PromptTemplate::ChatML
    } else {
        PromptTemplate::Standard
    };

    let context_window = if lower.contains("1m") || lower.contains("gemini") {
        1_000_000
    } else if lower.contains("200k") || lower.contains("claude") {
        200_000
    } else if lower.contains("128k") || lower.contains("llama-3") || lower.contains("qwen") || lower.contains("gpt-4") {
        128_000
    } else {
        32_768
    };

    let max_output_tokens = match tier {
        ModelTier::Frontier => 16384,
        ModelTier::Strong => 8192,
        ModelTier::Mid => 4096,
        ModelTier::Weak => 2048,
    };

    ModelCapabilityProfile {
        model_id: model_id.to_string(),
        tier,
        context_window,
        supports_function_calling: true,
        supports_system_prompt: true,
        instruction_following,
        reasoning_depth,
        prompt_template,
        stop_sequences: vec![],
        max_output_tokens,
        supports_streaming: true,
    }
}

