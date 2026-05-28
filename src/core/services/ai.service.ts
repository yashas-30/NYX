/**
 * @file src/core/services/ai.service.ts
 * @description CONSOLIDATED unified service for interacting with local and remote AI models.
 * This is the single source of truth for all AI inference. The duplicate at
 * src/features/coder/services/ai.service.ts has been removed in favour of this file.
 *
 * Fixes applied:
 *  - BAD-1 : Merged duplicate AIService classes
 *  - BAD-4 : Replaced text.length/4 heuristic with tiktoken-based token counting (cl100k_base)
 *  - UGLY-6: Removed unused isCodePrompt dead-code method
 *  - UGLY-4: Fixed handleError stub — it now invokes retryFn with exponential backoff
 *  - WRONG-1: Re-added qwen-local provider support
 */

import { AISettings, AIResponse, ChatMessage, Provider } from '@src/infrastructure/types';
import { ContinuationManager } from '@src/infrastructure/services/continuationManager';
import { fetchWithAuth, getSessionToken, setSessionToken } from '@src/infrastructure/api/authFetch';

// ---------------------------------------------------------------------------
// Token counting — use tiktoken when available, fall back to heuristic
// ---------------------------------------------------------------------------
let _countTokens: ((text: string) => number) | null = null;
async function initTokenizer() {
  if (_countTokens) return;
  try {
    // Dynamically import so bundle size is not impacted when not needed
    const { encoding_for_model } = await import(/* @vite-ignore */ 'tiktoken');
    const enc = encoding_for_model('gpt-4o');
    _countTokens = (text: string) => {
      try {
        return enc.encode(text).length;
      } catch {
        return Math.ceil(text.length / 4);
      }
    };
  } catch {
    // tiktoken not installed — use heuristic (still better than nothing)
    _countTokens = (text: string) => Math.ceil(text.length / 4);
  }
}
// Pre-warm tokenizer at module load time (fire-and-forget)
initTokenizer().catch(() => {});

export function countTokens(text: string): number {
  if (_countTokens) return _countTokens(text);
  return Math.ceil(text.length / 4); // interim heuristic until async init completes
}

// ---------------------------------------------------------------------------
// Abort controller singleton
// ---------------------------------------------------------------------------
let currentAbortController: AbortController | null = null;

