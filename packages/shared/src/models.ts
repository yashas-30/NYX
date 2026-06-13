import { ModelOption } from './types.js';

const RAW_AVAILABLE_MODELS: ModelOption[] = [
  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMINI DIRECT - Gemini 3.5 (GA)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    provider: 'gemini',
    status: 'ga',
    description: 'Cutting-edge high performance Flash model. Limits: 5 RPM, 250k TPM, 20 RPD.',
    specs: { contextWindow: '1M', trainingData: '2026', maxOutput: '32K', modality: 'Multimodal' },
    limits: { rpm: 5, tpm: 250000, rpd: 20 },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMINI DIRECT - Gemini 3.x Preview Series
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: 'gemini',
    status: 'preview',
    description: 'Balanced speed and capability Flash model (preview).',
    specs: { contextWindow: '1M', trainingData: '2025', maxOutput: '32K', modality: 'Multimodal' },
  },

  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    provider: 'gemini',
    status: 'preview',
    description: 'Lightweight, cost-efficient Flash model (preview). Limits: 15 RPM, 250k TPM, 500 RPD.',
    specs: { contextWindow: '1M', trainingData: '2026', maxOutput: '16K', modality: 'Multimodal' },
    limits: { rpm: 15, tpm: 250000, rpd: 500 },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMINI DIRECT - Gemini 2.5 Series (Deprecated — shutting down Oct 16, 2026)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'gemini',
    status: 'deprecated',
    shutdownDate: '2026-10-16',
    description: 'Stable Flash model. Deprecated — migrating to 3.x series. Limits: 5 RPM, 250k TPM, 20 RPD.',
    specs: { contextWindow: '1M', trainingData: '2025', maxOutput: '32K', modality: 'Multimodal' },
    limits: { rpm: 5, tpm: 250000, rpd: 20 },
  },

  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    provider: 'gemini',
    status: 'deprecated',
    shutdownDate: '2026-10-16',
    description: 'Lightweight Flash model. Deprecated — migrating to 3.x series.',
    specs: { contextWindow: '1M', trainingData: '2025', maxOutput: '8K', modality: 'Multimodal' },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMINI DIRECT - Gemma 4 Series (Open Models)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gemma-4-31b-it',
    name: 'Gemma 4 31B',
    provider: 'gemini',
    status: 'ga',
    description: "Google's best open weights model — reasoning and math. Limits: 15 RPM, unlimited TPM, 1500 RPD.",
    specs: { contextWindow: '256K', trainingData: '2026', maxOutput: '8K', modality: 'Text' },
    limits: { rpm: 15, tpm: null, rpd: 1500 },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // ALIASES (latest-pointer model IDs — always resolve to current best)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gemini-flash-latest',
    name: 'Gemini Flash (Latest)',
    provider: 'gemini',
    status: 'alias',
    description: 'Auto-resolves to the latest stable Flash model.',
    specs: { contextWindow: '1M', trainingData: '2026', maxOutput: '32K', modality: 'Multimodal' },
  },
  {
    id: 'gemini-pro-latest',
    name: 'Gemini Pro (Latest)',
    provider: 'gemini',
    status: 'alias',
    description: 'Auto-resolves to the latest stable Pro model.',
    specs: { contextWindow: '2M', trainingData: '2026', maxOutput: '64K', modality: 'Multimodal' },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // NYX NATIVE PRESETS (Local Ollama models)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'nyx-gemma-4-e2b-it',
    name: 'NYX Edge Agent (Gemma 4 E2B)',
    provider: 'ollama',
    status: 'ga',
    description:
      "The native NYX agent running locally on-device. Fully powered by Google's Gemma 4 E2B.",
    specs: { contextWindow: '128K', trainingData: '2026', maxOutput: '4K', modality: 'Text' },
  },
  {
    id: 'qwen2.5-coder-1.5b-native',
    name: 'Qwen 2.5 Coder 1.5B (GGUF)',
    provider: 'ollama',
    status: 'ga',
    description: 'Fast, lightweight Qwen model optimized specifically for coding tasks.',
    specs: { contextWindow: '4K', trainingData: '2024', maxOutput: '2K', modality: 'Text' },
  },
  {
    id: 'qwen2.5-coder-3b-native',
    name: 'Qwen 2.5 Coder 3B (GGUF)',
    provider: 'ollama',
    status: 'ga',
    description: 'Perfect balance of high intelligence and execution speed for coding.',
    specs: { contextWindow: '4K', trainingData: '2024', maxOutput: '2K', modality: 'Text' },
  },
  {
    id: 'llama-3.2-3b-native',
    name: 'Llama 3.2 3B (GGUF)',
    provider: 'ollama',
    status: 'ga',
    description: "Meta's highly capable general instruction model for general analysis.",
    specs: { contextWindow: '4K', trainingData: '2024', maxOutput: '2K', modality: 'Text' },
  },
];

// Deduplicate by ID to prevent duplicate entries in the model selector
const ALLOWED_PROVIDERS = ['gemini', 'ollama', 'lmstudio'];
const _seen = new Set<string>();
export const AVAILABLE_MODELS: ModelOption[] = RAW_AVAILABLE_MODELS.filter((m) =>
  ALLOWED_PROVIDERS.includes(m.provider)
).filter((m) => {
  if (_seen.has(m.id)) return false;
  _seen.add(m.id);
  return true;
});
