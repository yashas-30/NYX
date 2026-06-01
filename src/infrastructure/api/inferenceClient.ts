/**
 * @file src/infrastructure/api/inferenceClient.ts
 * @description Production-grade unified inference client with real SSE streaming,
 *   Gemini-exclusive provider abstraction, automatic fallback, and Claude/Kimi-parity features.
 */

import { isTransientError, formatProviderError } from './streamParser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AISettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  antigravity?: boolean;
  responseFormat?: 'text' | 'json' | { type: 'json_schema'; schema: object };
}

export interface InferenceOptions {
  history?: Array<{ role: string; content: string; images?: string[] }>;
  nodeId?: string;
  gatewayUrls?: Record<string, string>;
  tools?: Array<{
    type: 'function';
    function: { name: string; description: string; parameters: object };
  }>;
  images?: Array<{ name: string; mimeType: string; data: string }>;
}

export interface StreamChunk {
  type: 'text' | 'reasoning' | 'tool_call' | 'citation' | 'metrics' | 'finish' | 'error';
  content?: string;
  metadata?: any;
}

export interface InferenceResult {
  text: string;
  latency: number;
  tokens?: number;
  tps?: number;
  finishReason?: string;
  reasoning?: string;
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

export type StreamHandler = (chunk: StreamChunk) => void;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 60000;
const STREAM_TIMEOUT_MS = 120000;
const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 1000;

const PROVIDER_ENDPOINTS: Record<string, string> = {
  gemini: '/api/gemini/stream',
};

const API_KEY_PATTERNS: Record<string, (key: string) => boolean> = {
  gemini: (k) => k.length >= 30,
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

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
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    }, { once: true });
  });
}

function validateApiKey(provider: string, apiKey?: string): void {
  const validator = API_KEY_PATTERNS[provider];
  if (!validator) return;

  if (!apiKey?.trim()) return;

  if (!validator(apiKey.trim())) {
    throw new Error(`Invalid ${provider} API key format`);
  }
}

// ---------------------------------------------------------------------------
// SSE Parser
// ---------------------------------------------------------------------------

async function* parseSSEStream(response: Response): AsyncGenerator<StreamChunk> {
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        const dataStr = trimmed.startsWith('data: ') ? trimmed.slice(6).trim() : trimmed;
        if (dataStr === '[DONE]') {
          yield { type: 'finish', metadata: { finish_reason: 'stop' } };
          return;
        }

        try {
          const parsed = JSON.parse(dataStr);

          // OpenAI-compatible format
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            yield { type: 'text', content: delta.content };
          }
          if (delta?.reasoning_content || delta?.thinking) {
            yield { type: 'reasoning', content: delta.reasoning_content || delta.thinking };
          }
          if (delta?.tool_calls) {
            yield { type: 'tool_call', metadata: delta.tool_calls[0] };
          }

          // Gemini format
          const geminiText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (geminiText) {
            yield { type: 'text', content: geminiText };
          }

          // Metrics
          if (parsed.usage) {
            yield { type: 'metrics', metadata: parsed.usage };
          }

          // Finish reason
          const finishReason = parsed.choices?.[0]?.finish_reason || parsed.candidates?.[0]?.finishReason;
          if (finishReason) {
            yield { type: 'finish', metadata: { finish_reason: finishReason } };
          }
        } catch {
          // Ignore malformed JSON in stream
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Request builder
// ---------------------------------------------------------------------------

function buildPayload(
  provider: string,
  modelId: string,
  prompt: string,
  apiKey: string | undefined,
  settings: AISettings,
  systemInstruction: string | undefined,
  options?: InferenceOptions
): Record<string, any> {
  return {
    model: modelId,
    prompt,
    apiKey,
    settings,
    systemInstruction,
    contents: [
      ...(options?.history?.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })) || []),
      { role: 'user', parts: [{ text: prompt }] },
    ],
    gatewayUrls: options?.gatewayUrls,
    images: options?.images,
    tools: options?.tools,
    responseFormat: settings.responseFormat,
  };
}