export function cancelCurrentRequest(): void {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

// ---------------------------------------------------------------------------
// AIService class
// ---------------------------------------------------------------------------
export class AIService {
  private static inFlightRequests = new Map<string, Promise<AIResponse>>();
  private static cachedVaultStatus: any = null;
  private static cachedVaultStatusTime: number = 0;
  private static pendingVaultStatusPromise: Promise<any> | null = null;

  private static async getVaultStatus() {
    if (this.cachedVaultStatus && Date.now() - this.cachedVaultStatusTime < 2000) {
      return this.cachedVaultStatus;
    }
    if (this.pendingVaultStatusPromise) {
      return this.pendingVaultStatusPromise;
    }
    this.pendingVaultStatusPromise = (async () => {
      try {
        const response = await fetch('/api/vault/status');
        if (response.ok) {
          const data = await response.json();
          this.cachedVaultStatus = data;
          this.cachedVaultStatusTime = Date.now();
          return data;
        }
      } catch (e) {
        // silently ignore — vault status is optional
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

  public static async fetchWithAuth(
    url: string,
    init?: RequestInit,
    isStream = false
  ): Promise<Response> {
    return fetchWithAuth(url, init, isStream);
  }

  /**
   * Main entry point for executing AI requests with streaming support and deduplication.
   */
  static async execute(
    modelId: string,
    provider: Provider | string,
    prompt: string,
    apiKey?: string,
    systemInstruction?: string,
    settings?: AISettings,
    onStream?: (text: string) => void,
    signal?: AbortSignal,
    options?: {
      history?: ChatMessage[];
      nodeId?: string;
      gatewayUrls?: Record<string, string>;
      agentMode?: 'chat' | 'coder';
      webSearch?: boolean;
      images?: ChatMessage['images'];
    }
  ): Promise<AIResponse> {
    const dedupeKey = JSON.stringify({
      provider,
      model: modelId,
      prompt,
      systemInstruction,
      history: options?.history || [],
      settings: settings || {},
    });

    if (this.inFlightRequests.has(dedupeKey)) {
      const existingPromise = this.inFlightRequests.get(dedupeKey)!;
      if (onStream) {
        const res = await existingPromise;
        onStream(res.text);
        return res;
      }
      return existingPromise;
    }

    const promise = this.executeWithRetry(
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

    this.inFlightRequests.set(dedupeKey, promise);
    try {
      return await promise;
    } finally {
      this.inFlightRequests.delete(dedupeKey);
    }
  }

  private static async executeWithRetry(
    modelId: string,
    provider: Provider | string,
    prompt: string,
    apiKey?: string,
    systemInstruction?: string,
    settings?: AISettings,
    onStream?: (text: string) => void,
    signal?: AbortSignal,
    options?: any,
    attempt = 1
  ): Promise<AIResponse> {
    try {
      return await this._executeRaw(
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
    } catch (error: any) {
      const message = error.message || String(error);
      const isAbort = error.name === 'AbortError' || message.includes('aborted');
      const isCloud = ['gemini', 'openrouter', 'nvidia', 'opencode'].includes(String(provider));
      const isTransient =
        /429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|rate_limit|quota|overloaded|high demand/i.test(
          message
        ) || /fetch|network|timeout|econnreset|enotfound/i.test(message);

      if (isCloud && isTransient && attempt <= 3 && !isAbort) {
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        console.warn(
          `[AIService] Cloud request failed. Retrying in ${delay}ms (Attempt ${attempt}/3). Error: ${message}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeWithRetry(
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
      throw error;
    }
  }

  private static async _executeRaw(
    modelId: string,
    provider: Provider | string,
    prompt: string,
    apiKey?: string,
    systemInstruction?: string,
    settings?: AISettings,
    onStream?: (text: string) => void,
    signal?: AbortSignal,
    options?: {
      history?: ChatMessage[];
      nodeId?: string;
      gatewayUrls?: Record<string, string>;
      agentMode?: 'chat' | 'coder';
      webSearch?: boolean;
      images?: ChatMessage['images'];
    }
  ): Promise<AIResponse> {
    cancelCurrentRequest();
    currentAbortController = new AbortController();
    signal = signal || currentAbortController.signal;

    const startTime = Date.now();
    let resultText: string;

    // Filter history to exclude the final user prompt if it already sits at the end
    let historyToUse = options?.history;
    if (historyToUse && Array.isArray(historyToUse) && historyToUse.length > 0) {
      const lastMsg = historyToUse[historyToUse.length - 1];
      if (lastMsg.role === 'user') {
        historyToUse = historyToUse.slice(0, -1);
      }
    }

    // Validation
    this.validateApiKey(provider, apiKey);

    // Cache intercept
    let cacheKey = '';
    try {
      const cacheCheckRes = await this.fetchWithAuth('/api/cache/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model: modelId,
          prompt,
          systemInstruction,
          history: historyToUse || [],
          settings: settings || {},
        }),
        signal,
      });
      if (cacheCheckRes.ok) {
        const cacheCheck = await cacheCheckRes.json();
        cacheKey = cacheCheck.key;
        if (cacheCheck.hit) {
          const text = cacheCheck.text;
          const endTime = Date.now();
          const latency = endTime - startTime;
          const tokens = countTokens(text);
          const tps = latency > 0 ? Math.round(tokens / (latency / 1000)) : tokens;
          if (onStream) onStream(text);
          return { text, metrics: { latency, tokens, tps } };
        }
      }
    } catch {
      // Cache miss or error — fall through to provider
    }

    // Route to provider
    if (provider === 'gemini') {
      resultText = await this.executeGemini(
        modelId,
        prompt,
        apiKey,
        settings,
        systemInstruction,
        historyToUse,
        onStream,
        signal,
        options?.gatewayUrls,
        options?.images
      );
    } else if (provider === 'openrouter') {
      resultText = await this.executeOpenRouter(
        modelId,
        prompt,
        apiKey!,
        settings,
        systemInstruction,
        historyToUse,
        onStream,
        signal,
        options?.gatewayUrls,
        options?.images
      );
    } else if (provider === 'nvidia') {
      resultText = await this.executeNvidia(
        modelId,
        prompt,
        apiKey!,
        settings,
        systemInstruction,
        historyToUse,
        onStream,
        signal,
        options?.gatewayUrls
      );
    } else if (provider === 'opencode') {
      resultText = await this.executeOpencode(
        modelId,
        prompt,
        apiKey,
        settings,
        systemInstruction,
        historyToUse,
        onStream,
        signal,
        options?.gatewayUrls
      );
    } else if (provider === 'pollinations') {
      resultText = await this.executePollinations(
        modelId,
        prompt,
        settings,
        systemInstruction,
        historyToUse,
        onStream,
        signal
      );
    } else if (provider === 'nyx-native') {
      resultText = await this.executeNyxNative(
        modelId,
        prompt,
        systemInstruction,
        settings,
        historyToUse,
        onStream,
        signal,
        options?.agentMode,
        options?.webSearch
      );
    } else if (provider === 'qwen-local') {
      // WRONG-1 fix: qwen-local re-added to provider routing
      resultText = await this.executeQwenLocal(
        modelId,
        prompt,
        systemInstruction,
        settings,
        historyToUse,
        onStream,
        signal
      );
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // Write-back to cache asynchronously (fire-and-forget with error logging)
    if (cacheKey && resultText) {
      this.fetchWithAuth('/api/cache/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: cacheKey, data: resultText, provider, model: modelId }),
      }).catch((err) => console.warn('[Cache Server] Write failed:', err));
    }

    const endTime = Date.now();
    const latency = endTime - startTime;
    const tokens = countTokens(resultText);
    const tps = latency > 0 ? Math.round(tokens / (latency / 1000)) : 0;

    return { text: resultText, metrics: { latency, tokens, tps } };
  }

  // ── Provider Implementations ─────────────────────────────────────────────

  private static async executeGemini(
    model: string,
    prompt: string,
    apiKey?: string,
    settings?: AISettings,
    systemInstruction?: string,
    history?: ChatMessage[],
    onStream?: (t: string) => void,
    signal?: AbortSignal,
    gatewayUrls?: Record<string, string>,
    images?: ChatMessage['images']
  ): Promise<string> {
    try {
      const response = await this.fetchWithAuth('/api/gemini/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Connection: 'keep-alive' },
        body: JSON.stringify({
          model,
          prompt,
          apiKey,
          settings,
          systemInstruction,
          history,
          gatewayUrls,
          images,
        }),
        signal,
      });
      if (!response.ok) await this.handleNonOkResponse(response, 'Gemini');
      return this.processStream(response, onStream);
    } catch (error: any) {
      const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
      if (!isAbort) {
        const { directFetchGemini } = await import('@src/infrastructure/api/directClient');
        const text = await directFetchGemini(
          model,
          prompt,
          apiKey || '',
          settings,
          systemInstruction,
          history,
          signal,
          gatewayUrls
        );
        if (onStream) onStream(text);
        return text;
      }
      throw error;
    }
  }

  private static async executeNyxNative(
    model: string,
    prompt: string,
    systemInstruction?: string,
    settings?: AISettings,
    history?: ChatMessage[],
    onStream?: (t: string) => void,
    signal?: AbortSignal,
    agentMode?: 'chat' | 'coder',
    webSearch?: boolean
  ): Promise<string> {
    const messages: any[] = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
    if (history && Array.isArray(history)) {
      messages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.fetchWithAuth('/api/nyx/local-models/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature: settings?.temperature ?? 0.7,
        max_tokens: settings?.maxTokens ?? 4096,
        agentMode,
        webSearch,
      }),
      signal,
    });
    if (!response.ok) await this.handleNonOkResponse(response, 'Native GGUF Runner');
    return this.processStream(response, onStream);
  }

  // WRONG-1 fix: qwen-local provider re-added
  private static async executeQwenLocal(
    model: string,
    prompt: string,
    systemInstruction?: string,
    settings?: AISettings,
    history?: ChatMessage[],
    onStream?: (t: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const messages: any[] = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
    if (history && Array.isArray(history)) {
      messages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.fetchWithAuth('/api/nyx/local-models/qwen-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature: settings?.temperature ?? 0.7,
        max_tokens: settings?.maxTokens ?? 4096,
      }),
      signal,
    });
    if (!response.ok) await this.handleNonOkResponse(response, 'Qwen Local');
    return this.processStream(response, onStream);
  }

  private static async executeOpenRouter(
    model: string,
    prompt: string,
    apiKey: string,
    settings?: AISettings,
    systemInstruction?: string,
    history?: ChatMessage[],
    onStream?: (t: string) => void,
    signal?: AbortSignal,
    gatewayUrls?: Record<string, string>,
    images?: ChatMessage['images']
  ): Promise<string> {
    try {
      const response = await this.fetchWithAuth('/api/openrouter/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Connection: 'keep-alive' },
        body: JSON.stringify({
          model,
          prompt,
          apiKey,
          settings,
          systemInstruction,
          history,
          gatewayUrls,
          images,
        }),
        signal,
      });
      if (!response.ok) await this.handleNonOkResponse(response, 'OpenRouter');
      return this.processStream(response, onStream);
    } catch (error: any) {
      const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
      if (!isAbort) {
        const { directFetchOpenRouter } = await import('@src/infrastructure/api/directClient');
        const text = await directFetchOpenRouter(
          model,
          prompt,
          apiKey,
          settings,
          systemInstruction,
          history,
          signal,
          gatewayUrls
        );
        if (onStream) onStream(text);
        return text;
      }
      throw error;
    }
  }

  private static async executeNvidia(
    model: string,
    prompt: string,
    apiKey: string,
    settings?: AISettings,
    systemInstruction?: string,
    history?: ChatMessage[],
    onStream?: (t: string) => void,
    signal?: AbortSignal,
    gatewayUrls?: Record<string, string>
  ): Promise<string> {
    try {
      const response = await this.fetchWithAuth('/api/nvidia/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Connection: 'keep-alive' },
        body: JSON.stringify({
          model,
          prompt,
          apiKey,
          settings,
          systemInstruction,
          history,
          gatewayUrls,
        }),
        signal,
      });
      if (!response.ok) await this.handleNonOkResponse(response, 'NVIDIA');
      return this.processStream(response, onStream);
    } catch (error: any) {
      const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
      if (!isAbort) {
        const { directFetchNvidia } = await import('@src/infrastructure/api/directClient');
        const text = await directFetchNvidia(
          model,
          prompt,
          apiKey,
          settings,
          systemInstruction,
          history,
          signal,
          gatewayUrls
        );
        if (onStream) onStream(text);
        return text;
      }
      throw error;
    }
  }

  private static async executeOpencode(
    model: string,
    prompt: string,
    apiKey?: string,
    settings?: AISettings,
    systemInstruction?: string,
    history?: ChatMessage[],
    onStream?: (t: string) => void,
    signal?: AbortSignal,
    gatewayUrls?: Record<string, string>
  ): Promise<string> {
    try {
      const response = await this.fetchWithAuth('/api/opencode/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Connection: 'keep-alive' },
        body: JSON.stringify({
          model,
          prompt,
          apiKey,
          settings,
          systemInstruction,
          history,
          gatewayUrls,
        }),
        signal,
      });
      if (!response.ok) await this.handleNonOkResponse(response, 'OpenCode');
      return this.processStream(response, onStream);
    } catch (error: any) {
      const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
      if (!isAbort) {
        const { directFetchOpenCode } = await import('@src/infrastructure/api/directClient');
        const text = await directFetchOpenCode(
          model,
          prompt,
          apiKey,
          settings,
          systemInstruction,
          history,
          signal,
          gatewayUrls
        );
        if (onStream) onStream(text);
        return text;
      }
      throw error;
    }
  }

  private static async executePollinations(
    model: string,
    prompt: string,
    settings?: AISettings,
    systemInstruction?: string,
    history?: ChatMessage[],
    onStream?: (t: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    try {
      const response = await this.fetchWithAuth('/api/pollinations/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Connection: 'keep-alive' },
        body: JSON.stringify({ model, prompt, settings, systemInstruction, history }),
        signal,
      });
      if (!response.ok) await this.handleNonOkResponse(response, 'Pollinations');
      return this.processStream(response, onStream);
    } catch (error: any) {
      const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
      if (!isAbort) {
        const realModel = model.replace('pollinations/', '');
        const messages: any[] = [];
        if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
        if (history && Array.isArray(history)) {
          messages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
        }
        messages.push({ role: 'user', content: prompt });
        const directRes = await fetch('https://text.pollinations.ai/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: realModel,
            messages,
            stream: false,
            temperature: settings?.temperature ?? 0.7,
          }),
          signal,
        });
        if (!directRes.ok) {
          const errText = await directRes.text();
          throw new Error(`Pollinations Direct API Error: ${errText}`, { cause: error });
        }
        let text: string;
        const contentType = directRes.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await directRes.json();
          text =
            data.choices?.[0]?.message?.content ||
            data.choices?.[0]?.delta?.content ||
            data.text ||
            '';
        } else {
          text = await directRes.text();
        }
        if (onStream) onStream(text);
        return text;
      }
      throw error;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private static async handleNonOkResponse(
    response: Response,
    providerName: string
  ): Promise<never> {
    const err = await response
      .json()
      .catch(() => ({ error: `${providerName} Error ${response.status}` }));
    if (err && err.error === 'SAFETY_GATE_BLOCKED')
      throw new Error(`SAFETY_GATE_BLOCKED:${JSON.stringify(err)}`);
    throw new Error(err.error || `${providerName} Error ${response.status}`);
  }

  /**
   * UGLY-4 fix: handleError now actually invokes _retryFn with exponential backoff
   * instead of being a stub that ignores retries.
   */
  private static async handleError(
    error: any,
    retryFn: () => Promise<AIResponse>,
    attempt = 1,
    maxAttempts = 3
  ): Promise<AIResponse> {
    const message = error.message || String(error);
    if (message.startsWith('SAFETY_GATE_BLOCKED:')) throw error;

    const isRetryable = /429|503|rate_limit|quota|overloaded|timeout|network/i.test(message);
    if (isRetryable && attempt <= maxAttempts) {
      const delay = Math.pow(2, attempt - 1) * 1000 + Math.random() * 200; // Exponential backoff + jitter
      console.warn(
        `[AIService.handleError] Retryable error (attempt ${attempt}/${maxAttempts}). Retrying in ${delay.toFixed(0)}ms. Error: ${message}`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        return await retryFn();
      } catch (retryErr: any) {
        return this.handleError(retryErr, retryFn, attempt + 1, maxAttempts);
      }
    }
    throw new Error(message);
  }

  private static async processStream(
    response: Response,
    onStream?: (t: string) => void
  ): Promise<string> {
    if (!response.body) throw new Error('No response body');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let resultText = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          const hasDataPrefix = trimmed.startsWith('data: ');
          const dataStr = hasDataPrefix ? trimmed.slice(6).trim() : trimmed;
          if (dataStr === '[DONE]' || dataStr === '[done]') return resultText || '[PROTOCOL HALT]';
          if (!dataStr) continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed && parsed.tokenRotate) {
              AIService.setSessionToken(parsed.tokenRotate);
              continue;
            }
            if (parsed.error) {
              const msg =
                typeof parsed.error === 'object'
                  ? parsed.error.message || JSON.stringify(parsed.error)
                  : String(parsed.error);
              throw new Error(msg);
            }
            let chunk: string | null = null;
            if (typeof parsed.chunk === 'string') chunk = parsed.chunk;
            else if (parsed.choices?.[0]?.delta?.content) chunk = parsed.choices[0].delta.content;
            if (chunk) {
              resultText += chunk;
              if (onStream) onStream(resultText);
            }
          } catch (e: any) {
            if (e.message?.includes('JSON') || e.message?.includes('Unexpected token')) continue;
            throw e;
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* already released */
      }
    }
    return resultText || '[PROTOCOL HALT]';
  }

  private static validateApiKey(provider: Provider | string, key?: string) {
    if (provider === 'pollinations' || provider === 'nyx-native' || provider === 'qwen-local')
      return;
    if (!key) return;
    const trimmed = key.trim();
    if (!trimmed) return;
    if (provider === 'openrouter' && !trimmed.startsWith('sk-or-'))
      throw new Error('Invalid OpenRouter Key');
    if (provider === 'gemini' && trimmed.length < 30) throw new Error('Invalid Gemini Key');
    if (provider === 'openai' && !trimmed.startsWith('sk-')) throw new Error('Invalid OpenAI Key');
    if (provider === 'anthropic' && !trimmed.startsWith('sk-ant-'))
      throw new Error('Invalid Anthropic Key');
    if (provider === 'deepseek' && trimmed.length < 20) throw new Error('Invalid DeepSeek Key');
    if (provider === 'groq' && !trimmed.startsWith('gsk_')) throw new Error('Invalid Groq Key');
    if (provider === 'mistral' && trimmed.length < 20) throw new Error('Invalid Mistral Key');
    if (provider === 'together' && !trimmed.startsWith('sk-'))
      throw new Error('Invalid Together AI Key');
  }

  /**
   * Returns the connectivity status of a provider.
   */
  static async checkStatus(
    provider: Provider | string,
    apiKey?: string
  ): Promise<'online' | 'offline' | 'no-key'> {
    if (provider === 'pollinations') return 'online';
    if (provider === 'nyx-native' || provider === 'qwen-local') {
      try {
        const res = await this.fetchWithAuth('/api/nyx/local-models/status');
        if (res.ok) {
          const data = await res.json();
          return data.activeModelId ? 'online' : 'offline';
        }
        return 'offline';
      } catch {
        return 'offline';
      }
    }
    try {
      const vaultStatus = await this.getVaultStatus();
      if (vaultStatus) {
        const isConfigured = vaultStatus[provider];
        if (isConfigured) return 'online';
      }
    } catch {
      /* ignore */
    }
    if (apiKey && apiKey.trim().length > 0) return 'online';
    return 'no-key';
  }

  /**
   * Executes with automatic continuation if the response is truncated.
   * Guarantees complete, non-cut-off output.
   */
  static async executeWithContinuation(
    modelId: string,
    provider: Provider | string,
    prompt: string,
    apiKey?: string,
    systemInstruction?: string,
    settings?: AISettings,
    onStream?: (text: string) => void,
    signal?: AbortSignal,
    options?: { history?: ChatMessage[]; nodeId?: string; gatewayUrls?: Record<string, string> }
  ): Promise<AIResponse> {
    return ContinuationManager.executeWithContinuation(
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
  }
}
