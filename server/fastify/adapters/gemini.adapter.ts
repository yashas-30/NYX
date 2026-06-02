import { ProviderAdapter, ChatRequest } from './base.adapter.ts';

export class GeminiAdapter implements ProviderAdapter {
  providerName = 'gemini';

  async listModels(apiKey?: string): Promise<string[]> {
    if (!apiKey) return [];
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.models.map((m: any) => `gemini/${m.name.replace('models/', '')}`);
    } catch {
      return [];
    }
  }

  async getQuota(apiKey?: string): Promise<any> {
    return { status: 'ok', type: 'free_tier_or_pay_as_you_go' };
  }

  async *streamChat(request: ChatRequest, apiKey?: string): AsyncGenerator<string, void, unknown> {
    if (!apiKey) throw new Error('Gemini API Key required');
    const model = request.model.replace('gemini/', '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    // Normalize request (messages must be parts array)
    const contents = request.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }],
    }));

    const payload: any = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Gemini API Error ${res.status}: ${res.statusText}`);
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
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                yield data.candidates[0].content.parts[0].text;
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
