import logger from '../../lib/logger.ts';

export const NVIDIA_MODELS: Record<string, string> = {
  'nvidia/llama-3.3-70b-instruct': 'meta/llama-3.3-70b-instruct',
  'nvidia/deepseek-r1': 'deepseek-ai/deepseek-r1',
  'nvidia/deepseek-v3': 'deepseek-ai/deepseek-v3',
  'nvidia/llama-3.1-nemotron-70b-instruct': 'nvidia/llama-3.1-nemotron-70b-instruct',
  'nvidia/nemotron-4-340b-instruct': 'nvidia/nemotron-4-340b-instruct',
  'nvidia/gemma-3-27b-it': 'google/gemma-3-27b-it',
  'nvidia/gemma-2-9b-it': 'google/gemma-2-9b-it',
  'nvidia/phi-4': 'microsoft/phi-4',
  'nvidia/ministral-8b': 'mistralai/ministral-8b-instruct-v0.3',
};

export interface NvidiaStreamParams {
  model: string;
  prompt: string;
  apiKey?: string;
  settings?: any;
  systemInstruction?: string;
  history?: any[];
}

export class NvidiaService {
  async executeStream(
    params: NvidiaStreamParams,
    signal: AbortSignal,
    onChunk: (chunk: string) => void,
    onDone: () => void
  ): Promise<void> {
    const { model, prompt, apiKey, settings, systemInstruction, history } = params;

    if (!model || !prompt) {
      throw new Error('Model and prompt are required');
    }

    // Map UI model ID to real NVIDIA API model ID
    const realModel = NVIDIA_MODELS[model] || model.replace('nvidia/', '');

    if (!realModel) {
      throw new Error(`Unknown NVIDIA model: ${model}`);
    }

    // Build messages
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
      max_tokens: settings?.maxTokens ?? 4096,
      temperature: settings?.temperature ?? 0.7,
      top_p: settings?.topP ?? 1.0,
    };

    // Resolve API key: request body > env var
    const activeKey = apiKey || process.env.NVIDIA_API_KEY || '';
    if (!activeKey || !activeKey.startsWith('nvapi-')) {
      throw new Error('NVIDIA API key is required. Add your nvapi-* key in Settings.');
    }

    logger.info({ model: realModel }, 'Forwarding stream request to NVIDIA NIM');

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok || !response.body) {
      const errText = await response.text();
      logger.error({ status: response.status, error: errText }, 'NVIDIA API response error');
      throw new Error(`NVIDIA API Error ${response.status}: ${errText}`);
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
            // ignore JSON errors
          }
        }
      }
    }

    onDone();
  }
}
