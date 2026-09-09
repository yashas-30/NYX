/**
 * @file src/core/utils/provider.ts
 * @description Shared utilities for detecting AI providers and model capabilities.
 */

import { Provider, ModelDefinition } from '../types';
import {
  GEMINI_MODELS,
  NVIDIA_MODELS,
  GROQ_MODELS,
  MISTRAL_MODELS,
  OPENROUTER_MODELS,
  NATIVE_MODELS,
  AVAILABLE_MODELS,
} from '@shared/config/models';
import { useAppStore } from '@src/stores/useAppStore';

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

/**
 * Registry of provider catalogs directly imported from their respective provider definitions.
 * All models are resolved from their own provider section written code.
 */
const PROVIDER_SECTIONS: { provider: Provider; models: any[] }[] = [
  { provider: 'gemini', models: GEMINI_MODELS },
  { provider: 'nvidia-nim', models: NVIDIA_MODELS },
  { provider: 'groq', models: GROQ_MODELS },
  { provider: 'mistral', models: MISTRAL_MODELS },
  { provider: 'openrouter', models: OPENROUTER_MODELS },
  { provider: 'nyx-native', models: NATIVE_MODELS },
];

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
import { findLocalModelDef } from '@src/shared/hooks/useLocalModels';

/**
 * Structured, catalog-driven provider detection.
 * Resolves models strictly from their own provider section code without brittle hardcoded string lists.
 */
