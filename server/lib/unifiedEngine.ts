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
    let lastText = '';

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
              // Fix: Only emit the delta (new text since last chunk)
              const delta = text.slice(lastText.length);
              if (delta) {
                onChunk({ chunk: delta });
              }
              lastText = text;
            }
          } catch (e: any) {
            // ignore JSON parse errors for incomplete chunks
          }
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
    let LLAMA_PORT = process.env.LLAMA_PORT || LOCAL_MODEL_PORT;
    try {
      const runner = require('../../server/features/local-models/localModelRunner.ts');
      if (runner && runner.getLlamaPort) {
        LLAMA_PORT = runner.getLlamaPort();
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
