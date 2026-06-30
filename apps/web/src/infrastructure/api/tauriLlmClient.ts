import { invoke, Channel } from '@tauri-apps/api/core';
import { StreamParserOptions, ParseResult } from './streamParser';
import { stripThinkingContent } from '../../utils/textUtils';

// ── Per-provider max token defaults (Fix 2 — mirrors llm.rs constants) ───────
const PROVIDER_MAX_TOKENS: Record<string, number> = {
  'nyx-native': 8_192,
  openrouter: 16_384,
  gemini: 8_192,
};

export interface TauriLlmRequest {
  provider: string;
  model_id: string;
  messages: Array<{ role: string; content: string | any[] }>;
  system_instruction?: string;
  api_key: string;
  temperature?: number;
  /** Override the per-provider default max output tokens. */
  max_tokens?: number;
  endpoint_override?: string;
  tools?: any[];
}

export async function tauriLlmStream(
  req: TauriLlmRequest,
  options: StreamParserOptions & { timeoutMs?: number; signal?: AbortSignal }
): Promise<ParseResult> {
  // Sanitize history to prevent reasoning block context bloat
  const sanitizedMessages = req.messages.map((m) => {
    if ((m.role === 'assistant' || m.role === 'model') && typeof m.content === 'string') {
      return { ...m, content: stripThinkingContent(m.content) };
    }
    return m;
  });

  // Resolve max_tokens: caller > provider default
  const max_tokens = req.max_tokens ?? PROVIDER_MAX_TOKENS[req.provider] ?? 8_192;

  let accumulatedText = '';
  let accumulatedReasoning = '';
  let finishReason: any = null;
  const toolCalls: any[] = [];
  const metrics: any = { latencyMs: 0 };
  const startTime = Date.now();

  let isThinking = false;
  let streamBuffer = '';

  const processStreamBuffer = (flush = false) => {
    while (streamBuffer.length > 0) {
      if (!isThinking) {
        let startIdx = streamBuffer.indexOf('<think>');
        let startLen = 7;
        
        if (startIdx === -1) {
          startIdx = streamBuffer.indexOf('<|channel>thought');
          startLen = 17;
        }

        if (startIdx !== -1) {
          const before = streamBuffer.slice(0, startIdx);
          if (before) {
            accumulatedText += before;
            options.onChunk?.(before, accumulatedText);
          }
          isThinking = true;
          streamBuffer = streamBuffer.slice(startIdx + startLen);
          continue;
        }

        let partialIdx = -1;
        if (!flush) {
          const targets = ['<think>', '<|channel>thought'];
          for (const target of targets) {
            for (
              let i = Math.max(0, streamBuffer.length - target.length);
              i < streamBuffer.length;
              i++
            ) {
              if (streamBuffer[i] === target[0] && target.startsWith(streamBuffer.slice(i))) {
                partialIdx = partialIdx === -1 ? i : Math.min(partialIdx, i);
              }
            }
          }
        }

        if (partialIdx !== -1) {
          const safePart = streamBuffer.slice(0, partialIdx);
          if (safePart) {
            accumulatedText += safePart;
            options.onChunk?.(safePart, accumulatedText);
          }
          streamBuffer = streamBuffer.slice(partialIdx);
          break;
        } else {
          accumulatedText += streamBuffer;
          options.onChunk?.(streamBuffer, accumulatedText);
          streamBuffer = '';
        }
      } else {
        let endIdx = streamBuffer.indexOf('</think>');
        let endLen = 8;
        
        if (endIdx === -1) {
          endIdx = streamBuffer.indexOf('<channel|>');
          endLen = 10;
        }

        if (endIdx !== -1) {
          const reasoningDelta = streamBuffer.slice(0, endIdx);
          if (reasoningDelta) {
            accumulatedReasoning += reasoningDelta;
            options.onReasoning?.(reasoningDelta, accumulatedReasoning);
          }
          isThinking = false;
          streamBuffer = streamBuffer.slice(endIdx + endLen);
          continue;
        }

        let partialIdx = -1;
        if (!flush) {
          const targets = ['</think>', '<channel|>'];
          for (const target of targets) {
            for (
              let i = Math.max(0, streamBuffer.length - target.length);
              i < streamBuffer.length;
              i++
            ) {
              if (streamBuffer[i] === target[0] && target.startsWith(streamBuffer.slice(i))) {
                partialIdx = partialIdx === -1 ? i : Math.min(partialIdx, i);
              }
            }
          }
        }

        if (partialIdx !== -1) {
          const safePart = streamBuffer.slice(0, partialIdx);
          if (safePart) {
            accumulatedReasoning += safePart;
            options.onReasoning?.(safePart, accumulatedReasoning);
          }
          streamBuffer = streamBuffer.slice(partialIdx);
          break;
        } else {
          accumulatedReasoning += streamBuffer;
          options.onReasoning?.(streamBuffer, accumulatedReasoning);
          streamBuffer = '';
        }
      }
    }
  };

  return new Promise<ParseResult>((resolve, reject) => {
    let settled = false;

    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId ?? undefined);
        options.signal?.removeEventListener('abort', onAbort);
        fn();
      }
    };

    // ── Tauri v2 Channel — direct low-latency IPC, no global event bus ──
    const channel = new Channel<any>((payload) => {
      if (payload.error) {
        settle(() => {
          options.onError?.(payload.error);
          reject(new Error(payload.error));
        });
        return;
      }

      if (payload.done || payload.type === 'done') {
        settle(() => {
          processStreamBuffer(true);
          finishReason = 'stop';
          options.onFinish?.(finishReason);
          resolve({
            text: accumulatedText,
            reasoning: accumulatedReasoning,
            toolCalls,
            metrics: { ...metrics, latencyMs: Date.now() - startTime },
            finishReason,
          });
        });
        return;
      }

      // Handle pre-parsed events from Rust
      if (payload.type === 'text' && payload.content) {
        // Handle Anthropic interleaved thinking
        if (payload.content.startsWith('\x00THINK\x00')) {
          const thinking = payload.content.replace('\x00THINK\x00', '');
          accumulatedReasoning += thinking;
          options.onReasoning?.(thinking, accumulatedReasoning);
        } else {
          streamBuffer += payload.content;
          processStreamBuffer();
        }
      } else if (payload.type === 'thinking' && payload.content) {
        accumulatedReasoning += payload.content;
        options.onReasoning?.(payload.content, accumulatedReasoning);
      } else if (payload.type === 'tool_start') {
        // Rust sends: tool_call: { id: ... }, name: ...
        const newTool = {
          index: toolCalls.length,
          id: payload.tool_call?.id || `call_${Date.now()}`,
          type: 'function',
          function: {
            name: payload.name || 'unknown',
            arguments: ''
          }
        };
        toolCalls.push(newTool);
        options.onToolCall?.(newTool as any, toolCalls);
      } else if (payload.type === 'tool_call' && payload.content) {
        // Rust sends tool arguments in content
        if (toolCalls.length > 0) {
          const current = toolCalls[toolCalls.length - 1];
          current.function.arguments += payload.content;
          options.onToolCall?.({ index: current.index, function: { arguments: payload.content } } as any, toolCalls);
        }
      }
    });

    // Timeout support — abort stream if no response within timeoutMs
    const timeoutId = options.timeoutMs
      ? setTimeout(() => {
          settle(() => reject(new Error(`Stream timeout after ${options.timeoutMs}ms`)));
        }, options.timeoutMs)
      : null;

    // AbortSignal support
    const onAbort = () => {
      settle(() => {
        processStreamBuffer(true);
        resolve({
          text: accumulatedText,
          reasoning: accumulatedReasoning,
          toolCalls,
          metrics: { ...metrics, latencyMs: Date.now() - startTime },
          finishReason: 'stop',
        });
      });
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    // Trigger the Rust backend command, passing the channel as onEvent
    invoke('llm_stream_request', {
      req: {
        ...req,
        messages: sanitizedMessages,
        max_tokens,
      },
      onEvent: channel,
    }).catch((err: any) => {
      settle(() => {
        options.onError?.(err.message || String(err));
        reject(err);
      });
    });
  });
}

