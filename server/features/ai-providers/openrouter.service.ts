import { Gateway } from '../../lib/gateway.js';

export interface OpenRouterStreamParams {
  model: string;
  prompt: string;
  apiKey: string;
  settings?: any;
  systemInstruction?: string;
  history?: any[];
  gatewayUrls?: Record<string, string>;
}

export class OpenRouterService {
  async executeStream(
    params: OpenRouterStreamParams,
    signal: AbortSignal,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: any) => void
  ): Promise<void> {
    const { model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls } = params;

    // Auth validation
    const authResult = Gateway.validateAuth('openrouter', model, apiKey);
    if (!authResult.valid) {
      throw new Error(authResult.error || 'Authentication validation failed');
    }

    if (!model || !prompt) {
      throw new Error('Model and prompt are required');
    }

    const activeKey = Gateway.getActiveKey('openrouter', apiKey);

    // Build messages
    const messages = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    if (history && Array.isArray(history)) {
      messages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
    }
    messages.push({ role: 'user', content: prompt });

    // Build URL with gateway support (custom user gateway takes priority)
    const { url } = Gateway.buildUrl('openrouter', '/chat/completions', gatewayUrls);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'LLM Reference Dashboard',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: settings?.temperature ?? 0.7,
        max_tokens: settings?.maxTokens ?? 4096,
        top_p: settings?.topP ?? 1.0,
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      let errorMessage = `OpenRouter Error ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
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
