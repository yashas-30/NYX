import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import promClient from 'prom-client';
import { LRUCache } from 'lru-cache';
import crypto from 'crypto';

import { GeminiAdapter } from './adapters/gemini.adapter.js';
import { OllamaAdapter } from './adapters/ollama.adapter.js';
import { LmStudioAdapter } from './adapters/lmstudio.adapter.js';
import { ProviderAdapter, ChatRequest } from './adapters/base.adapter.js';
import { modelCache } from './modelCache.service.js';
import { keyManager } from './keyManager.service.js';
import { webhookService } from './webhook.service.js';
import { MemoryService } from '../features/nyx/memory.service.js';
import logger from '../lib/logger.js';

const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const streamRequestsTotal = new promClient.Counter({
  name: 'ai_stream_requests_total',
  help: 'Total number of streaming requests',
  labelNames: ['provider', 'status'],
});
registry.registerMetric(streamRequestsTotal);

// Setup Cache
const responseCache = new LRUCache<string, any>({
  max: 500,
  ttl: 1000 * 60 * 60, // 1 hour
});

function generateCacheKey(provider: string, model: string, prompt: any): string {
  const hash = crypto.createHash('sha256').update(JSON.stringify(prompt)).digest('hex');
  return `${provider}:${model}:${hash}`;
}

import { EventEmitter } from 'events';

interface ActiveStream {
  history: string[];
  emitter: EventEmitter;
  isDone: boolean;
  error?: string;
}

const activeStreams = new Map<string, ActiveStream>();

