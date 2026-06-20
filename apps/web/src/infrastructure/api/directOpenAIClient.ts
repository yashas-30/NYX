import { EnhancedAIResponse } from '@src/infrastructure/types';
import { parseSSEStream } from './streamParser';

export async function directOpenAIFetch(config: any): Promise<EnhancedAIResponse> {
  const {
    modelId,
    prompt,
    systemInstruction,
    settings,
    history,
    onStream,
    signal,
    gatewayUrls,
    provider,
    apiKey,
    streamEvents,
  } = config;

  let endpoint = 'https://api.openai.com/v1/chat/completions';
  if (provider === 'openrouter') endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  if (provider === 'deepseek') endpoint = 'https://api.deepseek.com/v1/chat/completions';
  if (provider === 'ollama') endpoint = 'http://localhost:11434/v1/chat/completions';
  if (provider === 'lmstudio') endpoint = 'http://localhost:1234/v1/chat/completions';

  // In browser/dev mode, route cloud providers through the Vite server-side proxy
  // to avoid CORS preflight blocks. Proxy URL: /api/proxy/<provider>/<upstream-path>
  const isDevProxy = typeof window !== 'undefined' && window.location.hostname === 'localhost';
  if (isDevProxy) {
    if (provider === 'openrouter') endpoint = `${window.location.origin}/api/proxy/openrouter/api/v1/chat/completions`;
    if (provider === 'openai')     endpoint = `${window.location.origin}/api/proxy/openai/v1/chat/completions`;
    if (provider === 'deepseek')   endpoint = `${window.location.origin}/api/proxy/deepseek/v1/chat/completions`;
  }

  if (gatewayUrls && gatewayUrls[provider]) {
    endpoint = gatewayUrls[provider].replace(/\/$/, '') + '/chat/completions';
  }

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  if (history) {
    for (const msg of history) {
      messages.push({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.content });
    }
  }
  messages.push({ role: 'user', content: prompt });

  const body = {
    model: modelId,
    messages,
    temperature: settings?.temperature ?? 0.7,
    max_tokens: settings?.maxTokens,
    top_p: settings?.topP,
    stream: true,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  
  if (provider === 'openrouter') {
    headers['X-Title'] = 'NYX Web';
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`[${provider}] API Error ${response.status}: ${errorText}`);
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
    provider,
    reasoning: parsed.reasoning ? [{ content: parsed.reasoning, type: 'thinking' }] : undefined,
    finishReason: parsed.finishReason as any,
    metrics: {
      latency: parsed.metrics?.latencyMs || 0,
      tokens: 0,
      tps: 0
    }
  };
}
