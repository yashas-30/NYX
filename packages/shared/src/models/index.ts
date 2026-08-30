import { ModelOption } from '../types.js';
import { GEMINI_MODELS } from './gemini.js';
import { OPENROUTER_MODELS } from './openrouter.js';
import { NVIDIA_MODELS } from './nvidia.js';
import { GROQ_MODELS } from './groq.js';
import { MISTRAL_MODELS } from './mistral.js';
import { NATIVE_MODELS } from './native.js';

export { GEMINI_MODELS } from './gemini.js';
export { OPENROUTER_MODELS } from './openrouter.js';
export { NVIDIA_MODELS } from './nvidia.js';
export { GROQ_MODELS } from './groq.js';
export { MISTRAL_MODELS } from './mistral.js';
export { NATIVE_MODELS } from './native.js';

export const RAW_AVAILABLE_MODELS: ModelOption[] = [
  ...GEMINI_MODELS,
  ...OPENROUTER_MODELS,
  ...NVIDIA_MODELS,
  ...GROQ_MODELS,
  ...MISTRAL_MODELS,
  ...NATIVE_MODELS,
];

// Deduplicate by `${m.provider}:${m.id}` to guarantee models across providers stay segregated
const ALLOWED_PROVIDERS = new Set([
  'gemini',
  'openrouter',
  'nvidia-nim',
  'nvidia',
  'groq',
  'mistral',
  'nyx-native',
]);

export function deduplicateModels(models: ModelOption[]): ModelOption[] {
  const map = new Map<string, ModelOption>();
  for (const m of models) {
    if (ALLOWED_PROVIDERS.has(m.provider)) {
      const key = `${m.provider}:${m.id}`;
      if (!map.has(key)) {
        map.set(key, m);
      }
    }
  }
  return Array.from(map.values());
}

export const AVAILABLE_MODELS: ModelOption[] = deduplicateModels(RAW_AVAILABLE_MODELS);
