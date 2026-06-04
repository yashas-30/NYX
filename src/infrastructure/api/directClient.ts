// @ts-nocheck
/**
 * @file src/infrastructure/api/directClient.ts
 * @description Production-grade direct browser-to-Gemini API client with
 * streaming SSE support, exponential retry logic, and timeouts.
 */

import { AISettings } from './types';
import { parseSSEStream } from './streamParser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamChunk {
  type: 'text' | 'reasoning' | 'tool_call' | 'citation' | 'metrics' | 'finish' | 'error';
  content?: string;
  metadata?: any;
}

export interface DirectClientOptions {
  apiKey: string;
  settings?: AISettings;
  systemInstruction?: string;
  history?: Array<{ role: string; content: string; images?: string[] }>;
  signal?: AbortSignal;
  gatewayUrls?: Record<string, string>;
  onStream?: (chunk: StreamChunk) => void;
  tools?: Array<{
    type: 'function';
    function: { name: string; description: string; parameters: object };
  }>;
  responseFormat?: 'text' | 'json' | { type: 'json_schema'; schema: object };
  images?: Array<{ mimeType?: string; base64: string }>;
  webSearch?: boolean;
}

export interface DirectClientResult {
  text: string;
  reasoning?: string;
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  metrics?: {
    latency: number;
    tokens: number;
    tps: number;
    estimatedCostUsd?: number;
  };
  finishReason?: string;
}

// ---------------------------------------------------------------------------
// Configuration & State
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 120000;
const MAX_RETRIES = 3;
// fallow-ignore-next-line code-duplication
const BASE_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

// fallow-ignore-next-line code-duplication
function createTimeoutSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

function mergeSignals(a?: AbortSignal | null, b?: AbortSignal | null): AbortSignal | undefined {
  const cleanA = a || undefined;
  const cleanB = b || undefined;
  if (!cleanA && !cleanB) return undefined;
  if (!cleanA) return cleanB;
  if (!cleanB) return cleanA;

  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  cleanA.addEventListener('abort', abort, { once: true });
  cleanB.addEventListener('abort', abort, { once: true });
  return ctrl.signal;
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

async function fetchWithRetry(
  url: string,
  init: RequestInit & { timeout?: number },
  attempt = 1
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT_MS, signal: userSignal, ...fetchInit } = init;
  const signal = mergeSignals(userSignal, createTimeoutSignal(timeout));

  try {
    const response = await fetch(url, { ...fetchInit, signal });

    // Retry on rate limit or server error
    if (
      !response.ok &&
      (response.status === 429 || response.status >= 500) &&
      attempt <= MAX_RETRIES
    ) {
      const retryAfter = response.headers.get('Retry-After');
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 200;

      console.warn(
        `[directClient] HTTP ${response.status} (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${delayMs.toFixed(0)}ms.`
      );

      await delay(delayMs, userSignal || undefined);
      return fetchWithRetry(url, init, attempt + 1);
    }

    return response;
  } catch (error: any) {
    if (error?.name === 'AbortError' || userSignal?.aborted) {
      throw error;
    }

    if (attempt <= MAX_RETRIES) {
      const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 200;
      console.warn(
        `[directClient] Network error (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${delayMs.toFixed(0)}ms: ${error.message || error}`
      );

      await delay(delayMs, userSignal || undefined);
      return fetchWithRetry(url, init, attempt + 1);
    }

    throw error;
  }
}

async function parseError(response: Response): Promise<Error> {
  const errorText = await response.text().catch(() => '');
  let message = `API Error ${response.status}`;

  try {
    const data = JSON.parse(errorText);
    message = data.error?.message || data.error?.code || data.message || message;
    if (data.error?.details) {
      message += ` | Details: ${JSON.stringify(data.error.details)}`;
    }
    if (data.error?.status) {
      message = `[${data.error.status}] ${message}`;
    }
  } catch {
    message = errorText || message;
  }

  const error = new Error(message) as any;
  error.status = response.status;
  error.headers = Object.fromEntries(response.headers.entries());
  return error;
}

