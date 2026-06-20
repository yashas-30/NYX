import { LOCAL_MODEL_PORT } from '@nyx/shared';
import { env } from '../config/env.js';
import logger from './logger.js';

/** Base URLs per provider — gateway.ts has a duplicate; keep in sync if changed */
const PROVIDER_API_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  groq: 'https://api.groq.com/openai/v1',
  together: 'https://api.together.xyz/v1',
  perplexity: 'https://api.perplexity.ai',
  ollama: env.OLLAMA_URL || 'http://localhost:11434/v1',
  lmstudio: env.LM_STUDIO_URL || 'http://localhost:1234/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  deepseek: 'https://api.deepseek.com',
};

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
  messages: Array<{ role: string; content: string }>;
  settings?: ModelSettings;
  apiKey?: string;
}

export class UnifiedEngine {
  static async executeStream(
    options: ExecuteOptions,
    onChunk: (chunk: StreamChunk) => void,
    onComplete: () => void,
    signal?: AbortSignal
  ): Promise<void> {
    const { provider, model, messages, settings, apiKey } = options;

    switch (provider) {
      case 'gemini':
        return this.streamGemini(model, messages, apiKey || '', settings, onChunk, onComplete);
      case 'anthropic':
        return this.streamAnthropic(model, messages, apiKey || '', settings, onChunk, onComplete);
      case 'nyx-native':
        return this.streamLocal(model, messages, settings, onChunk, onComplete);
      default: {
        const OPENAI_COMPAT = [
          'openai', 'groq', 'together', 'perplexity',
          'deepseek', 'openrouter', 'ollama', 'lmstudio',
        ];
        if (OPENAI_COMPAT.includes(provider)) {
          return this.streamOpenAICompatible(provider, model, messages, apiKey || '', settings, onChunk, onComplete, signal);
        }
        throw new Error(`Unsupported provider: ${provider}`);
      }
    }
  }

  private static async streamGemini(
    model: string,
    messages: any[],
    apiKey: string,
    settings: any,
    onChunk: (chunk: StreamChunk) => void,
    onComplete: () => void
  ) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    // Fix: Extract system message and filter from contents
    const systemMsg = messages.find((m) => m.role === 'system');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const requestBody: any = {
      contents,
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

    // Fix: Add system instruction properly
    if (systemMsg) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMsg.content }],
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';
    // fallow-ignore-next-line code-duplication
    let accumulatedText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text) {
              accumulatedText += text;
              const delta = text;
              if (delta) {
                onChunk({ chunk: delta });
              }
            }
          } catch (e: any) {
            // ignore JSON parse errors for incomplete chunks
          }
        }
      }
    }
    onComplete();
  }

  private static async streamAnthropic(
    model: string,
    messages: any[],
    apiKey: string,
    settings: any,
    onChunk: (chunk: StreamChunk) => void,
    onComplete: () => void
  ) {
    const baseUrl = PROVIDER_API_URLS['anthropic'];
    const url = `${baseUrl}/v1/messages`;

    const systemMsg = messages.find((m) => m.role === 'system');
    const apiMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    const requestBody: any = {
      model,
      max_tokens: settings?.maxTokens ?? 4096,
      messages: apiMessages,
    };

    if (systemMsg) {
      requestBody.system = systemMsg.content;
    }
    if (settings?.temperature !== undefined) {
      requestBody.temperature = settings.temperature;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') continue;

        try {
          const data = JSON.parse(jsonStr);
          if (data.type === 'content_block_delta' && data.delta?.text) {
            onChunk({ chunk: data.delta.text });
          } else if (data.type === 'content_block_stop') {
            // block finished
          } else if (data.type === 'message_stop') {
            onComplete();
            return;
          } else if (data.type === 'error') {
            throw new Error(data.error?.message || 'Anthropic stream error');
          }
        } catch (e: any) {
          if (e.message?.includes('Anthropic')) throw e;
        }
      }
    }
    onComplete();
  }

  private static async streamOpenAICompatible(
    provider: string,
    model: string,
    messages: any[],
    apiKey: string,
    settings: any,
    onChunk: (chunk: StreamChunk) => void,
    onComplete: () => void,
    signal?: AbortSignal
  ) {
    const baseUrl = PROVIDER_API_URLS[provider];
    if (!baseUrl) throw new Error(`No API URL configured for provider: ${provider}`);

    const url = `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const requestBody: any = {
      model,
      messages,
      stream: true,
      temperature: settings?.temperature ?? 0.7,
      max_tokens: settings?.maxTokens ?? 4096,
    };
    if (settings?.topP !== undefined) {
      requestBody.top_p = settings.topP;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`${provider} API error ${response.status}: ${errorBody}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') continue;

        try {
          const data = JSON.parse(jsonStr);

          if (data.error) {
            const msg = typeof data.error === 'object'
              ? data.error.message || JSON.stringify(data.error)
              : data.error;
            throw new Error(`${provider}: ${msg}`);
          }

          const content = data.choices?.[0]?.delta?.content;
          if (content) {
            onChunk({ chunk: content });
          }

          const finishReason = data.choices?.[0]?.finish_reason;
          if (finishReason === 'stop' || finishReason === 'length') {
            onComplete();
            return;
          }
        } catch (e: any) {
          if (e.message?.includes('API error')) throw e;
        }
      }
    }
    onComplete();
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
          // fallow-ignore-next-line code-duplication
          stream: true,
        }),
      });
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.message?.content) onChunk({ chunk: data.message.content });
          } catch {}
        }
      }
      onComplete();
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
          // fallow-ignore-next-line code-duplication
          // fallow-ignore-next-line code-duplication
          stream: true,
        }),
      });
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            try {
              const data = JSON.parse(jsonStr);
              const content = data.choices?.[0]?.delta?.content;
              if (content) onChunk({ chunk: content });
            } catch {}
          }
        }
      }
      onComplete();
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
        // fallow-ignore-next-line code-duplication
        // fallow-ignore-next-line code-duplication
        stream: true,
      }),
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    // fallow-ignore-next-line code-duplication
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) onChunk({ chunk: data.content });
          } catch (e) {}
        }
      }
    }
    onComplete();
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
