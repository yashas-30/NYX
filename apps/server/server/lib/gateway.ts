/**
 * @file server/lib/gateway.ts
 * @description Unified AI Gateway Service with modular, readable architecture.
 * Supports Cloudflare AI Gateway proxying and provider-specific routing.
 */

import { getKeysSync } from '../features/vault/vault.service.js';
import logger from './logger.js';
import { Provider, ChatMessage, AISettings } from '@nyx/shared';
import { env } from '../config/env.js';
export type { Provider, ChatMessage, AISettings };

export const VALID_GEMINI_MODELS = [
  // GA
  'gemini-3.5-flash',
  // Preview
  'gemini-3-flash-preview',

  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-live-preview',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
  'gemini-3.1-pro-preview-customtools',
  // Deprecated (shutting down Oct 16, 2026)
  'gemini-2.5-flash',

  'gemini-2.5-flash-lite',
  // Open models
  'gemma-4-31b-it',
  'gemma-4-26b-it',
  'gemma-4-26b-a4b-it',

  // Aliases
  'gemini-flash-latest',
  'gemini-pro-latest',
];

export const GEMINI_API_VERSION = (model: string) => {
  if (model.startsWith('gemini-3.5') || model.startsWith('gemini-3.1')) return 'v1';
  return 'v1beta';
};

export interface GatewayRequest {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  settings?: AISettings;
  apiKey?: string;
  baseUrl?: string;
}

export interface StreamCallbacks {
  onChunk: (text: any) => void;
  onDone: () => void;
  onError: (error: string) => void;
  isPaused?: () => boolean;
  waitForResume?: () => Promise<void>;
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
 * Local providers (ollama, lmstudio) always use direct connections.
 * @param provider - The AI provider to check
 * @returns AIGatewayConfig with enabled flag and baseUrl
 */
const getCloudflareGateway = (provider: Provider): AIGatewayConfig => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const gatewayName = env.CLOUDFLARE_GATEWAY_NAME;
  const useGateway = env.USE_CLOUDFLARE_GATEWAY;

  if (!useGateway || !accountId) {
    return { enabled: false, baseUrl: '' };
  }