// Helper to resolve Gemini models
function resolveRealGeminiModel(model: string): string {
  const modelMap: Record<string, string> = {
    'gemma-4-31b-it': 'gemma-4-31b-it',
    'gemma-4-27b-it': 'gemma-4-26b-a4b-it',
    'gemini-3.5-flash': 'gemini-3.5-flash',
    'gemini-3-flash': 'gemini-3-flash-preview',
    'gemini-3.1-pro': 'gemini-3.1-pro-preview',
    'gemini-2.5-flash': 'gemini-2.5-flash',
    'gemini-2.5-pro': 'gemini-2.5-pro',
    'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
    'gemini-2.0-flash': 'gemini-2.0-flash',
    'gemini-1.5-pro': 'gemini-1.5-pro',
    'gemini-1.5-flash': 'gemini-1.5-flash',
  };
  return modelMap[model] || model;
}

// Cost estimation helper
function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const m = model.toLowerCase();
  let inputPricePerM = 0;
  let outputPricePerM = 0;

  if (m.includes('flash')) {
    inputPricePerM = 0.075;
    outputPricePerM = 0.3;
  } else if (m.includes('pro')) {
    inputPricePerM = 3.5;
    outputPricePerM = 10.5;
  }

  return (inputTokens / 1_000_000) * inputPricePerM + (outputTokens / 1_000_000) * outputPricePerM;
}

// ---------------------------------------------------------------------------
// Main Gemini fetch function
// ---------------------------------------------------------------------------

