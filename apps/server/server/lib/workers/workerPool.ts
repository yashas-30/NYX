/**
 * @file server/lib/workers/workerPool.ts
 * @description Minimal worker thread pool for CPU-bound operations with sync fallback.
 */

import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import logger from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// One worker per logical CPU core, capped at 4 (token work is light)
const POOL_SIZE = Math.min(4, Math.max(1, (await import('os')).cpus().length));

// ── Synchronous fallback functions for CPU-bound tasks ────────────────────────
function syncEstimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function syncTruncateHistory(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number
): Array<{ role: string; content: string }> {
  let total = 0;
  let sliceFrom = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = syncEstimateTokens(messages[i].content ?? '');
    if (total + tokens > maxTokens) break;
    total += tokens;
    sliceFrom = i;
  }

  return sliceFrom > 0 ? messages.slice(sliceFrom) : messages;
}

function syncPreprocessPrompt(text: string, maxChars = 100_000): string {
  if (!text) return '';
  let result = text.replace(/\0/g, '');
  result = result.replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ');
  result = result.replace(/\n{4,}/g, '\n\n');
  if (result.length > maxChars) {
    result = result.slice(0, maxChars);
  }
  return result;
}

// ── Worker lifecycle ───────────────────────────────────────────────────────────
function createWorker(): Worker {
  const isTs = __filename.endsWith('.ts');
  const ext = isTs ? '.ts' : '.js';
  
  let workerPath = path.join(__dirname, `tokenEstimator.worker${ext}`);
  if (!fs.existsSync(workerPath)) {
    const altExt = ext === '.ts' ? '.js' : '.ts';
    const altPath = path.join(__dirname, `tokenEstimator.worker${altExt}`);
    if (fs.existsSync(altPath)) {
      workerPath = altPath;
    }
  }

  if (workerPath.endsWith('.ts')) {
    // Load TS worker dynamically using tsx for ESM environments
    return new Worker(workerPath, {
      execArgv: ['--import', 'tsx']
    });
  }

  return new Worker(workerPath);
}

// ── Pool state ─────────────────────────────────────────────────────────────────
type PendingTask = {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
};

class WorkerPool {
  private workers: Worker[] = [];
  private pending = new Map<string, PendingTask>();
  private roundRobinIdx = 0;
  private useFallback = false;

  constructor(size: number) {
    try {
      for (let i = 0; i < size; i++) {
        const w = createWorker();
        
        w.on('message', (msg: { id: string; result?: any; error?: string }) => {
          const task = this.pending.get(msg.id);
          if (!task) return;
          this.pending.delete(msg.id);
          if (msg.error) {
            task.reject(new Error(msg.error));
          } else {
            task.resolve(msg.result);
          }
        });

        w.on('error', (err) => {
          logger.error({ err }, '[WorkerPool] Worker runtime error');
          this.useFallback = true;
          // Reject all pending tasks to prevent hangs
          for (const [id, task] of this.pending.entries()) {
            task.reject(err instanceof Error ? err : new Error(String(err)));
            this.pending.delete(id);
          }
        });

        w.on('exit', (code) => {
          if (code !== 0) {
            logger.warn(`[WorkerPool] Worker exited with code ${code}`);
            this.useFallback = true;
          }
        });

        this.workers.push(w);
      }
      logger.info(`[WorkerPool] Initialized ${size} worker thread(s) for CPU-bound operations`);
    } catch (err: any) {
      logger.warn(`[WorkerPool] Failed to initialize workers: ${err.message}. Falling back to main thread execution.`);
      this.useFallback = true;
    }
  }

  private dispatch(task: string, payload: any): Promise<any> {
    if (this.useFallback || this.workers.length === 0) {
      try {
        let result: any;
        switch (task) {
          case 'estimateTokens':
            result = syncEstimateTokens(payload.text);
            break;
          case 'truncateHistory':
            result = syncTruncateHistory(payload.messages, payload.maxTokens ?? 80_000);
            break;
          case 'preprocessPrompt':
            result = syncPreprocessPrompt(payload.text, payload.maxChars);
            break;
          default:
            throw new Error(`Unknown task: ${task}`);
        }
        return Promise.resolve(result);
      } catch (err: any) {
        return Promise.reject(err);
      }
    }

    const id = crypto.randomUUID();
    const worker = this.workers[this.roundRobinIdx % this.workers.length];
    this.roundRobinIdx++;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, task, payload });
    });
  }

  /** Estimate token count for a string. Returns a number. */
  estimateTokens(text: string): Promise<number> {
    return this.dispatch('estimateTokens', { text });
  }

  /** Truncate message history to fit within a token budget. */
  truncateHistory(
    messages: Array<{ role: string; content: string }>,
    maxTokens = 80_000
  ): Promise<Array<{ role: string; content: string }>> {
    return this.dispatch('truncateHistory', { messages, maxTokens });
  }

  /** Sanitize and normalize a raw prompt string. */
  preprocessPrompt(text: string, maxChars?: number): Promise<string> {
    return this.dispatch('preprocessPrompt', { text, maxChars });
  }

  /** Gracefully shut down all workers. Call on server shutdown. */
  async shutdown(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
    logger.info('[WorkerPool] All workers terminated');
  }
}

/** Singleton pool — import this everywhere you need CPU-offloaded operations. */
export const workerPool = new WorkerPool(POOL_SIZE);
