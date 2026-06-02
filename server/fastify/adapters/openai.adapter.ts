import { ProviderAdapter, ChatRequest } from './base.adapter.ts';
import logger from '../../lib/logger.ts';

export class OpenAIAdapter implements ProviderAdapter {
  providerName = 'openai';

  async listModels(apiKey?: string): Promise<string[]> {
    if (!apiKey) return [];
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.data.map((m: any) => `openai/${m.id}`);
    } catch {
      return [];
    }
  }

  async getQuota(apiKey?: string): Promise<any> {
    return { status: 'ok', type: 'pay_as_you_go' };
  }

  async *streamChat(request: ChatRequest, apiKey?: string): AsyncGenerator<string, void, unknown> {
    if (!apiKey) throw new Error('OpenAI API Key required');
    const url = 'https://api.openai.com/v1/chat/completions';

    const payload = {
      model: request.model.replace('openai/', ''),
      messages: request.messages,
      stream: true,
      temperature: request.temperature ?? 0.7,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API Error: ${res.statusText}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder('utf-8');

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              if (data.choices && data.choices.length > 0 && data.choices[0].delta?.content) {
                yield data.choices[0].delta.content;
              }
            } catch (err) {
              // ignore parse errors for partial chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
