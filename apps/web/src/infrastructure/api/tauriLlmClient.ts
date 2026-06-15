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
};

export interface TauriLlmRequest {
  provider: string;
  model_id: string;
  messages: Array<{ role: string; content: string }>;
  system_instruction?: string;
  api_key: string;
  temperature?: number;
  /** Override the per-provider default max output tokens. */
  max_tokens?: number;
  endpoint_override?: string;
}

export async function tauriLlmStream(
  req: TauriLlmRequest,
  options: StreamParserOptions & { timeoutMs?: number; signal?: AbortSignal }
): Promise<ParseResult> {
  const eventName = `llm_stream_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Resolve max_tokens: caller > provider default
  const max_tokens = req.max_tokens ?? PROVIDER_MAX_TOKENS[req.provider] ?? 8_192;

  const stream = new ReadableStream({
    async start(controller) {
      let unlisten: UnlistenFn | undefined;

      // Timeout support — abort stream if no response within timeoutMs
      const timeoutId = options.timeoutMs
        ? setTimeout(() => {
            controller.error(new Error(`Stream timeout after ${options.timeoutMs}ms`));
            unlisten?.();
          }, options.timeoutMs)
        : null;

      // AbortSignal support
      const onAbort = () => {
        clearTimeout(timeoutId ?? undefined);
        controller.close();
        unlisten?.();
      };
      options.signal?.addEventListener('abort', onAbort, { once: true });

      try {
        unlisten = await listen<{ chunk: string; done?: boolean; error?: string }>(
          eventName,
          (event) => {
            const payload = event.payload;

            if (payload.error) {
              clearTimeout(timeoutId ?? undefined);
              controller.error(new Error(payload.error));
              unlisten?.();
              return;
            }

            if (payload.done) {
              clearTimeout(timeoutId ?? undefined);
              // Signal end of SSE stream
              controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
              controller.close();
              unlisten?.();
              return;
            }

            // Fix 1: The Rust command now emits pre-parsed text deltas,
            // but we still need to wrap in SSE format for parseSSEStream.
            // Handle both old raw-SSE and new parsed-delta formats.
            const chunk = payload.chunk;
            if (chunk) {
              // If it looks like an already-parsed delta (no SSE prefix), wrap it
              if (!chunk.startsWith('data:') && !chunk.startsWith('event:')) {
                // Emit as a synthetic OpenAI-style SSE chunk so parseSSEStream handles it
                const synthetic = JSON.stringify({ choices: [{ delta: { content: chunk } }] });
                controller.enqueue(new TextEncoder().encode(`data: ${synthetic}\n\n`));
              } else {
                controller.enqueue(new TextEncoder().encode(chunk));
              }
            }
          }
        );

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
        controller.error(err);
        unlisten?.();
      }
    },
    cancel() {
      // Stream cancelled by consumer — nothing to do, the Rust side
      // will stop when the process context is dropped
    },
  });

  const mockResponse = new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });

  return parseSSEStream(mockResponse, options);
}
