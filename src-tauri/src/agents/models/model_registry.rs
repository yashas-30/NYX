#[derive(Debug, Clone, PartialEq)]
pub enum ModelTier {
    Frontier, // GPT-4o, Claude Sonnet/Opus, Gemini 1.5 Pro, Kimi K2
    Strong,   // Gemini Flash, GPT-4o-mini, Claude Haiku, Qwen2.5-72B
    Mid,      // Mistral-7B, LLaMA-3-8B, Gemma-2-9B (GGUF local)
    Weak,     // TinyLlama, Phi-2, <4B GGUF models
}

#[derive(Debug, Clone, PartialEq)]
pub enum InstructionQuality {
    Excellent, // Follows complex multi-step instructions reliably
    Good,      // Follows most instructions, occasional drift
    Fair,      // Follows simple instructions, needs hand-holding
    Poor,      // Often ignores format/instruction constraints
}

#[derive(Debug, Clone, PartialEq)]
pub enum ReasoningDepth {
    Extended, // o1/o3, thinking models — can reason multi-step
    Standard, // GPT-4o, Claude Sonnet — good reasoning
    Basic,    // 7B-13B models — simple reasoning only
    Limited,  // <7B — mostly pattern matching
}

#[derive(Debug, Clone, PartialEq)]
pub enum PromptTemplate {
    ChatML,   // Most GGUF models (mistral, llama)
    Gemma,    // Google Gemma models
    Phi,      // Microsoft Phi models
    Standard, // Cloud APIs (no special formatting needed)
}

#[derive(Debug, Clone)]
pub struct ModelCapabilityProfile {
    pub model_id: String,
    pub tier: ModelTier,
    pub context_window: usize, // tokens
    pub supports_function_calling: bool,
    pub supports_system_prompt: bool,
    pub instruction_following: InstructionQuality,
    pub reasoning_depth: ReasoningDepth,
    pub prompt_template: PromptTemplate,
    pub max_output_tokens: usize,
    pub supports_streaming: bool,
}