export const detectProvider = (modelId: any, providerHint?: string): Provider => {
  // 1. Direct object inspection if caller passes a ModelOption or descriptor
  if (typeof modelId === 'object' && modelId?.provider) {
    return modelId.provider as Provider;
  }

  const idStr = resolveModelIdString(modelId).trim();
  if (!idStr) return 'gemini';
  const lowerId = idStr.toLowerCase();

  // 2. Check current Zustand store state for explicit local selection
  try {
    const nyxLocalId = useNyxStore.getState().localModelId;
    if (nyxLocalId && nyxLocalId === idStr) {
      return 'nyx-native' as Provider;
    }
  } catch {
    // Ignore store access outside React/Zustand context if any
  }

  try {
    const localLib = useModelStore.getState().localLibraryModels;
    if (localLib && Array.isArray(localLib)) {
      if (localLib.some((m: any) => m.id === idStr || m.name === idStr || m.path === idStr)) {
        return 'nyx-native' as Provider;
      }
    }
  } catch {
    // Ignore
  }

  // 3. Explicit Local Server Prefixes, Extensions & Path heuristics
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

  // 4. Explicit provider namespace prefix in model ID
  if (lowerId.startsWith('nvidia-nim/')) return 'nvidia-nim' as Provider;
  if (lowerId.startsWith('gemini/')) return 'gemini' as Provider;
  if (lowerId.startsWith('groq/')) return 'groq' as Provider;
  if (lowerId.startsWith('mistral/')) return 'mistral' as Provider;
  if (lowerId.startsWith('openrouter/')) return 'openrouter' as Provider;

  // 5. Provider hint priority: if a specific provider context is hinted, check its own section first
  if (providerHint) {
    const hintSection = PROVIDER_SECTIONS.find((s) => s.provider === providerHint);
    if (hintSection) {
      const match = hintSection.models.some((m: any) => {
        const mId = m.id.toLowerCase();
        const mBase = m.id.split('/').pop()?.toLowerCase();
        const mName = m.name?.toLowerCase();
        return mId === lowerId || mBase === lowerId || mName === lowerId;
      });
      if (match) return providerHint as Provider;
    }
  }

  // 6. Exact catalog match across all provider sections (taking from each provider's own written code)
  for (const section of PROVIDER_SECTIONS) {
    if (section.models.some((m: any) => m.id === idStr || m.id.toLowerCase() === lowerId)) {
      return section.provider;
    }
  }

  // 7. Un-namespaced alias / basename / display name match across provider sections
  // (e.g. 'kimi-k3' matching 'moonshotai/kimi-k3', 'gpt-oss-20b' matching 'openai/gpt-oss-20b')
  for (const section of PROVIDER_SECTIONS) {
    if (
      section.models.some((m: any) => {
        const basename = m.id.split('/').pop()?.toLowerCase();
        const nameLower = m.name?.toLowerCase();
        return basename === lowerId || nameLower === lowerId;
      })
    ) {
      return section.provider;
    }
  }

  // 8. OpenRouter free models or explicit suffixes
  if (
    lowerId.endsWith(':free') ||
    lowerId.startsWith('openrouter/') ||
    lowerId === 'openrouter/free' ||
    lowerId.startsWith('openrouter-')
  ) {
    return 'openrouter' as Provider;
  }

  // 9. Mistral standalone models
  if (
    lowerId.startsWith('mistral-') ||
    lowerId.startsWith('ministral-') ||
    lowerId.startsWith('codestral')
  ) {
    return 'mistral' as Provider;
  }

  // 10. Gemini models
  if (lowerId.startsWith('gemini-') || lowerId.startsWith('gemma-')) {
    return 'gemini' as Provider;
  }

  // 11. Groq models
  if (lowerId.startsWith('groq/')) {
    return 'groq' as Provider;
  }

  // 12. NVIDIA prefix
  if (lowerId.startsWith('nvidia/')) {
    return 'nvidia-nim' as Provider;
  }

  // 13. Explicit Cloud Provider Prefixes (for custom models)
  if (lowerId.startsWith('huggingface/')) return 'huggingface' as Provider;

  // 14. Default for unknown cloud models
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
  const key = apiKeys?.[provider]?.trim();
  if (key && key !== '') return key;

  try {
    const appKey = (useAppStore.getState().apiKeys as Record<string, string> | undefined)?.[
      provider
    ]?.trim();
    if (appKey && appKey !== '') return appKey;
    const nyxKey = useNyxStore.getState().apiKeys?.[provider]?.trim();
    if (nyxKey && nyxKey !== '') return nyxKey;
  } catch {
    // Store might not be initialized in tests
  }

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

export const parseTokenCount = (val?: string | number | null, fallback: number = 8192): number => {
  if (typeof val === 'number') {
    return isFinite(val) && val > 0 ? Math.round(val) : fallback;
  }
  if (!val || typeof val !== 'string') return fallback;

  const trimmed = val.trim();
  if (!trimmed) return fallback;

  // 1. Explicit comma-formatted full integer (e.g. "1,048,576", "262,144", "65,536")
  const commaMatch = trimmed.match(/(\d{1,3}(?:,\d{3})+)/);
  if (commaMatch) {
    const num = parseInt(commaMatch[1].replace(/,/g, ''), 10);
    if (!isNaN(num) && num > 0) return num;
  }

  // 2. Large standalone integer >= 1000 (e.g. "1048576", "131072", "65536", "32768", "8192")
  const intMatch = trimmed.match(/\b(\d{4,})\b/);
  if (intMatch) {
    const num = parseInt(intMatch[1], 10);
    if (!isNaN(num) && num > 0) return num;
  }

  // 3. 'M' or 'm' notation (e.g. "1M", "2M", "1.5M", "1048576 (1M)")
  const mMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*[mM]\b/);
  if (mMatch) {
    const floatVal = parseFloat(mMatch[1]);
    if (!isNaN(floatVal) && floatVal > 0) {
      return Math.round(floatVal * 1024 * 1024);
    }
  }

  // 4. 'K' or 'k' notation (e.g. "128K", "256k", "32k", "64k", "262K")
  const kMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*[kK]\b/);
  if (kMatch) {
    const floatVal = parseFloat(kMatch[1]);
    if (!isNaN(floatVal) && floatVal > 0) {
      return Math.round(floatVal * 1024);
    }
  }

  // 5. Fallback plain integer (e.g. "512", "2048")
  const anyIntMatch = trimmed.replace(/,/g, '').match(/\b(\d+)\b/);
  if (anyIntMatch) {
    const num = parseInt(anyIntMatch[1], 10);
    if (!isNaN(num) && num > 0) return num;
  }

  return fallback;
};

