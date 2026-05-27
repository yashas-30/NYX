/**
 * @file src/lib/api/directClient.ts
 * @description Direct browser-to-LLM-provider API clients for client-side execution
 * on static environments (e.g. GitHub Pages) or when the backend server is unavailable.
 */

import { AISettings } from './inferenceClient';

// Helper to resolve Gemini models
function resolveRealGeminiModel(model: string): string {
  const modelMap: Record<string, string> = {
    'gemini-3.5-flash': 'gemini-3.5-flash',
    'gemini-3-flash': 'gemini-3-flash',
    'gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
    'gemini-2.5-flash': 'gemini-2.5-flash',
    'gemini-2.5-pro': 'gemini-2.5-pro',
    'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
    'gemma-4-31b-it': 'gemma-4-31b-it',
    'gemma-4-26b-a4b-it': 'gemma-4-26b-a4b-it',
    'gemma-4-e4b-it': 'gemma-4-e4b-it',
    'gemma-4-e2b-it': 'gemma-4-e2b-it',
  };
  return modelMap[model] || model;
}

// NVIDIA NIM free model mapping
const NVIDIA_MODELS: Record<string, string> = {
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

// OpenCode model mapper
function mapOpenCodeModel(modelId: string): string {
  if (!modelId.startsWith('opencode/')) {
    return modelId;
  }
  const realModel = modelId.replace('opencode/', '');
  const modelMap: Record<string, string> = {
    'big-pickle': 'big-pickle',
    'deepseek-v4-flash-free': 'deepseek-v4-flash-free',
    'minimax-m2.5-free': 'minimax-m2.5-free',
    'ring-2.6-1t-free': 'ring-2.6-1t-free',
    'nemotron-3-super-free': 'nemotron-3-super-free',
    'qwen3-30b-a3b-free': 'qwen3-30b-a3b-free',
    'qwen3-coder-14b-free': 'qwen3-coder-14b-free',
    'llama-3.3-70b-free': 'llama-3.3-70b-free',
    'gemma-3-27b-it-free': 'gemma-3-27b-it-free',
    'deepseek-v3-free': 'deepseek-v3-free',
  };
  return modelMap[realModel] || realModel;
}

/**
 * Direct Gemini Browser Fetch
 */
export async function directFetchGemini(
  model: string,
  prompt: string,
  apiKey: string,
  settings?: AISettings,
  systemInstruction?: string,
  history?: any[],
  signal?: AbortSignal,
  gatewayUrls?: Record<string, string>
): Promise<string> {
  const activeKey = apiKey || (process.env as any).GEMINI_API_KEY || '';
  if (!activeKey) {
    throw new Error('AUTHENTICATION FAILED: Gemini API key is required. Please check your settings.');
  }

  const realModel = resolveRealGeminiModel(model);
  const gatewayBase = (gatewayUrls?.gemini && gatewayUrls.gemini.trim() !== '')
    ? gatewayUrls.gemini.replace(/\/$/, '')
    : 'https://generativelanguage.googleapis.com/v1beta';

  const url = `${gatewayBase}/models/${realModel}:generateContent?key=${activeKey}`;

  // Formulate contents in Gemini format
  const contents: any[] = [];
  if (history && Array.isArray(history)) {
    contents.push(...history.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })));
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  const requestBody: any = { contents };

  if (systemInstruction) {
    requestBody.systemInstruction = { role: 'system', parts: [{ text: systemInstruction }] };
  }

  if (settings?.temperature !== undefined || settings?.maxTokens !== undefined || settings?.topP !== undefined) {
    requestBody.generationConfig = {};
    if (settings.temperature !== undefined) requestBody.generationConfig.temperature = settings.temperature;
    if (settings.topP !== undefined) requestBody.generationConfig.topP = settings.topP;
    if (settings.maxTokens !== undefined) requestBody.generationConfig.maxOutputTokens = settings.maxTokens;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Google AI Studio Error ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error?.message || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) {
    throw new Error('Gemini API returned no response text.');
  }
  return text;
}

