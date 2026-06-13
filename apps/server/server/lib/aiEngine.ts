/**
 * @file server/lib/unifiedEngine.ts
 * @description Unified streaming execution engine using the Gateway service.
 */

import { Gateway, Provider, ChatMessage, AISettings } from './gateway.js';
import { env } from '../config/env.js';
import { ABSTENTION_INSTRUCTION, resolveRealGeminiModel } from './modelUtils.js';
import { resolveThinkingBudget } from './thinkingBudget.js';

// ── Ollama keep-alive: prevents cold-start latency by keeping models loaded ─────
// The interval uses .unref() so it won't prevent clean Node.js shutdown.
const OLLAMA_KEEPALIVE_URL = 'http://127.0.0.1:11434/api/tags';
setInterval(async () => {
  try {
    const res = await fetch(OLLAMA_KEEPALIVE_URL, { signal: AbortSignal.timeout(2_000) });
    await res.text(); // Consume the body to release the connection back to the pool
  } catch {
    // Ollama not running — silent, expected
  }
}, 30_000).unref();

import { SmartRouter } from './router.js';
import { loadKeys } from '../features/vault/vault.service.js';
import { compressPrompt } from '../features/prompts/compression.js';
import { workerPool } from './workers/workerPool.js';

export type { Provider, ChatMessage, AISettings } from './gateway.js';



export interface UnifiedRequest {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  settings?: AISettings;
  apiKey?: string;
  baseUrl?: string;
  signal?: AbortSignal;
  customGatewayUrls?: Record<string, string>;
  tools?: any[];
  cachedContent?: string;
}

export class AIEngine {
  /**
   * Routes streaming request to appropriate provider handler.
   */
  static async stream(
    req: UnifiedRequest & { provider: Provider },
    writeChunk: (chunk: any) => void,
    onDone: () => void
  ): Promise<void> {
    const { provider, model, messages, settings, apiKey, customGatewayUrls, tools, cachedContent } = req;

    switch (provider) {
      case 'gemini':
        return this.streamGemini(
          model,
          messages,
          apiKey || '',
          settings,
          customGatewayUrls,
          tools,
          cachedContent,
          req.signal,
          writeChunk,
          onDone
        );

      case 'ollama':
        return this.streamOllama(model, messages, settings, req.signal, tools, writeChunk, onDone);

      case 'lmstudio':
        return this.streamLMStudio(model, messages, settings, req.signal, tools, writeChunk, onDone);

      case 'antigravity-sdk':
        return this.streamAntigravitySdk(model, messages, apiKey || '', req.signal, writeChunk, onDone);

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  // ─── Provider-specific streamers ───────────────────────────────────────────


  /**
   * Streams responses from Gemini using Google's generative language API.
   * Supports system instructions and Gemini-specific generation config.
   * @param model - Gemini model identifier (e.g., 'gemini-2.5-flash')
   * @param messages - Array of chat messages
   * @param apiKey - Gemini API key
   * @param settings - Optional generation settings
   * @param write - Callback for writing chunks to response
   * @param done - Callback when stream completes
   */
  private static async streamGemini(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    settings: AISettings | undefined,
    customGatewayUrls: Record<string, string> | undefined,
    tools: any[] | undefined,
    cachedContent: string | undefined,
    signal: AbortSignal | undefined,
    write: (chunk: any) => void,
    done: () => void
  ): Promise<void> {
    const realModel = resolveRealGeminiModel(model);
    const { url } = Gateway.buildUrl(
      'gemini',
      `/models/${realModel}:streamGenerateContent?alt=sse&key=${apiKey}`,
      customGatewayUrls
    );
    const { contents, systemInstruction } = Gateway.formatMessages(messages, 'gemini');

    let response: Response | null = null;
    let retries = 3;
    let delay = 1000;
    
    while (retries >= 0) {
      const isGemma = realModel.toLowerCase().includes('gemma');
      const requestBody: any = {
        contents,
        generationConfig: {
          temperature: settings?.temperature ?? 0.1,
          // Gemma models: no cap — let the API use the model's native maximum output.
          // Other Gemini models default to 8192 to prevent runaway costs.
          maxOutputTokens: isGemma ? undefined : (settings?.maxTokens ?? 8192),
          topP: settings?.topP ?? 0.9,
          topK: settings?.topK ?? 20,
        },
        tools: tools && tools.length > 0 ? tools : undefined,
        cachedContent: cachedContent ? cachedContent : undefined,
      };

      // Enable thinking tokens for Gemini 2.5+ models (non-Gemma)
      const supportsThinking = realModel.includes('2.5') || realModel.includes('3.1-pro') || realModel.includes('3.5');
      if (supportsThinking && !isGemma) {
        requestBody.generationConfig = {
          ...requestBody.generationConfig,
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: settings?.thinkingBudget ?? resolveThinkingBudget(
              messages[messages.length - 1]?.content || ''
            ),
          },
        };
      }

      if (!isGemma) {
        requestBody.systemInstruction = systemInstruction
          ? { role: 'system', parts: [{ text: systemInstruction + '\n\n' + ABSTENTION_INSTRUCTION }] }
          : { role: 'system', parts: [{ text: ABSTENTION_INSTRUCTION }] };
      } else if (systemInstruction || ABSTENTION_INSTRUCTION) {
        // Manually prepend to the first user message
        const combinedSystem = (systemInstruction ? systemInstruction + '\n\n' : '') + ABSTENTION_INSTRUCTION;
        if (contents.length > 0 && contents[0].role === 'user') {
          contents[0].parts[0].text = `System Instruction:\n${combinedSystem}\n\n${contents[0].parts[0].text}`;
        } else {
          contents.unshift({ role: 'user', parts: [{ text: `System Instruction:\n${combinedSystem}` }] });
          if (contents.length > 1 && contents[1].role === 'user') {
            contents.splice(1, 0, { role: 'model', parts: [{ text: 'Acknowledged.' }] });
          }
        }
      }

      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // fallow-ignore-next-line code-duplication
        body: JSON.stringify(requestBody),
        signal,
      });

      if (response.ok) break;

      if ((response.status === 503 || response.status === 429) && retries > 0) {
        retries--;
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }

      const errorText = await response.text().catch(() => '');
      throw new Error(`Gemini API Error: ${response.status} ${errorText}`);
    }

