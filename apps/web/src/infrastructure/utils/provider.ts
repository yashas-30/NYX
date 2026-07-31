/**
 * @file src/core/utils/provider.ts
 * @description Shared utilities for detecting AI providers and model capabilities.
 */

import { Provider, ModelDefinition } from '../types';
import { AVAILABLE_MODELS } from '@shared/config/models';

export const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  terminal: 'Terminal',
  openrouter: 'OpenRouter',
};

export const CLOUD_PROVIDERS: string[] = ['gemini', 'openrouter'];

export const LOCAL_PROVIDERS: string[] = ['nyx-native'];

const LOCAL_MODEL_IDS = new Set([

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
/**
 * Helper to safely extract string ID from model parameters (handles strings, objects, nulls)
 */
const resolveModelIdString = (modelId: any): string => {
  if (!modelId) return '';
  if (typeof modelId === 'string') return modelId;
  if (typeof modelId === 'object') return modelId.id || modelId.name || String(modelId);
  return String(modelId);
};

/**
 * Structured provider detection that checks in priority order.
 */
export const detectProvider = (modelId: any): Provider => {
  if (typeof modelId === 'object' && modelId?.provider) {
    return modelId.provider as Provider;
  }

  const idStr = resolveModelIdString(modelId);
  if (!idStr) return 'gemini';
  const lowerId = idStr.toLowerCase();

  // 1. Explicit Local Server Prefixes & Extensions
  if (
    lowerId.startsWith('ollama/') ||
    lowerId.startsWith('vllm/') ||
    lowerId.startsWith('lmstudio/') ||
    lowerId.startsWith('local/') ||
    lowerId.endsWith('.gguf') ||
    lowerId.includes('.gguf') ||
    lowerId.endsWith('.safetensors') ||
    lowerId.endsWith('.bin') ||
    lowerId.endsWith('.pt') ||
    lowerId.endsWith('.pth') ||
    lowerId.endsWith('.onnx') ||
    lowerId.endsWith('.ckpt') ||
    lowerId.startsWith('custom-')
  ) {
    return 'nyx-native' as Provider;
  }

  // 2. Explicit Cloud Provider Prefixes
  if (lowerId.startsWith('huggingface/')) return 'huggingface' as Provider;
  if (lowerId.startsWith('groq/')) return 'groq' as Provider;
  if (lowerId.startsWith('anthropic/') || lowerId.includes('claude')) return 'anthropic' as Provider;
  if (lowerId.startsWith('openrouter/') || lowerId.startsWith('deepseek/')) return 'openrouter' as Provider;

  // 3. Static catalog lookup
  const availableModel = AVAILABLE_MODELS.find((m) => m.id === idStr);
  if (availableModel) return availableModel.provider;

  if (LOCAL_MODEL_IDS.has(idStr)) {
    return 'nyx-native' as Provider;
  }

  // 4. Default for unknown cloud models (use OpenRouter instead of forcing Gemini)
  return 'openrouter' as Provider;
};

/**
 * Gets provider from model ID with proper fallback to AVAILABLE_MODELS.
 */
export const getProviderForModel = (modelId: any): Provider => {
  return detectProvider(modelId);
};

/**
 * Checks if a model ID refers to a local instance.
 */
export const isLocalModel = (modelId: any): boolean => {
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
  supportsReasoning: boolean;
  contextWindow: number;
}

export const getModelCapabilities = (modelId: any): ModelCapabilities => {
  const idStr = resolveModelIdString(modelId);
  const lowerId = idStr.toLowerCase();
  
  const isVision =
    lowerId.includes('vl') ||
    lowerId.includes('vision') ||
    lowerId.includes('multimodal') ||
    lowerId.includes('pixtral') ||
    lowerId.includes('llava') ||
    lowerId.includes('minicpm-v') ||
    lowerId.includes('idefics') ||
    lowerId.includes('deepseek-vl') ||
    lowerId.includes('internvl') ||
    lowerId.includes('moondream') ||
    lowerId.includes('gemini');

  const isReasoning =
    lowerId.includes('r1') ||
    lowerId.includes('reasoning') ||
    lowerId.includes('thinking') ||
    lowerId.includes('thinker') ||
    lowerId.includes('qwq') ||
    lowerId.includes('skywork-o') ||
    lowerId.includes('o1') ||
    lowerId.includes('o3');

  const caps: ModelCapabilities = {
    supportsVision: isVision,
    supportsStreaming: true,
    supportsTools: false,
    supportsSystemPrompt: true,
    supportsReasoning: isReasoning,
    contextWindow: 8192,
  };

  if (lowerId.includes('gemini-3.6-flash') || lowerId.includes('gemini-3.5-flash-lite')) {
    caps.supportsTools = true;
    caps.contextWindow = 1048576; // 1M
  } else if (lowerId.includes('gemini-2.0-flash')) {
    caps.supportsTools = true;
    caps.contextWindow = 1048576;
  } else if (lowerId.includes('gemini-3.5-pro')) {
    caps.supportsTools = true;
    caps.contextWindow = 2097152;
  } else if (lowerId.includes('gemini-3.1-flash-lite') || lowerId.includes('gemini-3.5-flash')) {
    caps.supportsTools = true;
    caps.contextWindow = 1048576;
  } else if (lowerId.includes('gemini')) {
    caps.supportsTools = true;
    caps.contextWindow = 1048576;
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

/**
 * Returns true if the model is a reasoning/thinking model that emits a
 * <think> block or a dedicated `thinking` event before its response.
 *
 * Detection is purely by model-name pattern so it works for both cloud
 * models (deepseek-r1 on OpenRouter) and local GGUF files the user drops
 * in (e.g. "qwq-32b-q4_k_m.gguf").
 */
export const isReasoningModel = (modelId: any): boolean => {
  const idStr = resolveModelIdString(modelId);
  if (!idStr) return false;
  const lower = idStr.toLowerCase();

  // Strict pattern matching for genuine reasoning models (DeepSeek R1, QwQ, o1, o3, etc.)
  // Avoids false-positive matches on standard instruct models (e.g. HyperCLOVAX, Llama, Gemma, Gemini)
  return (
    /\b(?:deepseek-r1|deepseek-reasoner|qwq|sky-t1|o1|o3|o1-mini|o1-preview|o3-mini)\b/i.test(lower) ||
    /[-_/](?:r1|qwq|reasoner|thinking|reasoning)(?:[-_/\.]|$)/i.test(lower) ||
    lower.includes('deepseek/deepseek-r') ||
    lower.includes('qwen/qwq')
  );
};

