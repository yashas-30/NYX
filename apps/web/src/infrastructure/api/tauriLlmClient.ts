import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { StreamParserOptions, parseSSEStream, ParseResult } from './streamParser';

// ── Per-provider max token defaults (Fix 2 — mirrors llm.rs constants) ───────
const PROVIDER_MAX_TOKENS: Record<string, number> = {
  anthropic: 32_768,
  openai: 16_384,
  openrouter: 16_384,
  deepseek: 16_384,
  gemini: 8_192,
  ollama: 8_192,
  lmstudio: 8_192,
  'nyx-embedded': 2_048,  // embedded Qwen 2.5 1.5B — 4096 ctx, 2048 max output
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
  const eventName = `llm_stream_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Resolve max_tokens: caller > provider default
  const max_tokens = req.max_tokens ?? PROVIDER_MAX_TOKENS[req.provider] ?? 8_192;

  let accumulatedText = '';
  let accumulatedReasoning = '';
  let finishReason: any = null;
  const toolCalls: any[] = [];
  const metrics: any = { latencyMs: 0 };
  const startTime = Date.now();

  return new Promise<ParseResult>(async (resolve, reject) => {
    let unlisten: UnlistenFn | undefined;

    // Timeout support — abort stream if no response within timeoutMs
    const timeoutId = options.timeoutMs
      ? setTimeout(() => {
          unlisten?.();
          reject(new Error(`Stream timeout after ${options.timeoutMs}ms`));
        }, options.timeoutMs)
      : null;

    // AbortSignal support
    const onAbort = () => {
      clearTimeout(timeoutId ?? undefined);
      unlisten?.();
      resolve({
        text: accumulatedText,
        reasoning: accumulatedReasoning,
        toolCalls,
        metrics: { ...metrics, latencyMs: Date.now() - startTime },
        finishReason: 'stop',
      });
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      unlisten = await listen<any>(eventName, (event) => {
        const payload = event.payload;

        if (payload.error) {
          clearTimeout(timeoutId ?? undefined);
          options.onError?.(payload.error);
          unlisten?.();
          reject(new Error(payload.error));
          return;
        }

        if (payload.done || payload.type === 'done') {
          clearTimeout(timeoutId ?? undefined);
          finishReason = 'stop';
          options.onFinish?.(finishReason);
          unlisten?.();
          resolve({
            text: accumulatedText,
            reasoning: accumulatedReasoning,
            toolCalls,
            metrics: { ...metrics, latencyMs: Date.now() - startTime },
            finishReason,
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
             accumulatedText += payload.content;
             options.onChunk?.(payload.content, accumulatedText);
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

      // Trigger the Rust backend command
      await invoke('llm_stream_request', {
        req: {
          ...req,
          max_tokens,
          event_name: eventName,
        },
      });
    } catch (err: any) {
      clearTimeout(timeoutId ?? undefined);
      options.onError?.(err.message || String(err));
      unlisten?.();
      reject(err);
    }
  });
}

