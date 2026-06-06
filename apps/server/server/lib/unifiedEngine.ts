// @ts-nocheck
import { LOCAL_MODEL_PORT } from '@nyx/shared';
import { env } from '../config/env.js';
import { Gateway } from './gateway.js';
import logger from './logger.js';

export interface ModelSettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface StreamChunk {
  chunk?: string;
  choices?: Array<{ delta: { content: string } }>;
  token?: string;
  error?: string;
}

export interface ExecuteOptions {
  provider: string;
  model: string;
  messages: Array<{ role: string; content: string; images?: any[] }>;
  settings?: ModelSettings;
  apiKey?: string;
  customGatewayUrls?: Record<string, string>;
  tools?: any[];
}

// Circuit Breaker & Coalescing State
const circuitBreakers: Record<string, { failures: number; nextTry: number }> = {};
const activeRequests: Record<string, Promise<void>> = {};

export class UnifiedEngine {
  private static checkCircuit(provider: string): void {
    const cb = circuitBreakers[provider];
    if (cb && cb.failures >= 3 && Date.now() < cb.nextTry) {
      throw new Error(`Circuit breaker active for ${provider}. Retry after ${new Date(cb.nextTry).toISOString()}`);
    }
  }

  private static recordFailure(provider: string): void {
    if (!circuitBreakers[provider]) {
      circuitBreakers[provider] = { failures: 0, nextTry: 0 };
    }
    circuitBreakers[provider].failures++;
    if (circuitBreakers[provider].failures >= 3) {
      circuitBreakers[provider].nextTry = Date.now() + 30000; // 30s timeout
    }
  }

  private static recordSuccess(provider: string): void {
    if (circuitBreakers[provider]) {
      circuitBreakers[provider].failures = 0;
      circuitBreakers[provider].nextTry = 0;
    }
  }

  static async executeStream(
    options: ExecuteOptions,
    onChunk: (chunk: StreamChunk) => void,
    onComplete: () => void
  ): Promise<void> {
    const { provider, model, messages, settings, apiKey, customGatewayUrls, tools } = options;

    this.checkCircuit(provider);

    // Request Coalescing (prevent duplicate identical requests simultaneously)
    const requestKey = `${provider}:${model}:${JSON.stringify(messages)}`;
    if (activeRequests[requestKey]) {
      logger.info({ requestKey }, 'Coalescing identical request');
      return activeRequests[requestKey];
    }

    const promise = (async () => {
      let lastError: any;
      const maxRetries = 3;
      
      for (let i = 0; i < maxRetries; i++) {
        try {
          switch (provider) {
            case 'gemini':
              await this.streamGemini(model, messages, apiKey || '', settings, customGatewayUrls, tools, onChunk, onComplete);
              break;
            case 'nyx-native':
              await this.streamLocal(model, messages, settings, onChunk, onComplete);
              break;
            default:
              throw new Error(`Unsupported provider: ${provider}`);
          }
          this.recordSuccess(provider);
          delete activeRequests[requestKey];
          return;
        } catch (error: any) {
          lastError = error;
          const message = error.message || String(error);
          const isTransient = /429|502|503|504|RESOURCE_EXHAUSTED|UNAVAILABLE|timeout/i.test(message);
          const isNonRetryable = /400|401|403|404|key|auth|unauthorized/i.test(message);

          if (isTransient && !isNonRetryable && i < maxRetries - 1) {
            const delay = Math.min(1000 * Math.pow(2, i), 10000);
            logger.warn(`[UnifiedEngine] Retry ${i + 1}/${maxRetries} for ${provider} in ${delay}ms: ${message}`);
            onChunk({ chunk: `\n\n[System: Connection failed. Retrying in ${delay / 1000}s...]\n\n` });
            await new Promise(r => setTimeout(r, delay));
          } else {
            break;
          }
        }
      }
      
      this.recordFailure(provider);
      onChunk({ error: lastError?.message || 'Unknown error' });
      onComplete();
      delete activeRequests[requestKey];
      throw lastError;
    })();

    activeRequests[requestKey] = promise;
    return promise;
  }

