/**
 * @file src/core/services/ai.service.ts
 * @description Unified service for interacting with local and remote AI models.
 */

import { AISettings, AIResponse, ChatMessage, Provider } from '../types';

let currentAbortController: AbortController | null = null;

export function cancelCurrentRequest(): void {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

export class AIService {
  private static sessionToken: string | null = null;
  private static tokenExpiresAt: number = 0;

  static setSessionToken(token: string | null): void {
    this.sessionToken = token;
  }

  static getSessionToken(): string | null {
    return this.sessionToken;
  }

  private static async getOrFetchSessionToken(isStream = false): Promise<string> {
    if (isStream) {
      const res = await fetch('/api/vault/token?stream=true');
      const data = await res.json();
      return data.token;
    }
    if (this.sessionToken && Date.now() < this.tokenExpiresAt - 10000) {
      return this.sessionToken;
    }
    const res = await fetch('/api/vault/token');
    const data = await res.json();
    this.sessionToken = data.token;
    this.tokenExpiresAt = data.expiresAt || (Date.now() + 5 * 60 * 1000);
    return this.sessionToken;
  }

  public static async fetchWithAuth(url: string, init?: RequestInit, isStream = false): Promise<Response> {
    const token = await this.getOrFetchSessionToken(isStream);
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('x-nyx-session-token', token);
    const response = await fetch(url, {
      ...init,
      headers
    });

    if (response.status === 401) {
      // Clear cached session token to force a refresh on the next request
      this.sessionToken = null;
      this.tokenExpiresAt = 0;
    }

    return response;
  }

  /**
   * Main entry point for executing AI requests with streaming support.
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
    options?: { history?: ChatMessage[]; nodeId?: string; gatewayUrls?: Record<string, string> }
  ): Promise<AIResponse> {
    cancelCurrentRequest();
    currentAbortController = new AbortController();
    signal = signal || currentAbortController.signal;

    const startTime = Date.now();
    let resultText = "";
    
    // ── Validation ──────────────────────────────────────────────────────────
    this.validateApiKey(provider, apiKey);

    // ── Cache Server Intercept ──────────────────────────────────────────────
    let cacheKey = "";
    try {
      const cacheCheckRes = await this.fetchWithAuth('/api/cache/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model: modelId,
          prompt,
          systemInstruction,
          history: options?.history || [],
          settings: settings || {}
        }),
        signal
      });
      if (cacheCheckRes.ok) {
        const cacheCheck = await cacheCheckRes.json();
        cacheKey = cacheCheck.key;
        if (cacheCheck.hit) {
          const text = cacheCheck.text;
          const endTime = Date.now();
          const latency = endTime - startTime;
          const tokens = Math.floor(text.length / 4);
          // Cache hits are near-instant — show actual round-trip ms, TPS from token count
          const tps = latency > 0 ? Math.round(tokens / (latency / 1000)) : tokens;
          if (onStream) onStream(text);
          return {
            text,
            metrics: {
              latency,
              tokens,
              tps
            }
          };
        }
      }
    } catch (e) {
      console.warn('[Cache Server] Check failed, falling back to direct API:', e);
    }

    try {
      if (provider === 'gemini') {
        resultText = await this.executeGemini(modelId, prompt, apiKey, settings, systemInstruction, options?.history, onStream, signal, options?.gatewayUrls);
      } else if (provider === 'openrouter') {
        resultText = await this.executeOpenRouter(modelId, prompt, apiKey!, settings, systemInstruction, options?.history, onStream, signal, options?.gatewayUrls);
      } else if (provider === 'nvidia') {
        resultText = await this.executeNvidia(modelId, prompt, apiKey!, settings, systemInstruction, options?.history, onStream, signal, options?.gatewayUrls);
      } else if (provider === 'opencode') {
        resultText = await this.executeOpencode(modelId, prompt, apiKey, settings, systemInstruction, options?.history, onStream, signal, options?.gatewayUrls);
      } else if (provider === 'pollinations') {
        resultText = await this.executePollinations(modelId, prompt, settings, systemInstruction, options?.history, onStream, signal);
      } else if (provider === 'nyx-native') {
        resultText = await this.executeNyxNative(modelId, prompt, systemInstruction, settings, options?.history, onStream, signal);
      } else if (provider === 'qwen-local') {
        resultText = await this.executeQwenLocal(modelId, prompt, systemInstruction, settings, options?.history, onStream, signal);
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }

      // Write-back to the Cache Server asynchronously
      if (cacheKey && resultText) {
        this.fetchWithAuth('/api/cache/set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: cacheKey,
            data: resultText,
            provider,
            model: modelId
          })
        }).catch(err => console.warn('[Cache Server] Write failed:', err));
      }

      const endTime = Date.now();
      const latency = endTime - startTime;
      const tokens = Math.floor(resultText.length / 4); // Heuristic: ~4 chars per token
      const tps = latency > 0 ? Math.round(tokens / (latency / 1000)) : 0;
      
      return {
        text: resultText,
        metrics: {
          latency,
          tokens,
          tps
        }
      };
    } catch (error: any) {
      return this.handleError(error, async () => {
        return this.execute(modelId, provider, prompt, apiKey, systemInstruction, settings, onStream, signal, options);
      });
    }
  }

  // ── Provider Specific Implementations ────────────────────────────────────

  private static async executeGemini(
    model: string, prompt: string, apiKey?: string, settings?: AISettings, 
    systemInstruction?: string, history?: ChatMessage[], onStream?: (t: string) => void, signal?: AbortSignal,
    gatewayUrls?: Record<string, string>
  ): Promise<string> {
    try {
      const response = await this.fetchWithAuth('/api/gemini/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
        body: JSON.stringify({ model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls }),
        signal,
      });

      if (!response.ok) {
        await this.handleNonOkResponse(response, 'Gemini');
      }
      return this.processStream(response, onStream);
    } catch (error: any) {
      const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
      if (!isAbort) {
        console.warn('[AIService] Gemini stream proxy failed, falling back to direct browser fetch:', error);
        const { directFetchGemini } = await import('@/src/lib/api/directClient');
        const text = await directFetchGemini(model, prompt, apiKey, settings, systemInstruction, history, signal, gatewayUrls);
        if (onStream) onStream(text);
        return text;
      }
      throw error;
    }
  }



  private static async executeQwenLocal(
    model: string,
    prompt: string,
    systemInstruction?: string,
    settings?: AISettings,
    history?: ChatMessage[],
    onStream?: (t: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const response = await this.fetchWithAuth('/api/qwen-local/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt,
        history,
        systemInstruction,
        settings
      }),
      signal
    });

    if (!response.ok) {
      await this.handleNonOkResponse(response, 'Local Qwen Server');
    }

    return this.processStream(response, onStream);
  }

  private static async executeNyxNative(
    model: string,
    prompt: string,
    systemInstruction?: string,
    settings?: AISettings,
    history?: ChatMessage[],
    onStream?: (t: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const messages: any[] = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
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
        max_tokens: settings?.maxTokens ?? 2048,
        stream: true
      }),
      signal,
    });

    if (!response.ok) {
      await this.handleNonOkResponse(response, 'Native GGUF Runner');
    }

    return this.processStream(response, onStream);
  }

  private static async executeOpenRouter(
    model: string, prompt: string, apiKey: string, settings?: AISettings, 
    systemInstruction?: string, history?: ChatMessage[], onStream?: (t: string) => void, signal?: AbortSignal,
    gatewayUrls?: Record<string, string>
  ): Promise<string> {
    try {
      const response = await this.fetchWithAuth('/api/openrouter/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
        body: JSON.stringify({ model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls }),
        signal,
      });

      if (!response.ok) {
        await this.handleNonOkResponse(response, 'OpenRouter');
      }
      return this.processStream(response, onStream);
    } catch (error: any) {
      const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
      if (!isAbort) {
        console.warn('[AIService] OpenRouter stream proxy failed, falling back to direct browser fetch:', error);
        const { directFetchOpenRouter } = await import('@/src/lib/api/directClient');
        const text = await directFetchOpenRouter(model, prompt, apiKey, settings, systemInstruction, history, signal, gatewayUrls);
        if (onStream) onStream(text);
        return text;
      }
      throw error;
    }
  }

  private static async executeNvidia(
    model: string, prompt: string, apiKey: string, settings?: AISettings, 
    systemInstruction?: string, history?: ChatMessage[], onStream?: (t: string) => void, signal?: AbortSignal,
    gatewayUrls?: Record<string, string>
  ): Promise<string> {
    // NVIDIA NIM models - requires API key
    try {
      const response = await this.fetchWithAuth('/api/nvidia/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
        body: JSON.stringify({ model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls }),
        signal,
      });

      if (!response.ok) {
        await this.handleNonOkResponse(response, 'NVIDIA');
      }
      return this.processStream(response, onStream);
    } catch (error: any) {
      const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
      if (!isAbort) {
        console.warn('[AIService] NVIDIA stream proxy failed, falling back to direct browser fetch:', error);
        const { directFetchNvidia } = await import('@/src/lib/api/directClient');
        const text = await directFetchNvidia(model, prompt, apiKey, settings, systemInstruction, history, signal, gatewayUrls);
        if (onStream) onStream(text);
        return text;
      }
      throw error;
    }
  }

  private static async executeOpencode(
    model: string, prompt: string, apiKey?: string, settings?: AISettings, 
    systemInstruction?: string, history?: ChatMessage[], onStream?: (t: string) => void, signal?: AbortSignal,
    gatewayUrls?: Record<string, string>
  ): Promise<string> {
    try {
      const response = await this.fetchWithAuth('/api/opencode/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
        body: JSON.stringify({ model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls }),
        signal,
      });

      if (!response.ok) {
        await this.handleNonOkResponse(response, 'OpenCode');
      }
      return this.processStream(response, onStream);
    } catch (error: any) {
      const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
      if (!isAbort) {
        console.warn('[AIService] OpenCode stream proxy failed, falling back to direct browser fetch:', error);
        const { directFetchOpenCode } = await import('@/src/lib/api/directClient');
        const text = await directFetchOpenCode(model, prompt, apiKey, settings, systemInstruction, history, signal, gatewayUrls);
        if (onStream) onStream(text);
        return text;
      }
      throw error;
    }
  }

  private static async executePollinations(
    model: string, prompt: string, settings?: AISettings, 
    systemInstruction?: string, history?: ChatMessage[], onStream?: (t: string) => void, signal?: AbortSignal
  ): Promise<string> {
    try {
      const response = await this.fetchWithAuth('/api/pollinations/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
        body: JSON.stringify({ model, prompt, settings, systemInstruction, history }),
        signal,
      });

      if (!response.ok) {
        await this.handleNonOkResponse(response, 'Pollinations');
      }
      return this.processStream(response, onStream);
    } catch (error: any) {
      const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
      if (!isAbort) {
        console.warn('[AIService] Pollinations stream proxy failed, falling back to direct browser fetch:', error);
        
        const realModel = model.replace('pollinations/', '');
        const messages: any[] = [];
        if (systemInstruction) {
          messages.push({ role: 'system', content: systemInstruction });
        }
        if (history && Array.isArray(history)) {
          messages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
        }
        messages.push({ role: 'user', content: prompt });

        const directRes = await fetch('https://text.pollinations.ai/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: realModel,
            messages,
            stream: false,
            temperature: settings?.temperature ?? 0.7,
          }),
          signal,
        });

        if (!directRes.ok) {
          const directErrText = await directRes.text();
          throw new Error(`Pollinations Direct API Error: ${directErrText}`);
        }

        let text = '';
        const contentType = directRes.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await directRes.json();
          text = data.choices?.[0]?.message?.content || data.choices?.[0]?.delta?.content || data.text || '';
        } else {
          text = await directRes.text();
        }

        if (onStream) onStream(text);
        return text;
      }
      throw error;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private static async handleNonOkResponse(response: Response, providerName: string): Promise<never> {
    const err = await response.json().catch(() => ({ error: `${providerName} Error ${response.status}` }));
    if (err && err.error === 'SAFETY_GATE_BLOCKED') {
      throw new Error(`SAFETY_GATE_BLOCKED:${JSON.stringify(err)}`);
    }
    throw new Error(err.error || `${providerName} Error ${response.status}`);
  }

  private static async processStream(response: Response, onStream?: (t: string) => void): Promise<string> {
  if (!response.body) throw new Error("No response body");
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let resultText = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith(":")) continue;
        
        // Check for "data: " prefix
        const hasDataPrefix = trimmed.startsWith("data: ");
        const dataStr = hasDataPrefix ? trimmed.slice(6).trim() : trimmed;
        
        // Handle [DONE] sentinel
        if (dataStr === "[DONE]" || dataStr === "[done]") {
          return resultText || "[PROTOCOL HALT]";
        }
        
        // Skip empty data
        if (!dataStr) continue;
        
        // Try to parse JSON safely
        try {
          const parsed = JSON.parse(dataStr);
          
          // Intercept token rotation events
          if (parsed && parsed.tokenRotate) {
            AIService.setSessionToken(parsed.tokenRotate);
            continue;
          }

          // Check for error
          if (parsed.error) {
            const msg = typeof parsed.error === 'object' 
              ? (parsed.error.message || JSON.stringify(parsed.error))
              : String(parsed.error);
            throw new Error(msg);
          }
          
          // Extract content from various formats
          let chunk: string | null = null;
          
          // Unified format: { chunk: "..." }
          if (typeof parsed.chunk === 'string') {
            chunk = parsed.chunk;
          }
          // OpenAI format: { choices: [{ delta: { content: "..." } }] }
          else if (parsed.choices?.[0]?.delta?.content) {
            chunk = parsed.choices[0].delta.content;
          }

          
          if (chunk) {
            resultText += chunk;
            if (onStream) onStream(resultText);
          }
        } catch (e: any) {
          // Skip JSON parse errors silently - partial chunks are common in SSE
          if (e.message?.includes('JSON') || e.message?.includes('Unexpected token')) {
            continue;
          }
          // Re-throw non-parse errors
          throw e;
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Lock may already be released
    }
  }
  
  return resultText || "[PROTOCOL HALT]";
}

  private static validateApiKey(provider: Provider | string, key?: string) {
    if (provider === 'pollinations' || provider === 'nyx-native' || provider === 'qwen-local') return;
    // If no key is provided, let the backend vault validation handle auth
    if (!key) return;
    if (key) {
      const trimmed = key.trim();
      if (!trimmed) return;
      if (provider === 'openrouter' && !trimmed.startsWith('sk-or-')) throw new Error("Invalid OpenRouter Key");
      if (provider === 'gemini' && trimmed.length < 30) throw new Error("Invalid Gemini Key");
      if (provider === 'openai' && !trimmed.startsWith('sk-')) throw new Error("Invalid OpenAI Key");
      if (provider === 'anthropic' && !trimmed.startsWith('sk-ant-')) throw new Error("Invalid Anthropic Key");
      if (provider === 'deepseek' && trimmed.length < 20) throw new Error("Invalid DeepSeek Key");
      if (provider === 'groq' && !trimmed.startsWith('gsk_')) throw new Error("Invalid Groq Key");
      if (provider === 'mistral' && trimmed.length < 20) throw new Error("Invalid Mistral Key");
      if (provider === 'together' && !trimmed.startsWith('sk-')) throw new Error("Invalid Together AI Key");
    }
  }

  private static async handleError(error: any, retryFn: () => Promise<AIResponse>): Promise<AIResponse> {
    const message = error.message || String(error);
    if (message.startsWith('SAFETY_GATE_BLOCKED:')) {
      throw error;
    }
    const isTransient = /429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|rate_limit|quota|overloaded|high demand/.test(message);
    
    // For now, we skip auto-retry logic in this service layer to keep it pure, 
    // or we could implement a controlled retry here if requested.
    // Given original logic had retryCount < 2, I'll let the feature hook handle retries 
    // or wrap it if strictly needed.
    
    throw new Error(message);
  }

  /**
   * Returns the connectivity status of a provider.
   */
  static async checkStatus(provider: Provider | string, apiKey?: string): Promise<'online' | 'offline' | 'no-key'> {
    if (provider === 'pollinations') return 'online';
    if (provider === 'nyx-native') {
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
    if (provider === 'qwen-local') {
      try {
        const response = await fetch('http://127.0.0.1:3002/health').catch(() => null);
        return (response && response.ok) ? 'online' : 'offline';
      } catch {
        return 'offline';
      }
    }



    // Check cloud provider via server vault configuration status
    try {
      const response = await fetch('/api/vault/status');
      if (response.ok) {
        const vaultStatus = await response.json();
        const isConfigured = vaultStatus[provider];
        if (isConfigured) return 'online';
      }
    } catch (e) {
      console.warn('[AIService] Failed to check status via vault status:', e);
    }

    // Fallback: check if apiKey is passed in (local in-memory settings check)
    if (apiKey && apiKey.trim().length > 0) {
      return 'online';
    }

    return 'no-key';
  }

  /**
   * Returns true if the prompt is asking for code generation.
   */
  static isCodePrompt(prompt: string): boolean {
    const p = prompt.toLowerCase().trim();
    if (prompt.trim().startsWith('CODE: ')) return true;
    const strongKeywords = [
      'generate code', 'write code', 'write a function', 'write a class',
      'implement a function', 'implement a class', 'implement an algorithm',
      'debug this code', 'refactor this', 'fix this code', 'fix the bug',
      'code snippet', 'python script', 'javascript function', 'typescript',
      'sql query', 'bash script', 'shell script', 'html template',
      'css style', 'react component', 'react hook', 'api endpoint',
      'rest api', 'graphql', 'dockerfile', 'kubernetes', 'terraform',
      'unit test', 'test case', 'pseudocode', 'time complexity', 'space complexity',
      'big o', 'recursion', 'data structure', 'linked list', 'binary tree',
      'sorting algorithm', 'merge sort', 'quick sort'
    ];
    if (strongKeywords.some(kw => p.includes(kw))) return true;
    if (/```[\w]*\n/.test(prompt)) return true;
    const langPattern = /\b(python|javascript|typescript|java|c\+\+|c#|rust|golang|ruby|php|swift|kotlin|scala)\b/;
    const taskPattern = /\b(write|implement|create|build|code|function|class|script|program)\b/;
    if (langPattern.test(p) && taskPattern.test(p)) return true;
    return false;
  }
}
