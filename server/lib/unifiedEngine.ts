/**
 * @file server/lib/unifiedEngine.ts
 * @description Unified streaming execution engine using the Gateway service.
 */

import { Gateway, Provider, ChatMessage, AISettings, ZEN_FREE_MODELS } from './gateway.js';

export type { Provider, ChatMessage, AISettings } from './gateway.js';

export interface UnifiedRequest {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  settings?: AISettings;
  apiKey?: string;
  baseUrl?: string;
}

export class UnifiedEngine {
  /**
   * Main entry point for streaming AI requests.
   * Validates auth, routes to appropriate provider handler.
   */
  static async executeStream(
    req: UnifiedRequest,
    writeChunk: (chunk: any) => void,
    onDone: () => void
  ): Promise<void> {
    const { provider, model, messages, settings, apiKey } = req;

    // 1. Auth validation
    const authResult = Gateway.validateAuth(provider, model, apiKey);
    if (!authResult.valid) {
      throw new Error(authResult.error);
    }

    const activeKey = Gateway.getActiveKey(provider, apiKey);

    // 2. Route to provider-specific handler
    switch (provider) {
      case 'gemini':
        return this.streamGemini(model, messages, activeKey, settings, writeChunk, onDone);

      case 'openrouter':
      case 'openai':
      case 'anthropic':
      case 'deepseek':
      case 'groq':
      case 'mistral':
      case 'together':
        return this.streamOpenAICompatible(provider, model, messages, activeKey, settings, writeChunk, onDone);

      case 'nvidia':
        return this.streamOpenAICompatible(provider, model, messages, activeKey, settings, writeChunk, onDone);

      case 'opencode':
        return this.streamOpenCodeZen(model, messages, activeKey, settings, writeChunk, onDone);

      case 'nyx-native':
        return this.streamNyxNative(model, messages, settings, writeChunk, onDone);

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
    write: (chunk: any) => void,
    done: () => void
  ): Promise<void> {
    const { url } = Gateway.buildUrl('gemini', `/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`);
    const { contents, systemInstruction } = Gateway.formatMessages(messages, 'gemini');

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        generationConfig: {
          temperature: settings?.temperature,
          maxOutputTokens: settings?.maxTokens,
          topP: settings?.topP,
          topK: settings?.topK,
        }
      })
    });

    if (!response.ok) throw new Error(`Gemini API Error: ${response.status}`);

    await Gateway.processSSEStream(response, {
      onChunk: (text) => write({ chunk: text }),
      onDone: done,
      onError: (err) => { throw new Error(err); }
    });
  }

  /**
   * Handles OpenAI-compatible APIs (OpenRouter, NVIDIA).
   * Uses standard /chat/completions endpoint with SSE streaming.
   * @param provider - The provider ('openrouter' or 'nvidia')
   * @param model - Model identifier (may include provider prefix like 'anthropic/claude-3.5-sonnet')
   * @param messages - Array of chat messages
   * @param apiKey - API key (Bearer token format)
   * @param settings - Optional generation settings
   * @param write - Callback for writing chunks to response
   * @param done - Callback when stream completes
   */
  private static async streamOpenAICompatible(
    provider: Provider,
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    settings: AISettings | undefined,
    write: (chunk: any) => void,
    done: () => void
  ): Promise<void> {
    const { url } = Gateway.buildUrl(provider, '/chat/completions');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey ? `Bearer ${apiKey}` : '',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'NYX Unified Engine',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: settings?.temperature,
        max_tokens: settings?.maxTokens,
        top_p: settings?.topP,
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let msg = `${provider} API Error: ${response.status}`;
      try {
        const json = JSON.parse(errorText);
        msg = json.error?.message || msg;
      } catch {}
      throw new Error(msg);
    }

    await Gateway.processSSEStream(response, {
      onChunk: (text) => write({ chunk: text }),
      onDone: done,
      onError: (err) => { throw new Error(err); }
    });
  }

  /**
   * Streams responses from OpenCode Zen free models.
   * Uses OpenAI-compatible /chat/completions endpoint.
   * @param model - OpenCode model identifier (e.g., 'big-pickle')
   * @param messages - Array of chat messages
   * @param apiKey - OpenCode API key
   * @param settings - Optional generation settings
   * @param write - Callback for writing chunks to response
   * @param done - Callback when stream completes
   */
  private static async streamOpenCodeZen(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    settings: AISettings | undefined,
    write: (chunk: any) => void,
    done: () => void
  ): Promise<void> {
    const modelName = model.replace('opencode/', '');

    // Validate it's a free model
    if (!ZEN_FREE_MODELS.includes(modelName)) {
      throw new Error(`${modelName} is not available. Free models: ${ZEN_FREE_MODELS.join(', ')}`);
    }

    const baseUrl = 'https://opencode.ai/zen/v1';

    console.log('[OpenCode Zen] Request:', {
      model: modelName,
      url: baseUrl,
    });

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'NYX - OpenCode Zen',
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        stream: true,
        temperature: settings?.temperature ?? 0.7,
        max_tokens: settings?.maxTokens ?? 8192,
        top_p: settings?.topP ?? 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let msg = `OpenCode Zen Error ${response.status}`;
      try {
        const json = JSON.parse(errorText);
        msg = json.error?.message || json.error?.type || json.error || msg;
      } catch {
        if (errorText) msg = errorText;
      }
      console.error('[OpenCode Zen] Request failed:', { status: response.status, error: errorText });
      throw new Error(msg);
    }

    await Gateway.processSSEStream(response, {
      onChunk: (text) => write({ chunk: text }),
      onDone: done,
      onError: (err) => { throw new Error(err); }
    });
  }

  /**
   * Streams responses from local GGUF model executed via NYX's native runner.
   * Connects directly to localhost:12345.
   */
  private static async streamNyxNative(
    model: string,
    messages: ChatMessage[],
    settings: AISettings | undefined,
    write: (chunk: any) => void,
    done: () => void
  ): Promise<void> {
    const url = 'http://127.0.0.1:12345/v1/chat/completions';

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        temperature: settings?.temperature ?? 0.7,
        max_tokens: settings?.maxTokens ?? 2048,
      })
    });

    if (!response.ok) {
      throw new Error(`Native GGUF Runner Error: ${response.status}. Make sure the model is loaded in RAM.`);
    }

    await Gateway.processSSEStream(response, {
      onChunk: (text) => write({ chunk: text }),
      onDone: done,
      onError: (err) => { throw new Error(err); }
    });
  }
}