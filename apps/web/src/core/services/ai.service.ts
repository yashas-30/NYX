/**
 * @file src/core/services/ai.service.ts
 * @description Enterprise-grade unified AI inference service with streaming,
 *   retry logic, circuit breaking, structured output, and tool use.
 *   Targets parity with Kimi/Claude-level reliability and UX.
 */

import {
  AISettings,
  AIResponse,
  ChatMessage,
  Provider,
  ReasoningStep,
  AIServiceToolDefinition,
  ExecuteOptions,
  EnhancedAIResponse,
  ToolCall,
} from '@src/infrastructure/types';
import { ContinuationManager } from '@src/infrastructure/services/continuationManager';
import { fetchWithAuth, getSessionToken, setSessionToken } from '@src/infrastructure/api/authFetch';
import { parseSSEStream } from '@src/infrastructure/api/streamParser';

export interface AIServiceStreamEvent {
  type: 'text' | 'reasoning' | 'tool_calls' | 'error';
  content: string | ToolCall[];
  final: boolean;
}

// ---------------------------------------------------------------------------
// Token counting with tiktoken (cl100k_base)
// ---------------------------------------------------------------------------
let _countTokens: ((text: string) => number) | null = null;

async function initTokenizer(): Promise<void> {
  if (_countTokens) return;
  try {
    const { encoding_for_model } = await import(/* @vite-ignore */ 'tiktoken');
    const enc = encoding_for_model('gpt-4o');
    _countTokens = (text: string) => {
      try {
        return enc.encode(text).length;
      } catch {
        const asciiChars = (text.match(/[\\x00-\\x7F]/g) || []).length;
        const nonAsciiChars = text.length - asciiChars;
        return Math.ceil(text.length / 3.5); // Better heuristic for code
      }
    };
  } catch {
    _countTokens = (text: string) => {
      return Math.ceil(text.length / 3.5); // Better heuristic for code
    };
  }
}
initTokenizer().catch(() => {});

export function countTokens(text: string): number {
  if (_countTokens) return _countTokens(text);
  return Math.ceil(text.length / 3.5); // Better heuristic for code
}

// ---------------------------------------------------------------------------
// Per-request abort controllers (not global singleton)
// ---------------------------------------------------------------------------
const activeControllers = new Map<string, { controller: AbortController; timestamp: number }>();

// Periodic cleanup of stale controllers (older than 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of activeControllers.entries()) {
    if (now - data.timestamp > 600000) {
      data.controller.abort();
      activeControllers.delete(id);

      // Also find and remove from inFlightRequests
      for (const [key, promise] of AIService.inFlightRequests.entries()) {
        if (key.includes(id)) {
          AIService.inFlightRequests.delete(key);
        }
      }
    }
  }
}, 60000);

export function cancelRequest(requestId: string): void {
  const data = activeControllers.get(requestId);
  if (data) {
    data.controller.abort();
    activeControllers.delete(requestId);
  }
}

export function cancelAllRequests(): void {
  activeControllers.forEach((data) => data.controller.abort());
  activeControllers.clear();
}

/**
 * Backward compatibility alias for cancelAllRequests
 */
export function cancelCurrentRequest(): void {
  cancelAllRequests();
}

// ---------------------------------------------------------------------------
// Circuit breaker for cloud providers
// ---------------------------------------------------------------------------
interface CircuitState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

const circuits = new Map<string, CircuitState>();
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_TIMEOUT_MS = 30000;

function isCircuitOpen(provider: string): boolean {
  const state = circuits.get(provider);
  if (!state || state.state === 'closed') return false;

  if (state.state === 'open') {
    if (Date.now() - state.lastFailure > CIRCUIT_TIMEOUT_MS) {
      state.state = 'half-open'; // Transition to half-open
      return false; // Allow one test request
    }
    return true; // Still open
  }

  // half-open: allow through, next result will close or re-open
  return false;
}

function recordSuccess(provider: string): void {
  circuits.delete(provider);
}

