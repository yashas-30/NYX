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
        return Math.ceil(asciiChars / 4 + nonAsciiChars / 1.5);
      }
    };
  } catch {
    _countTokens = (text: string) => {
      const asciiChars = (text.match(/[\\x00-\\x7F]/g) || []).length;
      const nonAsciiChars = text.length - asciiChars;
      return Math.ceil(asciiChars / 4 + nonAsciiChars / 1.5);
    };
  }
}
initTokenizer().catch(() => {});

export function countTokens(text: string): number {
  if (_countTokens) return _countTokens(text);
  const asciiChars = (text.match(/[\\x00-\\x7F]/g) || []).length;
  const nonAsciiChars = text.length - asciiChars;
  return Math.ceil(asciiChars / 4 + nonAsciiChars / 1.5);
}

// ---------------------------------------------------------------------------
// Per-request abort controllers (not global singleton)
// ---------------------------------------------------------------------------
const activeControllers = new Map<string, { controller: AbortController; timestamp: number }>();

// Periodic cleanup of stale controllers (older than 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of activeControllers.entries()) {
    if (now - data.timestamp > 300000) {
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

    const promise = this.executeWithRetry(
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
    ).finally(() => {
      this.inFlightRequests.delete(dedupeKey);
      activeControllers.delete(requestId);
    });

    this.inFlightRequests.set(dedupeKey, promise);

    // Auto-cleanup dedupe map after TTL to prevent memory leaks
    setTimeout(() => this.inFlightRequests.delete(dedupeKey), this.DEDUPE_TTL_MS);

    return promise;
  }

  // -------------------------------------------------------------------------
  // Retry with exponential backoff + jitter
  // -------------------------------------------------------------------------
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
    options?: ExecuteOptions,
    attempt = 1
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
      const message = error.message || String(error);
      const isAbort = error.name === 'AbortError' || message.includes('aborted');
      const isCloud = String(provider) === 'gemini';
      const isTransient =
        /429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|rate_limit|quota|overloaded|high demand|timeout|network|econnreset|enotfound/i.test(
          message
        );
      const isNonRetryable = /SAFETY_GATE_BLOCKED|Invalid API key|401|403|unauthorized/i.test(
        message
      );

      if (isCloud && isTransient && attempt <= 3 && !isAbort && !isNonRetryable) {
        const delay = Math.pow(2, attempt - 1) * 1000 + Math.random() * 1000;
        console.warn(
          `[AIService] Retry ${attempt}/3 for ${provider} in ${delay.toFixed(0)}ms: ${message}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeWithRetry(
          requestId,
          modelId,
          provider,
          prompt,
          apiKey,
          systemInstruction,
          settings,
          onStream,
          signal,
          options,
          attempt + 1
        );
      }

      if (isCloud && !isAbort) {
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
      agentMode: options.agentMode,
      webSearch: options.webSearch,
      streamEvents: options.streamEvents,
    };

    let result: EnhancedAIResponse;

    switch (provider) {
      case 'gemini':
        result = await this.executeGemini(providerConfig);
        break;
      case 'nyx-native':
      case 'qwen-local':
        result = await this.executeNyxNative(providerConfig);
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    // Cache write
    if (cacheKey && result.text) {
      await this.fetchWithAuth('/api/v1/cache/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: cacheKey,
          data: result.text,
          provider,
          model: modelId,
        }),
      }).catch((err) => console.warn('[Cache] Write failed:', err));
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

    try {
      const response = await this.fetchWithAuth('/api/v1/gemini/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Connection: 'keep-alive' },
        body: JSON.stringify({
          model: modelId,
          prompt,
          apiKey,
          settings,
          systemInstruction,
          history,
          gatewayUrls,
          images,
          tools,
          responseFormat,
          reasoning,
        }),
        signal,
      });
      if (!response.ok) await this.handleNonOkResponse(response, 'Gemini');
      return await this.processStream(response, modelId, 'gemini', onStream, streamEvents);
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message?.includes('aborted')) throw error;
      const { directFetchGemini } = await import('@src/infrastructure/api/directClient');
      const text = await directFetchGemini(
        modelId,
        prompt,
        apiKey || '',
        settings,
        systemInstruction,
        history,
        signal,
        gatewayUrls
      );
      if (onStream) {
        if (streamEvents) {
          onStream({ type: 'text', content: text, final: true });
        } else {
          onStream(text);
        }
      }
      return {
        text,
        model: modelId,
        provider: 'gemini',
        metrics: this.computeMetrics(text, Date.now()),
        finishReason: 'stop',
      };
    }
  }

  private static async executeNyxNative(config: ProviderConfig): Promise<EnhancedAIResponse> {
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
    } = config;

    const messages = this.buildMessages(prompt, systemInstruction, history);
    const response = await this.fetchWithAuth('/api/v1/nyx/local-models/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: settings?.temperature ?? 0.7,
        max_tokens: settings?.maxTokens ?? 4096,
        top_p: settings?.topP,
        top_k: settings?.topK,
        repeat_penalty: settings?.repeatPenalty,
        gpu_layers: settings?.gpuLayers,
        threads: settings?.threads,
        context_size: settings?.contextSize,
        batch_size: settings?.batchSize,
        mirostat: settings?.mirostat,
        agentMode,
        webSearch,
      }),
      signal,
    });
    if (!response.ok) await this.handleNonOkResponse(response, 'Native GGUF Runner');
    return this.processStream(response, modelId, 'nyx-native', onStream, streamEvents);
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
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
    if (history?.length) {
      messages.push(...history.map((m) => ({ role: m.role, content: m.content })));
    }
    messages.push({ role: 'user', content: prompt });
    return messages;
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
    const noKeyProviders = ['nyx-native', 'qwen-local'];
    if (noKeyProviders.includes(String(provider))) return;

    if (!key?.trim()) {
      throw new Error(`${provider} requires an API key. Please add one in Settings.`);
    }

    const trimmed = key.trim();
    const validators: Record<string, (k: string) => boolean> = {
      gemini: (k) => k.length >= 30,
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
    if (provider === 'nyx-native' || provider === 'qwen-local') {
      try {
        const res = await this.fetchWithAuth('/api/v1/nyx/local-models/status');
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
  agentMode?: 'chat' | 'coder';
  webSearch?: boolean;
  streamEvents?: boolean;
}
