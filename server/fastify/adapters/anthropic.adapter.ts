import { ProviderAdapter, ChatRequest } from './base.adapter.ts';

export class AnthropicAdapter implements ProviderAdapter {
  providerName = 'anthropic';

  async listModels(apiKey?: string): Promise<string[]> {
    return [
      'anthropic/claude-3-5-sonnet-20240620',
      'anthropic/claude-3-opus-20240229',
      'anthropic/claude-3-haiku-20240307',
    ];
  }

  async getQuota(apiKey?: string): Promise<any> {
    return { status: 'ok', type: 'pay_as_you_go' };
  }

  async *streamChat(request: ChatRequest, apiKey?: string): AsyncGenerator<string, void, unknown> {
    if (!apiKey) throw new Error('Anthropic API Key required');
    const url = 'https://api.anthropic.com/v1/messages';

    // Normalize request (messages must not start with system message)
    let systemMessage = '';
    const anthropicMessages = request.messages.filter((m) => {
      if (m.role === 'system') {
        systemMessage = m.content;
        return false;
      }
      return true;
    });

    const payload: any = {
      model: request.model.replace('anthropic/', ''),
      messages: anthropicMessages,
      max_tokens: request.max_tokens ?? 4096,
      stream: true,
      temperature: request.temperature ?? 0.7,
    };
    if (systemMessage) payload.system = systemMessage;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API Error: ${res.statusText}`);
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
              if (data.type === 'content_block_delta' && data.delta?.text) {
                yield data.delta.text;
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
