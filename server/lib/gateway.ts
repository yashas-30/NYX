/**
 * @file server/lib/gateway.ts
 * @description Unified AI Gateway Service with modular, readable architecture.
 * Supports Cloudflare AI Gateway proxying and provider-specific routing.
 */

export type Provider = 'gemini' | 'openrouter' | 'nvidia' | 'ollama' | 'lmstudio' | 'opencode' | 'openai' | 'anthropic' | 'deepseek' | 'groq' | 'mistral' | 'together' | 'pollinations' | 'nyx-native' | 'qwen-local';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'model';
  content: string;
}

export interface AISettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stream?: boolean;
}

export interface GatewayRequest {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  settings?: AISettings;
  apiKey?: string;
  baseUrl?: string;
}

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

// Cloudflare AI Gateway Configuration
interface AIGatewayConfig {
  enabled: boolean;
  accountId?: string;
  gatewayName?: string;
  baseUrl: string;
}

/**
 * Returns Cloudflare AI Gateway config for provider if enabled.
 * Local providers (ollama, lmstudio, opencode) always use direct connections.
 * @param provider - The AI provider to check
 * @returns AIGatewayConfig with enabled flag and baseUrl
 */
const getCloudflareGateway = (provider: Provider): AIGatewayConfig => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const gatewayName = process.env.CLOUDFLARE_GATEWAY_NAME;
  const useGateway = process.env.USE_CLOUDFLARE_GATEWAY === 'true';

  if (!useGateway || !accountId) {
    return { enabled: false, baseUrl: '' };
  }

  const gatewayBase = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName || 'llm-gateway'}`;

  switch (provider) {
    case 'openrouter':
      return { enabled: true, accountId, gatewayName: gatewayName || 'llm-gateway', baseUrl: `${gatewayBase}/openrouter` };
    case 'nvidia':
      return { enabled: true, accountId, gatewayName: gatewayName || 'llm-gateway', baseUrl: `${gatewayBase}/nvidia` };
    case 'gemini':
      return { enabled: true, accountId, gatewayName: gatewayName || 'llm-gateway', baseUrl: `${gatewayBase}/gemini` };
    case 'openai':
      return { enabled: true, accountId, gatewayName: gatewayName || 'llm-gateway', baseUrl: `${gatewayBase}/openai` };
    case 'ollama':
    case 'lmstudio':
    case 'opencode':
    case 'anthropic':
    case 'deepseek':
    case 'groq':
    case 'mistral':
    case 'together':
    case 'pollinations':
    case 'nyx-native':
    case 'qwen-local':
      return { enabled: false, baseUrl: '' };
    default:
      return { enabled: false, baseUrl: '' };
  }
};

// Provider URL configuration
const PROVIDER_URLS: Record<Provider, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openrouter: 'https://openrouter.ai/api/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  ollama: '',
  lmstudio: '',
  opencode: 'https://opencode.ai/zen/v1', // OpenCode Zen API
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  together: 'https://api.together.ai/v1',
  pollinations: 'https://text.pollinations.ai',
  'nyx-native': '',
  'qwen-local': '',
};

// Free models on OpenCode Zen (verified from API)
export const ZEN_FREE_MODELS = [
  'big-pickle',
  'deepseek-v4-flash-free',
  'minimax-m2.5-free',
  'ring-2.6-1t-free',
  'nemotron-3-super-free',
  'qwen3-30b-a3b-free',
  'qwen3-coder-14b-free',
  'llama-3.3-70b-free',
  'gemma-3-27b-it-free',
  'deepseek-v3-free',
];

export class Gateway {
  private static SYSTEM_KEYS: Record<string, string> = {
    gemini: process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || '',
    openrouter: process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY || '',
    nvidia: process.env.NVIDIA_API_KEY || process.env.LLM_API_KEY || '',
    opencode: process.env.OPENCODE_ZEN_API_KEY || '',
    openai: process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '',
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    deepseek: process.env.DEEPSEEK_API_KEY || '',
    groq: process.env.GROQ_API_KEY || '',
    mistral: process.env.MISTRAL_API_KEY || '',
    together: process.env.TOGETHER_API_KEY || '',
  };

  /**
 * Resolves the active API key with priority: user key > system key.
 * @param provider - The AI provider
 * @param userKey - Optional user-provided API key
 * @returns The active API key string
 */
  static getActiveKey(provider: Provider, userKey?: string): string {
    const isValidKey = (key: string | undefined | null): boolean => {
      if (!key) return false;
      const trimmed = key.trim();
      return trimmed !== '' && trimmed !== 'null' && trimmed !== 'undefined';
    };

    if (isValidKey(userKey)) {
      return userKey!.trim();
    }

    return this.SYSTEM_KEYS[provider] || '';
  }

  /**
   * Checks if a model is a free tier model.
   * @param modelId - The model identifier to check
   * @returns true if the model is free tier
   */
  static isFreeModel(modelId: string): boolean {
    return modelId.endsWith(':free') || modelId.includes('-free') || modelId.includes('/free');
  }

  /**
   * Gets the OpenCode Zen endpoint and API type for a specific model.
   * Based on official OpenCode Zen API docs.
   * @param modelId - The OpenCode model identifier
   * @returns Object with endpoint path and apiType ('openai' | 'anthropic' | 'google')
   */
  static getOpenCodeZenEndpoint(modelId: string): { endpoint: string; apiType: 'openai' | 'anthropic' | 'google' } {
    const model = modelId.replace('opencode/', '').replace('opencode\\', '');
    
    // Anthropic /messages endpoint - free models that require this format
    const anthropicModels = ['minimax-m2.1-free'];
    
    // OpenAI compatible /chat/completions endpoint
    const openaiModels = [
      'big-pickle',
      'gpt-5-nano',
      'glm-4.7-free',
      'kimi-k2.5-free',
      'glm-4.7',
      'kimi-k2.5',
      'kimi-k2',
      'kimi-k2-thinking',
      'minimax-m2.1',
      'qwen3-coder',
    ];
    
    // Google /models endpoint
    const googleModels = ['gemini-3-pro', 'gemini-3-flash'];
    
    if (anthropicModels.includes(model)) {
      return { endpoint: '/messages', apiType: 'anthropic' };
    }
    
    if (googleModels.includes(model)) {
      return { endpoint: `/models/${model}`, apiType: 'google' };
    }
    
    // Default to OpenAI-compatible /chat/completions
    return { endpoint: '/chat/completions', apiType: 'openai' };
  }

  /**
   * Maps OpenCode model IDs to Zen API format
   * These map to free models available on OpenCode Zen
   */
  static mapOpenCodeModel(modelId: string): string {
    if (!modelId.startsWith('opencode/')) {
      return modelId;
    }

    const realModel = modelId.replace('opencode/', '');
    
    // Map to OpenCode Zen model IDs (free tier)
    const modelMap: Record<string, string> = {
      'big-pickle': 'big-pickle',
      'deepseek-v4-flash-free': 'deepseek-v4-flash-free',
      'minimax-m2.5-free': 'minimax-m2.5-free',
      'ring-2.6-1t-free': 'ring-2.6-1t-free',
      'nemotron-3-super-free': 'nemotron-3-super-free',
      'qwen3-30b-a3b-free': 'qwen3-30b-a3b-free',
      'qwen3-coder-14b-free': 'qwen3-coder-14b-free',
      'llama-3.3-70b-free': 'llama-3.3-70b-free',
      'gemma-3-27b-it-free': 'gemma-3-27b-it-free',
      'deepseek-v3-free': 'deepseek-v3-free',
    };
    
    return modelMap[realModel] || realModel;

  }

  /**
   * Validates that we have proper authentication before making requests.
   * Local providers (ollama, lmstudio) don't need keys.
   * @param provider - The AI provider
   * @param modelId - The model identifier
   * @param apiKey - Optional user-provided API key
   * @returns Validation result with valid flag and optional error message
   */
  static validateAuth(provider: Provider, modelId: string, apiKey?: string): { valid: boolean; error?: string } {
    // Local providers don't need keys
    if (['ollama', 'lmstudio', 'pollinations', 'nyx-native', 'qwen-local'].includes(provider)) {
      return { valid: true };
    }

    const activeKey = this.getActiveKey(provider, apiKey);
    const isFree = this.isFreeModel(modelId);

    // OpenCode Zen always requires API key (free tier has free credits)
    if (provider === 'opencode') {
      if (!activeKey) {
        return { 
          valid: false, 
          error: `AUTHENTICATION FAILED: OpenCode Zen requires an API key. Get one free at opencode.ai/auth` 
        };
      }
      return { valid: true };
    }

    // Other providers: free models don't need key, paid models do
    if (isFree) {
      return { valid: true };
    }

    if (!activeKey) {
      return { 
        valid: false, 
        error: `AUTHENTICATION FAILED: No API key detected for ${provider}. Please add it in Settings.` 
      };
    }

    return { valid: true };
  }

  /**
   * Builds the request URL with optional Cloudflare AI Gateway proxy.
   * Custom gateway URLs from user settings take priority.
   * @param provider - The AI provider
   * @param endpoint - The API endpoint path
   * @param customGatewayUrls - Optional custom gateway URLs from user settings
   * @returns Object with url and viaGateway flag
   */
  static buildUrl(provider: Provider, endpoint: string, customGatewayUrls?: Record<string, string>): { url: string; viaGateway: boolean } {
    // Check for custom user-defined gateway URL first
    if (customGatewayUrls && customGatewayUrls[provider]) {
      const customUrl = customGatewayUrls[provider].replace(/\/$/, '');
      return { url: `${customUrl}${endpoint}`, viaGateway: true };
    }

    const gateway = getCloudflareGateway(provider);

    if (gateway.enabled) {
      return { url: `${gateway.baseUrl}${endpoint}`, viaGateway: true };
    }

    const base = PROVIDER_URLS[provider];
    return { url: `${base}${endpoint}`, viaGateway: false };
  }

  /**
   * Builds the Authorization header value for the provider.
   * Gemini uses key directly, others use Bearer token format.
   * @param provider - The AI provider
   * @param apiKey - The API key to format
   * @returns The formatted Authorization header value
   */
  static buildAuthHeader(provider: Provider, apiKey: string): string {
    if (!apiKey) return '';
    
    if (provider === 'gemini') {
      return apiKey;
    }
    
    return `Bearer ${apiKey}`;
  }

  /**
   * Processes SSE stream response from OpenAI-compatible APIs.
   * Handles data: [DONE] markers and error payloads.
   * @param response - The fetch Response object with streaming body
   * @param callbacks - Stream callbacks for chunk, done, and error events
   */
  static async processSSEStream(
    response: Response,
    callbacks: StreamCallbacks
  ): Promise<void> {
    if (!response.body) {
      callbacks.onError('No response body');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const clean = line.trim();
          if (clean === 'data: [DONE]' || clean === 'data: [done]') {
            callbacks.onDone();
            return;
          }
          if (!clean.startsWith('data: ')) {
            // Handle lines without data: prefix
            try {
              const data = JSON.parse(clean);
              if (data.error) {
                callbacks.onError(typeof data.error === 'object' ? (data.error.message || JSON.stringify(data.error)) : data.error);
                return;
              }
              // Extract content from OpenAI format
              const chunk = data.choices?.[0]?.delta?.content;
              if (chunk) callbacks.onChunk(chunk);
              // Handle finish_reason to detect end of stream
              if (data.choices?.[0]?.finish_reason === 'stop' || data.choices?.[0]?.finish_reason === 'length') {
                callbacks.onDone();
                return;
              }
            } catch {
              // Skip non-JSON lines
            }
            continue;
          }

          try {
            const data = JSON.parse(clean.slice(6));
            
            if (data.error) {
              const msg = typeof data.error === 'object' ? data.error.message || JSON.stringify(data.error) : data.error;
              callbacks.onError(msg);
              return;
            }

            // Handle multiple content delta formats
            let chunk = data.choices?.[0]?.delta?.content;
            
            // Fallback: check for content in message.delta
            if (!chunk && data.choices?.[0]?.delta?.message?.content) {
              chunk = data.choices[0].delta.message.content;
            }
            
            // Fallback: check for content.message (non-delta format)
            if (!chunk && data.choices?.[0]?.message?.content) {
              chunk = data.choices[0].message.content;
            }

            if (chunk) {
              callbacks.onChunk(chunk);
            }
            
            // Handle finish_reason to detect end of stream
            if (data.choices?.[0]?.finish_reason === 'stop' || data.choices?.[0]?.finish_reason === 'length') {
              callbacks.onDone();
              return;
            }
          } catch {
            // Silent catch for partial chunks
          }
        }
      }
      callbacks.onDone();
    } catch (e: any) {
      console.error('[Gateway.processSSEStream] Stream error:', e.message);
      callbacks.onError(e.message || 'Stream processing failed');
    }
  }

  /**
   * Logs SSE events for debugging.
   * Supports OpenAI, Anthropic, and Google API response formats.
   * @param response - The fetch Response object with streaming body
   * @param apiType - The API format type ('openai' | 'anthropic' | 'google')
   * @param callbacks - Stream callbacks for chunk, done, and error events
   */
  static async processOpenCodeZenStream(
    response: Response,
    apiType: 'openai' | 'anthropic' | 'google',
    callbacks: StreamCallbacks
  ): Promise<void> {
    if (!response.body) {
      callbacks.onError('No response body');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const clean = line.trim();
          if (clean === 'data: [DONE]') {
            callbacks.onDone();
            return;
          }
          if (!clean.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(clean.slice(6));
            
            if (data.error) {
              const msg = data.error.message || JSON.stringify(data.error);
              callbacks.onError(msg);
              return;
            }

            let chunk = '';

            // Handle different API response formats
            if (apiType === 'openai') {
              // OpenAI compatible: data.choices[0].delta.content
              chunk = data.choices?.[0]?.delta?.content || '';
            } else if (apiType === 'anthropic') {
              // Anthropic: data.content[0].text
              chunk = data.content?.[0]?.text || data.choices?.[0]?.message?.content || '';
            } else if (apiType === 'google') {
              // Google: data.candidates[0].content.parts[0].text
              chunk = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            }

            if (chunk) {
              callbacks.onChunk(chunk);
            }
          } catch {
            // Silent catch for partial chunks
          }
        }
      }
      callbacks.onDone();
    } catch (e: any) {
      callbacks.onError(e.message || 'Stream processing failed');
    }
  }

  /**
   * Converts messages to provider-specific format.
   * Gemini uses 'contents' array with 'role' and 'parts' structure.
   * @param messages - Array of chat messages with role and content
   * @param provider - The target AI provider
   * @returns Provider-specific message format
   */
  static formatMessages(messages: ChatMessage[], provider: Provider): any {
    if (provider === 'gemini') {
      const systemInstruction = messages.find(m => m.role === 'system')?.content;
      const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));
      return { systemInstruction, contents };
    }

    return messages.map(m => ({ role: m.role, content: m.content }));
  }

  /**
   * Converts messages to Anthropic format for OpenCode Zen API.
   * @param messages - Array of chat messages with role and content
   * @returns Object with optional systemPrompt and formatted messages array
   */
  static formatMessagesForAnthropic(messages: ChatMessage[]): { systemPrompt?: string; messages: any[] } {
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }));

    return {
      systemPrompt: systemMessage?.content,
      messages: chatMessages
    };
  }
}