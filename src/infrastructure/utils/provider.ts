/**
 * @file src/core/utils/provider.ts
 * @description Shared utilities for detecting AI providers and model capabilities.
 */

import { Provider, ModelDefinition } from '../types';
import { AVAILABLE_MODELS } from '@shared/config/models';

export const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  terminal: 'Terminal',
  'nyx-native': 'NYX Native',
  'qwen-local': 'Qwen Local',
  'antigravity-sdk': 'Antigravity SDK',
};

export const CLOUD_PROVIDERS: string[] = ['gemini', 'antigravity-sdk'];

export const LOCAL_PROVIDERS: string[] = ['nyx-native', 'qwen-local'];

const LOCAL_MODEL_IDS = new Set([
  'nyx-gemma-4-e2b-it',
  'gemma-2-2b-it',
  'gemma-2-9b-it',
  'gemma-3-4b-it',
  'gemma-3-12b-it',
  'llama-3.2-1b-native',
  'llama-3.2-3b-native',
  'llama-3-8b-instruct',
  'llama-3.1-8b-native',
  'codellama-7b-instruct',
  'codellama-13b-instruct',
  'phi-3-mini-instruct',
  'phi-4-mini-instruct',
  'phi-4-instruct',
  'qwen2.5-1.5b-instruct',
  'qwen2.5-coder-1.5b-native',
  'qwen2.5-coder-3b-native',
  'qwen2.5-coder-7b-native',
  'qwen2.5-coder-14b-native',
  'qwen2.5-7b-native',
  'qwen3-8b-native',
  'deepseek-r1-distill-qwen-1.5b',
  'deepseek-r1-distill-qwen-7b',
  'deepseek-r1-distill-qwen-14b',
  'deepseek-r1-distill-llama-8b',
  'mistral-7b-v0.3',
  'openchat-3.5-7b',
]);

/**
 * Structured provider detection that checks in priority order.
 */
export const detectProvider = (modelId: string): Provider => {
  if (!modelId) return 'gemini';

  // 1. Check in local GGUF model presets first
  if (LOCAL_MODEL_IDS.has(modelId)) {
    return 'nyx-native';
  }

  // 2. Check in static AVAILABLE_MODELS presets
  const availableModel = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (availableModel) return availableModel.provider;

  // 3. Check GGUF and custom patterns for imported models
  const lowerId = modelId.toLowerCase();
  if (lowerId.endsWith('.gguf') || lowerId.includes('.gguf') || lowerId.startsWith('custom-')) {
    return 'nyx-native';
  }

  return 'gemini';
};

/**
 * Gets provider from model ID with proper fallback to AVAILABLE_MODELS.
 */
export const getProviderForModel = (modelId: string): Provider => {
  // 1. Check in local GGUF model presets first
  if (LOCAL_MODEL_IDS.has(modelId)) {
    return 'nyx-native';
  }

  // 2. Check in static AVAILABLE_MODELS presets
  const availableModel = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (availableModel) return availableModel.provider;

  // 3. Check GGUF and custom patterns for imported models
  const lowerId = modelId.toLowerCase();
  if (lowerId.endsWith('.gguf') || lowerId.includes('.gguf') || lowerId.startsWith('custom-')) {
    return 'nyx-native';
  }

  return 'gemini';
};

/**
 * Checks if a model ID refers to a local instance.
 */
export const isLocalModel = (modelId: string): boolean => {
  const provider = getProviderForModel(modelId);
  return LOCAL_PROVIDERS.includes(provider);
};

/**
 * Checks if a provider requires an API key.
 */
export const requiresApiKey = (provider: Provider): boolean => {
  return CLOUD_PROVIDERS.includes(provider);
};

/**
 * Resolves the effective API key for a given provider.
 */
export const getEffectiveApiKey = (
  provider: string,
  apiKeys: Record<string, string>
): string | undefined => {
  const key = apiKeys[provider]?.trim();
  if (key && key !== '') return key;

  if (provider === 'gemini') {
    if (
      typeof import.meta !== 'undefined' &&
      (import.meta as any).env &&
      (import.meta as any).env.VITE_GEMINI_API_KEY
    ) {
      return (import.meta as any).env.VITE_GEMINI_API_KEY;
    }
    if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
      return process.env.GEMINI_API_KEY;
    }
  }

  return undefined;
};

export const getApiKeyName = (provider: Provider): string => {
  return provider.toUpperCase();
};

export interface ModelCapabilities {
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsSystemPrompt: boolean;
  contextWindow: number;
}

export const getModelCapabilities = (modelId: string): ModelCapabilities => {
  const lowerId = modelId.toLowerCase();

  const caps: ModelCapabilities = {
    supportsVision: false,
    supportsStreaming: true,
    supportsTools: false,
    supportsSystemPrompt: true,
    contextWindow: 8192,
  };

  if (lowerId.includes('gemini-2.5-pro')) {
    caps.supportsVision = true;
    caps.supportsTools = true;
    caps.contextWindow = 2097152; // 2M
  } else if (lowerId.includes('gemini-2.5-flash')) {
    caps.supportsVision = true;
    caps.supportsTools = true;
    caps.contextWindow = 1048576; // 1M
  } else if (lowerId.includes('gemini-2.0-flash')) {
    caps.supportsVision = true;
    caps.supportsTools = true;
    caps.contextWindow = 1048576;
  } else if (lowerId.includes('gemini-1.5-pro')) {
    caps.supportsVision = true;
    caps.supportsTools = true;
    caps.contextWindow = 2097152;
  } else if (lowerId.includes('gemini-1.5-flash')) {
    caps.supportsVision = true;
    caps.supportsTools = true;
    caps.contextWindow = 1048576;
  } else if (lowerId.includes('gemini')) {
    caps.supportsVision = true;
    caps.supportsTools = true;
    if (lowerId.includes('3.1-pro')) {
      caps.contextWindow = 2097152;
    } else {
      caps.contextWindow = 1048576;
    }
  } else if (lowerId.includes('gemma-4')) {
    caps.supportsVision = false;
    caps.supportsTools = true;
    caps.contextWindow = 262144;
  } else if (lowerId.includes('llama-3.2')) {
    caps.supportsVision = lowerId.includes('vision');
    caps.supportsTools = true;
    caps.contextWindow = 128000;
  } else if (lowerId.includes('qwen')) {
    caps.supportsTools = true;
    caps.contextWindow = 32768;
  } else if (lowerId.includes('deepseek')) {
    caps.supportsTools = false;
    caps.contextWindow = 128000;
  } else if (lowerId.includes('phi-4') || lowerId.includes('phi-3')) {
    caps.contextWindow = 16384;
  }

  return caps;
};

// ── Health Tracking ──

interface HealthRecord {
  failures: number;
  lastFailure: number;
}

const healthCache = new Map<string, HealthRecord>();
const HEALTH_THRESHOLD = 3;
const COOLDOWN_MS = 60 * 1000; // 1 minute

export const recordModelError = (modelId: string) => {
  const record = healthCache.get(modelId) || { failures: 0, lastFailure: 0 };
  record.failures += 1;
  record.lastFailure = Date.now();
  healthCache.set(modelId, record);
};

export const recordModelSuccess = (modelId: string) => {
  healthCache.delete(modelId);
};

export const isModelHealthy = (modelId: string): boolean => {
  const record = healthCache.get(modelId);
  if (!record) return true;

  if (record.failures >= HEALTH_THRESHOLD) {
    if (Date.now() - record.lastFailure > COOLDOWN_MS) {
      return true; // Cooldown expired, optimistic retry
    }
    return false; // Circuit breaker open
  }
  return true;
};
