/**
 * @file src/core/services/ai.service.ts
 * @description Unified service for interacting with local and remote AI models.
 */

import { AISettings, AIResponse, ChatMessage, Provider } from '../types';

export class AIService {
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
    options?: { lmStudioBaseUrl?: string; ollamaBaseUrl?: string; history?: ChatMessage[]; nodeId?: string; gatewayUrls?: Record<string, string> }
  ): Promise<AIResponse> {
    const startTime = Date.now();
    let resultText = "";
    
    // ── Validation ──────────────────────────────────────────────────────────
    this.validateApiKey(provider, apiKey);

    // ── Cache Server Intercept ──────────────────────────────────────────────
    let cacheKey = "";
    try {
      const cacheCheckRes = await fetch('/api/cache/get', {
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
      } else if (provider === 'ollama') {
        resultText = await this.executeOllama(modelId, prompt, systemInstruction, settings, options?.ollamaBaseUrl, options?.history, options?.nodeId, onStream, signal);
      } else if (provider === 'openrouter') {
        resultText = await this.executeOpenRouter(modelId, prompt, apiKey!, settings, systemInstruction, options?.history, onStream, signal, options?.gatewayUrls);
      } else if (provider === 'nvidia') {
        resultText = await this.executeNvidia(modelId, prompt, apiKey!, settings, systemInstruction, options?.history, onStream, signal, options?.gatewayUrls);
      } else if (provider === 'opencode') {
        resultText = await this.executeOpencode(modelId, prompt, apiKey, settings, systemInstruction, options?.history, onStream, signal, options?.gatewayUrls);
      } else if (provider === 'pollinations') {
        resultText = await this.executePollinations(modelId, prompt, settings, systemInstruction, options?.history, onStream, signal);
      } else if (provider === 'lmstudio') {
        resultText = await this.executeLMStudio(modelId, prompt, systemInstruction, settings, options?.lmStudioBaseUrl, options?.history, options?.nodeId, onStream, signal);
      } else if (provider === 'nyx-native') {
        resultText = await this.executeNyxNative(modelId, prompt, systemInstruction, settings, options?.history, onStream, signal);
      } else if (provider === 'qwen-local') {
        resultText = await this.executeQwenLocal(modelId, prompt, systemInstruction, settings, options?.history, onStream, signal);
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }

      // Write-back to the Cache Server asynchronously
      if (cacheKey && resultText) {
        fetch('/api/cache/set', {
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
      const response = await fetch('/api/gemini/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
        body: JSON.stringify({ model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls }),
        signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `Gemini Error ${response.status}` }));
        throw new Error(err.error || `Gemini Error ${response.status}`);
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

  private static async executeOllama(
    model: string, prompt: string, systemInstruction?: string, settings?: AISettings, 
    baseUrl?: string, history?: ChatMessage[], nodeId?: string, onStream?: (t: string) => void, signal?: AbortSignal
  ): Promise<string> {
    const { ollamaChat } = await import('@/src/lib/api/ollamaClient');
    let resultText = "";

    return new Promise((resolve, reject) => {
      ollamaChat({
        nodeId: nodeId ?? model,
        model, prompt, systemInstruction, settings, history, baseUrl,
        onChunk: (_, accumulated) => {
          resultText = accumulated;
          if (onStream) onStream(accumulated);
        },
        onDone: () => resolve(resultText),
        onError: (msg) => reject(new Error(msg))
      });

      if (signal) {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      }
    });
  }

  private static async executeLMStudio(
    model: string, prompt: string, systemInstruction?: string, settings?: AISettings, 
    baseUrl?: string, history?: ChatMessage[], nodeId?: string, onStream?: (t: string) => void, signal?: AbortSignal
  ): Promise<string> {
    const { lmStudioChat } = await import('@/src/lib/api/lmStudioClient');
    let resultText = "";

    return new Promise((resolve, reject) => {
      lmStudioChat({
        nodeId: nodeId ?? model,
        model, prompt, systemInstruction, settings, history, baseUrl,
        onChunk: (_, accumulated) => {
          resultText = accumulated;
          if (onStream) onStream(accumulated);
        },
        onDone: () => resolve(resultText),
        onError: (msg) => reject(new Error(msg))
      });

      if (signal) {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      }
    });
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
    const response = await fetch('/api/qwen-local/stream', {
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
      const err = await response.json().catch(() => ({ error: `Local Qwen Server Error ${response.status}` }));
      throw new Error(err.error || `Local Qwen Server Error ${response.status}. Make sure the Python server is running on port 3002.`);
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

    const response = await fetch('/api/nyx/local-models/chat', {
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
      const err = await response.json().catch(() => ({ error: `Native GGUF Runner Error ${response.status}` }));
      throw new Error(err.error || `Native GGUF Runner Error ${response.status}. Make sure the model is loaded in RAM.`);
    }

    return this.processStream(response, onStream);
  }

  private static async executeOpenRouter(
    model: string, prompt: string, apiKey: string, settings?: AISettings, 
    systemInstruction?: string, history?: ChatMessage[], onStream?: (t: string) => void, signal?: AbortSignal,
    gatewayUrls?: Record<string, string>
  ): Promise<string> {
    try {
      const response = await fetch('/api/openrouter/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
        body: JSON.stringify({ model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls }),
        signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `OpenRouter Error ${response.status}` }));
        throw new Error(err.error || `OpenRouter Error ${response.status}`);
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
      const response = await fetch('/api/nvidia/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
        body: JSON.stringify({ model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls }),
        signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `NVIDIA Error ${response.status}` }));
        throw new Error(err.error || `NVIDIA Error ${response.status}`);
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
      const response = await fetch('/api/opencode/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
        body: JSON.stringify({ model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls }),
        signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `OpenCode Error ${response.status}` }));
        throw new Error(err.error || `OpenCode Error ${response.status}`);
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
      const response = await fetch('/api/pollinations/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
        body: JSON.stringify({ model, prompt, settings, systemInstruction, history }),
        signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `Pollinations Error ${response.status}` }));
        throw new Error(err.error || `Pollinations Error ${response.status}`);
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
          // Ollama chat: { message: { content: "..." } }
          else if (parsed.message?.content) {
            chunk = parsed.message.content;
          }
          // Ollama generate: { response: "..." }
          else if (typeof parsed.response === 'string') {
            chunk = parsed.response;
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
    if (!['ollama', 'lmstudio', 'opencode', 'nyx-native', 'gemini', 'qwen-local'].includes(provider) && !key) {
      throw new Error(`${provider} API key is required. Add it in Settings.`);
    }
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
  static async checkStatus(provider: Provider | string, apiKey?: string, options?: { lmStudioBaseUrl?: string, ollamaBaseUrl?: string }): Promise<'online' | 'offline' | 'no-key'> {
    if (provider === 'pollinations') return 'online';
    if (provider === 'nyx-native') {
      try {
        const res = await fetch('/api/nyx/local-models/status');
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
    // 1. Check for missing keys first (except for local providers and opencode)
    if (!['ollama', 'lmstudio', 'opencode', 'nyx-native', 'qwen-local'].includes(provider) && !apiKey) {
      return 'no-key';
    }

    try {
      if (provider === 'ollama') {
        const baseUrl = options?.ollamaBaseUrl || 'http://localhost:11434';
        try {
          // Try direct fetch first (fastest)
          const response = await fetch(`${baseUrl}/api/tags`, { mode: 'no-cors' });
          // with no-cors we can't check ok, but if it doesn't throw, it's likely up
          return 'online';
        } catch {
          // Try Fastify proxy as fallback
          const proxyResponse = await fetch(`/api/fastify/ollama/models?baseUrl=${encodeURIComponent(baseUrl)}`);
          return proxyResponse.ok ? 'online' : 'offline';
        }
      } 
      
      if (provider === 'lmstudio') {
        const baseUrl = options?.lmStudioBaseUrl || 'http://localhost:1234';
        try {
          // LM Studio via Fastify
          const proxyResponse = await fetch(`/api/fastify/lmstudio/models?baseUrl=${encodeURIComponent(baseUrl)}`);
          return proxyResponse.ok ? 'online' : 'offline';
        } catch {
          return 'offline';
        }
      }

      if (provider === 'nvidia') {
        // NVIDIA NIM - requires API key
        return apiKey ? 'online' : 'no-key';
      }

      // 2. For cloud providers, validate the key format
      if (apiKey) {
        try {
          this.validateApiKey(provider, apiKey);
          return 'online'; 
        } catch {
          return 'no-key';
        }
      }

      return 'no-key';
    } catch {
      return 'offline';
    }
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