pub fn get_profile(model_id: &str) -> ModelCapabilityProfile {
    let lower_model = model_id.to_lowercase();
    
    match lower_model.as_str() {
        // Frontier Cloud
        m if m.starts_with("claude-3-opus") || m.starts_with("claude-3-5-sonnet") => ModelCapabilityProfile {
            model_id: model_id.to_string(),
            tier: ModelTier::Frontier,
            context_window: 200_000,
            supports_function_calling: true,
            supports_system_prompt: true,
            instruction_following: InstructionQuality::Excellent,
            reasoning_depth: ReasoningDepth::Extended,
            prompt_template: PromptTemplate::Standard,
            max_output_tokens: 8192,
            supports_streaming: true,
        },

        m if m.starts_with("gpt-4o") || m.starts_with("o3") || m.starts_with("o1") => ModelCapabilityProfile {
            model_id: model_id.to_string(),
            tier: ModelTier::Frontier,
            context_window: 128_000,
            supports_function_calling: true,
            supports_system_prompt: true,
            instruction_following: InstructionQuality::Excellent,
            reasoning_depth: if m.starts_with("o") { ReasoningDepth::Extended } else { ReasoningDepth::Standard },
            prompt_template: PromptTemplate::Standard,
            max_output_tokens: 16384,
            supports_streaming: true,
        },

        m if m.starts_with("gemini-1.5-pro") || m.starts_with("gemini-2") => ModelCapabilityProfile {
            model_id: model_id.to_string(),
            tier: ModelTier::Frontier,
            context_window: 1_000_000,
            supports_function_calling: true,
            supports_system_prompt: true,
            instruction_following: InstructionQuality::Excellent,
            reasoning_depth: ReasoningDepth::Extended,
            prompt_template: PromptTemplate::Standard,
            max_output_tokens: 8192,
            supports_streaming: true,
        },

        // Strong Cloud
        m if m.starts_with("gemini-1.5-flash") || m.starts_with("gemini-flash") || m.starts_with("gemini-3") => ModelCapabilityProfile {
            model_id: model_id.to_string(),
            tier: ModelTier::Strong,
            context_window: 1_000_000,
            supports_function_calling: true,
            supports_system_prompt: true,
            instruction_following: InstructionQuality::Good,
            reasoning_depth: ReasoningDepth::Standard,
            prompt_template: PromptTemplate::Standard,
            max_output_tokens: 8192,
            supports_streaming: true,
        },

        m if m.starts_with("claude-3-haiku") || m.starts_with("claude-3-5-haiku") => ModelCapabilityProfile {
            model_id: model_id.to_string(),
            tier: ModelTier::Strong,
            context_window: 200_000,
            supports_function_calling: true,
            supports_system_prompt: true,
            instruction_following: InstructionQuality::Good,
            reasoning_depth: ReasoningDepth::Standard,
            prompt_template: PromptTemplate::Standard,
            max_output_tokens: 8192,
            supports_streaming: true,
        },

        // OpenRouter DeepSeek models
        m if m.contains("deepseek-reasoner") || m.contains("r1") => ModelCapabilityProfile {
            model_id: model_id.to_string(),
            tier: ModelTier::Frontier,
            context_window: 64_000,
            supports_function_calling: true,
            supports_system_prompt: true,
            instruction_following: InstructionQuality::Excellent,
            reasoning_depth: ReasoningDepth::Extended,
            prompt_template: PromptTemplate::Standard,
            max_output_tokens: 8192,
            supports_streaming: true,
        },

        m if m.contains("deepseek-chat") || m.contains("v3") => ModelCapabilityProfile {
            model_id: model_id.to_string(),
            tier: ModelTier::Frontier,
            context_window: 64_000,
            supports_function_calling: true,
            supports_system_prompt: true,
            instruction_following: InstructionQuality::Excellent,
            reasoning_depth: ReasoningDepth::Standard,
            prompt_template: PromptTemplate::Standard,
            max_output_tokens: 8192,
            supports_streaming: true,
        },

        // Local GGUF — detect by filename patterns
        m if m.contains("26b") || m.contains("27b") || m.contains("31b") => ModelCapabilityProfile {
            model_id: model_id.to_string(),
            tier: ModelTier::Strong,
            context_window: 128_000,
            supports_function_calling: true,
            supports_system_prompt: true,
            instruction_following: InstructionQuality::Good,
            reasoning_depth: ReasoningDepth::Extended,
            prompt_template: if m.contains("gemma") { PromptTemplate::Gemma } else { PromptTemplate::ChatML },
            max_output_tokens: 8192,
            supports_streaming: true,
        },

        m if m.contains("70b") || m.contains("72b") => ModelCapabilityProfile {
            model_id: model_id.to_string(),
            tier: ModelTier::Strong,
            context_window: 32_768,
            supports_function_calling: true,
            supports_system_prompt: true,
            instruction_following: InstructionQuality::Good,
            reasoning_depth: ReasoningDepth::Standard,
            prompt_template: if m.contains("gemma") { PromptTemplate::Gemma } else { PromptTemplate::ChatML },
            max_output_tokens: 4096,
            supports_streaming: true,
        },

        m if m.contains("13b") || m.contains("14b") || m.contains("34b") => ModelCapabilityProfile {
            model_id: model_id.to_string(),
            tier: ModelTier::Mid,
            context_window: 8_192,
            supports_function_calling: false,
            supports_system_prompt: true,
            instruction_following: InstructionQuality::Fair,
            reasoning_depth: ReasoningDepth::Basic,
            prompt_template: if m.contains("phi") { PromptTemplate::Phi } else { PromptTemplate::ChatML },
            max_output_tokens: 4096,
            supports_streaming: true,
        },

        m if m.contains("7b") || m.contains("8b") || m.contains("9b") => ModelCapabilityProfile {
            model_id: model_id.to_string(),
            tier: ModelTier::Mid,
            context_window: 4_096,
            supports_function_calling: false,
            supports_system_prompt: true,
            instruction_following: InstructionQuality::Fair,
            reasoning_depth: ReasoningDepth::Basic,
            prompt_template: if m.contains("gemma") { PromptTemplate::Gemma } else { PromptTemplate::ChatML },
            max_output_tokens: 2048,
            supports_streaming: true,
        },

        m if m.contains("1b") || m.contains("2b") || m.contains("3b") => ModelCapabilityProfile {
            model_id: model_id.to_string(),
            tier: ModelTier::Weak,
            context_window: 2_048,
            supports_function_calling: false,
            supports_system_prompt: true,
            instruction_following: InstructionQuality::Poor,
            reasoning_depth: ReasoningDepth::Limited,
            prompt_template: PromptTemplate::ChatML,
            max_output_tokens: 1024,
            supports_streaming: true,
        },

        // Safe default for unknown models (assume Mid tier, standard limits)
        _ => ModelCapabilityProfile {
            model_id: model_id.to_string(),
            tier: ModelTier::Mid,
            context_window: 4_096,
            supports_function_calling: false,
            supports_system_prompt: true,
            instruction_following: InstructionQuality::Fair,
            reasoning_depth: ReasoningDepth::Basic,
            prompt_template: PromptTemplate::Standard,
            max_output_tokens: 2048,
            supports_streaming: true,
        },
    }
}

