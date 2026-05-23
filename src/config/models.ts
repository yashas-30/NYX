import { ModelOption } from '../types';

// Anthropic Claude via OpenRouter
export const CLAUDE_MODELS: ModelOption[] = [
  {
    id: 'anthropic/claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4 (Latest)',
    provider: 'openrouter',
    description: 'Anthropic latest Sonnet model with enhanced coding capabilities.',
    specs: { contextWindow: '200K', trainingData: '2025', maxOutput: '32K', modality: 'Text' }
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'openrouter',
    description: 'Strong coding and reasoning capabilities.',
    specs: { contextWindow: '200K', trainingData: '2024', maxOutput: '8K', modality: 'Text' }
  },
];

// OpenCode Zen - All verified free models
export const FREE_OPENCODE_MODELS: ModelOption[] = [
  {
    id: 'opencode/big-pickle',
    name: 'Big Pickle',
    provider: 'opencode',
    description: 'Stealth model optimized for coding agents. Currently free.',
    specs: { contextWindow: '200K', trainingData: '2026', maxOutput: '32K', modality: 'Text' }
  },
  {
    id: 'opencode/deepseek-v4-flash-free',
    name: 'DeepSeek V4 Flash (Free)',
    provider: 'opencode',
    description: 'Fast DeepSeek model for quick tasks. Free on Zen.',
    specs: { contextWindow: '128K', trainingData: '2025', maxOutput: '8K', modality: 'Text' }
  },
  {
    id: 'opencode/minimax-m2.5-free',
    name: 'MiniMax M2.5 (Free)',
    provider: 'opencode',
    description: 'Strong at coding and reasoning. Free on Zen.',
    specs: { contextWindow: '200K', trainingData: '2025', maxOutput: '8K', modality: 'Text' }
  },
  {
    id: 'opencode/ring-2.6-1t-free',
    name: 'Ring 2.6 1T (Free)',
    provider: 'opencode',
    description: 'High-capacity reasoning model. Free on Zen.',
    specs: { contextWindow: '200K', trainingData: '2025', maxOutput: '16K', modality: 'Text' }
  },
  {
    id: 'opencode/qwen3-30b-a3b-free',
    name: 'Qwen3 30B (Free)',
    provider: 'opencode',
    description: 'Alibaba Qwen3 model - free on Zen.',
    specs: { contextWindow: '131K', trainingData: '2025', maxOutput: '8K', modality: 'Text' }
  },
  {
    id: 'opencode/qwen3-coder-14b-free',
    name: 'Qwen3 Coder 14B (Free)',
    provider: 'opencode',
    description: 'Specialized coding model - free on Zen.',
    specs: { contextWindow: '32K', trainingData: '2025', maxOutput: '8K', modality: 'Text' }
  },
  {
    id: 'opencode/llama-3.3-70b-free',
    name: 'Llama 3.3 70B (Free)',
    provider: 'opencode',
    description: "Meta's latest Llama - free on Zen.",
    specs: { contextWindow: '131K', trainingData: '2024', maxOutput: '32K', modality: 'Text' }
  },
  {
    id: 'opencode/gemma-3-27b-it-free',
    name: 'Gemma 3 27B (Free)',
    provider: 'opencode',
    description: "Google's latest Gemma - free on Zen.",
    specs: { contextWindow: '128K', trainingData: '2025', maxOutput: '8K', modality: 'Text' }
  },
  {
    id: 'opencode/deepseek-v3-free',
    name: 'DeepSeek V3 (Free)',
    provider: 'opencode',
    description: 'DeepSeek V3 model - free on Zen.',
    specs: { contextWindow: '64K', trainingData: '2024', maxOutput: '8K', modality: 'Text' }
  },
];

// Pollinations.ai - Verified free models
export const POLLINATIONS_MODELS: ModelOption[] = [
  {
    id: 'pollinations/openai-fast',
    name: 'GPT-OSS 20B (Free)',
    provider: 'pollinations',
    description: 'Fast, open-weight model with excellent instruction-following. Free, no key required.',
    specs: { contextWindow: '131K', trainingData: '2024', maxOutput: '8K', modality: 'Text' }
  },
  {
    id: 'pollinations/openai',
    name: 'GPT-4o-Mini equivalent (Free)',
    provider: 'pollinations',
    description: 'High-quality general purpose intelligence. Free, no key required.',
    specs: { contextWindow: '128K', trainingData: '2024', maxOutput: '16K', modality: 'Text' }
  }
];

