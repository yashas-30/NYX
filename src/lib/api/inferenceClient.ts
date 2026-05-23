/**
 * @file src/lib/api/inferenceClient.ts
 * @description Unified inference client for all AI providers.
 * Uses the same direct Express endpoints as the Coder page (AIService).
 */

import { isTransientError, formatProviderError } from './streamParser';

export interface AISettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
}

export interface InferenceOptions {
  lmStudioBaseUrl?: string;
  ollamaBaseUrl?: string;
  history?: any[];
  nodeId?: string;
  gatewayUrls?: Record<string, string>;
}

export interface InferenceResult {
  text: string;
  latency: number;
}

function validateApiKey(provider: string, apiKey?: string): void {
  if (!apiKey) return;
  const key = apiKey.trim();
  if (provider === 'openrouter' && !key.startsWith('sk-or-')) {
    throw new Error("Invalid OpenRouter API Key format (must start with 'sk-or-')");
  }
  if (provider === 'gemini' && key.length < 30) {
    throw new Error("Invalid Gemini API Key format (too short)");
  }
}

async function requestDirect(endpoint: string, payload: Record<string, any>, provider: string, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((err as any).error || `Request failed: ${response.status}`);
  }
  return response;
}

async function handleGemini(model: string, prompt: string, apiKey: string | undefined, settings: AISettings, systemInstruction: string | undefined, history: any[] | undefined, onStream: ((text: string) => void) | undefined, signal: AbortSignal | undefined, gatewayUrls?: Record<string, string>): Promise<string> {
  // Bypassed: Gemini is proxied key-free to the local Hugging Face service
  // if (!apiKey) throw new Error("Gemini API key is required.");
  try {
    const response = await requestDirect('/api/gemini/stream', { model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls }, 'Gemini', signal);
    const data = await response.json();
    const text = data.text || '';
    if (onStream) onStream(text);
    if (!text) throw new Error("No response from Gemini API.");
    return text;
  } catch (error: any) {
    const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
    if (!isAbort) {
      console.warn('[inferenceClient] Gemini stream proxy failed, falling back to direct browser fetch:', error);
      const { directFetchGemini } = await import('./directClient');
      const text = await directFetchGemini(model, prompt, apiKey || '', settings, systemInstruction, history, signal, gatewayUrls);
      if (onStream) onStream(text);
      return text;
    }
    throw error;
  }
}

async function handleOllama(nodeId: string, model: string, prompt: string, systemInstruction: string | undefined, settings: AISettings | undefined, baseUrl: string | undefined, history: any[] | undefined, onStream: ((text: string) => void) | undefined, signal: AbortSignal | undefined): Promise<string> {
    const { ollamaChat } = await import('@/src/lib/api/ollamaClient');
    let resultText = "";
    return new Promise((resolve, reject) => {
      ollamaChat({
        nodeId: nodeId ?? model,
        model, prompt, systemInstruction, settings, history, baseUrl,
        onChunk: (_, accumulated) => {
          resultText = accumulated;
          if (onStream) onStream(accumulated);
        },
        onDone: () => resolve(resultText),
        onError: (msg) => reject(new Error(msg))
      });
      if (signal) {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      }
    });
  }

async function handleLMStudio(nodeId: string, model: string, prompt: string, systemInstruction: string | undefined, settings: AISettings | undefined, baseUrl: string | undefined, history: any[] | undefined, onStream: ((text: string) => void) | undefined, signal: AbortSignal | undefined): Promise<string> {
    const { lmStudioChat } = await import('@/src/lib/api/lmStudioClient');
    let resultText = "";
    return new Promise((resolve, reject) => {
      lmStudioChat({
        nodeId: nodeId ?? model,
        model, prompt, systemInstruction, settings, history, baseUrl,
        onChunk: (_, accumulated) => {
          resultText = accumulated;
          if (onStream) onStream(accumulated);
        },
        onDone: () => resolve(resultText),
        onError: (msg) => reject(new Error(msg))
      });
      if (signal) {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      }
    });
  }

async function handleOpenRouter(model: string, prompt: string, apiKey: string, settings: AISettings, systemInstruction: string | undefined, history: any[] | undefined, onStream: ((text: string) => void) | undefined, signal: AbortSignal | undefined, gatewayUrls?: Record<string, string>): Promise<string> {
  if (!apiKey) throw new Error("OpenRouter API key is required.");
  try {
    const response = await requestDirect('/api/openrouter/stream', { model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls }, 'OpenRouter', signal);
    const data = await response.json();
    const text = data.text || '';
    if (onStream) onStream(text);
    if (!text) throw new Error("OpenRouter returned no response.");
    return text;
  } catch (error: any) {
    const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
    if (!isAbort) {
      console.warn('[inferenceClient] OpenRouter stream proxy failed, falling back to direct browser fetch:', error);
      const { directFetchOpenRouter } = await import('./directClient');
      const text = await directFetchOpenRouter(model, prompt, apiKey, settings, systemInstruction, history, signal, gatewayUrls);
      if (onStream) onStream(text);
      return text;
    }
    throw error;
  }
}

