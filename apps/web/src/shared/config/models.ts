import { ModelOption } from '@src/types';

const RAW_AVAILABLE_MODELS: ModelOption[] = [
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
    pros: ['Very fast generation speeds due to MoE', 'Extremely efficient active parameter count', 'Excellent for general logic and chat'],
    cons: ['Slightly lower reasoning depth than dense 31B', 'Requires MoE compatible engines for deployment'],
    limits: { rpm: 15, tpm: null, rpd: 1500 },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // LOCAL PROVIDERS (OLLAMA & LM STUDIO)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'qwen2.5-coder-7b-ollama',
    name: 'Qwen 2.5 Coder 7B (Ollama)',
    provider: 'ollama',
    description: 'Fast, lightweight Qwen model optimized specifically for coding tasks.',
    status: 'ga',
    specs: { contextWindow: '8K', trainingData: '2024', maxOutput: '4K', modality: 'Text' },
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
const ALLOWED_PROVIDERS = ['gemini', 'ollama', 'lmstudio', 'antigravity-sdk'];
const _seen = new Set<string>();
export const AVAILABLE_MODELS: ModelOption[] = RAW_AVAILABLE_MODELS.filter((m) =>
  ALLOWED_PROVIDERS.includes(m.provider)
).filter((m) => {
  if (_seen.has(m.id)) return false;
  _seen.add(m.id);
  return true;
});