pub fn build_adaptive_system_prompt(
    profile: &ModelCapabilityProfile,
    role: &str,
    tools_xml: &str,
) -> String {
    let mut prompt = String::new();

    if role == "Synthesizer" {
        prompt.push_str("You are the Synthesizer Agent in a state-of-the-art multi-agent DAG.\n");
        prompt.push_str("Your ONLY job is to ingest the raw output from the upstream dependency tasks and synthesize them into a pristine, uncluttered, premium, user-facing final response.\n");
        prompt.push_str("Do NOT output any tool logs, internal thoughts, or XML blocks. Output ONLY the polished answer.\n");
    } else if role == "Chatbot" {
        prompt.push_str("You are a helpful AI assistant. Answer the user's queries concisely and conversationally. Do not use any tools.\n");
    } else {
        prompt.push_str("You are a Worker Agent in the NYX swarm. Execute the given task. Return your results cleanly formatted (preferably in markdown or JSON).\n");
        
        if !tools_xml.is_empty() {
            prompt.push_str("You have access to the following tools:\n");
            prompt.push_str(tools_xml);
            prompt.push_str("To call a tool, output exactly this XML block:\n");
            prompt.push_str("<tool_call><name>tool_name</name><args>{\"param\": \"value\"}</args></tool_call>\n");
            prompt.push_str("Wait for the tool response before continuing.\n");
        }

        prompt.push_str("If you are asked to adhere to strict character, word, or formatting constraints, you MUST use the verify_output tool to run a Python script to verify your output against those constraints before providing your final answer. Do not guess.\n");
    }

    // Adapt to model capabilities
    match profile.tier {
        ModelTier::Frontier => {
            prompt.push_str("\n[SYSTEM NOTE: You are a frontier-tier model. You are expected to reason deeply, consider edge cases, and output highly polished, complex responses.]\n");
        },
        ModelTier::Strong => {
            prompt.push_str("\n[SYSTEM NOTE: Work carefully and methodically. Break complex instructions down.]\n");
        },
        ModelTier::Mid | ModelTier::Weak => {
            prompt.push_str("\n[SYSTEM NOTE: You MUST follow instructions exactly. DO NOT apologize or use phrases like \"I'm sorry\" or \"As an AI\". DO NOT output \"TODO\" or \"...\". Provide the complete requested code or answer directly without filler.]\n");
            
            if !tools_xml.is_empty() {
                prompt.push_str("\n[CRITICAL: If you use a tool, you MUST output ONLY the <tool_call> XML block and NOTHING ELSE. DO NOT add conversational text.]\n");
            }
        }
    }

    if profile.reasoning_depth == ReasoningDepth::Basic || profile.reasoning_depth == ReasoningDepth::Limited {
        prompt.push_str("\n[CRITICAL: Before answering, output a brief <thought>...</thought> block explaining your plan.]\n");
    }

    prompt
}

