/**
 * @file server/lib/streamDeduplicator.ts
 * @description In-flight SSE stream deduplication.
 *
 * When multiple clients (or browser tabs) send identical prompts to the same model
 * within a short window, this module prevents duplicate compute by:
 *   1. Hashing (model + prompt) into a dedup key.
 *   2. Buffering all chunks from the first stream into memory.
 *   3. Replaying the buffer to late-arriving identical requests instantly,
 *      then tailing live until the stream completes.
 *
 * ⚠️  Only deduplicates stateless requests (no conversation history) whose
 *     combined prompt is under MAX_DEDUP_CHARS. Long or context-heavy requests
 *     are always executed independently.
 */

import { createHash } from 'crypto';
import logger from './logger.js';

// Only deduplicate short-ish stateless prompts to avoid ballooning memory
const MAX_DEDUP_CHARS = 4_000;

// How long to keep a completed stream buffer cached for late arrivals (ms)
const BUFFER_TTL_MS = 10_000;

// ── Types ─────────────────────────────────────────────────────────────────────

interface StreamEntry {
  /** Chunks collected so far */
  buffer: any[];
  /** Whether the primary stream has finished */
  done: boolean;
  /** Callbacks registered by waiting requests */
  waiters: Array<{
    onChunk: (chunk: any) => void;
    onDone: () => void;
  }>;
  /** Timestamp when the stream completed (for TTL cleanup) */
  completedAt: number | null;
}

// ── State ─────────────────────────────────────────────────────────────────────

const inFlight = new Map<string, StreamEntry>();

// Garbage-collect completed entries every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of inFlight.entries()) {
    if (entry.done && entry.completedAt !== null && now - entry.completedAt > BUFFER_TTL_MS) {
      inFlight.delete(key);
    }
  }
}, 30_000).unref();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a deduplication key from model + prompt.
 * Returns null if the request should not be deduplicated (too long, has history).
 */
export function getDedupKey(params: {
  model: string;
  prompt: string;
  historyLength: number;
}): string | null {
  // Never dedup requests with conversation history — context makes them unique
  if (params.historyLength > 0) return null;
  // Don't dedup very long prompts — memory cost too high
  if (params.prompt.length > MAX_DEDUP_CHARS) return null;

  return createHash('sha256')
    .update(`${params.model}::${params.prompt}`)
    .digest('hex');
}

/**
 * Execute a streaming request with deduplication.
 *
 * @param key       - Dedup key from getDedupKey (null = execute directly)
 * @param execute   - Function that runs the actual stream, calling onChunk/onDone
 * @param onChunk   - Called for every streamed chunk (for this specific client)
 * @param onDone    - Called when the stream is complete
 */
export async function executeWithDedup(
  key: string | null,
  execute: (onChunk: (chunk: any) => void, onDone: () => void) => Promise<void>,
  onChunk: (chunk: any) => void,
  onDone: () => void
): Promise<void> {
  // No dedup: run directly
  if (key === null) {
    return execute(onChunk, onDone);
  }

  const existing = inFlight.get(key);

  // ── Case A: Stream is already complete (cache hit) ─────────────────────────
  if (existing?.done) {
    logger.debug(`[StreamDedup] Cache hit for key ${key.slice(0, 8)}… replaying ${existing.buffer.length} chunks`);
    for (const chunk of existing.buffer) {
      onChunk(chunk);
    }
    onDone();
    return;
  }

  // ── Case B: Stream is in-flight — join as a waiter ────────────────────────
  if (existing) {
    logger.debug(`[StreamDedup] Joining in-flight stream ${key.slice(0, 8)}… (${existing.buffer.length} chunks buffered)`);
    // Replay buffered chunks first
    for (const chunk of existing.buffer) {
      onChunk(chunk);
    }
    // Then register to receive future chunks and the done signal
    existing.waiters.push({ onChunk, onDone });
    return;
  }

  // ── Case C: No existing stream — become the primary ───────────────────────
  logger.debug(`[StreamDedup] Primary stream started for key ${key.slice(0, 8)}…`);
  const entry: StreamEntry = {
    buffer: [],
    done: false,
    waiters: [],
    completedAt: null,
  };
  inFlight.set(key, entry);

  const primaryOnChunk = (chunk: any) => {
    entry.buffer.push(chunk);
    onChunk(chunk); // Forward to primary caller
    for (const w of entry.waiters) {
      w.onChunk(chunk); // Broadcast to all waiters
    }
  };

  const primaryOnDone = () => {
    entry.done = true;
    entry.completedAt = Date.now();
    onDone();
    for (const w of entry.waiters) {
      w.onDone();
    }
    logger.debug(`[StreamDedup] Stream ${key.slice(0, 8)}… done. ${entry.waiters.length} waiters served from buffer.`);
  };

  try {
    await execute(primaryOnChunk, primaryOnDone);
  } catch (err: any) {
    // On error, remove the entry so the next request retries cleanly
    inFlight.delete(key);
    throw err;
  }
}
