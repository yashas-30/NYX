/**
 * @file src/core/utils/provider.ts
 * @description Shared utilities for detecting AI providers and model capabilities.
 */

import { Provider, ModelDefinition } from '../types';
import { AVAILABLE_MODELS } from '@/src/config/models';

const NVIDIA_MODEL_IDS = new Set(AVAILABLE_MODELS.filter(m => m.provider === 'nvidia').map(m => m.id));

const OPENROUTER_PREFIXES = ['openai/', 'anthropic/', 'meta-llama/', 'google/', 'qwen/', 'mistralai/', 'deepseek/', 'microsoft/'];

const OPENAI_PREFIXES = ['gpt-', 'o1-', 'o3-', 'o4-', 'chatgpt-'];

const ANTHROPIC_PREFIXES = ['claude-'];

const DEEPSEEK_PREFIXES = ['deepseek-'];

const GROQ_PREFIXES = ['groq/'];

const MISTRAL_PREFIXES = ['mistralai/'];

const TOGETHER_PREFIXES = ['together/'];

const CLAUDE_PREFIXES = ['claude-'];

const PROVIDER_PRIORITY = [
  { check: (id: string) => NVIDIA_MODEL_IDS.has(id), provider: 'nvidia' as Provider },
  { check: (id: string) => id.includes('/') && OPENROUTER_PREFIXES.some(p => id.startsWith(p)), provider: 'openrouter' as Provider },
  { check: (id: string) => OPENAI_PREFIXES.some(p => id.startsWith(p)), provider: 'openai' as Provider },
  { check: (id: string) => ANTHROPIC_PREFIXES.some(p => id.startsWith(p)), provider: 'anthropic' as Provider },
  { check: (id: string) => DEEPSEEK_PREFIXES.some(p => id.startsWith(p)), provider: 'deepseek' as Provider },
  { check: (id: string) => GROQ_PREFIXES.some(p => id.startsWith(p)), provider: 'groq' as Provider },
  { check: (id: string) => MISTRAL_PREFIXES.some(p => id.startsWith(p)), provider: 'mistral' as Provider },
  { check: (id: string) => TOGETHER_PREFIXES.some(p => id.startsWith(p)), provider: 'together' as Provider },
  { check: (id: string) => id.includes('/') && CLAUDE_PREFIXES.some(p => id.startsWith(p)), provider: 'claude' as Provider },
  { check: (id: string) => id.startsWith('opencode/') || id.startsWith('opencode-'), provider: 'opencode' as Provider },
  { check: (id: string) => id.includes('/') && !NVIDIA_MODEL_IDS.has(id), provider: 'openrouter' as Provider },
];

export const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: 'Gemini',
  nvidia: 'NVIDIA NIM',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  groq: 'Groq',
  mistral: 'Mistral',
  together: 'Together AI',
  claude: 'Claude',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  terminal: 'Terminal',
  opencode: 'Open Code',
};

export const CLOUD_PROVIDERS: Provider[] = ['gemini', 'nvidia', 'openrouter', 'openai', 'anthropic', 'deepseek', 'groq', 'mistral', 'together', 'claude'];

export const LOCAL_PROVIDERS: Provider[] = ['ollama', 'lmstudio'];

/**
 * Structured provider detection that checks in priority order.
 */
export const detectProvider = (
  modelId: string,
  ollamaModels: ModelDefinition[] = [],
  lmStudioModels: ModelDefinition[] = []
): Provider => {
  if (ollamaModels.some(m => m.id === modelId || m.name === modelId)) return 'ollama';
  if (lmStudioModels.some(m => m.id === modelId)) return 'lmstudio';

  for (const { check, provider } of PROVIDER_PRIORITY) {
    if (check(modelId)) return provider;
  }

  return 'gemini';
};

/**
 * Gets provider from model ID with proper fallback to AVAILABLE_MODELS.
 */
export const getProviderForModel = (modelId: string): Provider => {
  if (NVIDIA_MODEL_IDS.has(modelId)) return 'nvidia';

  const availableModel = AVAILABLE_MODELS.find(m => m.id === modelId);
  if (availableModel) return availableModel.provider;

  for (const { check, provider } of PROVIDER_PRIORITY) {
    if (check(modelId)) return provider;
  }

  return 'gemini';
};

/**
 * Checks if a model ID refers to a local instance.
 */
export const isLocalModel = (modelId: string): boolean => {
  return modelId.includes(':') || modelId.startsWith('ollama') || modelId.startsWith('lmstudio');
};

/**
 * Checks if a provider requires an API key.
 */
export const requiresApiKey = (provider: Provider): boolean => {
  if (provider === 'opencode') return false;
  return CLOUD_PROVIDERS.includes(provider);
};

/**
 * Gets the API key name for a provider (for settings display).
 */
export const getApiKeyName = (provider: Provider): string => {
  return provider.toUpperCase();
};