export const fastifyModelRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const adapters: Record<string, ProviderAdapter> = {
    gemini: new GeminiAdapter(),
    ollama: new OllamaAdapter(),
    lmstudio: new LmStudioAdapter(),
  };

  // Initialize load balancer keys
  keyManager.initializeFromEnv();

  // Preload local embedding models so they don't block the first request
  MemoryService.preloadModels();

  // Metrics endpoint
  app.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

  // fallow-ignore-next-line code-duplication
  app.post('/api/models/list', async (request, reply) => {
    const { provider } = request.body as any;
    if (!provider || !adapters[provider]) {
      return reply.code(400).send({ error: 'Unsupported provider' });
    }

    // Load balancer gives us a key to use for fetching models
    const apiKey = keyManager.getNextKey(provider);
    const cacheKey = modelCache.generateKey(provider, 'list', apiKey);
    const cached = modelCache.get(cacheKey);
    if (cached) return reply.send({ models: cached });

    try {
      const models = await adapters[provider].listModels(apiKey);
      modelCache.set(cacheKey, models);
      return reply.send({ models });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // fallow-ignore-next-line code-duplication
  app.post('/api/models/quota', async (request, reply) => {
    const { provider } = request.body as any;
    if (!provider || !adapters[provider]) {
      return reply.code(400).send({ error: 'Unsupported provider' });
    }

    const apiKey = keyManager.getNextKey(provider);
    const cacheKey = modelCache.generateKey(provider, 'quota', apiKey);
    const cached = modelCache.get(cacheKey);
    if (cached) return reply.send(cached);

    try {
      const quota = await adapters[provider].getQuota(apiKey);
      modelCache.set(cacheKey, quota);
      return reply.send(quota);
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  /**
   * Helper function for executing a chat stream with Queue/Retry logic
   */
  async function* executeWithRetry(
    adapter: ProviderAdapter,
    chatReq: ChatRequest,
    provider: string,
    maxRetries = 3
  ): AsyncGenerator<string, void, unknown> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const apiKey = keyManager.getNextKey(provider);
      try {
        const stream = adapter.streamChat(chatReq, apiKey);
        for await (const chunk of stream) {
          yield chunk;
        }
        return; // Success, exit retry loop
      } catch (err: any) {
        if (err.message && err.message.includes('429')) {
          keyManager.markRateLimited(provider, apiKey, 60);
          logger.warn(`[Fastify] Rate limited on attempt ${attempt} for ${provider}. Retrying...`);
          if (attempt === maxRetries) {
            throw new Error(`Rate limit exceeded after ${maxRetries} attempts.`);
          }
          // Exponential backoff
          await new Promise((res) => setTimeout(res, 1000 * Math.pow(2, attempt)));
        } else {
          throw err; // Not a rate limit error, throw immediately
        }
      }
    }
  }

  app.post('/api/models/stream', async (request, reply) => {
    const { provider, request: chatReq } = request.body as any;
    if (!provider || !adapters[provider]) {
      return reply.code(400).send({ error: 'Unsupported provider' });
    }

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    try {
      const adapter = adapters[provider];
      const cacheKey = generateCacheKey(provider, chatReq.model, chatReq.messages);
      let active = activeStreams.get(cacheKey);

      if (!active) {
        active = {
          history: [],
          emitter: new EventEmitter(),
          isDone: false,
        };
        // Increase max listeners if many clients connect
        active.emitter.setMaxListeners(50);
        activeStreams.set(cacheKey, active);

        // Start background generation
        (async () => {
          try {
            const stream = executeWithRetry(adapter, chatReq, provider);
            for await (const chunk of stream) {
              active!.history.push(chunk);
              active!.emitter.emit('data', chunk);
            }
            active!.isDone = true;
            active!.emitter.emit('end');
          } catch (err: any) {
            active!.error = err.message;
            active!.emitter.emit('error', err);
          } finally {
            setTimeout(() => activeStreams.delete(cacheKey), 5000);
          }
        })();
      }

      // Send already buffered history
      for (const chunk of active.history) {
        if (request.raw.aborted) return;
        const eventData = JSON.stringify({ choices: [{ delta: { content: chunk } }] });
        reply.raw.write(`data: ${eventData}\n\n`);
        if (typeof (reply.raw as any).flush === 'function') (reply.raw as any).flush();
      }

      if (active.error) {
        throw new Error(active.error);
      } else if (active.isDone) {
        reply.raw.write('data: [DONE]\n\n');
        if (typeof (reply.raw as any).flush === 'function') (reply.raw as any).flush();
        reply.raw.end();
        streamRequestsTotal.inc({ provider, status: 'success' });
        return;
      }

      // Subscribe to live events
      const onData = (chunk: string) => {
        if (request.raw.aborted) return;
        const eventData = JSON.stringify({ choices: [{ delta: { content: chunk } }] });
        reply.raw.write(`data: ${eventData}\n\n`);
        if (typeof (reply.raw as any).flush === 'function') (reply.raw as any).flush();
      };

      const onEnd = () => {
        if (request.raw.aborted) return;
        reply.raw.write('data: [DONE]\n\n');
        if (typeof (reply.raw as any).flush === 'function') (reply.raw as any).flush();
        reply.raw.end();
        streamRequestsTotal.inc({ provider, status: 'success' });
      };

      const onError = (err: any) => {
        if (request.raw.aborted) return;
        const errorData = JSON.stringify({ error: { message: err.message } });
        reply.raw.write(`data: ${errorData}\n\n`);
        if (typeof (reply.raw as any).flush === 'function') (reply.raw as any).flush();
        reply.raw.end();
        streamRequestsTotal.inc({ provider, status: 'error' });
      };

      active.emitter.on('data', onData);
      active.emitter.once('end', onEnd);
      active.emitter.once('error', onError);

      // Clean up listeners on disconnect
      request.raw.on('close', () => {
        if (active) {
          active.emitter.off('data', onData);
          active.emitter.off('end', onEnd);
          active.emitter.off('error', onError);
        }
      });

      // Keep the request open until the stream finishes
      await new Promise<void>((resolve) => {
        request.raw.on('close', resolve);
        active!.emitter.once('end', resolve);
        active!.emitter.once('error', resolve);
      });
    } catch (err: any) {
      logger.error({ err }, '[Fastify] Stream error');
      streamRequestsTotal.inc({ provider, status: 'error' });
      if (!reply.raw.writableEnded) {
        const errorData = JSON.stringify({ error: { message: err.message } });
        reply.raw.write(`data: ${errorData}\n\n`);
        reply.raw.end();
      }
    }
  });

  app.post('/api/models/batch', async (request, reply) => {
    const { provider, requests } = request.body as { provider: string; requests: ChatRequest[] };
    if (!provider || !adapters[provider]) {
      return reply.code(400).send({ error: 'Unsupported provider' });
    }

    if (!Array.isArray(requests)) {
      return reply.code(400).send({ error: 'Requests must be an array' });
    }

    try {
      const adapter = adapters[provider];

      // Process batch concurrently
      const results = await Promise.all(
        requests.map(async (chatReq, idx) => {
          // Check cache first
          const cacheKey = generateCacheKey(provider, chatReq.model, chatReq.messages);
          if (responseCache.has(cacheKey)) {
            return { index: idx, result: responseCache.get(cacheKey) };
          }

          let fullText = '';
          const stream = executeWithRetry(adapter, chatReq, provider);
          for await (const chunk of stream) {
            fullText += chunk;
          }

          responseCache.set(cacheKey, fullText);
          return { index: idx, result: fullText };
        })
      );

      return reply.send({ results });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  app.post('/api/models/async', async (request, reply) => {
    const { provider, request: chatReq, webhookUrl } = request.body as any;
    if (!provider || !adapters[provider]) {
      return reply.code(400).send({ error: 'Unsupported provider' });
    }
    if (!webhookUrl) {
      return reply.code(400).send({ error: 'webhookUrl is required for async jobs' });
    }

    try {
      const adapter = adapters[provider];
      const apiKey = keyManager.getNextKey(provider); // Base key to start with
      const jobId = await webhookService.enqueueJob(
        provider,
        chatReq.model,
        webhookUrl,
        chatReq,
        apiKey
      );
      return reply.send({ jobId, status: 'pending' });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });
};