// ---------------------------------------------------------------------------
// Core request handler
// ---------------------------------------------------------------------------

async function makeRequest(
  endpoint: string,
  payload: Record<string, any>,
  signal?: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const timeoutSignal = createTimeoutSignal(timeoutMs);
  const mergedSignal = mergeSignals(signal, timeoutSignal);

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream, application/json',
    },
    body: JSON.stringify(payload),
    signal: mergedSignal,
  });
}

// ---------------------------------------------------------------------------
// Provider handler with streaming + fallback
// ---------------------------------------------------------------------------

async function handleProvider(
  provider: string,
  modelId: string,
  prompt: string,
  apiKey: string | undefined,
  settings: AISettings,
  systemInstruction: string | undefined,
  onStream: StreamHandler | undefined,
  signal: AbortSignal | undefined,
  options: InferenceOptions | undefined
): Promise<InferenceResult> {
  const endpoint = PROVIDER_ENDPOINTS[provider];
  if (!endpoint) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const payload = buildPayload(provider, modelId, prompt, apiKey, settings, systemInstruction, options);
  const startTime = Date.now();

  try {
    // Try proxy endpoint first
    const response = await makeRequest(endpoint, payload, signal, onStream ? STREAM_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Proxy error ${response.status}: ${errText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const isSSE = contentType.includes('text/event-stream') || response.headers.get('transfer-encoding') === 'chunked';

    if (isSSE && onStream) {
      // Real streaming
      let fullText = '';
      let reasoning = '';
      const toolCalls: any[] = [];
      let finishReason = 'stop';
      let tokenCount = 0;

      for await (const chunk of parseSSEStream(response)) {
        if (signal?.aborted) break;

        switch (chunk.type) {
          case 'text':
            fullText += chunk.content || '';
            onStream({ type: 'text', content: fullText });
            break;
          case 'reasoning':
            reasoning += chunk.content || '';
            onStream({ type: 'reasoning', content: reasoning });
            break;
          case 'tool_call':
            toolCalls.push(chunk.metadata);
            onStream({ type: 'tool_call', metadata: toolCalls });
            break;
          case 'metrics':
            tokenCount = chunk.metadata?.total_tokens || tokenCount;
            break;
          case 'finish':
            finishReason = chunk.metadata?.finish_reason || finishReason;
            onStream(chunk);
            break;
        }
      }

      const latency = Date.now() - startTime;
      return {
        text: fullText,
        latency,
        tokens: tokenCount || Math.ceil(fullText.length / 4),
        tps: latency > 0 ? Math.round((tokenCount || Math.ceil(fullText.length / 4)) / (latency / 1000)) : 0,
        finishReason,
        reasoning: reasoning || undefined,
        toolCalls: toolCalls.length ? toolCalls : undefined,
      };
    } else {
      // JSON response
      const data = await response.json();
      const text = data.text || data.choices?.[0]?.message?.content || data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      if (onStream) onStream({ type: 'text', content: text });
      
      const latency = Date.now() - startTime;
      return {
        text,
        latency,
        tokens: data.usage?.total_tokens || Math.ceil(text.length / 4),
        finishReason: data.choices?.[0]?.finish_reason || data.candidates?.[0]?.finishReason,
      };
    }
  } catch (error: any) {
    const isAbort = error.name === 'AbortError' || signal?.aborted;
    if (isAbort) throw error;

    console.warn(`[inferenceClient] ${provider} proxy failed, falling back to direct:`, error.message);

    const { directFetch } = await import('./directClient');
    const result = await directFetch(modelId, prompt, {
      apiKey: apiKey || '',
      settings,
      systemInstruction,
      history: options?.history,
      signal,
      gatewayUrls: options?.gatewayUrls,
      onStream: onStream ? (chunk) => onStream(chunk) : undefined,
    });

    return {
      ...result,
      latency: Date.now() - startTime,
    };
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function callAI(
  modelId: string,
  provider: string,
  prompt: string,
  apiKey?: string,
  systemInstruction?: string,
  settings?: AISettings,
  onStream?: (text: string) => void,
  retryCount = 0,
  signal?: AbortSignal,
  nodeId?: string,
  options?: InferenceOptions
): Promise<InferenceResult> {
  validateApiKey(provider, apiKey);

  // Map simple legacy callback to stream handler if specified
  const streamHandler: StreamHandler | undefined = onStream
    ? (chunk) => {
        if (chunk.type === 'text' && chunk.content !== undefined) {
          onStream(chunk.content);
        }
      }
    : undefined;

  try {
    return await handleProvider(
      provider,
      modelId,
      prompt,
      apiKey,
      settings || {},
      systemInstruction,
      streamHandler,
      signal,
      options
    );
  } catch (error: any) {
    const message = error.message || String(error);

    // Retry on transient errors
    if (isTransientError(message) && retryCount < MAX_RETRIES) {
      const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount) + Math.random() * 500;
      console.warn(`[inferenceClient] Retry ${retryCount + 1}/${MAX_RETRIES} for ${provider} in ${delayMs}ms`);
      await delay(delayMs, signal);
      return callAI(modelId, provider, prompt, apiKey, systemInstruction, settings, onStream, retryCount + 1, signal, nodeId, options);
    }

    console.error(`[inferenceClient] Error calling ${provider}/${modelId}:`, error);
    throw new Error(formatProviderError(message));
  }
}

// ---------------------------------------------------------------------------
// Batch inference
// ---------------------------------------------------------------------------

export async function callAIBatch(
  requests: Array<{
    modelId: string;
    provider: string;
    prompt: string;
    apiKey?: string;
    systemInstruction?: string;
    settings?: AISettings;
    options?: InferenceOptions;
  }>,
  concurrency = 3
): Promise<InferenceResult[]> {
  const results: InferenceResult[] = [];
  
  for (let i = 0; i < requests.length; i += concurrency) {
    const batch = requests.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((req) =>
        callAI(
          req.modelId,
          req.provider,
          req.prompt,
          req.apiKey,
          req.systemInstruction,
          req.settings,
          undefined,
          0,
          undefined,
          undefined,
          req.options
        ).catch((error) => ({
          text: `Error: ${error.message}`,
          latency: 0,
          tokens: 0,
        }))
      )
    );
    results.push(...batchResults);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Legacy compatibility
// ---------------------------------------------------------------------------

export function isCodePrompt(prompt: string): boolean {
  const p = prompt.toLowerCase().trim();

  if (prompt.trim().startsWith('CODE: ')) return true;

  const strongKeywords = [
    'generate code', 'write code', 'write a function', 'write a class',
    'implement a function', 'implement a class', 'implement an algorithm',
    'debug this code', 'refactor this', 'fix this code', 'fix the bug',
    'code snippet', 'python script', 'javascript function', 'typescript',
    'sql query', 'bash script', 'shell script', 'html template',
    'css style', 'react component', 'react hook', 'api endpoint',
    'rest api', 'graphql', 'dockerfile', 'kubernetes', 'terraform',
    'unit test', 'test case', 'pseudocode', 'time complexity', 'space complexity',
    'big o', 'recursion', 'data structure', 'linked list', 'binary tree',
    'sorting algorithm', 'merge sort', 'quick sort',
  ];

  if (strongKeywords.some((kw) => p.includes(kw))) return true;
  if (/```[\w]*\n/.test(prompt)) return true;

  const langPattern = /\b(python|javascript|typescript|java|c\+\+|c#|rust|golang|ruby|php|swift|kotlin|scala)\b/;
  const taskPattern = /\b(write|implement|create|build|code|function|class|script|program)\b/;
  if (langPattern.test(p) && taskPattern.test(p)) return true;

  return false;
}
