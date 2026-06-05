import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import fs from 'fs';
import path from 'path';
import logger from '../lib/logger.js';

// ── Redis connection ──────────────────────────────────────────────────────────
// lazyConnect = don't attempt TCP until first command
// enableOfflineQueue = false means commands fail fast rather than accumulating
// retryStrategy returning null after 10 attempts stops BullMQ's internal retry loop
function makeRedisConnection(): InstanceType<typeof Redis> {
  const conn = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: null, // Required by BullMQ
    retryStrategy: (times) => {
      if (times > 3) {
        logger.warn(`[Queue] Redis unavailable after ${times} attempts — queues degraded`);
        return null; // stop retrying; silences the BullMQ internal log flood
      }
      return Math.min(times * 1000, 5_000);
    },
  });
  // Must attach before BullMQ attaches its own — prevents "unhandled error" crashes
  conn.on('error', () => {});
  return conn;
}

// ── Queue / Worker factories ──────────────────────────────────────────────────
// Lazy — only initialised when the module is first imported. Workers won't be
// created at all if REDIS_HOST is set to "disabled" in the environment.

let _redis: InstanceType<typeof Redis> | null = null;

function getRedis(): InstanceType<typeof Redis> | null {
  if (process.env.REDIS_HOST === 'disabled') return null;
  if (!_redis) _redis = makeRedisConnection();
  return _redis;
}

function makeQueue(name: string): Queue | null {
  const r = getRedis();
  if (!r) return null;
  const q = new Queue(name, { connection: r as ConnectionOptions });
  q.on('error', (err) => logger.debug({ err: err.message }, `[Queue:${name}] error`));
  return q;
}

// Exported queues (null when Redis is unavailable)
export const criticQueue   = makeQueue('critic');
export const downloadQueue = makeQueue('download');
export const fileWriteQueue = makeQueue('file-write');

// ── Workers ───────────────────────────────────────────────────────────────────
// Workers are fire-and-forget; failures are logged but don't crash the process.

const r = getRedis();

if (r) {
  // Dynamic imports keep Agentservice + LocalModelManager out of cold-start path
  const { AgentService } = await import('../features/nyx/agent.service.js');
  const { LocalModelManager } = await import('../features/local-models/localModelManager.js');
  const agentService = new AgentService();

  const criticWorker = new Worker('critic', async (job) => {
    const { prompt, response, modelId, provider } = job.data;
    await agentService.runBackgroundCritic(prompt, response, modelId, provider);
  }, { connection: r as ConnectionOptions, concurrency: 2 });

  const downloadWorker = new Worker('download', async (job) => {
    const { modelId } = job.data;
    await (LocalModelManager as any).startDownload(modelId);
  }, { connection: r as ConnectionOptions, concurrency: 1 });

  const fileWriteWorker = new Worker('file-write', async (job) => {
    const { filePath, content } = job.data;
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf8');
  }, { connection: r as ConnectionOptions, concurrency: 3 });

  // Suppress BullMQ worker internal error noise
  criticWorker.on('error',    (err) => logger.debug({ err: err.message }, '[Worker:critic] error'));
  downloadWorker.on('error',  (err) => logger.debug({ err: err.message }, '[Worker:download] error'));
  fileWriteWorker.on('error', (err) => logger.debug({ err: err.message }, '[Worker:file-write] error'));
}
