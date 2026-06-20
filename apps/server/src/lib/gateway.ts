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
 * Local providers (nyx-native) always use direct connections.
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
const PROVIDER_URLS: Record<Provider, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  'nyx-native': '',
  terminal: '',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  groq: 'https://api.groq.com/openai/v1',
  together: 'https://api.together.xyz/v1',
  perplexity: 'https://api.perplexity.ai',
  ollama: env.OLLAMA_URL || 'http://localhost:11434/v1',
  lmstudio: env.LM_STUDIO_URL || 'http://localhost:1234/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  deepseek: 'https://api.deepseek.com',
};

export class Gateway {
  private static SYSTEM_KEYS: Record<string, string> = {
    gemini: env.GEMINI_API_KEY || env.LLM_API_KEY || '',
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
   * Local providers (nyx-native) don't need keys.
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
    if (provider === 'nyx-native') {
      return { valid: true };
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
    customGatewayUrls?: Record<string, string>
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
   * Processes SSE stream response from standard JSON APIs (e.g. LM Studio, Ollama).
   * Handles data: [DONE] markers and error payloads.
   * @param response - The fetch Response object with streaming body
   * @param callbacks - Stream callbacks for chunk, done, and error events
   */
  static async processSSEStream(response: Response, callbacks: StreamCallbacks): Promise<void> {
    // fallow-ignore-next-line code-duplication
    if (!response.body) {
      callbacks.onError('No response body');
      return;
    }

    // fallow-ignore-next-line code-duplication
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        // fallow-ignore-next-line code-duplication
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
                callbacks.onError(
                  typeof data.error === 'object'
                    ? data.error.message || JSON.stringify(data.error)
                    : data.error
                );
                return;
              }
              // Extract content from standard format
              const chunk = data.choices?.[0]?.delta?.content;
              if (chunk) callbacks.onChunk(chunk);
              // Handle finish_reason to detect end of stream
              if (
                data.choices?.[0]?.finish_reason === 'stop' ||
                data.choices?.[0]?.finish_reason === 'length'
              ) {
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
              const msg =
                typeof data.error === 'object'
                  ? data.error.message || JSON.stringify(data.error)
                  : data.error;
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

            // Fallback: check for Gemini format
            if (!chunk && data.candidates?.[0]?.content?.parts?.[0]?.text) {
              chunk = data.candidates[0].content.parts[0].text;
            }

            let functionCall = data.candidates?.[0]?.content?.parts?.[0]?.functionCall;

            if (chunk) {
              callbacks.onChunk(chunk);
            }
            if (functionCall) {
              callbacks.onChunk({ functionCall });
            }

            // Handle finish_reason to detect end of stream
            const finishReason =
              data.choices?.[0]?.finish_reason || data.candidates?.[0]?.finishReason;

            if (
              finishReason === 'stop' ||
              finishReason === 'length' ||
              finishReason === 'STOP' // Gemini format
            ) {
              callbacks.onDone();
              return;
            }
          } catch {
            // Silent catch for partial chunks
          }
        }
      }
      callbacks.onDone();
    } catch (error: any) {
      logger.error({ err: error }, '[Gateway.processSSEStream] Stream error');
      callbacks.onError(error.message || 'Stream processing failed');
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
