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
    specs: { contextWindow: '1M', maxOutput: '32K', modality: 'Multimodal' },
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
    specs: { contextWindow: '1M', maxOutput: '32K', modality: 'Multimodal' },
    features: ['Optimized for maximum cost efficiency and lowest latency', 'Multimodal support'],
    pros: ['Incredibly fast inference times', 'Extremely cheap for high-frequency workflows'],
    cons: ['Limited capability on deep reasoning', 'Can over-generalize or over-simplify complex requests'],
    limits: { rpm: 15, tpm: 250000, rpd: 500 },
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    provider: 'gemini',
    description: 'Next-generation Gemini 3.6 Flash model with ultra-fast inference and advanced reasoning.',
    status: 'ga',
    specs: { contextWindow: '1M', maxOutput: '32K', modality: 'Multimodal' },
    features: ['Ultra-high speed generation balancing deep reasoning and low-latency', 'Native handling of text, image, audio, and video inputs'],
    pros: ['Next-gen speed & intelligence', 'Unmatched cost-efficiency for real-time applications', '1M Token Context Window'],
    cons: ['Slightly lower reasoning depth than Pro tier'],
    limits: { rpm: 15, tpm: 1000000, rpd: 1500 },
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    provider: 'gemini',
    description: 'Extremely fast, lightweight Gemini 3.5 Flash Lite model for ultra-low latency workflows.',
    status: 'ga',
    specs: { contextWindow: '1M', maxOutput: '32K', modality: 'Multimodal' },
    features: ['Engineered for maximum cost-efficiency and instant response times', 'Full multimodal input support'],
    pros: ['Ultra-fast inference latency', 'High throughput for search, research, and agent loops'],
    cons: ['Tailored for speed over ultra-complex math or deep code generation'],
    limits: { rpm: 30, tpm: 1000000, rpd: 2000 },
  },
  {
    id: 'openrouter/auto',
    name: 'Auto Router (OpenRouter)',
    provider: 'openrouter',
    description: 'OpenRouter dynamic model routing to best available provider.',
    status: 'ga',
    specs: { contextWindow: '128K', maxOutput: '8K', modality: 'Text' },
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3 (OpenRouter)',
    provider: 'openrouter',
    status: 'ga',
    description: 'DeepSeek\'s latest ultra-efficient and capable LLM.',
    specs: { contextWindow: '64K', maxOutput: '8K', modality: 'Text' },
  },
  {
    id: 'deepseek/deepseek-reasoner',
    name: 'DeepSeek R1 (OpenRouter)',
    provider: 'openrouter',
    status: 'ga',
    description: 'DeepSeek\'s reasoning-specialist model utilizing chain of thought.',
    specs: { contextWindow: '64K', maxOutput: '8K', modality: 'Text' },
  },

  {
    id: 'gemma-4-31b-it',
    name: 'Gemma 4 31B',
    provider: 'gemini',
    status: 'ga',
    description: "Google's best open weights model — reasoning and math. Limits: 15 RPM, unlimited TPM, 1500 RPD.",
    specs: { contextWindow: '256K', maxOutput: '8K', modality: 'Text' },
    features: ['Strong reasoning and math capabilities', 'Open weights architecture'],
    pros: ['Excellent reasoning for its size', 'High instruction-following capability'],
    cons: ['Text modality only'],
    limits: { rpm: 15, tpm: null, rpd: 1500 },
  },
  {
    id: 'gemma-4-26b-a4b-it',
    name: 'Gemma 4 26B MoE',
    provider: 'gemini',
    status: 'ga',
    description: "Gemma 4 Mixture-of-Experts model — high throughput with advanced reasoning.",
    specs: { contextWindow: '128K', maxOutput: '8K', modality: 'Text' },
    features: ['Mixture-of-Experts architecture for high throughput', 'Advanced reasoning capability'],
    pros: ['High throughput', 'Efficient for complex reasoning tasks'],
    cons: ['Text modality only'],
    limits: { rpm: 15, tpm: null, rpd: 1500 },
  },
  // LOCAL PROVIDERS (NYX-NATIVE)
  // ═══════════════════════════════════════════════════════════════════════════════
  // Local models will be dynamically populated from the Rust backend.
];

// Deduplicate by ID to prevent duplicate entries in the model selector
const ALLOWED_PROVIDERS = ['gemini', 'openrouter', 'nyx-native'];
const _seen = new Set<string>();
export const AVAILABLE_MODELS: ModelOption[] = RAW_AVAILABLE_MODELS.filter((m) =>
  ALLOWED_PROVIDERS.includes(m.provider)
).filter((m) => {
  if (_seen.has(m.id)) return false;
  _seen.add(m.id);
  return true;
});