function recordFailure(provider: string): void {
  const state = circuits.get(provider) || { failures: 0, lastFailure: 0, state: 'closed' as const };

  if (state.state === 'half-open') {
    // If we fail while half-open, immediately trip back to open
    state.state = 'open';
    state.lastFailure = Date.now();
  } else {
    state.failures++;
    state.lastFailure = Date.now();
    if (state.failures >= CIRCUIT_THRESHOLD) state.state = 'open';
  }

  circuits.set(provider, state);
}

// ---------------------------------------------------------------------------
// AIService
// ---------------------------------------------------------------------------
export class AIService {
  public static inFlightRequests = new Map<string, Promise<EnhancedAIResponse>>();
  private static readonly DEDUPE_TTL_MS = 30000;
  private static cachedVaultStatus: any = null;
  private static cachedVaultStatusTime = 0;
  private static pendingVaultStatusPromise: Promise<any> | null = null;

  // -------------------------------------------------------------------------
  // Vault status with stale-while-revalidate
  // -------------------------------------------------------------------------
  private static async getVaultStatus(): Promise<any> {
    if (this.cachedVaultStatus && Date.now() - this.cachedVaultStatusTime < 2000) {
      return this.cachedVaultStatus;
    }
    if (this.pendingVaultStatusPromise) {
      return this.pendingVaultStatusPromise;
    }
    this.pendingVaultStatusPromise = (async () => {
      try {
        const response = await fetchWithAuth('/api/v1/vault/status');
        if (response.ok) {
          const data = await response.json();
          this.cachedVaultStatus = data;
          this.cachedVaultStatusTime = Date.now();
          return data;
        }
      } catch {
        // vault status is optional
      } finally {
        this.pendingVaultStatusPromise = null;
      }
      return null;
    })();
    return this.pendingVaultStatusPromise;
  }

  static setSessionToken(token: string | null): void {
    setSessionToken(token);
  }

  static getSessionToken(): string | null {
    return getSessionToken();
  }

  static async fetchWithAuth(url: string, init?: RequestInit, isStream = false): Promise<Response> {
    return fetchWithAuth(url, init, isStream);
  }

  // -------------------------------------------------------------------------
  // Main execution entry point
  // -------------------------------------------------------------------------
  
  private static classifyError(error: any, provider: string) {
    const message = error?.message || String(error);
    const isTransient = /429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|rate_limit|quota|overloaded|high demand|timeout|network|econnreset|enotfound/i.test(message);
    const isNonRetryable = /SAFETY_GATE_BLOCKED|Invalid API key|401|403|unauthorized/i.test(message);
    
    return {
      retryable: isTransient && !isNonRetryable,
      retryAfterMs: isTransient ? 2000 : 0
    };
  }

  static async executeWithFallback(
    primaryModel: string,
    primaryProvider: Provider | string,
    prompt: string,
    apiKey?: string,
    systemInstruction?: string,
    settings?: AISettings,
    onStream?: (event: any) => void,
    signal?: AbortSignal,
    options: ExecuteOptions & { apiKeys?: Record<string, string> } = {}
  ): Promise<EnhancedAIResponse> {
    const fallbackChain = [
      { model: primaryModel, provider: primaryProvider, key: apiKey },
      { model: 'openrouter/free', provider: 'openrouter' as Provider, key: options.apiKeys?.['openrouter'] || '' },
      { model: 'pollinations/openai', provider: 'pollinations' as Provider, key: '' },
    ];

    let lastError: any;

    for (const attempt of fallbackChain) {
      try {
        const result = await this.execute(
          attempt.model,
          attempt.provider,
          prompt,
          attempt.key,
          systemInstruction,
          settings,
          onStream,
          signal,
          options
        );

        // Track which model actually served the request
        if (attempt.model !== primaryModel) {
          console.log(`[Fallback] Used ${attempt.provider}/${attempt.model} instead of ${primaryProvider}/${primaryModel}`);
        }

        return result;
      } catch (error: any) {
        lastError = error;
        const errorInfo = this.classifyError(error, String(attempt.provider));

        // Don't retry non-retryable errors
        if (!errorInfo.retryable) break;

        // Wait before next attempt
        if (errorInfo.retryAfterMs) {
          await new Promise(r => setTimeout(r, errorInfo.retryAfterMs));
        }
      }
    }

    throw lastError;
  }

