import logger from '../../lib/logger.ts';

export interface QwenLocalStreamParams {
  model?: string;
  prompt: string;
  settings?: any;
  systemInstruction?: string;
  history?: any[];
}

export class QwenLocalService {
  async executeStream(
    params: QwenLocalStreamParams,
    signal: AbortSignal,
    onChunk: (chunk: string) => void,
    onDone: () => void
  ): Promise<void> {
    const { model, prompt, settings, systemInstruction, history } = params;

    logger.info({ model }, 'Forwarding stream request to local Python server');

    const scraplingPort = process.env.SCRAPLING_PORT || '3002';
    const response = await fetch(`http://127.0.0.1:${scraplingPort}/api/gemini/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        history,
        systemInstruction,
        settings,
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      throw new Error(`Local Python Qwen Server Error: ${errorText}`);
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
        if (!line.trim()) continue;
        onChunk(line + '\n');
      }
    }

    if (buf.trim()) {
      onChunk(buf + '\n');
    }
    onDone();
  }
}
