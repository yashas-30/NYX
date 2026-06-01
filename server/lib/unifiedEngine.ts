import { LOCAL_MODEL_PORT } from '../../src/config/ports.ts';

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
    onComplete: () => void
  ): Promise<void> {
    const { provider, model, messages, settings, apiKey } = options;

    switch (provider) {
      case 'gemini':
        return this.streamGemini(model, messages, apiKey || '', settings, onChunk, onComplete);
      case 'nyx-native':
        return this.streamLocal(model, messages, settings, onChunk, onComplete);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          temperature: settings?.temperature ?? 0.7,
          maxOutputTokens: settings?.maxTokens ?? 4096,
          topP: settings?.topP ?? 1.0,
        },
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
          try {
            const data = JSON.parse(line.slice(6));
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text) onChunk({ chunk: text });
          } catch (e: any) {
            // ignore JSON parse errors for incomplete chunks
          }
        }
      }
    }
    onComplete();
  }

  private static async streamLocal(
    model: string,
    messages: any[],
    settings: any,
    onChunk: (chunk: StreamChunk) => void,
    onComplete: () => void
  ) {
    // Dynamic LLAMA_PORT would be resolved from env or state here
    const LLAMA_PORT = process.env.LLAMA_PORT || LOCAL_MODEL_PORT;
    const response = await fetch(`http://127.0.0.1:${LLAMA_PORT}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: this.formatPrompt(messages),
        temperature: settings?.temperature ?? 0.7,
        n_predict: settings?.maxTokens ?? 4096,
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
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) onChunk({ chunk: data.content });
          } catch (e: any) {
            // ignore JSON parse errors
          }
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
