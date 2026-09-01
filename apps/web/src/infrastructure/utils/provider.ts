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
  'nvidia-nim': 'NVIDIA NIM',
  nvidia: 'NVIDIA NIM',
  groq: 'Groq',
  mistral: 'Mistral AI',
};

export const CLOUD_PROVIDERS: string[] = [
  'gemini',
  'openrouter',
  'nvidia-nim',
  'nvidia',
  'groq',
  'mistral',
];

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

import { useNyxStore } from '@src/shared/store/useNyxStore';
import { useModelStore } from '@src/core/stores/useModelStore';

/**
 * Structured provider detection that checks in priority order.
 */
export const detectProvider = (modelId: any, providerHint?: string): Provider => {
  if (typeof modelId === 'object' && modelId?.provider) {
    return modelId.provider as Provider;
  }

  if (providerHint && CLOUD_PROVIDERS.includes(providerHint)) {
    return providerHint as Provider;
  }

  const idStr = resolveModelIdString(modelId);
  if (!idStr) return 'gemini';
  const lowerId = idStr.toLowerCase();

  // 1. Check current Zustand store state for explicit local selection
  try {
    const nyxLocalId = useNyxStore.getState().localModelId;
    if (nyxLocalId && nyxLocalId === idStr) {
      return 'nyx-native' as Provider;
    }
  } catch (e) {
    // Ignore store access outside React/Zustand context if any
  }

  try {
    const localLib = useModelStore.getState().localLibraryModels;
    if (localLib && Array.isArray(localLib)) {
      if (localLib.some((m: any) => m.id === idStr || m.name === idStr || m.path === idStr)) {
        return 'nyx-native' as Provider;
      }
    }
  } catch (e) {
    // Ignore
  }

  // 2. Explicit Local Server Prefixes, Extensions & Path heuristics
  if (
    lowerId.startsWith('ollama/') ||
    lowerId.startsWith('vllm/') ||
    lowerId.startsWith('lmstudio/') ||
    lowerId.startsWith('local/') ||
    lowerId.startsWith('nyx-native') ||
    lowerId.endsWith('.gguf') ||
    lowerId.includes('.gguf') ||
    lowerId.endsWith('.safetensors') ||
    lowerId.endsWith('.bin') ||
    lowerId.endsWith('.pt') ||
    lowerId.endsWith('.pth') ||
    lowerId.endsWith('.onnx') ||
    lowerId.endsWith('.ckpt') ||
    lowerId.startsWith('custom-') ||
    lowerId.includes('/unorganized/') ||
    lowerId.includes('\\unorganized\\') ||
    lowerId.includes('prism-')
  ) {
    return 'nyx-native' as Provider;
  }

  if (LOCAL_MODEL_IDS.has(idStr)) {
    return 'nyx-native' as Provider;
  }

  // 3. Exact matching against static catalog models (highest priority cloud check)
  if (providerHint) {
    const hintMatch = AVAILABLE_MODELS.find((m) => m.provider === providerHint && m.id === idStr);
    if (hintMatch) return hintMatch.provider;
  }

  // Exact catalog lookup — matches models configured in OPENROUTER_MODELS, NVIDIA_MODELS, etc.
  const availableModel = AVAILABLE_MODELS.find((m) => m.id === idStr);
  if (availableModel) return availableModel.provider;

  // OpenRouter free models have explicit :free suffix or openrouter prefix
  if (
    lowerId.endsWith(':free') ||
    lowerId.startsWith('openrouter/') ||
    lowerId === 'openrouter/free' ||
    lowerId.startsWith('openrouter-')
  ) {
    return 'openrouter' as Provider;
  }

  // Mistral standalone models
  if (
    lowerId.startsWith('mistral-') ||
    lowerId.startsWith('ministral-') ||
    lowerId.startsWith('codestral')
  ) {
    return 'mistral' as Provider;
  }

  // Gemini models
  if (lowerId.startsWith('gemini-') || lowerId.startsWith('gemma-')) {
    return 'gemini' as Provider;
  }

  // Groq models (explicit groq/ prefix)
  if (lowerId.startsWith('groq/')) {
    return 'groq' as Provider;
  }

  // 4. Explicit Cloud Provider Prefixes (for custom models)
  if (lowerId.startsWith('huggingface/')) return 'huggingface' as Provider;
  if (lowerId.startsWith('nvidia/') || lowerId.includes('deepseek-v4-pro'))
    return 'nvidia-nim' as Provider;
  if (lowerId.startsWith('openrouter/')) return 'openrouter' as Provider;

  // 5. Default for unknown cloud models
  return 'openrouter' as Provider;
};

