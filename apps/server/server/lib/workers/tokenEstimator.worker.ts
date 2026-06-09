/**
 * @file server/lib/workers/tokenEstimator.worker.ts
 * @description Worker thread for token estimation and prompt preprocessing.
 *
 * Offloads CPU-bound work (token counting, large JSON parsing, history truncation)
 * off the main event loop to prevent latency spikes during concurrent requests.
 *
 * Tasks supported:
 *   - estimateTokens: estimate token count for a text (4 chars/token heuristic)
 *   - truncateHistory: slice message history to a token budget
 *   - preprocessPrompt: strip null bytes, normalize whitespace, enforce max length
 */

import { parentPort, workerData } from 'worker_threads';

if (!parentPort) {
  throw new Error('This file must run as a worker thread');
}

// ── Task handlers ──────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  if (!text) return 0;
  // 4 chars/token is a robust heuristic for English (~±15%)
  return Math.ceil(text.length / 4);
}

function truncateHistory(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number
): Array<{ role: string; content: string }> {
  let total = 0;
  let sliceFrom = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(messages[i].content ?? '');
    if (total + tokens > maxTokens) break;
    total += tokens;
    sliceFrom = i;
  }

  return sliceFrom > 0 ? messages.slice(sliceFrom) : messages;
}

function preprocessPrompt(text: string, maxChars = 100_000): string {
  if (!text) return '';
  // Strip null bytes (can crash some parsers)
  let result = text.replace(/\0/g, '');
  // Normalize non-breaking spaces and zero-width chars
  result = result.replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ');
  // Collapse runs of 4+ blank lines to 2 blank lines
  result = result.replace(/\n{4,}/g, '\n\n');
  // Hard cap
  if (result.length > maxChars) {
    result = result.slice(0, maxChars);
  }
  return result;
}

// ── Message dispatcher ─────────────────────────────────────────────────────────

parentPort.on('message', (msg: { id: string; task: string; payload: any }) => {
  const { id, task, payload } = msg;

  try {
    let result: any;

    switch (task) {
      case 'estimateTokens':
        result = estimateTokens(payload.text);
        break;

      case 'truncateHistory':
        result = truncateHistory(payload.messages, payload.maxTokens ?? 80_000);
        break;

      case 'preprocessPrompt':
        result = preprocessPrompt(payload.text, payload.maxChars);
        break;

      default:
        throw new Error(`Unknown task: ${task}`);
    }

    parentPort!.postMessage({ id, result });
  } catch (err: any) {
    parentPort!.postMessage({ id, error: err.message });
  }
});
