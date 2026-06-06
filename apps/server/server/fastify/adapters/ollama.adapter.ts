import { ProviderAdapter, ChatRequest } from './base.adapter.js';

export class OllamaAdapter implements ProviderAdapter {
  providerName = 'ollama';

  async listModels(apiKey?: string): Promise<string[]> {
    try {
      const res = await fetch('http://127.0.0.1:11434/api/tags');
      if (!res.ok) return [];
      const data = await res.json();
      // fallow-ignore-next-line code-duplication
      return (data as any).models.map((m: any) => `ollama/${m.name}`);
    } catch {
      return [];
    }
  }

  async getQuota(apiKey?: string): Promise<any> {
    return { status: 'ok', type: 'local_unlimited' };
  }

  async *streamChat(request: ChatRequest, apiKey?: string): AsyncGenerator<string, void, unknown> {
    const model = request.model.replace('ollama/', '');
    // Using the OpenAI-compatible endpoint provided by Ollama
    // fallow-ignore-next-line code-duplication
    const url = 'http://127.0.0.1:11434/v1/chat/completions';

    // fallow-ignore-next-line code-duplication
    const payload = {
      model,
      messages: request.messages,
      stream: true,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // fallow-ignore-next-line code-duplication
      throw new Error(
        `Ollama API Error ${res.status}: ${res.statusText}. Ensure Ollama is running.`
      );
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
            if (!dataStr || dataStr === '[DONE]') continue;

            try {
              const data = JSON.parse(dataStr);
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                yield content;
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