/**
 * Gets provider from model ID with proper fallback to AVAILABLE_MODELS.
 */
export const getProviderForModel = (modelId: any, providerHint?: string): Provider => {
  return detectProvider(modelId, providerHint);
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

  if (provider === 'openrouter') {
    if (
      typeof import.meta !== 'undefined' &&
      (import.meta as any).env &&
      (import.meta as any).env.VITE_OPENROUTER_API_KEY
    ) {
      return (import.meta as any).env.VITE_OPENROUTER_API_KEY;
    }
    if (typeof process !== 'undefined' && process.env && process.env.OPENROUTER_API_KEY) {
      return process.env.OPENROUTER_API_KEY;
    }
    return undefined;
  }

  if (provider === 'nvidia-nim' || provider === 'nvidia') {
    const key = apiKeys['nvidia-nim'] || apiKeys['nvidia'];
    if (key && key.trim() !== '') return key.trim();
    if (
      typeof import.meta !== 'undefined' &&
      (import.meta as any).env &&
      ((import.meta as any).env.VITE_NVIDIA_API_KEY ||
        (import.meta as any).env.VITE_NVIDIA_NIM_API_KEY)
    ) {
      return (
        (import.meta as any).env.VITE_NVIDIA_API_KEY ||
        (import.meta as any).env.VITE_NVIDIA_NIM_API_KEY
      );
    }
    if (
      typeof process !== 'undefined' &&
      process.env &&
      (process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY)
    ) {
      return process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY;
    }
  }

  if (provider === 'groq') {
    const key = apiKeys['groq'];
    if (key && key.trim() !== '') return key.trim();
    if (
      typeof import.meta !== 'undefined' &&
      (import.meta as any).env &&
      (import.meta as any).env.VITE_GROQ_API_KEY
    ) {
      return (import.meta as any).env.VITE_GROQ_API_KEY;
    }
    if (typeof process !== 'undefined' && process.env && process.env.GROQ_API_KEY) {
      return process.env.GROQ_API_KEY;
    }
  }

  if (provider === 'mistral') {
    const key = apiKeys['mistral'];
    if (key && key.trim() !== '') return key.trim();
    if (
      typeof import.meta !== 'undefined' &&
      (import.meta as any).env &&
      (import.meta as any).env.VITE_MISTRAL_API_KEY
    ) {
      return (import.meta as any).env.VITE_MISTRAL_API_KEY;
    }
    if (typeof process !== 'undefined' && process.env && process.env.MISTRAL_API_KEY) {
      return process.env.MISTRAL_API_KEY;
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
  maxOutputTokens?: number;
  supportsAudio?: boolean;
  trainingCutoff?: string;
  pricing?: { inputPer1MTokens?: number; outputPer1MTokens?: number; currency?: string };
  latencyClass?: 'ultra-fast' | 'fast' | 'medium' | 'slow';
}

export const getModelCapabilities = (modelId: any): ModelCapabilities => {
  const idStr = resolveModelIdString(modelId);
  const lowerId = idStr.toLowerCase();

  const availableModel = AVAILABLE_MODELS.find((m) => m.id === idStr);
  const isReasoning =
    availableModel?.capabilities?.reasoning !== undefined
      ? !!availableModel.capabilities.reasoning
      : isReasoningModel(idStr);

  const isVision =
    availableModel?.capabilities?.vision !== undefined
      ? !!availableModel.capabilities.vision
      : lowerId.includes('vl') ||
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

  const isGemini = lowerId.includes('gemini') || lowerId.includes('gemma');
  const isGemma = lowerId.includes('gemma');
  const isImageGen =
    lowerId.includes('imagen') || lowerId.includes('flux') || lowerId.includes('diffusion');
  const isGeminiFlash = lowerId.includes('gemini') && !isGemma && !isImageGen;
  const isStandardToolModel =
    isGemini ||
    lowerId.includes('gpt-4') ||
    lowerId.includes('gpt-3.5') ||
    lowerId.includes('claude-3') ||
    lowerId.includes('mistral') ||
    lowerId.includes('llama-3') ||
    lowerId.includes('nemotron') ||
    lowerId.includes('qwen-2.5') ||
    lowerId.includes('groq/');

  const caps: ModelCapabilities = {
    supportsVision: isVision || isGemini,
    supportsStreaming: true,
    supportsTools: (isStandardToolModel || isGemini) && !isImageGen,
    supportsSystemPrompt: true,
    supportsReasoning: isReasoning || isGemini,
    contextWindow: isGemini ? (isGemma ? 262144 : 1048576) : 32768,
    maxOutputTokens: isGemini ? (isGemma ? 32768 : 65536) : 8192,
    supportsAudio: isGeminiFlash,
  };

  if (isGeminiFlash) {
    caps.supportsTools = true;
    caps.contextWindow = 1048576; // 1,048,576 tokens (1M)
    caps.maxOutputTokens = 65536; // 65,536 tokens (64K)
    caps.supportsAudio = true;
    if (lowerId.includes('lite')) {
      caps.latencyClass = 'ultra-fast';
    } else {
      caps.latencyClass = 'fast';
    }
  } else if (isGemma) {
    caps.supportsTools = true;
    caps.contextWindow = 262144; // 262,144 tokens (262K)
    caps.maxOutputTokens = 32768; // 32,768 tokens (32K)
    caps.supportsAudio = false;
    caps.latencyClass = lowerId.includes('moe') || lowerId.includes('a4b') ? 'ultra-fast' : 'fast';
  }

  return caps;
};

/**
 * Asynchronously fetch live model capabilities.
 * For OpenRouter cloud models, queries the OpenRouter /models/{id} API.
 * For Gemini models, derives from keyword patterns.
 * For local GGUF models, derives from model filename + known defaults.
 * Falls back to synchronous getModelCapabilities on any error.
 */
export async function getModelCapabilitiesAsync(
  modelId: any,
  provider?: string,
  apiKey?: string
): Promise<ModelCapabilities> {
  const idStr = resolveModelIdString(modelId);
  const resolvedProvider = provider || detectProvider(idStr);
  const baseCaps = getModelCapabilities(idStr);

  // OpenRouter live fetch
  if (resolvedProvider === 'openrouter' && apiKey) {
    try {
      const resp = await fetch(`https://openrouter.ai/api/v1/models/${idStr}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://nyx.ai',
          'X-Title': 'NYX Desktop',
        },
      });
      if (resp.ok) {
        const rawJson = await resp.json();
        const data = rawJson.data || rawJson;
        const ctx =
          data.context_length ?? data.top_provider?.context_length ?? baseCaps.contextWindow;
        const maxOut = data.top_provider?.max_completion_tokens ?? Math.min(ctx, 32768);
        return {
          ...baseCaps,
          contextWindow: ctx,
          maxOutputTokens: maxOut,
          supportsVision: !!data.architecture?.modality?.includes('image'),
          supportsTools: !!data.supported_parameters?.includes('tools'),
          supportsAudio: !!data.architecture?.modality?.includes('audio'),
          trainingCutoff: data.training_data_cutoff ?? undefined,
          pricing: data.pricing
            ? {
                inputPer1MTokens:
                  data.pricing.prompt != null
                    ? parseFloat(data.pricing.prompt) * 1_000_000
                    : undefined,
                outputPer1MTokens:
                  data.pricing.completion != null
                    ? parseFloat(data.pricing.completion) * 1_000_000
                    : undefined,
                currency: 'USD',
              }
            : undefined,
          latencyClass: ctx > 500_000 ? 'slow' : ctx > 100_000 ? 'medium' : 'fast',
        };
      }
    } catch {
      // Fall through to sync result
    }
  }

  return baseCaps;
}

/**
 * Format ModelCapabilities as a markdown table for display in chat.
 */
export function formatCapabilityMarkdown(modelId: string, caps: ModelCapabilities): string {
  const idStr = resolveModelIdString(modelId);
  const ctxDisplay =
    caps.contextWindow >= 1_000_000
      ? `${(caps.contextWindow / 1_000_000).toFixed(1)}M tokens`
      : caps.contextWindow >= 1_000
        ? `${Math.round(caps.contextWindow / 1_000)}K tokens`
        : `${caps.contextWindow} tokens`;

  const outputDisplay = caps.maxOutputTokens
    ? caps.maxOutputTokens >= 1_000
      ? `${Math.round(caps.maxOutputTokens / 1_000)}K tokens`
      : `${caps.maxOutputTokens} tokens`
    : 'Model default';

  const pricingStr =
    caps.pricing?.inputPer1MTokens != null
      ? `$${caps.pricing.inputPer1MTokens.toFixed(2)}/1M in · $${(caps.pricing.outputPer1MTokens ?? 0).toFixed(2)}/1M out`
      : 'Not available';

  const rows = [
    ['Model', `\`${idStr}\``],
    ['Context Window', ctxDisplay],
    ['Max Output', outputDisplay],
    ['Vision / Image Input', caps.supportsVision ? '✅ Yes' : '❌ No'],
    ['Tool / Function Calling', caps.supportsTools ? '✅ Yes' : '❌ No'],
    ['Extended Reasoning', caps.supportsReasoning ? '✅ Yes' : '❌ No'],
    ['Audio Generation', caps.supportsAudio ? '✅ Yes' : '❌ No'],
    ['Streaming', '✅ Yes'],
    ['Training Cutoff', caps.trainingCutoff ?? 'Unknown'],
    ['Pricing', pricingStr],
    ['Latency', caps.latencyClass ?? 'Unknown'],
  ];

  const table = [
    '| Capability | Value |',
    '|------------|-------|',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
  ].join('\n');

  return `### 🧠 Active Model Capabilities\n\n${table}`;
}

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
  const cleanId = idStr.trim();
  const lower = cleanId.toLowerCase();

  // 1. Check registered AVAILABLE_MODELS catalog
  const found = AVAILABLE_MODELS.find(
    (m) =>
      m.id === cleanId ||
      m.id.toLowerCase() === lower ||
      m.id.endsWith(`/${cleanId}`) ||
      cleanId.endsWith(`/${m.id}`)
  );
  if (found?.capabilities?.reasoning !== undefined) {
    return !!found.capabilities.reasoning;
  }

  // 2. Check local model library
  try {
    const localLib = useModelStore.getState().localLibraryModels;
    if (localLib && Array.isArray(localLib)) {
      const localFound = localLib.find(
        (m: any) =>
          m.id === cleanId ||
          m.name === cleanId ||
          m.path === cleanId ||
          m.id?.toLowerCase() === lower
      );
      if (localFound?.capabilities?.reasoning !== undefined) {
        return !!localFound.capabilities.reasoning;
      }
    }
  } catch {
    // Ignore outside Zustand
  }

  // 3. Precise pattern checks for reasoning models
  return (
    /\b(?:deepseek-r1|deepseek-reasoner|qwq|sky-t1|o1|o3|o1-mini|o1-preview|o3-mini|claude-3\.7|claude-3-7)\b/i.test(
      lower
    ) ||
    /[-_/](?:r1|qwq|reasoner|thinking|reasoning)(?:[-_/\.]|$)/i.test(lower) ||
    lower.includes('deepseek-r1') ||
    lower.includes('flash-thinking') ||
    lower.includes('pro-thinking') ||
    lower.includes('-thinking') ||
    lower.includes('-reasoning') ||
    lower.includes('r1-distill') ||
    lower.includes('qwq-') ||
    lower.includes('qwen-qwq') ||
    lower.startsWith('gemini') ||
    lower.startsWith('gemma') ||
    lower.includes('gemini-') ||
    lower.includes('gemma-') ||
    lower.includes('gemini') ||
    lower.includes('gemma') ||
    lower.includes('nemotron-3-ultra') ||
    lower.includes('nemotron-3-super') ||
    lower.includes('nemotron-70b')
  );
};
