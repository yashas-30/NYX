import { ModelOption } from '@src/types';

const RAW_AVAILABLE_MODELS: ModelOption[] = [
  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMINI DIRECT - Gemini 3.5 & 3.x Series (Latest)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    provider: 'gemini',
    description: 'Cutting-edge high performance Flash model.',
    specs: { contextWindow: '1M', trainingData: '2026', maxOutput: '32K', modality: 'Multimodal' },
  },
  {
    id: 'gemini-3-flash',
    name: 'Gemini 3 Flash',
    provider: 'gemini',
    description: 'Balanced speed and capability Flash model.',
    specs: { contextWindow: '1M', trainingData: '2025', maxOutput: '32K', modality: 'Multimodal' },
  },
  {
    id: 'gemini-3.1-pro',
    name: 'Gemini 3.1 Pro',
    provider: 'gemini',
    description: 'Cutting-edge Pro model for advanced reasoning and coding.',
    specs: { contextWindow: '2M', trainingData: '2026', maxOutput: '64K', modality: 'Multimodal' },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMINI DIRECT - Gemini 2.5 Series
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'gemini',
    description: 'Highly Stable Flash model.',
    specs: { contextWindow: '1M', trainingData: '2025', maxOutput: '32K', modality: 'Multimodal' },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMINI DIRECT - Gemma 4 Series (Open Models)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gemma-4-31b-it',
    name: 'Gemma 4 31B',
    provider: 'gemini',
    description: "Google's best open weights model - reasoning and math",
    specs: { contextWindow: '256K', trainingData: '2026', maxOutput: '8K', modality: 'Text' },
  },
  {
    id: 'gemma-4-27b-it',
    name: 'Gemma 4 27B',
    provider: 'gemini',
    description: "Google's open weights model",
    specs: { contextWindow: '256K', trainingData: '2026', maxOutput: '8K', modality: 'Text' },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // NYX NATIVE PRESETS
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'nyx-gemma-4-e2b-it',
    name: 'NYX Edge Agent (Gemma 4 E2B)',
    provider: 'nyx-native',
    description:
      "The native NYX agent running locally on-device. Fully powered by Google's Gemma 4 E2B.",
    specs: { contextWindow: '128K', trainingData: '2026', maxOutput: '4K', modality: 'Text' },
  },

  {
    id: 'qwen2.5-coder-1.5b-native',
    name: 'Qwen 2.5 Coder 1.5B (GGUF)',
    provider: 'nyx-native',
    description: 'Fast, lightweight Qwen model optimized specifically for coding tasks.',
    specs: { contextWindow: '4K', trainingData: '2024', maxOutput: '2K', modality: 'Text' },
  },
  {
    id: 'qwen2.5-coder-3b-native',
    name: 'Qwen 2.5 Coder 3B (GGUF)',
    provider: 'nyx-native',
    description: 'Perfect balance of high intelligence and execution speed for coding.',
    specs: { contextWindow: '4K', trainingData: '2024', maxOutput: '2K', modality: 'Text' },
  },
  {
    id: 'llama-3.2-3b-native',
    name: 'Llama 3.2 3B (GGUF)',
    provider: 'nyx-native',
    description: "Meta's highly capable general instruction model for general analysis.",
    specs: { contextWindow: '4K', trainingData: '2024', maxOutput: '2K', modality: 'Text' },
  },
];

// Deduplicate by ID to prevent duplicate entries in the model selector
const ALLOWED_PROVIDERS = ['gemini', 'nyx-native', 'antigravity-sdk'];
const _seen = new Set<string>();
export const AVAILABLE_MODELS: ModelOption[] = RAW_AVAILABLE_MODELS.filter((m) =>
  ALLOWED_PROVIDERS.includes(m.provider)
).filter((m) => {
  if (_seen.has(m.id)) return false;
  _seen.add(m.id);
  return true;
});
