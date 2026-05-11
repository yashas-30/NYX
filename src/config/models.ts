import { ModelOption } from '../types';

export const AVAILABLE_MODELS: ModelOption[] = [
  // ── Gemini 3.x Series (Preview) ────────────────────────────
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    provider: 'gemini',
    description: 'Elite 2026 flagship for complex coding, architectural logic, and multimodal reasoning.',
    specs: { contextWindow: '5M Tokens', trainingData: 'Dec 2025', maxOutput: '16,384', modality: 'Native Omni' }
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: 'gemini',
    description: 'State-of-the-art speedster for real-time everyday tasks, rapid prototyping, and snappiness.',
    specs: { contextWindow: '1M Tokens', trainingData: 'Dec 2025', maxOutput: '8,192', modality: 'Native Omni' }
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    provider: 'gemini',
    description: 'Ultra-low latency lightweight model for high-frequency tasks.',
    specs: { contextWindow: '512K Tokens', trainingData: 'Dec 2025', maxOutput: '4,096', modality: 'Text/Vision' }
  },
  // ── Gemini 2.5 Series (Stable) ──────────────────────────────
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'gemini',
    description: 'Production-stable high-intelligence model with exceptional reasoning.',
    specs: { contextWindow: '2M Tokens', trainingData: 'Aug 2025', maxOutput: '8,192', modality: 'Multimodal' }
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'gemini',
    description: 'High-throughput balanced model for efficient large-scale processing.',
    specs: { contextWindow: '1M Tokens', trainingData: 'Aug 2025', maxOutput: '8,192', modality: 'Multimodal' }
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    provider: 'gemini',
    description: 'Lightest and fastest 2.5-series model, optimized for cost-efficient tasks.',
    specs: { contextWindow: '512K Tokens', trainingData: 'Aug 2025', maxOutput: '4,096', modality: 'Text/Vision' }
  },

  { 
    id: 'openai/gpt-4o', 
    name: 'GPT-4o', 
    provider: 'openrouter', 
    description: 'OpenAI flagship multimodal model with human-level logic.',
    specs: { contextWindow: '128K Tokens', trainingData: 'Oct 2023', maxOutput: '4,096', modality: 'Omni-Multimodal' }
  },
  { 
    id: 'anthropic/claude-3.5-sonnet', 
    name: 'Claude 3.5 Sonnet', 
    provider: 'openrouter', 
    description: 'Anthropic next-gen reasoning with unparalleled coding skill.',
    specs: { contextWindow: '200K Tokens', trainingData: 'Apr 2024', maxOutput: '8,192', modality: 'Multimodal' }
  },
  { 
    id: 'meta-llama/llama-3.1-405b-instruct', 
    name: 'Llama 3.1 405B', 
    provider: 'openrouter', 
    description: 'The world\'s most powerful open-source foundation model.',
    specs: { contextWindow: '128K Tokens', trainingData: 'July 2024', maxOutput: '4,096', modality: 'Text' }
  },
  { 
    id: 'google/gemini-pro-1.5', 
    name: 'Gemini 1.5 Pro (OR)', 
    provider: 'openrouter', 
    description: 'Google flagship reasoning engine via OpenRouter.',
    specs: { contextWindow: '2M Tokens', trainingData: 'Apr 2024', maxOutput: '8,192', modality: 'Multimodal' }
  },
  { 
    id: 'qwen/qwen-2.5-72b-instruct', 
    name: 'Qwen 2.5 72B', 
    provider: 'openrouter', 
    description: 'Alibaba flagship with incredible math and code capabilities.',
    specs: { contextWindow: '128K Tokens', trainingData: 'Sept 2024', maxOutput: '8,192', modality: 'Text/Code' }
  },
  { 
    id: 'mistralai/mistral-large-2407', 
    name: 'Mistral Large 2', 
    provider: 'openrouter', 
    description: 'Mistral flagship for complex multilingual logic.',
    specs: { contextWindow: '128K Tokens', trainingData: 'July 2024', maxOutput: '8,192', modality: 'Text' }
  },
  { 
    id: 'deepseek/deepseek-coder', 
    name: 'DeepSeek Coder V2', 
    provider: 'openrouter', 
    description: 'State-of-the-art open-source coding specialist.',
    specs: { contextWindow: '128K Tokens', trainingData: 'June 2024', maxOutput: '8,192', modality: 'Text/Code' }
  },
  { 
    id: 'qwen/qwen-2.5-coder-32b-instruct', 
    name: 'Qwen 2.5 Coder 32B', 
    provider: 'openrouter', 
    description: 'Alibaba Specialized coding engine with superior reasoning and debugging.',
    specs: { contextWindow: '128K Tokens', trainingData: 'Sept 2024', maxOutput: '8,192', modality: 'Text/Code' }
  },
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash (Free)',
    provider: 'openrouter',
    description: 'Next-gen experimental flash model from Google (via OpenRouter Free).',
    specs: { contextWindow: '1M Tokens', trainingData: 'Dec 2024', maxOutput: '8,192', modality: 'Omni' }
  },

  // ── OpenRouter: High-Performance (Mid-Tier) ──────────────────
  { 
    id: 'anthropic/claude-3-haiku', 
    name: 'Claude 3 Haiku', 
    provider: 'openrouter', 
    description: 'Ultra-fast intelligence for rapid interactions.',
    specs: { contextWindow: '200K Tokens', trainingData: 'Mar 2024', maxOutput: '4,096', modality: 'Text/Vision' }
  },
  { 
    id: 'meta-llama/llama-3.1-70b-instruct', 
    name: 'Llama 3.1 70B', 
    provider: 'openrouter', 
    description: 'High-intelligence Meta model with deep reasoning.',
    specs: { contextWindow: '128K Tokens', trainingData: 'July 2024', maxOutput: '4,096', modality: 'Text' }
  },

  // ── OpenRouter: Zero-Cost / Free Tier ───────────────────────
  { 
    id: 'openrouter/auto', 
    name: 'OpenRouter Auto', 
    provider: 'openrouter', 
    description: 'Auto-routes to the best performing free model available.',
    specs: { contextWindow: 'Varies', trainingData: 'Dynamic', maxOutput: 'Varies', modality: 'Text/Vision' } 
  },
  { 
    id: 'google/gemma-2-9b-it:free', 
    name: 'Gemma 2 9B (Free)', 
    provider: 'openrouter', 
    description: 'Google DeepMind efficient instruction-tuned model.',
    specs: { contextWindow: '8,192', trainingData: 'Mar 2024', maxOutput: '8,192', modality: 'Text' } 
  },
  { 
    id: 'meta-llama/llama-3.1-8b-instruct:free', 
    name: 'Llama 3.1 8B (Free)', 
    provider: 'openrouter', 
    description: 'Meta efficient 8B model for edge applications.',
    specs: { contextWindow: '128K Tokens', trainingData: 'July 2024', maxOutput: '4,096', modality: 'Text' } 
  },
  { 
    id: 'mistralai/mistral-7b-instruct:free', 
    name: 'Mistral 7B (Free)', 
    provider: 'openrouter', 
    description: 'Mistral high-performance dense model.',
    specs: { contextWindow: '32K Tokens', trainingData: 'Sept 2023', maxOutput: '8,192', modality: 'Text' } 
  },
  { 
    id: 'microsoft/phi-3-mini-128k-instruct:free', 
    name: 'Phi-3 Mini (Free)', 
    provider: 'openrouter', 
    description: 'Microsoft compact model with huge context window.',
    specs: { contextWindow: '128K Tokens', trainingData: 'Apr 2024', maxOutput: '4,096', modality: 'Text' } 
  },
  { 
    id: 'qwen/qwen-2-7b-instruct:free', 
    name: 'Qwen 2 7B (Free)', 
    provider: 'openrouter', 
    description: 'Alibaba high-efficiency language model.',
    specs: { contextWindow: '128K Tokens', trainingData: 'June 2024', maxOutput: '8,192', modality: 'Text' } 
  },

  // ── NVIDIA NIM: Thinking Models ──────────────────
  {
    id: 'moonshotai/kimi-k2-thinking',
    name: 'Kimi K2 (Thinking)',
    provider: 'nvidia',
    description: 'Nvidia NIM hosted Moonshot Kimi K2 with thinking capabilities.',
    specs: { contextWindow: '128k', trainingData: '2024', maxOutput: '8k', modality: 'Text/Thinking' }
  },
  // ── NVIDIA NIM: Fast Models ──────────────────
  {
    id: 'moonshotai/kimi-k2.6',
    name: 'Kimi K2.6 (Fast)',
    provider: 'nvidia',
    description: 'Fast response mode without internal thinking. Quick answers for simple tasks.',
    specs: { contextWindow: '128K Tokens', trainingData: '2025', maxOutput: '16,384', modality: 'Text' }
  },
];

