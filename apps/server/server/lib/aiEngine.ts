/**
 * @file server/lib/unifiedEngine.ts
 * @description Unified streaming execution engine using the Gateway service.
 */

import { Gateway, Provider, ChatMessage, AISettings } from './gateway.js';
import { env } from '../config/env.js';

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

// ── Layer 7: Abstention Training ──────────────────────────────────────────────
// Injected into all system prompts to reduce hallucinations by encouraging
// the model to say "I don't know" rather than guess wrong answers.
const ABSTENTION_INSTRUCTION = `
IMPORTANT: If you are unsure about an API, function, library, or implementation detail, or if the context does not contain sufficient information to answer accurately, explicitly state "I don't have enough context to answer this reliably" rather than guessing. Accuracy over completeness. Never hallucinate imports, library names, or function signatures.`.trim();

/**
 * Injects abstention instruction into the last system message, or prepends a new one.
 */
function injectAbstentionInstruction(messages: ChatMessage[]): ChatMessage[] {
  const systemIdx = messages.findIndex((m) => m.role === 'system');
  if (systemIdx >= 0) {
    const updated = [...messages];
    updated[systemIdx] = {
      ...updated[systemIdx],
      content: `${updated[systemIdx].content}\n\n${ABSTENTION_INSTRUCTION}`,
    };
    return updated;
  }
  return [{ role: 'system', content: ABSTENTION_INSTRUCTION }, ...messages];
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
    const { provider, model, messages, settings, apiKey, customGatewayUrls, tools } = req;

    switch (provider) {
      case 'gemini':
        return this.streamGemini(
          model,
          messages,
          apiKey || '',
          settings,
          customGatewayUrls,
          tools,
          req.signal,
          writeChunk,
          onDone
        );

      case 'ollama':
        return this.streamOllama(model, messages, settings, writeChunk, onDone);

      case 'lmstudio':
        return this.streamLMStudio(model, messages, settings, writeChunk, onDone);

      case 'antigravity-sdk':
        return this.streamAntigravitySdk(model, messages, apiKey || '', req.signal, writeChunk, onDone);

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  // ─── Provider-specific streamers ───────────────────────────────────────────

  private static resolveRealGeminiModel(model: string): string {
    const modelMap: Record<string, string> = {
      'gemma-4-31b-it': 'gemma-4-31b-it',
      'gemma-4-27b-it': 'gemma-4-26b-a4b-it',
      'gemini-3.5-flash': 'gemini-3.5-flash',
      'gemini-3-flash': 'gemini-3-flash-preview',
      'gemini-3-flash-preview': 'gemini-3-flash-preview',
      'gemini-3.1-pro': 'gemini-3.1-pro-preview',
      'gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
      'gemini-2.5-flash': 'gemini-2.5-flash',
      'gemini-2.5-pro': 'gemini-2.5-pro',
      'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
      'gemini-flash-latest': 'gemini-flash-latest',
      'gemini-pro-latest': 'gemini-pro-latest',
    };
    return modelMap[model] || model;
  }

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
    signal: AbortSignal | undefined,
    write: (chunk: any) => void,
    done: () => void
  ): Promise<void> {
    const realModel = this.resolveRealGeminiModel(model);
    const { url } = Gateway.buildUrl(
      'gemini',
      `/models/${realModel}:streamGenerateContent?alt=sse&key=${apiKey}`,
      customGatewayUrls
    );
    const { contents, systemInstruction } = Gateway.formatMessages(messages, 'gemini');

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // fallow-ignore-next-line code-duplication
      body: JSON.stringify({
        contents,
        systemInstruction: systemInstruction
          ? { parts: [{ text: systemInstruction + '\n\n' + ABSTENTION_INSTRUCTION }] }
          : { parts: [{ text: ABSTENTION_INSTRUCTION }] },
        generationConfig: {
          temperature: settings?.temperature ?? 0.1, // Near-greedy for code accuracy
          maxOutputTokens: settings?.maxTokens,
          topP: settings?.topP ?? 0.9,
          topK: settings?.topK ?? 20,
        },
        tools: tools,
      }),
      signal,
    });

    if (!response.ok) throw new Error(`Gemini API Error: ${response.status}`);

    await Gateway.processSSEStream(response, {
      onChunk: (text) => write({ chunk: text }),
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
      onChunk: (text) => write({ chunk: text }),
      onDone: done,
      onError: (err) => {
        throw new Error(err);
      },
    });
  }

  /**
   * Streams responses from a local Ollama instance (OpenAI-compatible API).
   */
  private static async streamOllama(
    model: string,
    messages: ChatMessage[],
    settings: AISettings | undefined,
    write: (chunk: any) => void,
    done: () => void
  ): Promise<void> {
    // Strip provider prefix if present (e.g. "ollama/llama3" → "llama3")
    const cleanModel = model.replace(/^ollama\//, '');

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 600000);

    try {
      const formattedMessages = messages.map((m: any) => ({ role: m.role, content: m.content }));
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
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama API Error: ${response.status} ${response.statusText}. Ensure Ollama is running on port 11434.`);
      }

      await Gateway.processSSEStream(response, {
        onChunk: (text) => write({ chunk: text }),
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
    write: (chunk: any) => void,
    done: () => void
  ): Promise<void> {
    // Strip provider prefix if present (e.g. "lmstudio/publisher/model" → "publisher/model")
    const cleanModel = model.replace(/^lmstudio\//, '');

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 600000);

    try {
      const formattedMessages = messages.map((m: any) => ({ role: m.role, content: m.content }));
      const response = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cleanModel,
          messages: formattedMessages,
          stream: true,
          temperature: settings?.temperature ?? 0.7,
          max_tokens: settings?.maxTokens ?? 4096,
          top_p: settings?.topP ?? 1.0,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`LM Studio API Error: ${response.status} ${response.statusText}. Ensure LM Studio server is running on port 1234.`);
      }

      await Gateway.processSSEStream(response, {
        onChunk: (text) => write({ chunk: text }),
        onDone: done,
        onError: (err) => { throw new Error(err); },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export { UnifiedEngine } from './unifiedEngine.js';
