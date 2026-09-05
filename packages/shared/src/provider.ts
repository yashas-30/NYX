import { Provider } from './types.js';
import { AVAILABLE_MODELS } from './models.js';

export const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  terminal: 'Terminal',
  'nyx-native': 'NYX Native',
  openai: 'OpenAI',
  groq: 'Groq',
  together: 'Together AI',
  perplexity: 'Perplexity',
  anthropic: 'Anthropic',
};

export const CLOUD_PROVIDERS: string[] = [
  'gemini',
  'openai',
  'groq',
  'together',
  'perplexity',
  'anthropic',
];

export const LOCAL_PROVIDERS: string[] = ['nyx-native'];

/**
 * Structured provider detection that checks in priority order.
 */
export const detectProvider = (modelId: string): Provider => {
  if (!modelId) {
    throw new Error('Model ID is required but was not provided.');
  }

  if (modelId.startsWith('nyx-native/') || modelId.startsWith('nyx-native:')) return 'nyx-native';
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1') || modelId.startsWith('o3'))
    return 'openai';
  if (modelId.startsWith('claude-')) return 'anthropic';

  // 1. Check in static AVAILABLE_MODELS presets
  const availableModel = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (availableModel) return availableModel.provider;

  // 3. Check generic patterns
  const lowerId = modelId.toLowerCase();
  if (lowerId.startsWith('gemini-') || lowerId.startsWith('gemma-4')) {
    return 'gemini';
  }

  if (
    lowerId.includes('llama') ||
    lowerId.includes('qwen') ||
    lowerId.includes('gemma') ||
    lowerId.includes('phi') ||
    lowerId.includes('mistral') ||
    lowerId.includes('deepseek')
  ) {
    return 'nyx-native';
  }

  // 4. Check GGUF and custom patterns for imported models
  if (lowerId.endsWith('.gguf') || lowerId.includes('.gguf') || lowerId.startsWith('custom-')) {
    return 'nyx-native';
  }

  throw new Error(`Unknown model: ${modelId}. No provider mapping found.`);
};

/**
 * Gets provider from model ID with proper fallback to AVAILABLE_MODELS.
 */
export const getProviderForModel = (modelId: string): Provider => {
  if (!modelId) {
    throw new Error('Model ID is required but was not provided.');
  }

  if (modelId.startsWith('nyx-native/') || modelId.startsWith('nyx-native:')) return 'nyx-native';
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1') || modelId.startsWith('o3'))
    return 'openai';
  if (modelId.startsWith('claude-')) return 'anthropic';

  // 1. Check in static AVAILABLE_MODELS presets
  const availableModel = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (availableModel) return availableModel.provider;

  // 3. Check generic patterns
  const lowerId = modelId.toLowerCase();
  if (lowerId.startsWith('gemini-') || lowerId.startsWith('gemma-4')) {
    return 'gemini';
  }

  if (
    lowerId.includes('llama') ||
    lowerId.includes('qwen') ||
    lowerId.includes('gemma') ||
    lowerId.includes('phi') ||
    lowerId.includes('mistral') ||
    lowerId.includes('deepseek')
  ) {
    return 'nyx-native';
  }

  // 4. Check GGUF and custom patterns for imported models
  if (lowerId.endsWith('.gguf') || lowerId.includes('.gguf') || lowerId.startsWith('custom-')) {
    return 'nyx-native';
  }

  throw new Error(`Unknown model: ${modelId}. No provider mapping found.`);
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

export interface ModelCapabilities {
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsSystemPrompt: boolean;
  supportsReasoning: boolean;
  contextWindow: number;
}

export const getModelCapabilities = (modelId: string): ModelCapabilities => {
  const cleanId = (modelId || '').trim();
  const lowerId = cleanId.toLowerCase();

  // Exact match first, then fuzzy prefix/suffix for version aliases not yet in catalog
  const found =
    AVAILABLE_MODELS.find(
      (m) =>
        m.id === cleanId ||
        m.id.toLowerCase() === lowerId ||
        m.id.endsWith(`/${cleanId}`) ||
        cleanId.endsWith(`/${m.id}`)
    ) ||
    AVAILABLE_MODELS.find(
      (m) => lowerId.startsWith(m.id.toLowerCase()) || m.id.toLowerCase().startsWith(lowerId)
    );

  const caps: ModelCapabilities = {
    // All capabilities strictly from the catalog. If a model isn't in the catalog, return false.
    supportsVision: found?.capabilities?.vision !== undefined ? !!found.capabilities.vision : false,
    supportsStreaming: true,
    supportsTools:
      found?.capabilities?.toolCalling !== undefined ? !!found.capabilities.toolCalling : false,
    supportsSystemPrompt: true,
    supportsReasoning:
      found?.capabilities?.reasoning !== undefined ? !!found.capabilities.reasoning : false,
    contextWindow: 8192,
  };

  if (found?.specs?.contextWindow) {
    const match = found.specs.contextWindow.match(/^([\d,]+)/);
    if (match) {
      const num = parseInt(match[1].replace(/,/g, ''), 10);
      if (!isNaN(num) && num > 0) caps.contextWindow = num;
    }
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