export const getModelCapabilities = (modelId: any, providerHint?: string): ModelCapabilities => {
  const idStr = resolveModelIdString(modelId);
  const lowerId = idStr.toLowerCase();

  // 0. Check local library models first for native local models
  try {
    const localLib = useModelStore.getState().localLibraryModels;
    if (localLib && Array.isArray(localLib)) {
      const localFound = findLocalModelDef(idStr, localLib);
      if (localFound) {
        const caps = localFound.capabilities || {};
        return {
          supportsVision:
            caps.vision ?? localFound.supports_vision ?? localFound.has_mmproj ?? false,
          supportsStreaming: true,
          supportsTools: caps.toolCalling ?? caps.tools ?? localFound.supports_tools ?? false,
          supportsSystemPrompt: true,
          supportsReasoning: caps.reasoning ?? localFound.supports_reasoning ?? false,
          contextWindow: localFound.context_length || 131072,
          maxOutputTokens: 8192,
          supportsAudio: caps.audio ?? localFound.supports_audio ?? false,
        };
      }
    }
  } catch {
    // Ignore outside Zustand
  }

  // Catalog is the single source of truth. Check providerHint first if specified.
  let availableModel: any;
  if (providerHint) {
    const hintSection = PROVIDER_SECTIONS.find((s) => s.provider === providerHint);
    if (hintSection) {
      availableModel =
        hintSection.models.find((m: any) => m.id === idStr || m.id.toLowerCase() === lowerId) ||
        hintSection.models.find((m: any) => {
          const base = m.id.split('/').pop()?.toLowerCase();
          return base === lowerId || m.name?.toLowerCase() === lowerId;
        });
    }
  }

  if (!availableModel) {
    availableModel =
      AVAILABLE_MODELS.find((m) => m.id === idStr || m.id.toLowerCase() === lowerId) ||
      AVAILABLE_MODELS.find((m) => {
        const base = m.id.split('/').pop()?.toLowerCase();
        return base === lowerId || m.name?.toLowerCase() === lowerId;
      }) ||
      AVAILABLE_MODELS.find(
        (m) => lowerId.startsWith(m.id.toLowerCase()) || m.id.toLowerCase().startsWith(lowerId)
      );
  }

  // Whether this model ID is explicitly catalogued
  const inCatalog = !!availableModel;

  // ── Reasoning ────────────────────────────────────────────────────────────────
  // Prefer catalog. Fall back to isReasoningModel only for uncatalogued IDs.
  const isReasoning =
    availableModel?.capabilities?.reasoning !== undefined
      ? !!availableModel.capabilities.reasoning
      : isReasoningModel(idStr);

  // ── Vision ───────────────────────────────────────────────────────────────────
  // Prefer catalog. Fall back to metadata-driven capability.
  const isVision =
    availableModel?.capabilities?.vision !== undefined
      ? !!availableModel.capabilities.vision
      : false;
  // Note: 'gemini' is NOT in the vision fallback list — all Gemini models are
  // catalogued with explicit vision flags.

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

  // Context window: catalog → provider-based fallback (only for unknown aliases)
  const modelCtx = availableModel?.specs?.contextWindow
    ? parseTokenCount(availableModel.specs.contextWindow, 131072)
    : isGemini
      ? isGemma
        ? 262144
        : 1048576
      : 131072;

  // Max output: catalog → provider-based fallback
  const modelMaxOut = availableModel?.specs?.maxOutput
    ? parseTokenCount(availableModel.specs.maxOutput, 8192)
    : isGemini
      ? isGemma
        ? 32768
        : 65536
      : 8192;

  // Tool calling: catalog → provider-based fallback
  const supportsTools =
    availableModel?.capabilities?.toolCalling !== undefined
      ? !!availableModel.capabilities.toolCalling
      : (availableModel?.capabilities as any)?.tools !== undefined
        ? !!(availableModel?.capabilities as any).tools
        : (isStandardToolModel || isGemini) && !isImageGen;

  const caps: ModelCapabilities = {
    supportsVision: isVision,
    supportsStreaming: true,
    supportsTools,
    supportsSystemPrompt: true,
    supportsReasoning: isReasoning,
    contextWindow: modelCtx,
    maxOutputTokens: modelMaxOut,
    supportsAudio:
      availableModel?.capabilities?.audio !== undefined
        ? !!availableModel.capabilities.audio
        : isGeminiFlash && !inCatalog,
  };

  // Apply latency class hints (catalog doesn't express latency, so always apply).
  // Context / output / tool overrides only apply to UNCATALOGUED model aliases so
  // we don't stomp on what the catalog deliberately specifies.
  if (isGeminiFlash) {
    caps.supportsAudio = true;
    caps.latencyClass = lowerId.includes('lite') ? 'ultra-fast' : 'fast';
    if (!inCatalog) {
      caps.supportsTools = true;
      caps.contextWindow = 1048576;
      caps.maxOutputTokens = 65536;
    }
  } else if (isGemma) {
    caps.latencyClass = lowerId.includes('moe') || lowerId.includes('a4b') ? 'ultra-fast' : 'fast';
    if (!inCatalog) {
      caps.supportsTools = true;
      caps.contextWindow = 262144;
      caps.maxOutputTokens = 32768;
    }
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
      const localFound = findLocalModelDef(cleanId, localLib);
      if (localFound) {
        if (localFound.capabilities?.reasoning !== undefined) {
          return !!localFound.capabilities.reasoning;
        }
        if (localFound.supports_reasoning !== undefined) {
          return !!localFound.supports_reasoning;
        }
      }
    }
  } catch {
    // Ignore outside Zustand
  }

  // Steps 1 & 2 exhausted — no metadata indicates this model reasons.
  return false;
};