  private static async streamGemini(
    model: string,
    messages: any[],
    apiKey: string,
    settings: any,
    customGatewayUrls: Record<string, string> | undefined,
    tools: any[] | undefined,
    onChunk: (chunk: StreamChunk) => void,
    onComplete: () => void
  ) {
    const { url } = Gateway.buildUrl('gemini', `/models/${model}:streamGenerateContent?alt=sse`, customGatewayUrls, model);
    
    const authResult = Gateway.validateAuth('gemini', model, apiKey);
    if (!authResult.valid) {
      throw new Error(authResult.error);
    }
    
    const activeKey = Gateway.getActiveKey('gemini', apiKey);
    const finalUrl = `${url}&key=${activeKey}`;

    const formatted = Gateway.formatMessages(messages, 'gemini');

    const requestBody: any = {
      contents: formatted.contents,
      generationConfig: {
        temperature: settings?.temperature ?? 0.7,
        maxOutputTokens: settings?.maxTokens ?? 4096,
        topP: settings?.topP ?? 1.0,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    } else {
      requestBody.tools = [{ googleSearch: {} }];
    }

    if (formatted.systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: formatted.systemInstruction }],
      };
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 60000); // 60s timeout

    try {
      const response = await fetch(finalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`Gemini API Error: ${response.status} ${response.statusText}`);
      }

      await Gateway.processSSEStream(response, {
        onChunk: (data: any) => {
          if (typeof data === 'string') {
            onChunk({ chunk: data });
          } else if (data.functionCall) {
            onChunk({ chunk: JSON.stringify(data.functionCall) });
          }
        },
        onDone: onComplete,
        onError: (err) => { throw new Error(err); }
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private static async checkOllama(model: string): Promise<boolean> {
    try {
      const res = await fetch('http://127.0.0.1:11434/api/tags', {
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) {
        const data = await res.json();
        return data.models?.some((m: any) => m.name === model || m.name.includes(model));
      }
    } catch {}
    return false;
  }

  private static async checkLMStudio(model: string): Promise<boolean> {
    try {
      const res = await fetch('http://127.0.0.1:1234/v1/models', {
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) {
        const data = await res.json();
        return data.data?.some((m: any) => m.id === model || m.id.includes(model));
      }
    } catch {}
    return false;
  }

  private static async streamLocal(
    model: string,
    messages: any[],
    settings: any,
    onChunk: (chunk: StreamChunk) => void,
    onComplete: () => void
  ) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 60000);

    try {
      // 1. Check Ollama
      if (await this.checkOllama(model)) {
        const response = await fetch('http://127.0.0.1:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            options: {
              temperature: settings?.temperature ?? 0.7,
              num_predict: settings?.maxTokens ?? 4096,
              top_p: settings?.topP ?? 1.0,
            },
            stream: true,
          }),
          signal: abortController.signal
        });
        
        await Gateway.processSSEStream(response, {
          onChunk: (data: any) => {
            if (typeof data === 'string') onChunk({ chunk: data });
            else if (data.message?.content) onChunk({ chunk: data.message.content });
          },
          onDone: onComplete,
          onError: (err) => { throw new Error(err); }
        });
        return;
      }

      // 2. Check LM Studio
      if (await this.checkLMStudio(model)) {
        const response = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            temperature: settings?.temperature ?? 0.7,
            max_tokens: settings?.maxTokens ?? 4096,
            top_p: settings?.topP ?? 1.0,
            stream: true,
          }),
          signal: abortController.signal
        });
        
        await Gateway.processSSEStream(response, {
          onChunk: (data: any) => {
            if (typeof data === 'string') onChunk({ chunk: data });
            else if ((data as any).choices?.[0]?.delta?.content) onChunk({ chunk: (data as any).choices[0].delta.content });
          },
          onDone: onComplete,
          onError: (err) => { throw new Error(err); }
        });
        return;
      }

      // 3. Fallback to our own llama-server
      let LLAMA_PORT = env.LLAMA_PORT || LOCAL_MODEL_PORT;
      try {
        const runner = await import('../../server/features/local-models/localModelRunner.js');
        if (runner && (runner as any).getLlamaPort) {
          LLAMA_PORT = (runner as any).getLlamaPort();
        }
      } catch (e) {}

      const response = await fetch(`http://127.0.0.1:${LLAMA_PORT}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: this.formatPrompt(messages),
          temperature: settings?.temperature ?? 0.7,
          n_predict: settings?.maxTokens ?? 4096,
          stream: true,
        }),
        signal: abortController.signal
      });

      await Gateway.processSSEStream(response, {
        onChunk: (data: any) => {
          if (typeof data === 'string') onChunk({ chunk: data });
          else if (data.content) onChunk({ chunk: data.content });
        },
        onDone: onComplete,
        onError: (err) => { throw new Error(err); }
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private static formatPrompt(messages: any[]): string {
    return (
      messages
        .map((m) => {
          if (m.role === 'system') return `<|system|>\n${m.content}`;
          if (m.role === 'user') return `<|user|>\n${m.content}`;
          return `<|assistant|>\n${m.content}`;
        })
        .join('\n') + '\n<|assistant|>\n'
    );
  }
}