  const gatewayBase = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName || 'llm-gateway'}`;

  switch (provider) {
    case 'gemini':
      return {
        enabled: true,
        accountId,
        gatewayName: gatewayName || 'llm-gateway',
        baseUrl: `${gatewayBase}/gemini`,
      };
    default:
      return { enabled: false, baseUrl: '' };
  }
};

// Provider URL configuration
const CLOUD_PROVIDERS = ['gemini'];
const PROVIDER_URLS: Record<Provider, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta', // Kept for backwards compatibility
  ollama: '',
  lmstudio: '',
  terminal: '',
  'antigravity-sdk': ''
};

export class Gateway {
  private static SYSTEM_KEYS: Record<string, string> = {
    gemini: env.GEMINI_API_KEY || env.LLM_API_KEY || env.ANTIGRAVITY_API_KEY || '',
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

    // Fallback: check encrypted keyVault keys
    try {
      const vaultKeys = getKeysSync();
      if (isValidKey(vaultKeys[provider])) {
        return vaultKeys[provider].trim();
      }
    } catch (err: any) {
      logger.error({ err }, `[Gateway] Failed to retrieve key for ${provider} from keyVault`);
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
   * Validates that we have proper authentication before making requests.
   * Local providers (ollama, lmstudio) don't need keys.
   * @param provider - The AI provider
   * @param modelId - The model identifier
   * @param apiKey - Optional user-provided API key
   * @returns Validation result with valid flag and optional error message
   */
  static validateAuth(
    provider: Provider,
    modelId: string,
    apiKey?: string
  ): { valid: boolean; error?: string } {
    if (provider === 'ollama' || provider === 'lmstudio') {
      return { valid: true };
    }

    if (provider === 'gemini' && !VALID_GEMINI_MODELS.includes(modelId)) {
      return {
        valid: false,
        error: `INVALID MODEL: ${modelId} is not a valid Gemini model ID.`,
      };
    }

    const activeKey = this.getActiveKey(provider, apiKey);
    if (!activeKey) {
      return {
        valid: false,
        error: `AUTHENTICATION FAILED: No API key detected for ${provider}. Please add it in Settings.`,
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
  static buildUrl(
    provider: Provider,
    endpoint: string,
    customGatewayUrls?: Record<string, string>,
    model?: string
  ): { url: string; viaGateway: boolean } {
    // Check for custom user-defined gateway URL first
    if (customGatewayUrls && customGatewayUrls[provider]) {
      const customUrl = customGatewayUrls[provider].replace(/\/$/, '');
      return { url: `${customUrl}${endpoint}`, viaGateway: true };
    }

    const gateway = getCloudflareGateway(provider);

    if (gateway.enabled) {
      return { url: `${gateway.baseUrl}${endpoint}`, viaGateway: true };
    }

    let base = PROVIDER_URLS[provider];
    if (provider === 'gemini') {
      const version = model ? GEMINI_API_VERSION(model) : 'v1beta';
      base = `https://generativelanguage.googleapis.com/${version}`;
    }
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
   * Processes SSE stream response with robust chunk boundary and multiline parsing.
   * Handles data: [DONE] markers and error payloads.
   * @param response - The fetch Response object with streaming body
   * @param callbacks - Stream callbacks for chunk, done, and error events
   */
  static async processSSEStream(response: Response, callbacks: StreamCallbacks): Promise<void> {
    if (!response.body) {
      callbacks.onError('No response body');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (callbacks.isPaused?.()) {
          await callbacks.waitForResume?.();
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        let start = 0;
        let eventData: string[] = [];

        while (start < buffer.length) {
          const end = buffer.indexOf('\n', start);
          if (end === -1) break;

          const line = buffer.substring(start, end).replace(/\r$/, '');
          start = end + 1;

          if (line === '') {
            // End of an event
            if (eventData.length > 0) {
              const fullData = eventData.join('\n');
              eventData = [];
              
              if (fullData === '[DONE]' || fullData === '[done]') {
                callbacks.onDone();
                return;
              }

              // Process JSON chunk
              try {
                const data = JSON.parse(fullData);

                if (data.error) {
                  const msg = typeof data.error === 'object' ? data.error.message || JSON.stringify(data.error) : data.error;
                  callbacks.onError(msg);
                  return;
                }

                // Standard OpenAI-compatible formats
                let chunk = data.choices?.[0]?.delta?.content;
                if (!chunk) chunk = data.choices?.[0]?.delta?.message?.content;
                if (!chunk) chunk = data.choices?.[0]?.message?.content;
                if (!chunk && typeof data.chunk === 'string') chunk = data.chunk;

                if (chunk) {
                  callbacks.onChunk(chunk);
                }

                // Gemini format: iterate all parts to handle thinking + text + functionCall
                const parts = data.candidates?.[0]?.content?.parts;
                if (Array.isArray(parts)) {
                  console.log('[DEBUG] Gemini parts:', JSON.stringify(parts));
                  for (const part of parts) {
                    if (part.thought === true || part.thought === 'true') {
                      // Thinking token — dispatch as thinking object
                      if (part.text) callbacks.onChunk({ thinking: part.text });
                    } else if (part.functionCall) {
                      callbacks.onChunk({ functionCall: part.functionCall });
                    } else if (part.text) {
                      callbacks.onChunk(part.text);
                    }
                  }
                }

                if (data.usageMetadata || data.usage) {
                  callbacks.onChunk({ type: 'metrics', metadata: data.usageMetadata || data.usage });
                }

                const finishReason = data.choices?.[0]?.finish_reason || data.candidates?.[0]?.finishReason;
                if (finishReason === 'stop' || finishReason === 'length' || finishReason === 'STOP') {
                  callbacks.onDone();
                  return;
                }
              } catch {
                // Ignore parsing errors for partial/malformed chunks
              }
            }
          } else if (line.startsWith('data:')) {
            const dataStr = line.substring(5).replace(/^ /, ''); // Remove at most one leading space per spec
            eventData.push(dataStr);
          } else if (line.startsWith('error:')) {
             callbacks.onError(line.substring(6).trimStart());
             return;
          }
        }
        
        buffer = buffer.substring(start);
      }
      callbacks.onDone();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        callbacks.onDone();
        return;
      }
      logger.error({ err: error }, '[Gateway.processSSEStream] Stream error');
      callbacks.onError(error.message || 'Stream processing failed');
    } finally {
      reader.cancel().catch(() => {});
    }
  }

  static formatMessages(messages: ChatMessage[], provider: Provider): any {
    if (provider === 'gemini') {
      const systemInstruction = messages.find((m) => m.role === 'system')?.content;
      const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m: any) => {
          const parts: any[] = [];
          if (m.content) {
            parts.push({ text: m.content });
          }
          if (m.functionCall) {
            parts.push({ functionCall: m.functionCall });
          }
          if (m.functionResponse) {
            parts.push({ functionResponse: m.functionResponse });
          }
          if (m.images && Array.isArray(m.images)) {
            for (const img of m.images) {
              parts.push({
                inlineData: {
                  mimeType: img.mimeType,
                  data: img.data,
                },
              });
            }
          }
          // If empty, provide a default space
          if (parts.length === 0) {
            parts.push({ text: ' ' });
          }
          return {
            role: m.role === 'assistant' ? 'model' : m.role === 'function' ? 'user' : m.role,
            parts,
          };
        });
      return { systemInstruction, contents };
    }

    return messages.map((m) => {
      if (m.images && Array.isArray(m.images) && m.images.length > 0) {
        const contentParts: any[] = [{ type: 'text', text: m.content || ' ' }];
        for (const img of m.images) {
          contentParts.push({
            type: 'image_url',
            image_url: {
              url: `data:${img.mimeType};base64,${img.data}`,
            },
          });
        }
        return { role: m.role, content: contentParts };
      }
      return { role: m.role, content: m.content };
    });
  }
}