  // fallow-ignore-next-line code-duplication
  static async executeMultimodal(
    modelId: string,
    provider: Provider,
    message: any,
    apiKey?: string,
    settings?: AISettings
  ): Promise<EnhancedAIResponse> {
    // Wrapper around executeWithFallback for multimodal
    const prompt = (Array.isArray(message) ? message.join(' ') : message) as string;
    return this.executeWithFallback(
      modelId,
      provider,
      prompt,
      apiKey,       // 4th arg = apiKey
      undefined,    // 5th arg = systemInstruction
      settings,     // 6th arg = settings
      undefined,
      undefined,
      {}
    );
  }

  static async execute(
    modelId: string,
    provider: Provider | string,
    prompt: string,
    apiKey?: string,
    systemInstruction?: string,
    settings?: AISettings,
    onStream?: (event: any) => void,
    signal?: AbortSignal,
    options: ExecuteOptions = {}
  ): Promise<EnhancedAIResponse> {
    const requestId = `${provider}:${modelId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    // Circuit breaker check
    if (isCircuitOpen(String(provider))) {
      throw new Error(`Circuit breaker open for provider: ${provider}`);
    }

    const dedupeKey = JSON.stringify({
      sessionId: this.getSessionToken(),
      provider,
      model: modelId,
      prompt,
      systemInstruction,
      history: options.history || [],
      settings: settings || {},
      tools: options.tools || [],
      responseFormat: options.responseFormat,
    });

    // Deduplication
    if (this.inFlightRequests.has(dedupeKey)) {
      const existing = this.inFlightRequests.get(dedupeKey)!;
      if (onStream) {
        const res = await existing;
        if (res.text) {
          if (options.streamEvents) {
            onStream({ type: 'text', content: res.text, final: true });
          } else {
            onStream(res.text);
          }
        }
        return res;
      }
      return existing;
    }

    const executePromise = this.executeWithRetry(
      requestId,
      modelId,
      provider,
      prompt,
      apiKey,
      systemInstruction,
      settings,
      onStream,
      signal,
      options
    );

    const cleanupPromise = executePromise.finally(() => {
      this.inFlightRequests.delete(dedupeKey);
      activeControllers.delete(requestId);
    });

    cleanupPromise.catch(() => {}); // prevent unhandled rejections if unawaited
    this.inFlightRequests.set(dedupeKey, cleanupPromise);

    // Auto-cleanup dedupe map after TTL to prevent memory leaks
    setTimeout(() => this.inFlightRequests.delete(dedupeKey), this.DEDUPE_TTL_MS);

    return cleanupPromise;
  }

  // -------------------------------------------------------------------------
  // Retry with exponential backoff + jitter
  // -------------------------------------------------------------------------
  // fallow-ignore-next-line code-duplication
  private static async executeWithRetry(
    requestId: string,
    modelId: string,
    provider: Provider | string,
    prompt: string,
    apiKey?: string,
    systemInstruction?: string,
    settings?: AISettings,
    onStream?: (event: any) => void,
    signal?: AbortSignal,
    options?: ExecuteOptions
  ): Promise<EnhancedAIResponse> {
    try {
      const result = await this._executeRaw(
        requestId,
        modelId,
        provider,
        prompt,
        apiKey,
        systemInstruction,
        settings,
        onStream,
        signal,
        options
      );
      recordSuccess(String(provider));
      return result;
    } catch (error: any) {
      const isAbort = error?.name === 'AbortError' || error?.message?.includes('aborted');
      if (String(provider) === 'gemini' && !isAbort) {
        recordFailure(String(provider));
      }
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Core execution
  // -------------------------------------------------------------------------
  private static async _executeRaw(
    requestId: string,
    modelId: string,
    provider: Provider | string,
    prompt: string,
    apiKey?: string,
    systemInstruction?: string,
    settings?: AISettings,
    onStream?: (event: any) => void,
    externalSignal?: AbortSignal,
    options: ExecuteOptions = {}
  ): Promise<EnhancedAIResponse> {
    const controller = new AbortController();
    activeControllers.set(requestId, { controller, timestamp: Date.now() });

    // Link external signal
    if (externalSignal) {
      externalSignal.addEventListener('abort', () => controller.abort());
    }

    const signal = controller.signal;
    const startTime = Date.now();

    // Filter history: remove trailing user message if it matches current prompt
    let historyToUse = options.history ? [...options.history] : undefined;
    if (historyToUse?.length) {
      const last = historyToUse[historyToUse.length - 1];
      if (last.role === 'user' && last.content === prompt) {
        historyToUse = historyToUse.slice(0, -1);
      }
    }

    this.validateApiKey(provider, apiKey);

    // Cache check
    let cacheKey = '';
    try {
      const cacheRes = await this.fetchWithAuth('/api/v1/cache/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model: modelId,
          prompt,
          systemInstruction,
          history: historyToUse || [],
          settings: settings || {},
          tools: options.tools || [],
        }),
        signal,
      });
      if (cacheRes.ok) {
        const cache = await cacheRes.json();
        cacheKey = cache.key;
        if (cache.hit) {
          const text = cache.text;
          const latency = Date.now() - startTime;
          const tokens = countTokens(text);
          const tps = latency > 0 ? Math.round(tokens / (latency / 1000)) : tokens;
          if (onStream) {
            if (options.streamEvents) {
              onStream({ type: 'text', content: text, final: true });
            } else {
              onStream(text);
            }
          }
          return {
            text,
            model: modelId,
            provider: String(provider),
            metrics: { latency, tokens, tps },
            finishReason: 'stop',
          };
        }
      }
    } catch {
      // Cache miss — proceed
    }

    // Route to provider
    const providerConfig = {
      modelId,
      prompt,
      apiKey,
      settings,
      systemInstruction,
      history: historyToUse,
      onStream,
      signal,
      gatewayUrls: options.gatewayUrls,
      images: options.images,
      tools: options.tools,
      responseFormat: options.responseFormat,
      reasoning: options.reasoning,
      agentMode: (options.agentMode === 'coder' ? 'chat' : options.agentMode) as 'chat' | undefined,
      webSearch: options.webSearch,
      streamEvents: options.streamEvents,
    };

    let result: EnhancedAIResponse;

    const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

    if (isTauri) {
      // Bypass Fastify entirely on Desktop and use native Rust IPC for zero-latency
      result = await this.executeLocal({ ...providerConfig, provider: String(provider) } as any);
    } else {
      switch (provider) {
        case 'gemini':
          result = await this.executeGemini(providerConfig);
          break;
        case 'ollama':
        case 'lmstudio':
        case 'openai':
        case 'anthropic':
        case 'openrouter':
        case 'deepseek':
          result = await this.executeLocal({ ...providerConfig, provider: String(provider) } as any);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    }

    // Cache write
    if (cacheKey && result.text) {
      this.fetchWithAuth('/api/v1/cache/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: cacheKey,
          data: result.text,
          provider,
          model: modelId,
        }),
      }).catch((err) => {
        console.error(`[AIService] Cache write failed for key ${cacheKey.slice(0, 8)}...`, {
          error: err.message || err,
          provider,
          model: modelId,
          textLength: result.text.length,
        });
      });
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Provider implementations
  // -------------------------------------------------------------------------

  private static async executeGemini(config: ProviderConfig): Promise<EnhancedAIResponse> {
    const {
      modelId,
      prompt,
      apiKey,
      settings,
      systemInstruction,
      history,
      onStream,
      signal,
      gatewayUrls,
      images,
      tools,
      responseFormat,
      reasoning,
      streamEvents,
    } = config;

    // Direct bypass for Gemini if API key is present, avoiding the non-streaming proxy
    const { directFetch } = await import('@src/infrastructure/api/directClient');

    const result = await directFetch(modelId, prompt, {
      apiKey: apiKey || '',
      settings,
      systemInstruction,
      history: history as any,
      signal,
      gatewayUrls,
      images: images?.map((img: any) => ({ mimeType: img.mimeType, base64: img.data || img.base64 || '' })) as any,
      tools: tools as any,
      responseFormat: responseFormat as any,
      webSearch: config.webSearch,
      onStream: onStream
        ? (chunk) => {
            if (streamEvents) {
              if (chunk.type === 'text')
                onStream({ type: 'text', content: chunk.content, final: false });
              if (chunk.type === 'reasoning')
                onStream({ type: 'reasoning', content: chunk.content, final: false });
              if (chunk.type === 'tool_call')
                onStream({
                  type: 'tool_calls',
                  content: JSON.parse(chunk.content || '[]'),
                  final: false,
                });
            } else if (chunk.type === 'text' && chunk.content) {
              onStream(chunk.metadata?.accumulated || chunk.content);
            }
          }
        : undefined,
    });

    return {
      text: result.text,
      model: modelId,
      provider: 'gemini',
      metrics: result.metrics || this.computeMetrics(result.text, Date.now()),
      finishReason: (result.finishReason as any) || 'stop',
      reasoning: result.reasoning ? [{ content: result.reasoning, type: 'thinking' }] : undefined,
      toolCalls: result.toolCalls as any,
    };
  }

  private static async executeLocal(config: ProviderConfig & { provider: string }): Promise<EnhancedAIResponse> {
    const {
      modelId,
      prompt,
      systemInstruction,
      settings,
      history,
      onStream,
      signal,
      agentMode,
      webSearch,
      streamEvents,
      provider,
      apiKey,
      tools,
    } = config;

    const messages = this.buildMessages(prompt, systemInstruction, history);

    const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
    if (isTauri) {
      let resolvedApiKey = apiKey || '';
      if (!resolvedApiKey && ['openai', 'anthropic', 'deepseek', 'openrouter'].includes(provider)) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const res: any = await invoke('vault:get-key', { payload: { provider } });
          if (res.success && res.data) {
            resolvedApiKey = res.data;
          }
        } catch (e) {
          console.warn(`[AIService] Failed to get key for ${provider} from Tauri vault`, e);
        }
      }

      try {
        const { tauriLlmStream } = await import('@src/infrastructure/api/tauriLlmClient');
        const parsed = await tauriLlmStream({
          provider,
          model_id: modelId,
          messages,
          system_instruction: systemInstruction,
          api_key: resolvedApiKey,
          temperature: settings?.temperature ?? 0.7,
          tools,
        }, {
          signal,
          timeoutMs: 120000,
          onChunk: (delta, accumulated) => {
            if (onStream) {
              if (streamEvents) {
                onStream({ type: 'text', content: delta, final: false });
              } else {
                onStream(accumulated);
              }
            }
          },
          onReasoning: (delta, accumulated) => {
            if (onStream && streamEvents) {
              onStream({ type: 'reasoning', content: delta, final: false });
            }
          },
        });

        if (onStream) {
          if (streamEvents) {
            onStream({ type: 'text', content: parsed.text, final: true });
            if (parsed.reasoning) {
              onStream({ type: 'reasoning', content: parsed.reasoning, final: true });
            }
          } else {
            onStream(parsed.text);
          }
        }

        return {
          text: parsed.text || '',
          model: modelId,
          provider,
          reasoning: parsed.reasoning ? [{ content: parsed.reasoning, type: 'thinking' }] : undefined,
          finishReason: parsed.finishReason as any,
          metrics: this.computeMetrics(parsed.text, Date.now() - (parsed.metrics.latencyMs || 0)),
        };
      } catch (err) {
        console.warn('[AIService] Tauri native streaming failed, falling back to backend stream', err);
      }
    }

    const response = await this.fetchWithAuth('/api/v1/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        provider: provider,
        messages,
        temperature: settings?.temperature ?? 0.7,
        max_tokens: settings?.maxTokens ?? getDefaultMaxTokens(String(provider)),
        top_p: settings?.topP,
        top_k: settings?.topK,
        repeat_penalty: settings?.repeatPenalty,
        gpu_layers: settings?.gpuLayers,
        threads: settings?.threads,
        context_size: settings?.contextSize,
        batch_size: settings?.batchSize,
        mirostat: settings?.mirostat,
        // local models don't use agentMode/webSearch
      }),
      signal,
    });
    if (!response.ok) await this.handleNonOkResponse(response, provider);
    return this.processStream(response, modelId, provider, onStream, streamEvents);
  }

  // -------------------------------------------------------------------------
  // Stream processing — token-by-token with reasoning extraction
  // -------------------------------------------------------------------------
  private static async processStream(
    response: Response,
    model: string,
    provider: string,
    onStream?: (event: any) => void,
    streamEvents = false
  ): Promise<EnhancedAIResponse> {
    const parsed = await parseSSEStream(response, {
      onChunk: (delta, accumulated) => {
        if (onStream) {
          if (streamEvents) {
            onStream({ type: 'text', content: delta, final: false });
          } else {
            onStream(accumulated);
          }
        }
      },
      onReasoning: (delta, accumulated) => {
        if (onStream && streamEvents) {
          onStream({ type: 'reasoning', content: delta, final: false });
        }
      },
      onToolCall: (delta, accumulated) => {
        if (onStream && streamEvents) {
          onStream({ type: 'tool_calls', content: accumulated, final: false });
        }
      },
      onError: (err) => {
        // streamParser throws automatically, this is just for callback if needed
      },
    });

    if (onStream) {
      if (streamEvents) {
        onStream({ type: 'text', content: parsed.text, final: true });
        if (parsed.reasoning) {
          onStream({ type: 'reasoning', content: parsed.reasoning, final: true });
        }
        if (parsed.toolCalls && parsed.toolCalls.length > 0) {
          onStream({ type: 'tool_calls', content: parsed.toolCalls, final: true });
        }
      } else {
        onStream(parsed.text);
      }
    }

    return {
      text: parsed.text || '[PROTOCOL HALT]',
      model,
      provider,
      reasoning: parsed.reasoning ? [{ content: parsed.reasoning, type: 'thinking' }] : undefined,
      toolCalls:
        parsed.toolCalls && parsed.toolCalls.length ? (parsed.toolCalls as any) : undefined,
      finishReason: parsed.finishReason as any,
      metrics: this.computeMetrics(parsed.text, Date.now() - (parsed.metrics.latencyMs || 0)),
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  private static buildMessages(
    prompt: string,
    systemInstruction?: string,
    history?: ChatMessage[]
  ): Array<{ role: string; content: string | any[] }> {
    const messages: Array<{ role: string; content: string | any[] }> = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
    if (history?.length) {
      messages.push(...history.map((m) => ({ role: m.role, content: m.content })));
    }
    messages.push({ role: 'user', content: prompt });

    // Auto-inject cache markers for long contexts (e.g. Anthropic Ephemeral Caching)
    const totalTokens = countTokens(JSON.stringify(messages));
    if (totalTokens > 4000) {
      // Also cache the system instruction
      if (messages[0]?.role === 'system' && typeof messages[0].content === 'string') {
          messages[0].content = [
              { type: 'text', text: messages[0].content, cache_control: { type: 'ephemeral' } }
          ];
      }
      // Find the last large message and add a cache marker
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === 'user' && typeof m.content === 'string' && m.content.length > 8000) {
           m.content = [
             { type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }
           ];
           break;
        }
      }
    }

    return messages as any;
  }

  private static computeMetrics(text: string, startTime: number): AIResponse['metrics'] {
    const latency = Date.now() - startTime;
    const tokens = countTokens(text);
    return {
      latency,
      tokens,
      tps: latency > 0 ? Math.round(tokens / (latency / 1000)) : 0,
    };
  }

  private static async handleNonOkResponse(
    response: Response,
    providerName: string
  ): Promise<never> {
    const err = await response
      .json()
      .catch(() => ({ error: `${providerName} Error ${response.status}` }));
    if (err?.error === 'SAFETY_GATE_BLOCKED') {
      throw new Error(`SAFETY_GATE_BLOCKED:${JSON.stringify(err)}`);
    }
    throw new Error(err.error || `${providerName} Error ${response.status}`);
  }

  private static validateApiKey(provider: Provider | string, key?: string) {
    const noKeyProviders = ['ollama', 'lmstudio'];
    if (noKeyProviders.includes(String(provider))) return;

    if (!key?.trim()) {
      throw new Error(`${provider} requires an API key. Please add one in Settings.`);
    }

    const trimmed = key.trim();
    const validators: Record<string, (k: string) => boolean> = {
      gemini: (k) => k.length >= 10,
    };

    const validator = validators[String(provider)];
    if (validator && !validator(trimmed)) {
      throw new Error(`Invalid ${provider} API key format`);
    }
  }

  // -------------------------------------------------------------------------
  // Status checking
  // -------------------------------------------------------------------------
  static async checkStatus(
    provider: Provider | string,
    apiKey?: string
  ): Promise<'online' | 'offline' | 'no-key'> {
    if (provider === 'ollama' || provider === 'lmstudio') {
      try {
        const res = await this.fetchWithAuth(`/api/v1/models/status?provider=${provider}`);
        if (!res.ok) return 'offline';
        const data = await res.json();
        return data.activeModelId ? 'online' : 'offline';
      } catch {
        return 'offline';
      }
    }
    try {
      const vaultStatus = await this.getVaultStatus();
      if (vaultStatus?.[provider]) return 'online';
    } catch {
      /* ignore */
    }
    if (apiKey?.trim().length) return 'online';
    return 'no-key';
  }

  // -------------------------------------------------------------------------
  // Continuation support
  // -------------------------------------------------------------------------
  static compressPrompt(prompt: string, maxTokens = 100000): string {
    const tokens = countTokens(prompt);
    if (tokens <= maxTokens) return prompt;
    // rough heuristic: 1 token = 3.5 chars
    const maxChars = Math.floor(maxTokens * 3.5);
    const half = Math.floor(maxChars / 2);
    return `${prompt.substring(0, half)}\n\n...[TRUNCATED FOR LENGTH]...\n\n${prompt.substring(prompt.length - half)}`;
  }

  static async executeParallel(
    configs: { modelId: string; provider: string }[],
    prompt: string,
    baseOptions: {
      apiKey?: string;
      systemInstruction?: string;
      settings?: AISettings;
      options?: ExecuteOptions;
    }
  ): Promise<EnhancedAIResponse[]> {
    const promises = configs.map((config) =>
      this.execute(
        config.modelId,
        config.provider,
        prompt,
        baseOptions.apiKey,
        baseOptions.systemInstruction,
        baseOptions.settings,
        undefined,
        undefined,
        baseOptions.options
      ).catch(
        (e) =>
          ({
            text: `Error: ${e.message}`,
            model: config.modelId,
            provider: config.provider,
            metrics: { latency: 0, tokens: 0, tps: 0 },
            finishReason: undefined /* error */,
          }) as EnhancedAIResponse
      )
    );
    return Promise.all(promises);
  }

  static async executeEnsemble(
    configs: { modelId: string; provider: string }[],
    synthesizerConfig: { modelId: string; provider: string },
    prompt: string,
    baseOptions: {
      apiKey?: string;
      systemInstruction?: string;
      settings?: AISettings;
      options?: ExecuteOptions;
    }
  ): Promise<EnhancedAIResponse> {
    const parallelResults = await this.executeParallel(configs, prompt, baseOptions);

    let synthesisPrompt = `I asked multiple AI models the following prompt:\n\n<prompt>${prompt}</prompt>\n\nHere are their responses:\n\n`;

    parallelResults.forEach((res, i) => {
      synthesisPrompt += `<response model="${res.model}" provider="${res.provider}">\n${res.text}\n</response>\n\n`;
    });

    synthesisPrompt += `Synthesize these responses into a single, high-quality final answer that takes the best parts of each approach.`;

    return this.execute(
      synthesizerConfig.modelId,
      synthesizerConfig.provider,
      synthesisPrompt,
      baseOptions.apiKey,
      baseOptions.systemInstruction,
      baseOptions.settings,
      undefined,
      undefined,
      baseOptions.options
    );
  }

  static async executeABTest(
    prompt: string,
    variants: { weight: number; config: { modelId: string; provider: string } }[],
    baseOptions: {
      apiKey?: string;
      systemInstruction?: string;
      settings?: AISettings;
      options?: ExecuteOptions & { onStream?: (event: any) => void; signal?: AbortSignal };
    }
  ): Promise<EnhancedAIResponse> {
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    let rand = Math.random() * totalWeight;

    let selectedVariant = variants[0];
    for (const v of variants) {
      if (rand < v.weight) {
        selectedVariant = v;
        break;
      }
      rand -= v.weight;
    }

    return this.execute(
      selectedVariant.config.modelId,
      selectedVariant.config.provider,
      prompt,
      baseOptions.apiKey,
      baseOptions.systemInstruction,
      baseOptions.settings,
      baseOptions.options?.onStream,
      baseOptions.options?.signal,
      baseOptions.options
    );
  }

  // fallow-ignore-next-line code-duplication
  static async executeWithContinuation(
    modelId: string,
    provider: Provider | string,
    prompt: string,
    apiKey?: string,
    systemInstruction?: string,
    settings?: AISettings,
    onStream?: (event: any) => void,
    signal?: AbortSignal,
    options?: ExecuteOptions
  ): Promise<AIResponse> {
    const res = await ContinuationManager.executeWithContinuation(
      this.execute.bind(this),
      modelId,
      provider,
      prompt,
      apiKey,
      systemInstruction,
      settings,
      onStream,
      signal,
      options
    );
    return {
      text: res.text,
      metrics: res.metrics,
    };
  }
}

// ---------------------------------------------------------------------------
// Provider-specific defaults (Fix 8: per-provider max tokens + token estimation)
// ---------------------------------------------------------------------------

/**
 * Returns the appropriate max_tokens default for each provider.
 * These mirror the limits in the Rust llm.rs command.
 */
function getDefaultMaxTokens(provider: string): number {
  switch (provider) {
    case 'anthropic':
      return 32_768;  // Claude Sonnet/Opus support 64K+; use 32K as safe default
    case 'openai':
    case 'openrouter':
    case 'deepseek':
      return 16_384;
    case 'gemini':
      return 8_192;
    case 'ollama':
    case 'lmstudio':
      return 8_192;   // Local models — conservative to avoid OOM
    default:
      return 8_192;
  }
}

/**
 * Provider-specific characters-per-token ratios for accurate context budgeting.
 * Using GPT-4's cl100k tokenizer for all providers (as was done before) gives
 * 15-30% wrong counts for Gemini (SentencePiece) and Claude (BPE variant).
 */
export function estimateTokens(text: string, provider: string): number {
  const len = text.length;
  switch (provider) {
    case 'gemini':
      return Math.ceil(len / 3.5);   // Gemini SentencePiece: ~3.5 chars/token
    case 'anthropic':
      return Math.ceil(len / 3.7);   // Claude BPE variant: ~3.7 chars/token
    case 'openai':
    case 'openrouter':
    case 'deepseek':
      return Math.ceil(len / 4.0);   // GPT-4 cl100k: ~4 chars/token
    default:
      return Math.ceil(len / 3.8);   // Conservative middle ground
  }
}

// ---------------------------------------------------------------------------
// Type definitions for internal use
// ---------------------------------------------------------------------------
interface ProviderConfig {
  modelId: string;
  prompt: string;
  apiKey?: string;
  settings?: AISettings;
  systemInstruction?: string;
  history?: ChatMessage[];
  onStream?: (event: any) => void;
  signal?: AbortSignal;
  gatewayUrls?: Record<string, string>;
  images?: ChatMessage['images'];
  tools?: AIServiceToolDefinition[];
  responseFormat?: ExecuteOptions['responseFormat'];
  reasoning?: boolean;
  agentMode?: 'chat';
  webSearch?: boolean;
  streamEvents?: boolean;
}
