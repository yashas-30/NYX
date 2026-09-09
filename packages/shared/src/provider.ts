import { Provider, ModelOption } from './types.js';
import {
  GEMINI_MODELS,
  NVIDIA_MODELS,
  GROQ_MODELS,
  MISTRAL_MODELS,
  OPENROUTER_MODELS,
  NATIVE_MODELS,
  AVAILABLE_MODELS,
} from './models/index.js';

export const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  terminal: 'Terminal',
  'nyx-native': 'NYX Native',
  'nvidia-nim': 'NVIDIA NIM',
  nvidia: 'NVIDIA NIM',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  mistral: 'Mistral AI',
  openai: 'OpenAI',
  together: 'Together AI',
  perplexity: 'Perplexity',
  anthropic: 'Anthropic',
};

export const CLOUD_PROVIDERS: string[] = [
  'gemini',
  'nvidia-nim',
  'nvidia',
  'openrouter',
  'groq',
  'mistral',
  'openai',
  'together',
  'perplexity',
  'anthropic',
];

export const LOCAL_PROVIDERS: string[] = ['nyx-native'];

/**
 * Provider catalog registry mapping each provider directly to its own curated model definitions.
 * All models are resolved from their own provider section written code.
 */
const PROVIDER_SECTIONS: { provider: Provider; models: ModelOption[] }[] = [
  { provider: 'gemini', models: GEMINI_MODELS },
  { provider: 'nvidia-nim', models: NVIDIA_MODELS },
  { provider: 'groq', models: GROQ_MODELS },
  { provider: 'mistral', models: MISTRAL_MODELS },
  { provider: 'openrouter', models: OPENROUTER_MODELS },
  { provider: 'nyx-native', models: NATIVE_MODELS },
];

/**
 * Structured, catalog-driven provider detection.
 * Resolves models strictly from their own provider section code without brittle hardcoded string lists.
 */
export const detectProvider = (modelId: any, providerHint?: string): Provider => {
  if (!modelId) {
    throw new Error('Model ID is required but was not provided.');
  }

  // 1. Direct object inspection if caller passes a model object with provider
  if (typeof modelId === 'object' && modelId?.provider) {
    return modelId.provider as Provider;
  }

  const idStr = (
    typeof modelId === 'string' ? modelId : modelId?.id || modelId?.name || String(modelId)
  ).trim();
  if (!idStr) {
    throw new Error('Model ID is required but was not provided.');
  }
  const lowerId = idStr.toLowerCase();

  // 2. Explicit provider namespace prefix in model ID
  if (lowerId.startsWith('nyx-native/') || lowerId.startsWith('nyx-native:')) return 'nyx-native';
  if (lowerId.startsWith('nvidia-nim/')) return 'nvidia-nim';
  if (lowerId.startsWith('gemini/')) return 'gemini';
  if (lowerId.startsWith('groq/')) return 'groq';
  if (lowerId.startsWith('mistral/')) return 'mistral';
  if (lowerId.startsWith('openrouter/')) return 'openrouter';

  // 3. Provider hint priority: if a specific provider context is hinted, check its own section first
  if (providerHint) {
    const hintSection = PROVIDER_SECTIONS.find((s) => s.provider === providerHint);
    if (hintSection) {
      const match = hintSection.models.some((m) => {
        const mId = m.id.toLowerCase();
        const mBase = m.id.split('/').pop()?.toLowerCase();
        const mName = m.name.toLowerCase();
        return mId === lowerId || mBase === lowerId || mName === lowerId;
      });
      if (match) return providerHint as Provider;
    }
  }

  // 4. Exact catalog match across all provider sections (taking from each provider's own written code)
  for (const section of PROVIDER_SECTIONS) {
    if (section.models.some((m) => m.id === idStr || m.id.toLowerCase() === lowerId)) {
      return section.provider;
    }
  }

  // 5. Un-namespaced alias / basename / display name match across provider sections
  // (e.g. 'kimi-k3' matching 'moonshotai/kimi-k3', 'gpt-oss-20b' matching 'openai/gpt-oss-20b')
  for (const section of PROVIDER_SECTIONS) {
    if (
      section.models.some((m) => {
        const basename = m.id.split('/').pop()?.toLowerCase();
        const nameLower = m.name.toLowerCase();
        return basename === lowerId || nameLower === lowerId;
      })
    ) {
      return section.provider;
    }
  }

  // 6. Generic cloud/local patterns for external or dynamic models
  if (
    lowerId.endsWith('.gguf') ||
    lowerId.includes('.gguf') ||
    lowerId.endsWith('.safetensors') ||
    lowerId.endsWith('.bin') ||
    lowerId.startsWith('custom-') ||
    lowerId.startsWith('local/') ||
    lowerId.startsWith('ollama/') ||
    lowerId.startsWith('vllm/') ||
    lowerId.startsWith('lmstudio/')
  ) {
    return 'nyx-native';
  }

  if (lowerId.endsWith(':free')) return 'openrouter';
  if (lowerId.startsWith('gpt-') || lowerId.startsWith('o1') || lowerId.startsWith('o3'))
    return 'openai';
  if (lowerId.startsWith('claude-')) return 'anthropic';
  if (lowerId.startsWith('gemini-') || lowerId.startsWith('gemma-')) return 'gemini';
  if (
    lowerId.startsWith('mistral-') ||
    lowerId.startsWith('ministral-') ||
    lowerId.startsWith('codestral')
  )
    return 'mistral';

  throw new Error(`Unknown model: ${idStr}. No provider mapping found.`);
};

