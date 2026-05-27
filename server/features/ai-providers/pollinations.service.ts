import logger from '../../lib/logger.ts';

export interface PollinationsStreamParams {
  model: string;
  prompt: string;
  settings?: any;
  systemInstruction?: string;
  history?: any[];
}

export class PollinationsService {
  async executeStream(
    params: PollinationsStreamParams,
    signal: AbortSignal,
    onChunk: (chunk: string) => void,
    onDone: () => void
  ): Promise<void> {
    const { model, prompt, settings, systemInstruction, history } = params;

    if (!model || !prompt) {
      throw new Error('Model and prompt are required');
    }

    const realModel = model.replace('pollinations/', '');

    // Build messages in OpenAI compatible format
    const messages: any[] = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    if (history && Array.isArray(history)) {
      messages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
    }
    messages.push({ role: 'user', content: prompt });

    const requestBody = {
      model: realModel,
      messages,
      stream: true,
      temperature: settings?.temperature ?? 0.7,
    };

    logger.info({ model: realModel }, 'Forwarding stream request to Pollinations.ai');

    const response = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok || !response.body) {
      const errText = await response.text();
      logger.error({ status: response.status, error: errText }, 'Pollinations API response error');
      throw new Error(`Pollinations API Error ${response.status}: ${errText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Handle raw SSE format from pollinations
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === '[DONE]') {
            onDone();
            return;
          }
          try {
            const parsed = JSON.parse(dataStr);
            const chunk = parsed.choices?.[0]?.delta?.content ?? '';
            if (chunk) {
              onChunk(chunk);
            }
          } catch (e) {
            // ignore JSON parse errors
          }
        } else {
          // Pollinations sometimes sends raw content or lines if not prefixed, or if it claims to be JSON but sent as raw
          try {
            const parsed = JSON.parse(trimmed);
            const chunk = parsed.choices?.[0]?.delta?.content ?? parsed.text ?? '';
            if (chunk) {
              onChunk(chunk);
            }
          } catch {
            // Not JSON, ignore
          }
        }
      }
    }

    onDone();
  }
}
