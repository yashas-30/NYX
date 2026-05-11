// ─── src/lib/api/streamParser.ts ─────────────────────────────────────────────
// Shared SSE line parser used by every provider client.
// Change SSE parsing logic here — nothing else needs updating.

/**
 * Reads a ReadableStream line by line, calls onLine for each `data: ...` event.
 * Returns when the stream ends or the signal fires.
 */
export async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  onLine: (json: Record<string, any>) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const raw = trimmed.slice(6);
        if (raw === '[DONE]') return;
        try {
          const parsed = JSON.parse(raw);
          onLine(parsed);
        } catch {
          // Ignore partial/malformed chunks — normal at stream boundaries
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
