/**
 * @file src/infrastructure/api/streamParser.ts
 * @description Production-grade SSE stream parser with reasoning extraction,
 *   tool call accumulation, metrics tracking, and Claude/Kimi-parity features.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamParserOptions {
  onChunk?: (delta: string, fullText: string) => void;
  onReasoning?: (delta: string, fullReasoning: string) => void;
  onToolCall?: (toolCall: ToolCallDelta, accumulated: ToolCall[]) => void;
  onMetrics?: (metrics: StreamMetrics) => void;
  onError?: (error: string) => void;
  onFinish?: (reason: FinishReason) => void;
  signal?: AbortSignal;
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface ToolCall {
  index: number;
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface StreamMetrics {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
}

export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';

export interface ParseResult {
  text: string;
  reasoning: string;
  toolCalls: ToolCall[];
  metrics: StreamMetrics;
  finishReason: FinishReason | null;
}

// ---------------------------------------------------------------------------
// Timeout utilities
// ---------------------------------------------------------------------------

export function createTimeoutController(timeoutMs: number): AbortController {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Clean up timer if manually aborted
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });

  return controller;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

const TRANSIENT_PATTERNS = [
  /429/,
  /502/,
  /503/,
  /504/,
  /RESOURCE_EXHAUSTED/,
  /UNAVAILABLE/,
  /rate_limit/i,
  /quota/i,
  /overloaded/i,
  /high demand/i,
  /timeout/i,
  /network/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /fetch failed/i,
  /temporarily unavailable/i,
];

export function isTransientError(message: string): boolean {
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(message));
}

export function formatProviderError(message: string): string {
  if (/RESOURCE_EXHAUSTED|429|quota|rate.limit/i.test(message)) {
    return 'API quota exceeded. Check your provider dashboard or wait before retrying.';
  }
  if (/503|UNAVAILABLE|overloaded|high demand|temporarily unavailable/i.test(message)) {
    return 'Model is currently overloaded. Please try again in a moment.';
  }
  if (/502|504|gateway|bad gateway/i.test(message)) {
    return 'Gateway error. The service may be experiencing issues.';
  }
  if (/No response|PROTOCOL HALT|empty response/i.test(message)) {
    return 'No response from API. The service may be down or the model returned empty output.';
  }
  if (/Invalid API key|401|unauthorized|forbidden|403/i.test(message)) {
    return 'Authentication failed. Please check your API key in Settings.';
  }
  if (/timeout|ETIMEDOUT|took too long/i.test(message)) {
    return 'Request timed out. The model may be overloaded or your connection is slow.';
  }
  if (/Circuit breaker open/i.test(message)) {
    return 'Too many consecutive errors from this provider. The system has temporarily paused requests to prevent spam. Please wait a moment and try again.';
  }
  return message;
}

// ---------------------------------------------------------------------------
// SSE Line parser
// ---------------------------------------------------------------------------

interface SSELine {
  event?: string;
  data: string;
  id?: string;
  retry?: number;
}

function parseSSELine(line: string): SSELine | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) return null;

  // Handle "data: ..." format
  if (trimmed.startsWith('data: ')) {
    return { data: trimmed.slice(6).trim() };
  }

  // Handle "event: ..." format
  if (trimmed.startsWith('event: ')) {
    return { event: trimmed.slice(7).trim(), data: '' };
  }

  // Handle "id: ..." format
  if (trimmed.startsWith('id: ')) {
    return { id: trimmed.slice(4).trim(), data: '' };
  }

  // Raw JSON without prefix (some providers)
  return { data: trimmed };
}

// ---------------------------------------------------------------------------
// Content extractors for different providers
// ---------------------------------------------------------------------------

interface ExtractedContent {
  text?: string;
  reasoning?: string;
  toolCall?: ToolCallDelta;
  usage?: StreamMetrics;
  finishReason?: FinishReason;
  error?: string;
  tokenRotate?: string;
}

function extractContent(parsed: any): ExtractedContent {
  const result: ExtractedContent = {};

  // Error handling
  if (parsed.error) {
    result.error =
      typeof parsed.error === 'object'
        ? parsed.error.message || parsed.error.code || JSON.stringify(parsed.error)
        : String(parsed.error);
    return result;
  }

  // Token rotation (your auth system)
  if (parsed.tokenRotate) {
    result.tokenRotate = parsed.tokenRotate;
  }

  // Usage metrics (OpenAI sends on final chunk)
  if (parsed.usage) {
    result.usage = {
      promptTokens: parsed.usage.prompt_tokens,
      completionTokens: parsed.usage.completion_tokens,
      totalTokens: parsed.usage.total_tokens,
    };
  }

  // Finish reason
  if (parsed.finish_reason || parsed.choices?.[0]?.finish_reason) {
    const reason = parsed.finish_reason || parsed.choices?.[0]?.finish_reason;
    if (['stop', 'length', 'tool_calls', 'content_filter'].includes(reason)) {
      result.finishReason = reason;
    }
  }

  // OpenAI format
  const choice = parsed.choices?.[0];
  if (choice) {
    const delta = choice.delta || choice.message;

    if (delta?.content) {
      result.text = delta.content;
    }

    // Reasoning / thinking (Claude, DeepSeek, etc.)
    if (delta?.reasoning_content || delta?.thinking) {
      result.reasoning = delta.reasoning_content || delta.thinking;
    }

    // Tool calls (accumulated)
    if (delta?.tool_calls) {
      const tc = delta.tool_calls[0];
      result.toolCall = {
        index: tc.index || 0,
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function?.name,
          arguments: tc.function?.arguments,
        },
      };
    }
  }

  // Unified format { chunk: "text" }
  if (typeof parsed.chunk === 'string') {
    result.text = parsed.chunk;
  }

  // Ollama formats
  if (parsed.message?.content) {
    result.text = parsed.message.content;
  }
  if (typeof parsed.response === 'string') {
    result.text = parsed.response;
  }

  // Gemini format
  const geminiText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
  if (geminiText) {
    result.text = geminiText;
  }

  // Raw text field
  if (typeof parsed.text === 'string') {
    result.text = parsed.text;
  }

  // Gemini function calls
  const geminiFunctionCall = parsed.candidates?.[0]?.content?.parts?.[0]?.functionCall;
  if (geminiFunctionCall) {
    result.toolCall = {
      index: 0,
      id: `${geminiFunctionCall.name}_${Date.now()}`,
      type: 'function',
      function: {
        name: geminiFunctionCall.name,
        arguments:
          typeof geminiFunctionCall.args === 'string'
            ? geminiFunctionCall.args
            : JSON.stringify(geminiFunctionCall.args),
      },
    };
  }

  // functionCall from backend
  if (parsed.functionCall) {
    result.toolCall = {
      index: 0, // Gemini only returns one function call per chunk usually
      id: parsed.functionCall.name + '_' + Date.now(),
      type: 'function',
      function: {
        name: parsed.functionCall.name,
        arguments:
          typeof parsed.functionCall.args === 'string'
            ? parsed.functionCall.args
            : JSON.stringify(parsed.functionCall.args),
      },
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export async function parseSSEStream(
  response: Response,
  options: StreamParserOptions & { timeoutMs?: number }
): Promise<ParseResult> {
  const {
    onChunk,
    onReasoning,
    onToolCall,
    onMetrics,
    onError,
    onFinish,
    signal,
    timeoutMs = 120000,
  } = options;

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Result accumulation
  let resultText = '';
  let resultReasoning = '';
  const toolCallsMap = new Map<number, ToolCall>();
  let metrics: StreamMetrics = {};
  let finishReason: FinishReason | null = null;

  // Timeout handling
  const timeoutCtrl = createTimeoutController(timeoutMs);
  const abortHandler = () => timeoutCtrl.abort();
  signal?.addEventListener('abort', abortHandler, { once: true });

  const startTime = performance.now();

  let isThinking = false;
  let streamBuffer = '';
  let lastGeminiText = '';

  const processStreamBuffer = (flush = false) => {
    while (streamBuffer.length > 0) {
      if (!isThinking) {
        const startIdx = streamBuffer.indexOf('<think>');
        if (startIdx !== -1) {
          const before = streamBuffer.slice(0, startIdx);
          if (before) {
            resultText += before;
            onChunk?.(before, resultText);
          }
          isThinking = true;
          streamBuffer = streamBuffer.slice(startIdx + 7);
          continue;
        }

        let partialIdx = -1;
        if (!flush) {
          // fallow-ignore-next-line code-duplication
          const target = '<think>';
          for (
            let i = Math.max(0, streamBuffer.length - target.length);
            i < streamBuffer.length;
            i++
          ) {
            if (streamBuffer[i] === target[0] && target.startsWith(streamBuffer.slice(i))) {
              partialIdx = i;
              break;
            }
          }
        }

        if (partialIdx !== -1) {
          const safePart = streamBuffer.slice(0, partialIdx);
          if (safePart) {
            resultText += safePart;
            onChunk?.(safePart, resultText);
          }
          streamBuffer = streamBuffer.slice(partialIdx);
          break;
        } else {
          resultText += streamBuffer;
          onChunk?.(streamBuffer, resultText);
          streamBuffer = '';
        }
      } else {
        const endIdx = streamBuffer.indexOf('</think>');
        if (endIdx !== -1) {
          const reasoningDelta = streamBuffer.slice(0, endIdx);
          if (reasoningDelta) {
            resultReasoning += reasoningDelta;
            onReasoning?.(reasoningDelta, resultReasoning);
          }
          isThinking = false;
          streamBuffer = streamBuffer.slice(endIdx + 8);
          continue;
        }

        let partialIdx = -1;
        if (!flush) {
          // fallow-ignore-next-line code-duplication
          const target = '</think>';
          for (
            let i = Math.max(0, streamBuffer.length - target.length);
            i < streamBuffer.length;
            i++
          ) {
            if (streamBuffer[i] === target[0] && target.startsWith(streamBuffer.slice(i))) {
              partialIdx = i;
              break;
            }
          }
        }

        if (partialIdx !== -1) {
          const safePart = streamBuffer.slice(0, partialIdx);
          if (safePart) {
            resultReasoning += safePart;
            onReasoning?.(safePart, resultReasoning);
          }
          streamBuffer = streamBuffer.slice(partialIdx);
          break;
        } else {
          resultReasoning += streamBuffer;
          onReasoning?.(streamBuffer, resultReasoning);
          streamBuffer = '';
        }
      }
    }
  };

  try {
    while (true) {
      // Check abort
      if (signal?.aborted || timeoutCtrl.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // fallow-ignore-next-line code-duplication
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const sseLine = parseSSELine(line);
        if (!sseLine) continue;

        // Handle [DONE] sentinel
        if (sseLine.data === '[DONE]' || sseLine.data === '[done]') {
          // fallow-ignore-next-line code-duplication
          processStreamBuffer(true);
          finishReason = finishReason || 'stop';
          onFinish?.(finishReason);
          return {
            text: resultText,
            reasoning: resultReasoning,
            toolCalls: Array.from(toolCallsMap.values()),
            metrics: { ...metrics, latencyMs: Math.round(performance.now() - startTime) },
            finishReason,
          };
        }

        // Skip empty data
        if (!sseLine.data) continue;

        // Parse JSON
        let parsed: any;
        try {
          parsed = JSON.parse(sseLine.data);
        } catch {
          // Partial JSON — accumulate in buffer for next iteration
          // But we already split by newline, so this is likely garbage
          continue;
        }

        const extracted = extractContent(parsed);

        // Handle errors
        if (extracted.error) {
          onError?.(extracted.error);
          throw new Error(extracted.error);
        }

        // Handle token rotation
        if (extracted.tokenRotate) {
          // Notify auth system
          if (typeof window !== 'undefined') {
            (window as any).__nyx_tokenRotate?.(extracted.tokenRotate);
          }
        }

        // Accumulate text with <think> tag support
        if (extracted.text) {
          // Gemini sends full text each time, not deltas - extract only new text
          const delta = extracted.text.slice(lastGeminiText.length);
          if (delta) {
            streamBuffer += delta;
            processStreamBuffer();
          }
          lastGeminiText = extracted.text;
        }

        // Accumulate reasoning
        if (extracted.reasoning) {
          resultReasoning += extracted.reasoning;
          onReasoning?.(extracted.reasoning, resultReasoning);
        }

        // Accumulate tool calls
        if (extracted.toolCall) {
          const tc = extracted.toolCall;
          const existing = toolCallsMap.get(tc.index);

          if (existing) {
            // Merge partial tool call
            existing.function.name = existing.function.name || tc.function?.name || '';
            existing.function.arguments += tc.function?.arguments || '';
          } else if (tc.id) {
            // New tool call
            toolCallsMap.set(tc.index, {
              index: tc.index,
              id: tc.id,
              type: tc.type || 'function',
              function: {
                name: tc.function?.name || '',
                arguments: tc.function?.arguments || '',
              },
            });
          }

          onToolCall?.(tc, Array.from(toolCallsMap.values()));
        }

        // Metrics
        if (extracted.usage) {
          metrics = { ...metrics, ...extracted.usage };
          onMetrics?.(metrics);
        }

        // Finish reason
        if (extracted.finishReason) {
          finishReason = extracted.finishReason;
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const sseLine = parseSSELine(buffer.trim());
      if (sseLine?.data && sseLine.data !== '[DONE]') {
        try {
          const parsed = JSON.parse(sseLine.data);
          const extracted = extractContent(parsed);

          if (extracted.text) {
            streamBuffer += extracted.text;
            processStreamBuffer();
          }
          if (extracted.reasoning) {
            resultReasoning += extracted.reasoning;
            onReasoning?.(extracted.reasoning, resultReasoning);
          }
          if (extracted.finishReason) {
            finishReason = extracted.finishReason;
          }
        } catch {
          // Final buffer was partial JSON, ignore
        }
      }
    }

    // fallow-ignore-next-line code-duplication
    processStreamBuffer(true);
    finishReason = finishReason || 'stop';
    onFinish?.(finishReason);

    return {
      text: resultText,
      reasoning: resultReasoning,
      toolCalls: Array.from(toolCallsMap.values()),
      metrics: { ...metrics, latencyMs: Math.round(performance.now() - startTime) },
      finishReason,
    };
  } finally {
    reader.releaseLock();
    signal?.removeEventListener('abort', abortHandler);
    // timeoutCtrl cleanup handled by its own abort listener
  }
}

// ---------------------------------------------------------------------------
// Legacy compatibility wrapper
// ---------------------------------------------------------------------------

export async function parseSSEStreamLegacy(
  response: Response,
  options: StreamParserOptions & { timeoutMs?: number; onDone?: () => void }
): Promise<string> {
  const { onChunk, onError, onDone, ...rest } = options;

  const result = await parseSSEStream(response, {
    ...rest,
    onChunk,
    onError,
    onFinish: () => onDone?.(),
  });

  return result.text;
}

// ---------------------------------------------------------------------------
// Batch parser for non-streaming responses
// ---------------------------------------------------------------------------

export async function parseJSONResponse(response: Response): Promise<ParseResult> {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let message = `HTTP ${response.status}`;
    try {
      const data = JSON.parse(text);
      message = data.error?.message || data.error?.code || message;
    } catch {
      message = text || message;
    }
    throw new Error(message);
  }

  const data = await response.json();
  const extracted = extractContent(data);

  if (extracted.error) {
    throw new Error(extracted.error);
  }

  return {
    text: extracted.text || '',
    reasoning: extracted.reasoning || '',
    toolCalls: [],
    metrics: extracted.usage || {},
    finishReason: extracted.finishReason || 'stop',
  };
}
