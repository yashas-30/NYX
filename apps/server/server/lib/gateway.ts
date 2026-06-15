/**
 * @file server/lib/gateway.ts
 * @description Unified AI Gateway Service with modular, readable architecture.
 * Supports Cloudflare AI Gateway proxying and provider-specific routing.
 */

import { getKeysSync } from '../features/vault/vault.service.js';
import logger from './logger.js';
import { Provider, ChatMessage, AISettings } from '@nyx/shared';
import { env } from '../config/env.js';
import WebSocket from 'ws';
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
const CLOUD_PROVIDERS = ['gemini', 'openai', 'groq', 'together', 'perplexity', 'anthropic'];
const PROVIDER_URLS: Record<Provider, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta', // Kept for backwards compatibility
  ollama: '',
  lmstudio: '',
  terminal: '',
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  together: 'https://api.together.xyz/v1',
  perplexity: 'https://api.perplexity.ai',
  anthropic: 'https://api.anthropic.com',
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
   * Inline async generator that parses an SSE stream without spawning a Worker thread.
   * Handles multi-line data blocks, [DONE] sentinel, Gemini candidates/thinking,
   * OpenAI delta.content, usageMetadata, and error payloads.
   */
  static async *readSSEStream(response: Response): AsyncGenerator<any, void, unknown> {
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventDataLines: string[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let start = 0;
        while (start < buffer.length) {
          const end = buffer.indexOf('\n', start);
          if (end === -1) break;

          const line = buffer.substring(start, end).replace(/\r$/, '');
          start = end + 1;

          if (line === '') {
            // Empty line = end of SSE event block
            if (eventDataLines.length > 0) {
              const fullData = eventDataLines.join('\n');
              eventDataLines = [];

              if (fullData === '[DONE]' || fullData === '[done]') return;

              try {
                const data = JSON.parse(fullData);

                if (data.error) {
                  const msg = typeof data.error === 'object'
                    ? data.error.message || JSON.stringify(data.error)
                    : data.error;
                  yield { error: msg };
                  return;
                }

                // OpenAI-compatible delta
                let textChunk: string | undefined;
                textChunk = data.choices?.[0]?.delta?.content
                  ?? data.choices?.[0]?.delta?.message?.content
                  ?? data.choices?.[0]?.message?.content;
                if (typeof textChunk === 'string') { yield textChunk; }

                // Gemini candidates / thinking parts
                const parts = data.candidates?.[0]?.content?.parts;
                if (Array.isArray(parts)) {
                  for (const part of parts) {
                    if (part.thought === true || part.thought === 'true') {
                      if (part.text) yield { thinking: part.text };
                    } else if (part.functionCall) {
                      yield { functionCall: part.functionCall };
                    } else if (part.text) {
                      yield part.text;
                    }
                  }
                }

                // Usage metadata
                if (data.usageMetadata || data.usage) {
                  yield { type: 'metrics', metadata: data.usageMetadata || data.usage };
                }

                // Finish reasons
                const finishReason = data.choices?.[0]?.finish_reason || data.candidates?.[0]?.finishReason;
                if (finishReason === 'stop' || finishReason === 'length' || finishReason === 'STOP') return;

              } catch { /* skip malformed JSON */ }
            }
          } else if (line.startsWith('data:')) {
            eventDataLines.push(line.substring(5).replace(/^ /, ''));
          } else if (line.startsWith('error:')) {
            yield { error: line.substring(6).trimStart() };
            return;
          }
        }

        buffer = buffer.substring(start);
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }

  /**
   * Callback-based SSE processor — drives the readSSEStream generator.
   * Kept for backward compatibility with Ollama/LMStudio callers.
   */
  static async processSSEStream(response: Response, callbacks: StreamCallbacks): Promise<void> {
    if (!response.body) {
      callbacks.onError('No response body');
      return;
    }

    try {
      for await (const item of Gateway.readSSEStream(response)) {
        if (callbacks.isPaused?.()) {
          await callbacks.waitForResume?.();
        }

        if (typeof item === 'string') {
          callbacks.onChunk(item);
        } else if (item?.error) {
          callbacks.onError(item.error);
          return;
        } else {
          callbacks.onChunk(item);
        }
      }
      callbacks.onDone();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        callbacks.onDone();
      } else {
        logger.error({ err: error }, '[Gateway.processSSEStream] Stream error');
        callbacks.onError(error.message || 'Stream processing failed');
      }
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

  /**
   * Connects to a provider's WebSocket API for bidirectional streaming
   * (e.g., Gemini Multimodal Live API or OpenAI Realtime API).
   */
  static connectWebSocket(
    provider: Provider,
    model: string,
    apiKey: string,
    callbacks: {
      onOpen?: () => void;
      onMessage: (data: any) => void;
      onError: (error: string) => void;
      onClose?: () => void;
    }
  ): WebSocket | null {
    const activeKey = this.getActiveKey(provider, apiKey);
    if (!activeKey) {
      callbacks.onError(`No API key for ${provider}`);
      return null;
    }

    let urlStr = '';

    if (provider === 'gemini') {
      const version = GEMINI_API_VERSION(model);
      const host = 'generativelanguage.googleapis.com';
      // The BidiGenerateContent endpoint format for Gemini
      urlStr = `wss://${host}/ws/google.ai.generativelanguage.${version}.GenerativeService.BidiGenerateContent?key=${activeKey}`;
    } else if (provider === 'openai') {
      urlStr = `wss://api.openai.com/v1/realtime?model=${model}`;
    } else {
      callbacks.onError(`WebSocket streaming not supported for ${provider}`);
      return null;
    }

    try {
      const options = provider === 'openai' ? {
        headers: {
          'Authorization': `Bearer ${activeKey}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      } : undefined;

      const ws = new WebSocket(urlStr, options);

      ws.on('open', () => {
        logger.info(`[Gateway] WebSocket connected to ${provider}`);
        callbacks.onOpen?.();
      });

      ws.on('message', (data: Buffer | string) => {
        try {
          const parsed = JSON.parse(data.toString());
          callbacks.onMessage(parsed);
        } catch (e) {
          // Pass raw string if not JSON
          callbacks.onMessage(data.toString());
        }
      });

      ws.on('error', (err: Error) => {
        logger.error({ err }, `[Gateway] WebSocket error on ${provider}`);
        callbacks.onError(err.message);
      });

      ws.on('close', () => {
        logger.info(`[Gateway] WebSocket closed on ${provider}`);
        callbacks.onClose?.();
      });

      return ws;
    } catch (err: any) {
      callbacks.onError(`Failed to open WebSocket: ${err.message}`);
      return null;
    }
  }
}