export const FREE_OPENCODE_MODELS: ModelOption[] = [
  { id: 'opencode/elephant-free', name: 'Elephant (free)', provider: 'opencode', description: 'Powerful free reasoning model.' },
  { id: 'opencode/ring-2.6-1t-free', name: 'Ring 2.6 1T Free', provider: 'opencode', description: 'High-capacity free model.' },
  { id: 'opencode/gemma-3-4b-free', name: 'Gemma 3 4B (free)', provider: 'opencode', description: 'Fast and efficient free model.' },
  { id: 'opencode/uncensored-free', name: 'Uncensored (free)', provider: 'opencode', description: 'Unfiltered free intelligence.' },
  { id: 'opencode/minimax-m2.5-free', name: 'MiniMax M2.5 Free', provider: 'opencode', description: 'Balanced performance free model.' },
  { id: 'opencode/free-models-router', name: 'Free Models Router', provider: 'opencode', description: 'Intelligent routing between free models.' },
  { id: 'opencode/gemma-3n-2b-free', name: 'Gemma 3n 2B (free)', provider: 'opencode', description: 'Fast free model.' },
  { id: 'opencode/gemma-3-12b-free', name: 'Gemma 3 12B (free)', provider: 'opencode', description: 'Medium-weight powerful free model.' },
  { id: 'opencode/gemma-3n-4b-free', name: 'Gemma 3n 4B (free)', provider: 'opencode', description: 'Efficient free model.' },
  { id: 'opencode/gemma-3-27b-free', name: 'Gemma 3 27B (free)', provider: 'opencode', description: 'Strong free model.' },
  { id: 'opencode/gemma-4-31b-free', name: 'Gemma 4 31B (free)', provider: 'opencode', description: 'Next-gen free model.' },
  { id: 'opencode/glm-4.5-air-free', name: 'GLM 4.5 Air (free)', provider: 'opencode', description: 'Lightweight and agile free model.' },
  { id: 'opencode/gpt-oss-20b-free', name: 'gpt-oss-20b (free)', provider: 'opencode', description: 'Open source free model.' },
  { id: 'opencode/minimax-m2.5-free-or', name: 'MiniMax M2.5 (free)', provider: 'opencode', description: 'MiniMax free model.' },
  { id: 'opencode/gpt-oss-120b-free', name: 'gpt-oss-120b (free)', provider: 'opencode', description: 'Large-scale open source free model.' },
  { id: 'opencode/nemotron-3-super-free', name: 'Nemotron 3 Super Free', provider: 'opencode', description: 'High-performance free vision/text model.' },
  { id: 'opencode/gemma-4-26b-a4b-free', name: 'Gemma 4 26B A4B (free)', provider: 'opencode', description: 'Gemma 4 free model.' },
  { id: 'opencode/nemotron-3-nano-omni-free', name: 'Nemotron 3 Nano Omni (free)', provider: 'opencode', description: 'Nano omni free model.' },
  { id: 'opencode/lfm-2.5-1.2b-thinking-free', name: 'LFM 2.5-1.2B-Thinking (free)', provider: 'opencode', description: 'Thinking free model.' },
  { id: 'opencode/llama-3.2-3b-instruct-free', name: 'Llama 3.2 3B Instruct (free)', provider: 'opencode', description: 'Compact free instruction model.' },
  { id: 'opencode/llama-3.3-70b-instruct-free', name: 'Llama 3.3 70B Instruct (free)', provider: 'opencode', description: 'Flagship-level free instruction model.' },
  { id: 'opencode/hermes-3-405b-instruct-free', name: 'Hermes 3 405B Instruct (free)', provider: 'opencode', description: 'Elite reasoning free model.' },
  { id: 'opencode/gemini-3-flash-preview-free', name: 'Gemini 3 Flash Preview (free)', provider: 'opencode', description: 'Next-gen speed and intelligence (Free).' },
];
