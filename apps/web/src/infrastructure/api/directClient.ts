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

const DEFAULT_TIMEOUT_MS = 600000; // Increased to 10 minutes to support long requests like 20k words
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
  init: RequestInit & { timeout?: number; isStream?: boolean },
  attempt = 1
): Promise<Response> {
  const { timeout = 600000, isStream, signal: userSignal, ...fetchInit } = init; // Increased to 10 minutes
  const signal = mergeSignals(userSignal, createTimeoutSignal(timeout));

  try {
    const response = await fetch(url, { ...fetchInit, signal });

    // Retry on server error, but NOT on rate limit (429) per user request
    if (
      !response.ok &&
      response.status >= 500 &&
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

function resolveRealGeminiModel(model: string): string {
  // In 2026, the 3.5 and 3.1 models are the actual backend names. 
  // We no longer map to the deprecated 1.5 models.
  return model;
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
      if (m.role === 'system') {
        continue;
      }

      if (m.role === 'assistant' || m.role === 'model') {
        const parts: any[] = [];
        if (m.content) {
          parts.push({ text: m.content });
        }
        const toolCalls = m.toolCalls || m.tool_calls;
        if (toolCalls && Array.isArray(toolCalls)) {
          for (const tc of toolCalls) {
            const name = tc.name || tc.function?.name;
            let args = tc.arguments || tc.function?.arguments || {};
            if (typeof args === 'string') {
              try {
                args = JSON.parse(args);
              } catch {
                args = {};
              }
            }
            parts.push({
              functionCall: {
                name,
                args
              }
            });
          }
        }
        if (parts.length > 0) {
          contents.push({
            role: 'model',
            parts,
          });
        }
      } else if (m.role === 'tool' || m.role === 'function') {
        const name = m.name;
        const output = m.content || m.result || '';
        
        let outputObj: any;
        try {
          outputObj = typeof output === 'string' ? JSON.parse(output) : output;
        } catch {
          outputObj = { output };
        }
        if (typeof outputObj !== 'object' || outputObj === null || Array.isArray(outputObj)) {
          outputObj = { output: outputObj };
        }
        
        const part = {
          functionResponse: {
            name,
            response: outputObj
          }
        };
        
        let merged = false;
        if (contents.length > 0) {
          const lastMsg = contents[contents.length - 1];
          if (lastMsg.role === 'user' && Array.isArray(lastMsg.parts)) {
            const hasFuncResponse = lastMsg.parts.some((p: any) => p.functionResponse !== undefined);
            if (hasFuncResponse) {
              lastMsg.parts.push(part);
              merged = true;
            }
          }
        }
        
        if (!merged) {
          contents.push({
            role: 'user',
            parts: [part]
          });
        }
      } else {
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
          role: 'user',
          parts,
        });
      }
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
  let finalSystemInstruction = options.systemInstruction || '';

  // Apply Fix 1 for Gemma models: forbid reasoning traces
  if (model.toLowerCase().includes('gemma')) {
    const suppressReasoningInstruction = `You are a helpful AI assistant. Respond directly to the user. 
Do NOT show your internal reasoning, planning, or thought process. 
Do NOT include sections like "Intent:", "Identity:", "Drafting:", or "Refining:". 
Just give the final answer in a natural, conversational tone.`;

    if (finalSystemInstruction) {
      finalSystemInstruction += `\n\n${suppressReasoningInstruction}`;
    } else {
      finalSystemInstruction = suppressReasoningInstruction;
    }
  }

  if (finalSystemInstruction) {
    if (model.toLowerCase().includes('gemma')) {
      // The Gemini API currently ignores systemInstruction for Gemma models.
      // We must inject it directly into the first user message.
      if (contents.length > 0 && contents[0].role === 'user') {
        contents[0].parts.unshift({ text: `System Instruction:\n${finalSystemInstruction}\n\n` });
      } else {
        // Fallback in case the first message isn't 'user' (rare)
        contents.unshift({ role: 'user', parts: [{ text: `System Instruction:\n${finalSystemInstruction}` }] });
        contents.unshift({ role: 'model', parts: [{ text: 'Acknowledged.' }] });
      }
    } else {
      requestBody.systemInstruction = {
        parts: [{ text: finalSystemInstruction }],
      };
    }
  }

  requestBody.generationConfig = {};
  if (options.settings) {
    if (options.settings.temperature !== undefined)
      requestBody.generationConfig.temperature = options.settings.temperature;
    if (options.settings.topP !== undefined)
      requestBody.generationConfig.topP = options.settings.topP;
    if (options.settings.maxTokens !== undefined)
      requestBody.generationConfig.maxOutputTokens = options.settings.maxTokens;
  }

  // Apply Fix 2 for Gemma models: overwrite sensitive sampling parameters
  if (model.toLowerCase().includes('gemma')) {
    requestBody.generationConfig.temperature = 0.7;
    requestBody.generationConfig.topP = 0.95;
    requestBody.generationConfig.topK = 40;
    // No maxOutputTokens cap — Gemma models support unlimited output natively
    delete requestBody.generationConfig.maxOutputTokens;
  }


  // Add tools if provided
  if (options.tools && options.tools.length > 0) {
    requestBody.tools = [
      {
        functionDeclarations: options.tools.map((t: any) => ({
          name: t.name || t.function?.name,
          description: t.description || t.function?.description,
          parameters: t.parameters || t.function?.parameters,
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
      timeoutMs: 600000,
      onChunk: (delta, accumulated) => {
        fullText = accumulated;
        options.onStream?.({ type: 'text', content: delta, metadata: { accumulated } });
      },
      onReasoning: (delta, accumulated) => {
        options.onStream?.({ type: 'reasoning', content: delta, metadata: { accumulated } });
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
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts
    .filter((part: any) => !part.thought)
    .map((part: any) => part.text)
    .filter(Boolean)
    .join('');
  const finishReason = data.candidates?.[0]?.finishReason;

  const reasoning = parts
    .filter((part: any) => part.thought)
    .map((part: any) => part.text)
    .filter(Boolean)
    .join('');

  if (!text && !reasoning) {
    throw new Error('Gemini API returned no response text.');
  }

  const latency = Math.round(performance.now() - startTime);
  const inputTokens = Math.ceil(prompt.length / 4); // heuristic
  const outputTokens = Math.ceil((text || reasoning).length / 4);
  const tokens = inputTokens + outputTokens;
  const cost = estimateCost(realModel, inputTokens, outputTokens);

  return {
    text,
    reasoning: reasoning || undefined,
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
