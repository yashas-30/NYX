import { v4 as uuidv4 } from 'uuid';
import { URL } from 'url';
import { db } from '../db/client.js';
import { asyncJobs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import logger from '../lib/logger.js';
import { ProviderAdapter, ChatRequest } from './adapters/base.adapter.js';
import { Queue, Worker } from 'bullmq';
import { env } from '../config/env.js';
import { GeminiAdapter } from './adapters/gemini.adapter.js';
import { OllamaAdapter } from './adapters/ollama.adapter.js';
import { LmStudioAdapter } from './adapters/lmstudio.adapter.js';

const redisConnection = {
  host: env.REDIS_HOST || '127.0.0.1',
  port: env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
};

// Create the BullMQ queue
export const asyncJobQueue = new Queue('async-jobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

let isRedisConnected = true;

// Simple concurrency limiter for fallback
class AsyncQueue {
  private concurrency: number;
  private active: number = 0;
  private queue: (() => void)[] = [];

  constructor(concurrency: number) {
    this.concurrency = concurrency;
  }

  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        this.active++;
        try {
          resolve(await task());
        } catch (err) {
          reject(err);
        } finally {
          this.active--;
          this.dequeue();
        }
      });
      this.dequeue();
    });
  }

  private dequeue() {
    if (this.active < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) task();
    }
  }
}

const inlineFallbackQueue = new AsyncQueue(5);

asyncJobQueue.on('error', (err) => {
  logger.warn(`[BullMQ] Queue connection error (Redis might be down): ${err.message}`);
  isRedisConnected = false;
});

// Factory to resolve adapters locally in the worker
function getAdapterForProvider(provider: string): ProviderAdapter {
  switch (provider) {
    case 'gemini':
      return new GeminiAdapter();
    case 'ollama':
      return new OllamaAdapter();
    case 'lmstudio':
      return new LmStudioAdapter();
    default:
      throw new Error(`Unsupported provider inside worker: ${provider}`);
  }
}

// Background Worker
export const asyncJobWorker = new Worker(
  'async-jobs',
  async (job) => {
    logger.info(`[BullMQ Worker] Processing job ${job.id}`);
    const { jobId, provider, chatReq, apiKey } = job.data;
    const adapter = getAdapterForProvider(provider);
    await webhookService.processJobInline(jobId, provider, chatReq, adapter, apiKey);
  },
  { 
    connection: redisConnection,
    concurrency: 5 // Process up to 5 jobs concurrently
  }
);

asyncJobWorker.on('error', (err) => {
  logger.warn(`[BullMQ] Worker connection error: ${err.message}`);
  isRedisConnected = false;
});

asyncJobWorker.on('failed', (job, err) => {
  if (job) {
    logger.error(`[BullMQ] Job ${job.id} failed: ${err.message}`);
  }
});

// Graceful shutdown handling for the worker
const gracefulShutdown = async () => {
  logger.info('[BullMQ] Gracefully shutting down worker...');
  await asyncJobWorker.close();
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export class WebhookService {
  /**
   * Enqueues an async job for processing and returns a jobId
   */
  async enqueueJob(
    provider: string,
    model: string,
    webhookUrl: string,
    chatReq: ChatRequest,
    apiKey: string
  ): Promise<string> {
    const jobId = uuidv4();
    const now = Date.now();

    await db.insert(asyncJobs).values({
      id: jobId,
      provider,
      model,
      status: 'pending',
      webhookUrl,
      requestPayload: JSON.stringify(chatReq),
      createdAt: now,
      updatedAt: now,
    });

    try {
      if (!isRedisConnected) {
        throw new Error('Redis is not connected');
      }
      
      // Enqueue job to BullMQ properly
      await asyncJobQueue.add('process-chat', {
        jobId,
        provider,
        chatReq,
        apiKey
      });
      logger.info(`[WebhookService] Enqueued job ${jobId} to BullMQ`);
    } catch (err: any) {
      // Graceful fallback to inline processing if Redis is unavailable
      logger.warn(`[WebhookService] Failed to push to BullMQ, falling back to inline processing for job ${jobId}: ${err.message}`);
      const adapter = getAdapterForProvider(provider);
      
      inlineFallbackQueue.enqueue(() => this.processJobInline(jobId, provider, chatReq, adapter, apiKey))
        .catch((fallbackErr) => {
          logger.error({ err: fallbackErr, jobId }, '[WebhookService] Inline background processing failed entirely');
        });
    }

    return jobId;
  }

  /**
   * Processes the job and sends the webhook (can be run inline or by the worker)
   */
  public async processJobInline(
    jobId: string,
    provider: string,
    chatReq: ChatRequest,
    adapter: ProviderAdapter,
    apiKey: string
  ) {
    try {
      await this.updateStatus(jobId, 'processing');

      // We consume the stream internally to get the full result
      const stream = adapter.streamChat(chatReq, apiKey);
      let fullResponse = '';

      for await (const chunk of stream) {
        fullResponse += chunk;
      }

      await this.updateStatus(jobId, 'completed', fullResponse);
      await this.deliverWebhook(jobId, 'completed', fullResponse);
    } catch (err: any) {
      logger.error({ err, jobId }, '[WebhookService] Job processing error');
      await this.updateStatus(jobId, 'failed', undefined, err.message);
      await this.deliverWebhook(jobId, 'failed', undefined, err.message);
      throw err; // Rethrow so BullMQ catches the failure and retries
    }
  }

  private async updateStatus(
    jobId: string,
    status: string,
    resultPayload?: string,
    error?: string
  ) {
    const updateData: any = {
      status,
      updatedAt: Date.now(),
    };
    if (resultPayload !== undefined) updateData.resultPayload = resultPayload;
    if (error !== undefined) updateData.error = error;

    await db.update(asyncJobs).set(updateData).where(eq(asyncJobs.id, jobId));
  }

  private async deliverWebhook(
    jobId: string,
    status: string,
    resultPayload?: string,
    error?: string
  ) {
    try {
      // Get the job record to find the webhookUrl
      const [job] = await db.select().from(asyncJobs).where(eq(asyncJobs.id, jobId)).limit(1);
      if (!job || !job.webhookUrl) return;

      // SSRF Protection: Validate URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(job.webhookUrl);
      } catch (e) {
        logger.error({ jobId }, '[WebhookService] Invalid webhook URL format');
        return;
      }

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        logger.error({ jobId }, '[WebhookService] Invalid webhook protocol (only HTTP/HTTPS allowed)');
        return;
      }

      // Block known private IP ranges (basic SSRF protection)
      const hostname = parsedUrl.hostname;
      const privateIPRegex = /^(?:127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|localhost)$/i;
      
      if (privateIPRegex.test(hostname)) {
        logger.error({ jobId, hostname }, '[WebhookService] Blocked webhook delivery to internal/private hostname (SSRF Protection)');
        return;
      }

      const payload = {
        jobId,
        provider: job.provider,
        model: job.model,
        status,
        result: resultPayload,
        error,
      };

      await fetch(job.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      logger.info(`[WebhookService] Successfully delivered webhook for job ${jobId}`);
    } catch (err: any) {
      logger.error({ err, jobId }, '[WebhookService] Failed to deliver webhook');
    }
  }
}

export const webhookService = new WebhookService();
