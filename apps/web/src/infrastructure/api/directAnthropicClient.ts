import { EnhancedAIResponse } from '@src/infrastructure/types';
import { parseSSEStream } from './streamParser';

export async function directAnthropicFetch(config: any): Promise<EnhancedAIResponse> {
  const {
    modelId,
    prompt,
    systemInstruction,
    settings,
    history,
    onStream,
    signal,
    gatewayUrls,
    apiKey,
    streamEvents,
  } = config;

  let endpoint = 'https://api.anthropic.com/v1/messages';
  if (gatewayUrls && gatewayUrls['anthropic']) {
    endpoint = gatewayUrls['anthropic'].replace(/\/$/, '') + '/messages';
  }

  const messages = [];
  if (history) {
    for (const msg of history) {
      messages.push({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.content });
    }
  }
  messages.push({ role: 'user', content: prompt });

  const body: any = {
    model: modelId,
    messages,
    max_tokens: settings?.maxTokens ?? 4096,
    temperature: settings?.temperature ?? 0.7,
    stream: true,
  };

  if (systemInstruction) {
    body.system = systemInstruction;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerously-allow-browser': 'true'
  };
  
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`[Anthropic] API Error ${response.status}: ${errorText}`);
  }

  const parsed = await parseSSEStream(response, {
    onChunk: (delta, accumulated) => {
      if (onStream) {
        if (streamEvents) {
          onStream({ type: 'text', content: delta, final: false });
        } else {
          onStream(accumulated);
        }
      }
    },
    onReasoning: (delta, accumulated) => {
      if (onStream && streamEvents) {
        onStream({ type: 'reasoning', content: delta, final: false });
      }
    },
    onToolCall: (delta, accumulated) => {
      if (onStream && streamEvents) {
        onStream({ type: 'tool_calls', content: accumulated, final: false });
      }
    },
    onError: () => {}
  });

  if (onStream) {
    if (streamEvents) {
      onStream({ type: 'text', content: parsed.text, final: true });
      if (parsed.reasoning) {
        onStream({ type: 'reasoning', content: parsed.reasoning, final: true });
      }
      if (parsed.toolCalls && parsed.toolCalls.length > 0) {
        onStream({ type: 'tool_calls', content: parsed.toolCalls, final: true });
      }
    } else {
      onStream(parsed.text);
    }
  }

  return {
    text: parsed.text || '',
    model: modelId,
    provider: 'anthropic',
    reasoning: parsed.reasoning ? [{ content: parsed.reasoning, type: 'thinking' }] : undefined,
    finishReason: parsed.finishReason as any,
    metrics: {
      latency: parsed.metrics?.latencyMs || 0,
      tokens: 0,
      tps: 0
    }
  };
}