export async function directFetch(
  model: string,
  prompt: string,
  options: DirectClientOptions
): Promise<DirectClientResult> {
  const activeKey =
    options.apiKey ||
    (typeof process !== 'undefined' ? (process.env as any).GEMINI_API_KEY : null) ||
    '';
  if (!activeKey) {
    throw new Error(
      'AUTHENTICATION FAILED: Gemini API key is required. Please check your settings.'
    );
  }

  const realModel = resolveRealGeminiModel(model);
  const rawGateway = options.gatewayUrls?.gemini || options.gatewayUrls?.google;
  const gatewayBase =
    rawGateway && rawGateway.trim() !== ''
      ? rawGateway.replace(/\/$/, '')
      : 'https://generativelanguage.googleapis.com/v1beta';

  const isStream = !!options.onStream;
  const endpoint = isStream ? 'streamGenerateContent' : 'generateContent';
  const url = `${gatewayBase}/models/${realModel}:${endpoint}?key=${activeKey}${isStream ? '&alt=sse' : ''}`;

  // Build contents with image support
  const contents: any[] = [];
  if (options.history && Array.isArray(options.history)) {
    for (const m of options.history) {
      const parts: any[] = [{ text: m.content }];
      if (m.images && m.images.length > 0) {
        for (const img of m.images) {
          parts.push({
            inlineData: {
              mimeType: img.mimeType || 'image/png',
              data: img.data || img.base64,
            },
          });
        }
      }
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts,
      });
    }
  }

  // Add current prompt with images
  const promptParts: any[] = [{ text: prompt }];
  if (options.images && options.images.length > 0) {
    for (const img of options.images) {
      promptParts.push({
        inlineData: {
          mimeType: img.mimeType || 'image/png',
          data: img.data || img.base64,
        },
      });
    }
  }
  contents.push({ role: 'user', parts: promptParts });

  const requestBody: any = { contents };

  // Fix: System instruction without role field
  if (options.systemInstruction) {
    requestBody.systemInstruction = {
      parts: [{ text: options.systemInstruction }],
    };
  }

  if (options.settings) {
    requestBody.generationConfig = {};
    if (options.settings.temperature !== undefined)
      requestBody.generationConfig.temperature = options.settings.temperature;
    if (options.settings.topP !== undefined)
      requestBody.generationConfig.topP = options.settings.topP;
    if (options.settings.maxTokens !== undefined)
      requestBody.generationConfig.maxOutputTokens = options.settings.maxTokens;
  }

  // Add tools if provided
  if (options.tools && options.tools.length > 0) {
    requestBody.tools = [
      {
        functionDeclarations: options.tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      },
    ];
  }

  // Add safety settings for coding (disable aggressive filters)
  requestBody.safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  ];

  // Add Google Search grounding if enabled
  if (options.webSearch) {
    requestBody.tools = requestBody.tools || [];
    requestBody.tools.push({
      googleSearchRetrieval: {
        dynamicRetrievalConfig: {
          mode: 'MODE_DYNAMIC',
          dynamicThreshold: 0.7,
        },
      },
    });
  }

  // Add JSON schema response format if specified
  if (options.responseFormat && typeof options.responseFormat === 'object') {
    requestBody.generationConfig = requestBody.generationConfig || {};
    requestBody.generationConfig.responseMimeType = 'application/json';
    requestBody.generationConfig.responseSchema = options.responseFormat.schema;
  }

  const startTime = performance.now();
  const headers = { 'Content-Type': 'application/json' };

  if (isStream) {
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: options.signal,
      timeout: DEFAULT_TIMEOUT_MS,
    });

    if (!response.ok) throw await parseError(response);
    if (!response.body) throw new Error('No response body for stream');

    let fullText = '';

    const parsed = await parseSSEStream(response, {
      signal: options.signal,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      onChunk: (delta, accumulated) => {
        fullText = accumulated;
        options.onStream?.({ type: 'text', content: accumulated });
      },
      onReasoning: (delta, accumulated) => {
        options.onStream?.({ type: 'reasoning', content: accumulated });
      },
      onToolCall: (delta, accumulated) => {
        options.onStream?.({ type: 'tool_call', content: JSON.stringify(accumulated) });
      },
      onFinish: (reason) => {
        options.onStream?.({ type: 'finish', metadata: { finish_reason: reason } });
      },
    });

    const latency = Math.round(performance.now() - startTime);
    const inputTokens = Math.ceil(prompt.length / 4); // heuristic for input
    const outputTokens = Math.ceil(fullText.length / 4);
    const tokens = inputTokens + outputTokens;
    const cost = estimateCost(realModel, inputTokens, outputTokens);

    return {
      text: fullText,
      reasoning: parsed.reasoning,
      toolCalls: parsed.toolCalls as any,
      metrics: {
        latency,
        tokens,
        tps: latency > 0 ? Math.round(outputTokens / (latency / 1000)) : 0,
        estimatedCostUsd: cost,
      },
      finishReason: parsed.finishReason || 'stop',
    };
  }

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    signal: options.signal,
    timeout: DEFAULT_TIMEOUT_MS,
  });

  if (!response.ok) throw await parseError(response);

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const finishReason = data.candidates?.[0]?.finishReason;

  if (!text) {
    throw new Error('Gemini API returned no response text.');
  }

  const latency = Math.round(performance.now() - startTime);
  const inputTokens = Math.ceil(prompt.length / 4); // heuristic
  const outputTokens = Math.ceil(text.length / 4);
  const tokens = inputTokens + outputTokens;
  const cost = estimateCost(realModel, inputTokens, outputTokens);

  return {
    text,
    metrics: {
      latency,
      tokens,
      tps: latency > 0 ? Math.round(outputTokens / (latency / 1000)) : 0,
      estimatedCostUsd: cost,
    },
    finishReason,
  };
}

// ---------------------------------------------------------------------------
// Backward-compatible Gemini wrappers
// ---------------------------------------------------------------------------

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
  const result = await directFetch(model, prompt, {
    apiKey,
    settings,
    systemInstruction,
    history,
    signal,
    gatewayUrls,
  });
  return result.text;
}

export async function directFetchGeminiStream(
  model: string,
  prompt: string,
  apiKey: string,
  onStream: (chunk: StreamChunk) => void,
  settings?: AISettings,
  systemInstruction?: string,
  history?: any[],
  signal?: AbortSignal,
  gatewayUrls?: Record<string, string>
): Promise<DirectClientResult> {
  return directFetch(model, prompt, {
    apiKey,
    settings,
    systemInstruction,
    history,
    signal,
    gatewayUrls,
    onStream,
  });
}
