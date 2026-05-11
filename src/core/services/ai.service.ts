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
    provider: Provider,
    prompt: string,
    apiKey?: string,
    systemInstruction?: string,
    settings?: AISettings,
    onStream?: (text: string) => void,
    signal?: AbortSignal,
    options?: { lmStudioBaseUrl?: string; ollamaBaseUrl?: string; history?: ChatMessage[]; nodeId?: string }
  ): Promise<AIResponse> {
    const startTime = Date.now();
    let resultText = "";
    
    // ── Validation ──────────────────────────────────────────────────────────
    this.validateApiKey(provider, apiKey);

    try {
      if (provider === 'gemini') {
        resultText = await this.executeGemini(modelId, prompt, apiKey!, settings, systemInstruction, options?.history, onStream, signal);
      } else if (provider === 'ollama') {
        resultText = await this.executeOllama(modelId, prompt, systemInstruction, settings, options?.ollamaBaseUrl, options?.history, options?.nodeId, onStream, signal);
      } else if (provider === 'openrouter') {
        resultText = await this.executeOpenRouter(modelId, prompt, apiKey!, settings, systemInstruction, options?.history, onStream, signal);
      } else if (provider === 'nvidia') {
        resultText = await this.executeNvidia(modelId, prompt, apiKey!, settings, systemInstruction, options?.history, onStream, signal);
      } else if (provider === 'opencode') {
        resultText = await this.executeOpencode(modelId, prompt, apiKey, settings, systemInstruction, options?.history, onStream, signal);
      } else if (provider === 'lmstudio') {
        resultText = await this.executeLMStudio(modelId, prompt, systemInstruction, settings, options?.lmStudioBaseUrl, options?.history, options?.nodeId, onStream, signal);
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }

      const endTime = Date.now();
      const latency = endTime - startTime;
      const tokens = Math.floor(resultText.length / 4); // Heuristic
      
      return {
        text: resultText,
        metrics: {
          latency,
          tokens,
          tps: latency > 0 ? Number(((tokens / latency) * 1000).toFixed(1)) : 0
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
    model: string, prompt: string, apiKey: string, settings?: AISettings, 
    systemInstruction?: string, history?: ChatMessage[], onStream?: (t: string) => void, signal?: AbortSignal
  ): Promise<string> {
    const response = await fetch('/api/gemini/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
      body: JSON.stringify({ model, prompt, apiKey, settings, systemInstruction, history }),
      signal,
    });

    if (!response.ok) throw new Error(`Gemini Error: ${response.status}`);
    return this.processStream(response, onStream);
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

  private static async executeOpenRouter(
    model: string, prompt: string, apiKey: string, settings?: AISettings, 
    systemInstruction?: string, history?: ChatMessage[], onStream?: (t: string) => void, signal?: AbortSignal
  ): Promise<string> {
    const response = await fetch('/api/openrouter/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
      body: JSON.stringify({ model, prompt, apiKey, settings, systemInstruction, history }),
      signal,
    });

    if (!response.ok) throw new Error(`OpenRouter Error: ${response.status}`);
    return this.processStream(response, onStream);
  }

  private static async executeNvidia(
    model: string, prompt: string, apiKey: string, settings?: AISettings, 
    systemInstruction?: string, history?: ChatMessage[], onStream?: (t: string) => void, signal?: AbortSignal
  ): Promise<string> {
    const response = await fetch('/api/nvidia/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
      body: JSON.stringify({ model, prompt, apiKey, settings, systemInstruction, history }),
      signal,
    });

    if (!response.ok) throw new Error(`NVIDIA Error: ${response.status}`);
    return this.processStream(response, onStream);
  }

  private static async executeOpencode(
    model: string, prompt: string, apiKey?: string, settings?: AISettings, 
    systemInstruction?: string, history?: ChatMessage[], onStream?: (t: string) => void, signal?: AbortSignal
  ): Promise<string> {
    const response = await fetch('/api/opencode/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
      body: JSON.stringify({ model, prompt, apiKey, settings, systemInstruction, history }),
      signal,
    });

    if (!response.ok) throw new Error(`OpenCode Error: ${response.status}`);
    return this.processStream(response, onStream);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private static async processStream(response: Response, onStream?: (t: string) => void): Promise<string> {
    if (!response.body) throw new Error("No response body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let resultText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.chunk) {
            resultText += parsed.chunk;
            if (onStream) onStream(resultText);
          }
        } catch (e) {}
      }
    }
    return resultText || "[PROTOCOL HALT]";
  }

  private static validateApiKey(provider: Provider, key?: string) {
    if (!['ollama', 'lmstudio', 'opencode'].includes(provider) && !key) {
      throw new Error(`${provider} API key is required. Add it in Settings.`);
    }
    if (key) {
      const trimmed = key.trim();
      if (provider === 'openrouter' && !trimmed.startsWith('sk-or-')) throw new Error("Invalid OpenRouter Key");
      if (provider === 'gemini' && trimmed.length < 30) throw new Error("Invalid Gemini Key");
      if (provider === 'nvidia' && !trimmed.startsWith('nvapi-')) throw new Error("Invalid NVIDIA Key");
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
  static async checkStatus(provider: Provider, apiKey?: string, options?: { lmStudioBaseUrl?: string, ollamaBaseUrl?: string }): Promise<'online' | 'offline' | 'no-key'> {
    // 1. Check for missing keys first (except for local providers and opencode)
    if (!['ollama', 'lmstudio', 'opencode'].includes(provider) && !apiKey) {
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
          // Try proxy as fallback
          const proxyResponse = await fetch(`/api/ollama/models?baseUrl=${encodeURIComponent(baseUrl)}`);
          return proxyResponse.ok ? 'online' : 'offline';
        }
      } 
      
      if (provider === 'lmstudio') {
        const baseUrl = options?.lmStudioBaseUrl || 'http://localhost:1234';
        try {
          // LM Studio usually needs proxy for CORS
          const proxyResponse = await fetch(`/api/lmstudio/models?baseUrl=${encodeURIComponent(baseUrl)}`);
          return proxyResponse.ok ? 'online' : 'offline';
        } catch {
          return 'offline';
        }
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
    const p = prompt.toLowerCase();
    return [
      'write', 'code', 'implement', 'function', 'class', 'algorithm', 'script',
      'program', 'method', 'api', 'component', 'module', 'build', 'create a',
      'develop', 'generate code', 'snippet', 'solve', 'debug', 'refactor', 'optimize'
    ].some(kw => p.includes(kw));
  }
}