const RAW_AVAILABLE_MODELS: ModelOption[] = [
  ...POLLINATIONS_MODELS,
  // ═══════════════════════════════════════════════════════════════════════════════
  // OPENROUTER - FREE MODELS (Current)
  // ═══════════════════════════════════════════════════════════════════════════════
  { id: 'openrouter/owl-alpha', name: 'OpenRouter OWL Alpha', provider: 'openrouter', description: 'OpenRouter flagship reasoning model', specs: { contextWindow: '1M', trainingData: '2025', maxOutput: '32K', modality: 'Text' } },
  { id: 'openrouter/free', name: 'OpenRouter Auto (Free)', provider: 'openrouter', description: 'Auto-routes to best free model', specs: { contextWindow: '200K', trainingData: 'Dynamic', maxOutput: '8K', modality: 'Text' } },
  { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (Free)', provider: 'openrouter', description: "Google's latest Gemma flagship", specs: { contextWindow: '262K', trainingData: '2025', maxOutput: '8K', modality: 'Text' } },
  { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B (Free)', provider: 'openrouter', description: "Google's efficient Gemma 4 model", specs: { contextWindow: '262K', trainingData: '2025', maxOutput: '8K', modality: 'Text' } },
  { id: 'deepseek/deepseek-v4-flash:free', name: 'DeepSeek V4 Flash (Free)', provider: 'openrouter', description: 'DeepSeek latest with 1M context', specs: { contextWindow: '1M', trainingData: '2025', maxOutput: '8K', modality: 'Text' } },
  { id: 'deepseek/deepseek-chat-v3.2:free', name: 'DeepSeek V3.2 (Free)', provider: 'openrouter', description: 'DeepSeek V3 with excellent coding', specs: { contextWindow: '64K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', provider: 'openrouter', description: "Meta's best free model - GPT-4 level", specs: { contextWindow: '131K', trainingData: '2024', maxOutput: '32K', modality: 'Text' } },
  { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B (Free)', provider: 'openrouter', description: "Meta's efficient small model", specs: { contextWindow: '131K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super (Free)', provider: 'openrouter', description: "NVIDIA's 262K context flagship", specs: { contextWindow: '262K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron 3 Nano (Free)', provider: 'openrouter', description: "NVIDIA's efficient 30B model", specs: { contextWindow: '256K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', name: 'Nemotron 3 Nano Reasoning (Free)', provider: 'openrouter', description: 'NVIDIA reasoning model with vision', specs: { contextWindow: '256K', trainingData: '2025', maxOutput: '16K', modality: 'Text' } },
  { id: 'qwen/qwen3-next-80b-a3b-instruct:free', name: 'Qwen3 Next 80B (Free)', provider: 'openrouter', description: 'Qwen latest for agents and RAG', specs: { contextWindow: '262K', trainingData: '2025', maxOutput: '8K', modality: 'Text' } },
  { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder (Free)', provider: 'openrouter', description: 'Qwen 480B coding model', specs: { contextWindow: '262K', trainingData: '2025', maxOutput: '8K', modality: 'Text' } },
  { id: 'minimax/minimax-m2.5:free', name: 'MiniMax M2.5 (Free)', provider: 'openrouter', description: 'Strong coding and reasoning', specs: { contextWindow: '205K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },
  { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B (Free)', provider: 'openrouter', description: "OpenAI's first open-weight model", specs: { contextWindow: '131K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },
  { id: 'openai/gpt-oss-20b:free', name: 'GPT-OSS 20B (Free)', provider: 'openrouter', description: "OpenAI's compact open model", specs: { contextWindow: '131K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },
  { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air (Free)', provider: 'openrouter', description: "Zhipu's efficient model", specs: { contextWindow: '131K', trainingData: '2025', maxOutput: '8K', modality: 'Text' } },
  { id: 'baidu/cobuddy:free', name: 'CoBuddy (Free)', provider: 'openrouter', description: "Baidu's multilingual model", specs: { contextWindow: '131K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },
  { id: 'arcee-ai/trinity-large-thinking:free', name: 'Trinity Large Thinking (Free)', provider: 'openrouter', description: 'Arcee AI reasoning model', specs: { contextWindow: '262K', trainingData: '2025', maxOutput: '32K', modality: 'Text' } },
  { id: 'poolside/laguna-m.1:free', name: 'Laguna M (Free)', provider: 'openrouter', description: 'Poolside latest model', specs: { contextWindow: '131K', trainingData: '2025', maxOutput: '8K', modality: 'Text' } },
  { id: 'poolside/laguna-xs.2:free', name: 'Laguna XS (Free)', provider: 'openrouter', description: 'Poolside efficient model', specs: { contextWindow: '131K', trainingData: '2025', maxOutput: '8K', modality: 'Text' } },
  { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 405B (Free)', provider: 'openrouter', description: 'Nous Research flagship', specs: { contextWindow: '131K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },
  { id: 'liquid/lfm-2.5-1.2b-thinking:free', name: 'LFM 2.5 1.2B Thinking (Free)', provider: 'openrouter', description: 'LiquidAI reasoning model', specs: { contextWindow: '33K', trainingData: '2024', maxOutput: '4K', modality: 'Text' } },
  { id: 'liquid/lfm-2.5-1.2b-instruct:free', name: 'LFM 2.5 1.2B (Free)', provider: 'openrouter', description: 'LiquidAI efficient model', specs: { contextWindow: '33K', trainingData: '2024', maxOutput: '4K', modality: 'Text' } },
  { id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free', name: 'Dolphin Mistral 24B (Free)', provider: 'openrouter', description: 'Venice optimized Mistral', specs: { contextWindow: '32K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },

  // ═══════════════════════════════════════════════════════════════════════════════
  // OPENROUTER - PAID MODELS
  // ═══════════════════════════════════════════════════════════════════════════════
  { id: 'openrouter/auto', name: 'OpenRouter Auto', provider: 'openrouter', description: 'Auto-routes to best performing model', specs: { contextWindow: 'Varies', trainingData: 'Dynamic', maxOutput: 'Varies', modality: 'Text' } },
  { id: 'google/gemma-3-27b-it', name: 'Gemma 3 27B', provider: 'openrouter', description: "Google's latest Gemma with reasoning", specs: { contextWindow: '128K', trainingData: '2025', maxOutput: '8K', modality: 'Text' } },
  { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B', provider: 'openrouter', description: "Google's efficient instruction-tuned", specs: { contextWindow: '8K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'openrouter', description: "Meta's flagship with excellent reasoning", specs: { contextWindow: '128K', trainingData: '2024', maxOutput: '32K', modality: 'Text' } },
  { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', provider: 'openrouter', description: "Meta's efficient 8B model", specs: { contextWindow: '128K', trainingData: 'July 2024', maxOutput: '4K', modality: 'Text' } },
  { id: 'mistralai/mistral-small-3.1-24b', name: 'Mistral Small 3.1', provider: 'openrouter', description: "Mistral's latest with great speed", specs: { contextWindow: '128K', trainingData: '2025', maxOutput: '32K', modality: 'Text' } },
  { id: 'mistralai/mistral-7b-instruct', name: 'Mistral 7B', provider: 'openrouter', description: 'High-performance dense model', specs: { contextWindow: '32K', trainingData: '2023', maxOutput: '8K', modality: 'Text' } },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', provider: 'openrouter', description: 'DeepSeek V3 with coding capabilities', specs: { contextWindow: '64K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', provider: 'openrouter', description: "Alibaba's powerful multilingual", specs: { contextWindow: '32K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },
  { id: 'microsoft/phi-4', name: 'Phi-4', provider: 'openrouter', description: "Microsoft's latest reasoning model", specs: { contextWindow: '16K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },
  { id: 'anthropic/claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'openrouter', description: "Anthropic's latest Sonnet model", specs: { contextWindow: '200K', trainingData: '2025', maxOutput: '32K', modality: 'Text' } },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'openrouter', description: "Anthropic's strong coding model", specs: { contextWindow: '200K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },

  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMINI DIRECT - Gemini 3.5 & 3.x Series (Latest)
  // ═══════════════════════════════════════════════════════════════════════════════
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', provider: 'gemini', description: "Cutting-edge high performance Flash model.", specs: { contextWindow: '1M', trainingData: '2026', maxOutput: '32K', modality: 'Multimodal' } },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash', provider: 'gemini', description: "Balanced speed and capability Flash model.", specs: { contextWindow: '1M', trainingData: '2025', maxOutput: '32K', modality: 'Multimodal' } },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Preview)', provider: 'gemini', description: "Cutting-edge Pro model for advanced reasoning and coding.", specs: { contextWindow: '2M', trainingData: '2026', maxOutput: '64K', modality: 'Multimodal' } },

  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMINI DIRECT - Gemini 2.5 Series
  // ═══════════════════════════════════════════════════════════════════════════════
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini', description: "Previous Generation (Highly Stable) Flash model.", specs: { contextWindow: '1M', trainingData: '2025', maxOutput: '32K', modality: 'Multimodal' } },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini', description: "Previous Generation (Highly Stable) Pro model.", specs: { contextWindow: '2M', trainingData: '2025', maxOutput: '64K', modality: 'Multimodal' } },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: 'gemini', description: "Previous Generation Flash-Lite, extremely fast and cost-effective.", specs: { contextWindow: '1M', trainingData: '2025', maxOutput: '16K', modality: 'Multimodal' } },


  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMINI DIRECT - Gemma 4 Series (Open Models)
  // ═══════════════════════════════════════════════════════════════════════════════
  { id: 'gemma-4-31b-it', name: 'Gemma 4 31B', provider: 'gemini', description: "Google's best open weights model - reasoning and math", specs: { contextWindow: '256K', trainingData: '2026', maxOutput: '8K', modality: 'Text' } },
  { id: 'google/gemma-4-27b-it', name: 'Gemma 4 27B', provider: 'openrouter', description: "Google's high-performance 27B open weights model for advanced reasoning.", specs: { contextWindow: '256K', trainingData: '2026', maxOutput: '8K', modality: 'Text' } },
  { id: 'gemma-4-26b-a4b-it', name: 'Gemma 4 26B MoE', provider: 'gemini', description: "Google's efficient MoE open weights model", specs: { contextWindow: '256K', trainingData: '2026', maxOutput: '8K', modality: 'Text' } },
  { id: 'gemma-4-e4b-it', name: 'Gemma 4 E4B (Edge)', provider: 'gemini', description: "Google's edge open weights model - 4.5B effective parameters", specs: { contextWindow: '128K', trainingData: '2026', maxOutput: '4K', modality: 'Text' } },
  { id: 'gemma-4-e2b-it', name: 'Gemma 4 E2B (Edge)', provider: 'gemini', description: "Google's smallest open weights model - 2.3B params", specs: { contextWindow: '128K', trainingData: '2026', maxOutput: '4K', modality: 'Text' } },

  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMMA (Google Open Models)
  // ═══════════════════════════════════════════════════════════════════════════════
  { id: 'google/gemma-4-31b-it', name: 'Gemma 4 31B', provider: 'openrouter', description: "Google's best open model - #3 on Arena AI (1452 Elo)", specs: { contextWindow: '256K', trainingData: '2026', maxOutput: '8K', modality: 'Text' } },
  { id: 'google/gemma-4-26b-a4b-it', name: 'Gemma 4 26B MoE', provider: 'openrouter', description: "Google's efficient MoE model - #6 on Arena AI (1441 Elo)", specs: { contextWindow: '256K', trainingData: '2026', maxOutput: '8K', modality: 'Text' } },
  { id: 'google/gemma-4-e4b-it', name: 'Gemma 4 E4B (Edge)', provider: 'openrouter', description: "Google's edge model - 4.5B effective params, multimodal", specs: { contextWindow: '128K', trainingData: '2026', maxOutput: '4K', modality: 'Text' } },
  { id: 'google/gemma-4-e2b-it', name: 'Gemma 4 E2B (Edge)', provider: 'openrouter', description: "Google's smallest model - 2.3B params for mobile/edge", specs: { contextWindow: '128K', trainingData: '2026', maxOutput: '4K', modality: 'Text' } },
  { id: 'google/gemma-3-27b-it', name: 'Gemma 3 27B', provider: 'openrouter', description: "Google's previous flagship open model", specs: { contextWindow: '128K', trainingData: '2025', maxOutput: '8K', modality: 'Text' } },
  { id: 'google/gemma-3-12b-it', name: 'Gemma 3 12B', provider: 'openrouter', description: "Google's mid-size open model", specs: { contextWindow: '128K', trainingData: '2025', maxOutput: '8K', modality: 'Text' } },
  { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B', provider: 'openrouter', description: "Google's efficient open model", specs: { contextWindow: '8K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },


  // ═══════════════════════════════════════════════════════════════════════════════
  // NVIDIA NIM - FREE MODELS (No API Key Required)
  // ═══════════════════════════════════════════════════════════════════════════════
  { id: 'nvidia/llama-3.3-70b-instruct', name: 'Llama 3.3 70B (NIM)', provider: 'nvidia', description: 'Meta 70B via NVIDIA NIM - Free', specs: { contextWindow: '128K', trainingData: '2025', maxOutput: '8K', modality: 'Text' } },
  { id: 'nvidia/deepseek-r1', name: 'DeepSeek R1 (NIM)', provider: 'nvidia', description: 'DeepSeek R1 reasoning via NVIDIA NIM - Free', specs: { contextWindow: '128K', trainingData: '2025', maxOutput: '16K', modality: 'Text' } },
  { id: 'nvidia/deepseek-v3', name: 'DeepSeek V3 (NIM)', provider: 'nvidia', description: 'DeepSeek V3 chat via NVIDIA NIM - Free', specs: { contextWindow: '64K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Llama 3.1 Nemotron 70B (NIM)', provider: 'nvidia', description: 'NVIDIA optimized Llama 3.1 - Free', specs: { contextWindow: '128K', trainingData: '2025', maxOutput: '32K', modality: 'Text' } },
  { id: 'nvidia/nemotron-4-340b-instruct', name: 'Nemotron-4 340B (NIM)', provider: 'nvidia', description: "NVIDIA's massive synthetic data generator", specs: { contextWindow: '4K', trainingData: '2024', maxOutput: '4K', modality: 'Text' } },
  { id: 'nvidia/gemma-3-27b-it', name: 'Gemma 3 27B (NIM)', provider: 'nvidia', description: "Google via NVIDIA NIM - Free", specs: { contextWindow: '128K', trainingData: '2025', maxOutput: '8K', modality: 'Text' } },
  { id: 'nvidia/gemma-2-9b-it', name: 'Gemma 2 9B (NIM)', provider: 'nvidia', description: "Google via NVIDIA NIM - Free", specs: { contextWindow: '128K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },
  { id: 'nvidia/phi-4', name: 'Phi-4 (NIM)', provider: 'nvidia', description: "Microsoft via NVIDIA NIM - Free", specs: { contextWindow: '16K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },
  { id: 'nvidia/ministral-8b', name: 'Mistral 8B (NIM)', provider: 'nvidia', description: 'Mistral via NVIDIA NIM - Free', specs: { contextWindow: '128K', trainingData: '2024', maxOutput: '8K', modality: 'Text' } },

  // ═══════════════════════════════════════════════════════════════════════════════
  // NYX NATIVE PRESETS
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'nyx-gemma-4-e2b-it',
    name: 'NYX Edge Agent (Gemma 4 E2B)',
    provider: 'nyx-native',
    description: 'The native NYX agent running locally on-device. Fully powered by Google\'s Gemma 4 E2B.',
    specs: { contextWindow: '128K', trainingData: '2026', maxOutput: '4K', modality: 'Text' }
  },
  {
    id: 'qwen-1.5b-local',
    name: 'Qwen 2.5 Coder 1.5B (Local Python)',
    provider: 'qwen-local',
    description: 'Ultra-fast local Qwen 1.5B model running on Python causal LM server.',
    specs: { contextWindow: '32K', trainingData: '2024', maxOutput: '8K', modality: 'Text' }
  },
  {
    id: 'qwen2.5-coder-1.5b-native',
    name: 'Qwen 2.5 Coder 1.5B (GGUF)',
    provider: 'nyx-native',
    description: 'Fast, lightweight Qwen model optimized specifically for coding tasks.',
    specs: { contextWindow: '4K', trainingData: '2024', maxOutput: '2K', modality: 'Text' }
  },
  {
    id: 'qwen2.5-coder-3b-native',
    name: 'Qwen 2.5 Coder 3B (GGUF)',
    provider: 'nyx-native',
    description: 'Perfect balance of high intelligence and execution speed for coding.',
    specs: { contextWindow: '4K', trainingData: '2024', maxOutput: '2K', modality: 'Text' }
  },
  {
    id: 'llama-3.2-3b-native',
    name: 'Llama 3.2 3B (GGUF)',
    provider: 'nyx-native',
    description: "Meta's highly capable general instruction model for general analysis.",
    specs: { contextWindow: '4K', trainingData: '2024', maxOutput: '2K', modality: 'Text' }
  }
];

// Deduplicate by ID to prevent duplicate entries in the model selector
const ALLOWED_PROVIDERS = ['gemini', 'openrouter', 'nvidia', 'opencode', 'pollinations', 'nyx-native', 'qwen-local'];
const _seen = new Set<string>();
export const AVAILABLE_MODELS: ModelOption[] = RAW_AVAILABLE_MODELS
  .filter(m => ALLOWED_PROVIDERS.includes(m.provider))
  .filter(m => {
    if (_seen.has(m.id)) return false;
    _seen.add(m.id);
    return true;
  });