/**
 * Direct OpenRouter Browser Fetch
 */
export async function directFetchOpenRouter(
  model: string,
  prompt: string,
  apiKey: string,
  settings?: AISettings,
  systemInstruction?: string,
  history?: any[],
  signal?: AbortSignal,
  gatewayUrls?: Record<string, string>
): Promise<string> {
  if (!apiKey) {
    throw new Error('AUTHENTICATION FAILED: OpenRouter API key is required. Please check your settings.');
  }

  const gatewayBase = (gatewayUrls?.openrouter && gatewayUrls.openrouter.trim() !== '')
    ? gatewayUrls.openrouter.replace(/\/$/, '')
    : 'https://openrouter.ai/api/v1';

  const url = `${gatewayBase}/chat/completions`;

  const messages: any[] = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  if (history && Array.isArray(history)) {
    messages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
  }
  messages.push({ role: 'user', content: prompt });

  const requestBody = {
    model,
    messages,
    stream: false,
    temperature: settings?.temperature ?? 0.7,
    max_tokens: settings?.maxTokens ?? 4096,
    top_p: settings?.topP ?? 1.0,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin || 'http://localhost:3000',
      'X-Title': 'LLM Reference Dashboard',
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
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

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) {
    throw new Error('OpenRouter API returned no response text.');
  }
  return text;
}

/**
 * Direct NVIDIA Browser Fetch
 */
export async function directFetchNvidia(
  model: string,
  prompt: string,
  apiKey: string,
  settings?: AISettings,
  systemInstruction?: string,
  history?: any[],
  signal?: AbortSignal,
  gatewayUrls?: Record<string, string>
): Promise<string> {
  if (!apiKey || !apiKey.startsWith('nvapi-')) {
    throw new Error('AUTHENTICATION FAILED: NVIDIA API key is required. Add your nvapi-* key in Settings.');
  }

  const realModel = NVIDIA_MODELS[model] || model.replace('nvidia/', '');
  const gatewayBase = (gatewayUrls?.nvidia && gatewayUrls.nvidia.trim() !== '')
    ? gatewayUrls.nvidia.replace(/\/$/, '')
    : 'https://integrate.api.nvidia.com/v1';

  const url = `${gatewayBase}/chat/completions`;

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
    stream: false,
    max_tokens: settings?.maxTokens ?? 4096,
    temperature: settings?.temperature ?? 0.7,
    top_p: settings?.topP ?? 1.0,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `NVIDIA API Error ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error?.message || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) {
    throw new Error('NVIDIA API returned no response text.');
  }
  return text;
}

/**
 * Direct OpenCode Browser Fetch
 */
export async function directFetchOpenCode(
  model: string,
  prompt: string,
  apiKey?: string,
  settings?: AISettings,
  systemInstruction?: string,
  history?: any[],
  signal?: AbortSignal,
  gatewayUrls?: Record<string, string>
): Promise<string> {
  if (!apiKey) {
    throw new Error('AUTHENTICATION FAILED: OpenCode Zen requires an API key. Get one free at opencode.ai/auth');
  }

  const mappedModel = mapOpenCodeModel(model);
  const gatewayBase = (gatewayUrls?.opencode && gatewayUrls.opencode.trim() !== '')
    ? gatewayUrls.opencode.replace(/\/$/, '')
    : 'https://opencode.ai/zen/v1';

  const url = `${gatewayBase}/chat/completions`;

  const messages: any[] = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  if (history && Array.isArray(history)) {
    messages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
  }
  messages.push({ role: 'user', content: prompt });

  const requestBody = {
    model: mappedModel,
    messages,
    stream: false,
    temperature: settings?.temperature ?? 0.7,
    max_tokens: settings?.maxTokens ?? 4096,
    top_p: settings?.topP ?? 1.0,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin || 'http://localhost:3000',
      'X-Title': 'LLM Reference - OpenCode Zen',
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `OpenCode API Error ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error?.message || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) {
    throw new Error('OpenCode API returned no response text.');
  }
  return text;
}
