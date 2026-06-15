/**
 * @file server/lib/unifiedEngine.ts
 * @description Unified streaming execution engine using the Gateway service.
 */

import { Gateway, Provider, ChatMessage, AISettings } from './gateway.js';
import { env } from '../config/env.js';
import { ABSTENTION_INSTRUCTION, resolveRealGeminiModel } from './modelUtils.js';
import { resolveThinkingBudget } from './thinkingBudget.js';
import { streamText, ModelMessage } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';

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

function mapMessagesToModelMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages.map((m) => {
    let role: 'system' | 'user' | 'assistant' | 'tool' = 'user';
    if (m.role === 'system') {
      role = 'system';
    } else if (m.role === 'assistant' || m.role === 'model') {
      role = 'assistant';
    } else if (m.role === 'user') {
      role = 'user';
    } else if (m.role === 'tool' || m.role === 'function') {
      role = 'tool';
    }

    if (role === 'tool') {
      const toolCallId = m.id || m.metadata?.toolCallId || 'call_default';
      const toolName = m.model || m.metadata?.toolName || 'tool';
      let result = m.content;
      try {
        if (typeof result === 'string' && (result.startsWith('{') || result.startsWith('['))) {
          result = JSON.parse(result);
        }
      } catch {}
      return {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId,
            toolName,
            result,
          } as any
        ]
      } as ModelMessage;
    }

    if (role === 'assistant') {
      if (m.toolCalls && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
        const contentParts: any[] = [];
        if (m.content) {
          contentParts.push({ type: 'text', text: m.content });
        }
        for (const tc of m.toolCalls) {
          contentParts.push({
            type: 'tool-call',
            toolCallId: tc.id || 'call_default',
            toolName: tc.name || tc.function?.name || 'tool',
            args: tc.args || tc.function?.arguments || {},
          });
        }
        return {
          role: 'assistant',
          content: contentParts,
        } as ModelMessage;
      }
    }

    if (m.images && Array.isArray(m.images) && m.images.length > 0) {
      const contentParts: any[] = [];
      if (m.content) {
        contentParts.push({ type: 'text', text: m.content });
      }
      for (const img of m.images) {
        if (img.data) {
          contentParts.push({
            type: 'image',
            image: img.data,
            mimeType: img.mimeType || 'image/jpeg',
          });
        } else if (img.url) {
          contentParts.push({
            type: 'image',
            image: new URL(img.url),
          });
        }
      }
      return {
        role,
        content: contentParts,
      } as ModelMessage;
    }

    return {
      role,
      content: m.content || '',
    } as ModelMessage;
  });
}




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

      case 'openai':
        return this.streamOpenAICompat(
          model, messages, settings, apiKey || '',
          'https://api.openai.com/v1',
          req.signal, tools, writeChunk, onDone
        );

      case 'groq':
        return this.streamOpenAICompat(
          model, messages, settings, apiKey || '',
          'https://api.groq.com/openai/v1',
          req.signal, tools, writeChunk, onDone
        );

      case 'together':
        return this.streamOpenAICompat(
          model, messages, settings, apiKey || '',
          'https://api.together.xyz/v1',
          req.signal, tools, writeChunk, onDone
        );

      case 'perplexity':
        return this.streamOpenAICompat(
          model, messages, settings, apiKey || '',
          'https://api.perplexity.ai',
          req.signal, tools, writeChunk, onDone
        );

      case 'anthropic':
        return this.streamAnthropic(
          model, messages, settings, apiKey || '',
          req.signal, writeChunk, onDone
        );

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
    const isGemma = realModel.toLowerCase().includes('gemma');

    const googleProvider = createGoogleGenerativeAI({
      apiKey,
      baseURL: customGatewayUrls?.['gemini'] || undefined,
    });

    const supportsThinking = realModel.includes('thinking') || ((realModel.includes('2.5') || realModel.includes('3.1-pro') || realModel.includes('3.5')) && !realModel.includes('flash'));

    const modelInstance = googleProvider(realModel);

    let finalMessages = [...messages];
    const systemInstruction = finalMessages.find((m) => m.role === 'system')?.content;
    const combinedSystem = (systemInstruction ? systemInstruction + '\n\n' : '') + ABSTENTION_INSTRUCTION;

    if (isGemma) {
      finalMessages = finalMessages.filter((m) => m.role !== 'system');
      if (finalMessages.length > 0 && finalMessages[0].role === 'user') {
        finalMessages[0] = {
          ...finalMessages[0],
          content: `System Instruction:\n${combinedSystem}\n\n${finalMessages[0].content}`,
        };
      } else {
        finalMessages.unshift({ role: 'user', content: `System Instruction:\n${combinedSystem}` });
      }
    } else {
      const systemIdx = finalMessages.findIndex((m) => m.role === 'system');
      if (systemIdx >= 0) {
        finalMessages[systemIdx] = {
          ...finalMessages[systemIdx],
          content: finalMessages[systemIdx].content + '\n\n' + ABSTENTION_INSTRUCTION,
        };
      } else {
        finalMessages.unshift({ role: 'system', content: ABSTENTION_INSTRUCTION });
      }
    }

    const coreMessages = mapMessagesToModelMessages(finalMessages);

    const sdkTools: Record<string, any> = {};
    if (tools && tools.length > 0 && !isGemma) {
      for (const t of tools) {
        const fn = t.function || t;
        if (fn && fn.name) {
          sdkTools[fn.name] = {
            description: fn.description || '',
            parameters: fn.parameters || { type: 'object', properties: {} },
          };
        }
      }
    }

    // Google Search Grounding Tool
    if (settings?.useGoogleSearch && !isGemma) {
      sdkTools['google_search'] = googleProvider.tools.googleSearch;
    }

    try {
      const result = await streamText({
        model: modelInstance,
        messages: coreMessages,
        temperature: settings?.temperature ?? 0.1,
        maxOutputTokens: isGemma ? undefined : (settings?.maxTokens ?? 8192),
        topP: settings?.topP ?? 0.9,
        topK: isGemma ? undefined : (settings?.topK ?? 20),
        abortSignal: signal,
        tools: Object.keys(sdkTools).length > 0 ? sdkTools : undefined,

        providerOptions: {
          google: {
            thinkingConfig: supportsThinking && !isGemma && !settings?.jsonMode ? {
              includeThoughts: true,
              thinkingBudget: settings?.thinkingBudget ?? resolveThinkingBudget(
                messages[messages.length - 1]?.content || ''
              ),
            } : undefined,
            cachedContent,
          }
        }
      });

      for await (const part of result.fullStream) {
        if (signal?.aborted) break;

        if (part.type === 'reasoning-delta') {
          write({ type: 'thinking', content: part.text });
        } else if (part.type === 'text-delta') {
          write({ chunk: part.text });
        } else if (part.type === 'tool-call') {
          write({ tool_call: { name: part.toolName, args: part.input } });
        }
      }

      done();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        done();
        return;
      }
      throw new Error(`Gemini API Error: ${err.message}`);
    }
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

  /**
   * Streams from any OpenAI-compatible endpoint (OpenAI, Groq, Together AI, Perplexity, Fireworks).
   */
  private static async streamOpenAICompat(
    model: string,
    messages: ChatMessage[],
    settings: AISettings | undefined,
    apiKey: string,
    baseUrl: string,
    signal: AbortSignal | undefined,
    tools: any[] | undefined,
    write: (chunk: any) => void,
    done: () => void
  ): Promise<void> {
    const openaiProvider = createOpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    const modelInstance = openaiProvider(model);
    const coreMessages = mapMessagesToModelMessages(messages);

    const sdkTools: Record<string, any> = {};
    if (tools && tools.length > 0) {
      for (const t of tools) {
        const fn = t.function || t;
        if (fn && fn.name) {
          sdkTools[fn.name] = {
            description: fn.description || '',
            parameters: fn.parameters || { type: 'object', properties: {} },
          };
        }
      }
    }

    try {
      const result = await streamText({
        model: modelInstance,
        messages: coreMessages,
        temperature: settings?.temperature ?? 0.7,
        maxOutputTokens: settings?.maxTokens ?? 4096,
        topP: settings?.topP ?? 1.0,
        abortSignal: signal,
        tools: Object.keys(sdkTools).length > 0 ? sdkTools : undefined,

      });

      for await (const part of result.fullStream) {
        if (signal?.aborted) break;

        if (part.type === 'text-delta') {
          write({ chunk: part.text });
        } else if (part.type === 'tool-call') {
          write({ tool_call: { name: part.toolName, args: part.input } });
        }
      }

      done();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        done();
        return;
      }
      throw new Error(`OpenAI-Compat Stream Error: ${err.message}`);
    }
  }

  /**
   * Streams responses from Anthropic Claude models.
   */
  private static async streamAnthropic(
    model: string,
    messages: ChatMessage[],
    settings: AISettings | undefined,
    apiKey: string,
    signal: AbortSignal | undefined,
    write: (chunk: any) => void,
    done: () => void
  ): Promise<void> {
    const anthropicProvider = createAnthropic({
      apiKey,
    });

    const resolvedModel = model || 'claude-opus-4-5';
    const modelInstance = anthropicProvider(resolvedModel);
    const coreMessages = mapMessagesToModelMessages(messages);

    try {
      const result = await streamText({
        model: modelInstance,
        messages: coreMessages,
        temperature: settings?.temperature ?? 0.7,
        maxOutputTokens: settings?.maxTokens ?? 4096,
        abortSignal: signal,
      });

      for await (const part of result.fullStream) {
        if (signal?.aborted) break;

        if (part.type === 'text-delta') {
          write({ chunk: part.text });
        } else if (part.type === 'reasoning-delta') {
          write({ type: 'thinking', content: part.text });
        }
      }

      done();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        done();
        return;
      }
      throw new Error(`Anthropic Stream Error: ${err.message}`);
    }
  }
}

export { UnifiedEngine } from './unifiedEngine.js';
