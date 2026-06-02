import { ProviderAdapter, ChatRequest } from './base.adapter.ts';
import logger from '../../lib/logger.ts';

export class PollinationsAdapter implements ProviderAdapter {
  providerName = 'pollinations';

  async listModels(apiKey?: string): Promise<string[]> {
    return ['pollinations/mistral-large', 'pollinations/gpt-4o', 'pollinations/claude'];
  }

  async getQuota(apiKey?: string): Promise<any> {
    return { status: 'ok', type: 'free_tier' };
  }

  async *streamChat(request: ChatRequest, apiKey?: string): AsyncGenerator<string, void, unknown> {
    const url = 'https://text.pollinations.ai/openai';

    // Normalize request
    const payload = {
      model: request.model.replace('pollinations/', ''),
      messages: request.messages,
      stream: true, // Force stream
      temperature: request.temperature ?? 0.7,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Pollinations API Error: ${res.statusText}`);
    }

    if (!res.body) {
      throw new Error('No response body from Pollinations API');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        // OpenAI stream format splits by "data: "
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
