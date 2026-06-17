import { ModelOption } from '@src/types';

const RAW_AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'nyx-auto',
    name: 'Dynamic Auto-Router (NYX)',
    provider: 'gemini',
    description: 'Auto-selects the best model based on prompt complexity (e.g. Gemini 3.1 Flash Lite for fast chat, DeepSeek R1 for reasoning).',
    status: 'ga',
    specs: { contextWindow: '1M', trainingData: '2026', maxOutput: '32K', modality: 'Multimodal' },
    features: ['Dynamic request analysis & routing', 'Cost & performance optimization'],
    pros: ['Optimizes speed and cost automatically', 'Accesses reasoning model when needed'],
    cons: ['Slight overhead for classification', 'Requires active Gemini API key'],
  },
  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMINI DIRECT MODELS
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    provider: 'gemini',
    description: 'Latest high-performance Gemini 3.5 Flash model.',
    status: 'ga',
    specs: { contextWindow: '1M', trainingData: '2026', maxOutput: '32K', modality: 'Multimodal' },
    features: ['High-speed tier balancing reasoning and low-latency', 'Native handling of text, image, audio, and video inputs'],
    pros: ['High Speed & Low Latency', 'Cost-Efficiency for high-volume tasks', 'Large 1M Context Window'],
    cons: ['Risk of Hallucinations compared to Pro tier', 'Inconsistency in highly complex logic tasks'],
    limits: { rpm: 5, tpm: 250000, rpd: 20 },
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    provider: 'gemini',
    description: 'Lightweight and fast Gemini 3.1 Flash Lite model.',
    status: 'ga',
    specs: { contextWindow: '1M', trainingData: '2026', maxOutput: '32K', modality: 'Multimodal' },
    features: ['Optimized for maximum cost efficiency and lowest latency', 'Multimodal support'],
    pros: ['Incredibly fast inference times', 'Extremely cheap for high-frequency workflows'],
    cons: ['Limited capability on deep reasoning', 'Can over-generalize or over-simplify complex requests'],
    limits: { rpm: 15, tpm: 250000, rpd: 500 },
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'gemini',
    description: 'Highly Stable Gemini 2.5 Flash model.',
    status: 'ga',
    specs: { contextWindow: '1M', trainingData: '2025', maxOutput: '32K', modality: 'Multimodal' },
    features: ['Workhorse model balancing speed and capable performance', 'Supports "thinking" capabilities and Google Search grounding'],
    pros: ['Highly reliable and scalable for production', 'Excellent cost-effectiveness'],
    cons: ['Outpaced by Gemini 3 series for frontier intelligence', 'May struggle with multi-step edge cases compared to newer models'],
    limits: { rpm: 5, tpm: 250000, rpd: 20 },
  },
  {
    id: 'gemma-4-31b-it',
    name: 'Gemma 4 31B',
    provider: 'gemini',
    description: "Google's open weights model for reasoning and math",
    status: 'ga',
    specs: { contextWindow: '256K', trainingData: '2026', maxOutput: '8K', modality: 'Text' },
    features: ['Dense flagship model for workstations', 'Configurable thinking modes for logic', 'High intelligence-per-parameter'],
    pros: ['Frontier-level reasoning in its size class', 'Highly capable in agentic workflows', 'Apache 2.0 commercial license'],
    cons: ['Resource Intensive (requires ~19GB+ VRAM)', 'Complex ecosystem setup compared to managed APIs'],
    limits: { rpm: 15, tpm: null, rpd: 1500 },
  },
  {
    id: 'gemma-4-26b-it',
    name: 'Gemma 4 26B',
    provider: 'gemini',
    description: "Google's open weights model with MoE architecture",
    status: 'ga',
    specs: { contextWindow: '256K', trainingData: '2026', maxOutput: '8K', modality: 'Text' },
    features: ['Mixture of Experts (MoE) architecture', 'Optimized for fast consumer GPU performance', 'Configurable thinking modes'],
    cons: ['Slightly lower reasoning depth than dense 31B', 'Requires MoE compatible engines for deployment'],
    limits: { rpm: 15, tpm: null, rpd: 1500 },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // ANTHROPIC CLAUDE MODELS
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'claude-3-7-sonnet-20250219',
    name: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
    description: "Anthropic's latest state-of-the-art Claude 3.7 Sonnet model with hybrid thinking capability.",
    status: 'ga',
    supportsThinking: true,
    specs: { contextWindow: '200K', trainingData: '2025', maxOutput: '8K', modality: 'Multimodal' },
    features: ['High-quality reasoning & coding', 'Hybrid thinking mode support', 'Prompt caching enabled'],
    pros: ['Top-tier coding abilities', 'Interleaved thinking', 'Low latency with prompt caching'],
    cons: ['More expensive than Flash models'],
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    description: 'Highly capable Claude 3.5 Sonnet model.',
    status: 'ga',
    specs: { contextWindow: '200K', trainingData: '2024', maxOutput: '8K', modality: 'Multimodal' },
    features: ['Industry standard coding capabilities', 'Excellent natural language processing'],
    pros: ['Extremely intelligent', 'Stable API output'],
    cons: ['Superseded by Claude 3.7 Sonnet'],
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    description: 'Fast and cheap Claude 3.5 Haiku model.',
    status: 'ga',
    specs: { contextWindow: '200K', trainingData: '2024', maxOutput: '8K', modality: 'Text' },
    features: ['Low latency, cheap cost', 'High speed reasoning'],
    pros: ['Very fast', 'Cost-effective for agent loops'],
    cons: ['Less intelligent than Sonnet'],
  },
  // ═══════════════════════════════════════════════════════════════════════════════
  // OPENAI CHATGPT MODELS
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: "OpenAI's flagship multimodal intelligence model.",
    status: 'ga',
    specs: { contextWindow: '128K', trainingData: '2024', maxOutput: '4K', modality: 'Multimodal' },
    features: ['High-speed vision and text capabilities', 'Structured JSON mode'],
    pros: ['Fast response time', 'Excellent tool usage and function calling'],
    cons: ['Struggles on extremely deep reasoning compared to o1/o3'],
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    description: "OpenAI's lightweight and cheap multimodal model.",
    status: 'ga',
    specs: { contextWindow: '128K', trainingData: '2024', maxOutput: '16K', modality: 'Multimodal' },
    features: ['High speed, low cost', 'Multimodal inputs support'],
    pros: ['Extremely cost-efficient', 'High throughput'],
    cons: ['Limited coding depth'],
  },
  {
    id: 'o1-mini',
    name: 'OpenAI o1 Mini',
    provider: 'openai',
    description: "OpenAI's reasoning model optimized for coding and STEM.",
    status: 'ga',
    supportsThinking: true,
    specs: { contextWindow: '128K', trainingData: '2024', maxOutput: '65K', modality: 'Text' },
    features: ['Specialized code generation reasoning', 'Chain of thought execution'],
    pros: ['High coding accuracy', 'Very strong math reasoning'],
    cons: ['Higher latency due to thinking turns', 'No vision support'],
  },
  {
    id: 'o3-mini',
    name: 'OpenAI o3 Mini',
    provider: 'openai',
    description: "OpenAI's latest reasoning model with configurable reasoning effort.",
    status: 'ga',
    supportsThinking: true,
    specs: { contextWindow: '200K', trainingData: '2024', maxOutput: '100K', modality: 'Text' },
    features: ['Configurable reasoning effort', 'Tool call support during thinking'],
    pros: ['Top-tier coding logic', 'Low latency compared to o1'],
    cons: ['Text-only'],
  },
  // ═══════════════════════════════════════════════════════════════════════════════
  // DEEPSEEK MODELS
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'deepseek-chat',
    name: 'DeepSeek V3 (Cloud)',
    provider: 'deepseek',
    description: 'DeepSeek V3 dense/MoE mixture model via cloud API.',
    status: 'ga',
    specs: { contextWindow: '64K', trainingData: '2024', maxOutput: '8K', modality: 'Text' },
    features: ['Very cheap cost', 'Strong general logic and multi-language capability'],
    pros: ['Fraction of the cost of GPT-4o', 'Excellent response speeds'],
    cons: ['Context window smaller than Gemini/Claude'],
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek R1 (Cloud)',
    provider: 'deepseek',
    description: "DeepSeek's flagship R1 reasoning model with deep thinking.",
    status: 'ga',
    supportsThinking: true,
    specs: { contextWindow: '64K', trainingData: '2025', maxOutput: '8K', modality: 'Text' },
    features: ['Advanced logic reasoning', 'Outputs deep chain-of-thought traces'],
    pros: ['Unparalleled math and coding reasoning', 'Extremely affordable reasoning model'],
    cons: ['High latency during reasoning phase'],
  },
  // ═══════════════════════════════════════════════════════════════════════════════
  // OPENROUTER MODELS
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'openrouter/auto',
    name: 'Auto Router (OpenRouter)',
    provider: 'openrouter',
    description: 'OpenRouter dynamic model routing to best available provider.',
    status: 'ga',
    specs: { contextWindow: '128K', trainingData: '2025', maxOutput: '8K', modality: 'Text' },
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B (OpenRouter)',
    provider: 'openrouter',
    description: "Meta's latest high-capacity Llama 3.3 model hosted via OpenRouter.",
    status: 'ga',
    specs: { contextWindow: '128K', trainingData: '2024', maxOutput: '8K', modality: 'Text' },
  },
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1 (OpenRouter)',
    provider: 'openrouter',
    description: 'DeepSeek R1 full reasoning model via OpenRouter.',
    status: 'ga',
    supportsThinking: true,
    specs: { contextWindow: '160K', trainingData: '2025', maxOutput: '8K', modality: 'Text' },
  },


  // ═══════════════════════════════════════════════════════════════════════════════
  // LOCAL PROVIDERS (OLLAMA & LM STUDIO)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'llama3.1:8b',
    name: 'Llama 3.1 8B (Ollama)',
    provider: 'ollama',
    description: 'Meta Llama 3.1 8B via Ollama - general purpose.',
    status: 'ga',
    specs: { contextWindow: '128K', trainingData: '2024', maxOutput: '8K', modality: 'Text' },
  },
  {
    id: 'llama3.1:70b',
    name: 'Llama 3.1 70B (Ollama)',
    provider: 'ollama',
    description: 'Meta Llama 3.1 70B via Ollama - high capability.',
    status: 'ga',
    specs: { contextWindow: '128K', trainingData: '2024', maxOutput: '8K', modality: 'Text' },
  },
  {
    id: 'mistral:7b',
    name: 'Mistral 7B (Ollama)',
    provider: 'ollama',
    description: 'Mistral 7B Instruct via Ollama.',
    status: 'ga',
    specs: { contextWindow: '32K', trainingData: '2024', maxOutput: '4K', modality: 'Text' },
  },
  {
    id: 'deepseek-r1:7b',
    name: 'DeepSeek R1 7B (Ollama)',
    provider: 'ollama',
    description: 'DeepSeek R1 reasoning model via Ollama.',
    status: 'ga',
    supportsThinking: true,
    specs: { contextWindow: '32K', trainingData: '2025', maxOutput: '8K', modality: 'Text' },
  },
  {
    id: 'qwen2.5-coder:7b',
    name: 'Qwen 2.5 Coder 7B (Ollama)',
    provider: 'ollama',
    description: 'Qwen Coder via Ollama - code-optimized.',
    status: 'ga',
    specs: { contextWindow: '32K', trainingData: '2024', maxOutput: '8K', modality: 'Text' },
  },
  {
    id: 'qwen2.5-coder-7b-lmstudio',
    name: 'Qwen 2.5 Coder 7B (LM Studio)',
    provider: 'lmstudio',
    description: 'Fast, lightweight Qwen model optimized specifically for coding tasks.',
    status: 'ga',
    specs: { contextWindow: '8K', trainingData: '2024', maxOutput: '4K', modality: 'Text' },
  },
];

// Deduplicate by ID to prevent duplicate entries in the model selector
const ALLOWED_PROVIDERS = ['gemini', 'ollama', 'lmstudio', 'anthropic', 'openai', 'deepseek', 'openrouter'];
const _seen = new Set<string>();
export const AVAILABLE_MODELS: ModelOption[] = RAW_AVAILABLE_MODELS.filter((m) =>
  ALLOWED_PROVIDERS.includes(m.provider)
).filter((m) => {
  if (_seen.has(m.id)) return false;
  _seen.add(m.id);
  return true;
});
