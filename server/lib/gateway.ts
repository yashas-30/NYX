/**
 * @file server/lib/gateway.ts
 * @description Unified AI Gateway Service with modular, readable architecture.
 * Supports Cloudflare AI Gateway proxying and provider-specific routing.
 */

import { loadKeys } from '../features/vault/vault.service.ts';
import logger from './logger.ts';

export type Provider =
  | 'gemini'
  | 'nyx-native';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'model';
  content: string;
  images?: { name: string; mimeType: string; data: string }[];
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
 * Local providers (nyx-native) always use direct connections.
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
};

export class Gateway {
  private static SYSTEM_KEYS: Record<string, string> = {
    gemini: process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || '',
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
      const vaultKeys = loadKeys();
      if (isValidKey(vaultKeys[provider])) {
        return vaultKeys[provider].trim();
      }
    } catch (err) {
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
   * Processes SSE stream response from OpenAI-compatible APIs.
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
              // Extract content from OpenAI format
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

            if (chunk) {
              callbacks.onChunk(chunk);
            }

            // Handle finish_reason to detect end of stream
            const finishReason = 
              data.choices?.[0]?.finish_reason || 
              data.candidates?.[0]?.finishReason;
              
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
    } catch (e: any) {
      logger.error({ err: e }, '[Gateway.processSSEStream] Stream error');
      callbacks.onError(e.message || 'Stream processing failed');
    }
  }

  static formatMessages(messages: ChatMessage[], provider: Provider): any {
    if (provider === 'gemini') {
      const systemInstruction = messages.find((m) => m.role === 'system')?.content;
      const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => {
          const parts: any[] = [{ text: m.content || ' ' }];
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
          return {
            role: m.role === 'assistant' ? 'model' : 'user',
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