async function handleNvidia(model: string, prompt: string, apiKey: string, settings: AISettings, systemInstruction: string | undefined, history: any[] | undefined, onStream: ((text: string) => void) | undefined, signal: AbortSignal | undefined, gatewayUrls?: Record<string, string>): Promise<string> {
  // NVIDIA NIM models - requires API key
  if (!apiKey) throw new Error("NVIDIA API key is required. Add your nvapi-* key in Settings.");
  try {
    const response = await requestDirect('/api/nvidia/stream', { model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls }, 'NVIDIA', signal);
    const data = await response.json();
    const text = data.text || '';
    if (onStream) onStream(text);
    if (!text) throw new Error("NVIDIA returned no response.");
    return text;
  } catch (error: any) {
    const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
    if (!isAbort) {
      console.warn('[inferenceClient] NVIDIA stream proxy failed, falling back to direct browser fetch:', error);
      const { directFetchNvidia } = await import('./directClient');
      const text = await directFetchNvidia(model, prompt, apiKey, settings, systemInstruction, history, signal, gatewayUrls);
      if (onStream) onStream(text);
      return text;
    }
    throw error;
  }
}

async function handleOpenCode(model: string, prompt: string, apiKey: string | undefined, settings: AISettings, systemInstruction: string | undefined, history: any[] | undefined, onStream: ((text: string) => void) | undefined, signal: AbortSignal | undefined, gatewayUrls?: Record<string, string>): Promise<string> {
  try {
    const response = await requestDirect('/api/opencode/stream', { model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls }, 'OpenCode', signal);
    const data = await response.json();
    const text = data.text || '';
    if (onStream) onStream(text);
    return text;
  } catch (error: any) {
    const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
    if (!isAbort) {
      console.warn('[inferenceClient] OpenCode stream proxy failed, falling back to direct browser fetch:', error);
      const { directFetchOpenCode } = await import('./directClient');
      const text = await directFetchOpenCode(model, prompt, apiKey, settings, systemInstruction, history, signal, gatewayUrls);
      if (onStream) onStream(text);
      return text;
    }
    throw error;
  }
}

export async function callAI(
  modelId: string, provider: string, prompt: string, apiKey?: string,
  systemInstruction?: string, settings?: AISettings,
  onStream?: (text: string) => void, retryCount = 0,
  signal?: AbortSignal, nodeId?: string, options?: InferenceOptions
): Promise<InferenceResult> {
  const startTime = Date.now();
  validateApiKey(provider, apiKey);

  try {
    let resultText = "";
    switch (provider) {
      case 'gemini': resultText = await handleGemini(modelId, prompt, apiKey!, settings, systemInstruction, options?.history, onStream, signal, options?.gatewayUrls); break;
      case 'ollama': resultText = await handleOllama(nodeId ?? modelId, modelId, prompt, systemInstruction, settings, options?.ollamaBaseUrl, options?.history, onStream, signal); break;
      case 'lmstudio': resultText = await handleLMStudio(nodeId ?? modelId, modelId, prompt, systemInstruction, settings, options?.lmStudioBaseUrl, options?.history, onStream, signal); break;
      case 'openrouter': resultText = await handleOpenRouter(modelId, prompt, apiKey!, settings, systemInstruction, options?.history, onStream, signal, options?.gatewayUrls); break;
      case 'nvidia': resultText = await handleNvidia(modelId, prompt, apiKey!, settings, systemInstruction, options?.history, onStream, signal, options?.gatewayUrls); break;
      case 'opencode': resultText = await handleOpenCode(modelId, prompt, apiKey, settings, systemInstruction, options?.history, onStream, signal, options?.gatewayUrls); break;
      default: throw new Error(`Unsupported provider: ${provider}`);
    }
    return { text: resultText, latency: Date.now() - startTime };
  } catch (error: any) {
    const message = error.message || String(error);
    if (isTransientError(message) && retryCount < 2) {
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 4000));
      return callAI(modelId, provider, prompt, apiKey, systemInstruction, settings, onStream, retryCount + 1, signal, nodeId, options);
    }
    console.error(`Error calling ${provider} model ${modelId}:`, error);
    throw new Error(formatProviderError(message));
  }
}

export function isCodePrompt(prompt: string): boolean {
  const p = prompt.toLowerCase().trim();

  // Explicit code prefix override
  if (prompt.trim().startsWith('CODE: ')) return true;

  // Strong code-specific keywords unlikely to appear in plain text
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
    'sorting algorithm', 'merge sort', 'quick sort'
  ];

  if (strongKeywords.some(kw => p.includes(kw))) return true;

  // Code block in the prompt itself
  if (/```[\w]*\n/.test(prompt)) return true;

  // Explicit programming language mentions combined with task words
  const langPattern = /\b(python|javascript|typescript|java|c\+\+|c#|rust|golang|ruby|php|swift|kotlin|scala)\b/;
  const taskPattern = /\b(write|implement|create|build|code|function|class|script|program)\b/;
  if (langPattern.test(p) && taskPattern.test(p)) return true;

  return false;
}