/**
 * Gets provider from model ID with proper fallback to AVAILABLE_MODELS.
 */
export const getProviderForModel = (modelId: string): Provider => {
  return detectProvider(modelId);
};

/**
 * Checks if a model ID refers to a local instance.
 */
export const isLocalModel = (modelId: string): boolean => {
  const provider = getProviderForModel(modelId);
  return LOCAL_PROVIDERS.includes(provider) || provider === 'nyx-native';
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
    const globalObj: any =
      typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
    const metaEnv = globalObj.importMetaEnv;
    if (metaEnv && metaEnv.VITE_GEMINI_API_KEY) {
      return metaEnv.VITE_GEMINI_API_KEY;
    }
    const procEnv = globalObj.process?.env;
    if (procEnv && procEnv.GEMINI_API_KEY) {
      return procEnv.GEMINI_API_KEY;
    }
  }

  return undefined;
};

export const getApiKeyName = (provider: Provider): string => {
  return provider.toUpperCase();
};

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

export interface ModelCapabilities {
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsSystemPrompt: boolean;
  supportsReasoning: boolean;
  contextWindow: number;
  maxOutputTokens?: number;
}

export const getModelCapabilities = (modelId: string, providerHint?: string): ModelCapabilities => {
  const cleanId = (modelId || '').trim();
  const lowerId = cleanId.toLowerCase();

  let found: ModelOption | undefined;
  if (providerHint) {
    const section = PROVIDER_SECTIONS.find((s) => s.provider === providerHint);
    if (section) {
      found =
        section.models.find((m) => m.id === cleanId || m.id.toLowerCase() === lowerId) ||
        section.models.find((m) => {
          const base = m.id.split('/').pop()?.toLowerCase();
          return base === lowerId || m.name.toLowerCase() === lowerId;
        });
    }
  }

  // 1. Exact match in catalog
  if (!found) {
    found = AVAILABLE_MODELS.find((m) => m.id === cleanId || m.id.toLowerCase() === lowerId);
  }

  // 2. Basename match (e.g. 'kimi-k3' matching 'moonshotai/kimi-k3')
  if (!found) {
    found = AVAILABLE_MODELS.find((m) => {
      const base = m.id.split('/').pop()?.toLowerCase();
      return base === lowerId || m.name.toLowerCase() === lowerId;
    });
  }

  // 3. Suffix / prefix match for uncatalogued aliases
  if (!found) {
    found = AVAILABLE_MODELS.find(
      (m) =>
        m.id.endsWith(`/${cleanId}`) ||
        cleanId.endsWith(`/${m.id}`) ||
        lowerId.startsWith(m.id.toLowerCase()) ||
        m.id.toLowerCase().startsWith(lowerId)
    );
  }

  const isGemini = lowerId.includes('gemini') || lowerId.includes('gemma');
  const isGemma = lowerId.includes('gemma');

  const defaultCtx = isGemini ? (isGemma ? 262144 : 1048576) : 131072;
  const defaultMaxOut = isGemini ? (isGemma ? 32768 : 65536) : 8192;

  const caps: ModelCapabilities = {
    // All capabilities strictly from the catalog. If a model isn't in the catalog, return false.
    supportsVision: found?.capabilities?.vision !== undefined ? !!found.capabilities.vision : false,
    supportsStreaming: true,
    supportsTools:
      found?.capabilities?.toolCalling !== undefined ? !!found.capabilities.toolCalling : false,
    supportsSystemPrompt: true,
    supportsReasoning:
      found?.capabilities?.reasoning !== undefined ? !!found.capabilities.reasoning : false,
    contextWindow: found?.specs?.contextWindow
      ? parseTokenCount(found.specs.contextWindow, defaultCtx)
      : defaultCtx,
    maxOutputTokens: found?.specs?.maxOutput
      ? parseTokenCount(found.specs.maxOutput, defaultMaxOut)
      : defaultMaxOut,
  };

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