    if (!response || !response.ok) {
      throw new Error(`Gemini API Error: ${response?.status}`);
    }

    await Gateway.processSSEStream(response, {
      onChunk: (data) => {
        if (typeof data === 'string') {
          write({ chunk: data });
        } else if (data && typeof data === 'object') {
          if (data.thinking) {
            // Pass thinking content as a thinking chunk
            write({ type: 'thinking', content: data.thinking });
          } else if (data.functionCall) {
            write({ tool_call: data.functionCall });
          } else {
            write(data);
          }
        }
      },
      onDone: done,
      onError: (err) => {
        throw new Error(err);
      },
    });
  }

  /**
   * Streams responses from the Python Antigravity SDK service.
   */
  private static async streamAntigravitySdk(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    signal: AbortSignal | undefined,
    write: (chunk: any) => void,
    done: () => void
  ): Promise<void> {
    const port = env.ANTIGRAVITY_PORT || 3003;
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    const prompt = lastUserMessage ? lastUserMessage.content : '';

    const response = await fetch(`http://127.0.0.1:${port}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // fallow-ignore-next-line code-duplication
      body: JSON.stringify({ prompt, model, apiKey }),
      signal,
    });

    if (!response.ok) throw new Error(`Antigravity SDK Error: ${response.status}`);

    await Gateway.processSSEStream(response, {
      onChunk: (data) => {
        if (typeof data === 'string') {
          write({ chunk: data });
        } else if (data && typeof data === 'object') {
          if (data.functionCall) write({ tool_call: data.functionCall });
          else write(data);
        }
      },
      onDone: done,
      onError: (err) => {
        throw new Error(err);
      },
    });
  }

  /**
   * Creates a Gemini cached content entry for a large system prompt.
   * This allows reusing the prefix computation across multiple requests.
   * @returns cacheId string or null if caching failed/unavailable
   */
  static async createCachedContent(
    systemContent: string,
    apiKey: string,
    model: string = 'gemini-3.5-flash',
    ttlSeconds: number = 3600
  ): Promise<string | null> {
    // Minimum 32K tokens to make caching worthwhile (~128K chars)
    if (!apiKey || systemContent.length < 4096) return null;
    try {
      const { resolveRealGeminiModel } = await import('./modelUtils.js');
      const realModel = resolveRealGeminiModel(model);
      const url = `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`;
      const body = {
        model: `models/${realModel}`,
        contents: [{ role: 'user', parts: [{ text: systemContent }] }],
        ttl: `${ttlSeconds}s`,
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      return data.name || null;
    } catch {
      return null;
    }
  }

  /**
   * Streams responses from a local Ollama instance (OpenAI-compatible API).
   */
  private static async streamOllama(
    model: string,
    messages: ChatMessage[],
    settings: AISettings | undefined,
    signal: AbortSignal | undefined,
    tools: any[] | undefined,
    write: (chunk: any) => void,
    done: () => void
  ): Promise<void> {
    // Strip provider prefix if present (e.g. "ollama/llama3" → "llama3")
    const cleanModel = model.replace(/^ollama\//, '');

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 600000);
    
    if (signal) {
      signal.addEventListener('abort', () => abortController.abort());
    }

    try {
      const formattedMessages = Gateway.formatMessages(messages, 'ollama');
      const response = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cleanModel,
          messages: formattedMessages,
          stream: true,
          temperature: settings?.temperature ?? 0.7,
          max_tokens: settings?.maxTokens ?? 4096,
          top_p: settings?.topP ?? 1.0,
          tools: tools && tools.length > 0 ? tools : undefined,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama API Error: ${response.status} ${response.statusText}. Ensure Ollama is running on port 11434.`);
      }

      await Gateway.processSSEStream(response, {
        onChunk: (data) => {
          if (typeof data === 'string') {
            write({ chunk: data });
          } else if (data && typeof data === 'object') {
            // Gemini-style functionCall
            if (data.functionCall) {
              write({ tool_call: data.functionCall });
            // OpenAI-style tool_calls array (Ollama)
            } else if (data.tool_calls && Array.isArray(data.tool_calls)) {
              for (const tc of data.tool_calls) {
                write({ tool_call: { name: tc.function?.name, args: tc.function?.arguments } });
              }
            } else {
              write(data);
            }
          }
        },
        onDone: done,
        onError: (err) => { throw new Error(err); },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Streams responses from a local LM Studio instance (OpenAI-compatible API).
   */
  private static async streamLMStudio(
    model: string,
    messages: ChatMessage[],
    settings: AISettings | undefined,
    signal: AbortSignal | undefined,
    tools: any[] | undefined,
    write: (chunk: any) => void,
    done: () => void
  ): Promise<void> {
    // Strip provider prefix if present (e.g. "lmstudio/publisher/model" → "publisher/model")
    const cleanModel = model.replace(/^lmstudio\//, '');

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 600000);

    if (signal) {
      signal.addEventListener('abort', () => abortController.abort());
    }

    try {
      const lmstudioPort = process.env.LMSTUDIO_PORT || '1234';
      const formattedMessages = Gateway.formatMessages(messages, 'lmstudio');
      const response = await fetch(`http://127.0.0.1:${lmstudioPort}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cleanModel,
          messages: formattedMessages,
          stream: true,
          temperature: settings?.temperature ?? 0.7,
          max_tokens: settings?.maxTokens ?? 4096,
          top_p: settings?.topP ?? 1.0,
          tools: tools && tools.length > 0 ? tools : undefined,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`LM Studio API Error: ${response.status} ${response.statusText}. Ensure LM Studio server is running on port ${lmstudioPort}.`);
      }

      await Gateway.processSSEStream(response, {
        onChunk: (data) => {
          if (typeof data === 'string') {
            write({ chunk: data });
          } else if (data && typeof data === 'object') {
            if (data.functionCall) write({ tool_call: data.functionCall });
            else write(data);
          }
        },
        onDone: done,
        onError: (err) => { throw new Error(err); },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export { UnifiedEngine } from './unifiedEngine.js';
