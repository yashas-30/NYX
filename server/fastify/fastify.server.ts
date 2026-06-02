import fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import promClient from 'prom-client';
import { LRUCache } from 'lru-cache';
import crypto from 'crypto';
import { OpenAIAdapter } from './adapters/openai.adapter.ts';
import { PollinationsAdapter } from './adapters/pollinations.adapter.ts';
import { AnthropicAdapter } from './adapters/anthropic.adapter.ts';
import { GeminiAdapter } from './adapters/gemini.adapter.ts';
import { ProviderAdapter, ChatRequest } from './adapters/base.adapter.ts';
import { modelCache } from './modelCache.service.ts';
import { keyManager } from './keyManager.service.ts';
import { webhookService } from './webhook.service.ts';
import logger from '../lib/logger.ts';
import { fileURLToPath } from 'url';

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

export async function startFastifyServer(port: number = 3001) {
  const app = fastify({ logger: false });

  await app.register(cors, {
    origin: '*',
  });

  await app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
  });

  const adapters: Record<string, ProviderAdapter> = {
    openai: new OpenAIAdapter(),
    pollinations: new PollinationsAdapter(),
    anthropic: new AnthropicAdapter(),
    gemini: new GeminiAdapter(),
  };

  // Initialize load balancer keys
  keyManager.initializeFromEnv();

  // Metrics endpoint
  app.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

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
      const stream = executeWithRetry(adapter, chatReq, provider);

      for await (const chunk of stream) {
        if (request.raw.aborted) break;
        // Normalize to OpenAI format
        const eventData = JSON.stringify({
          choices: [
            {
              delta: { content: chunk },
            },
          ],
        });
        reply.raw.write(`data: ${eventData}\n\n`);
      }
      reply.raw.write('data: [DONE]\n\n');
      streamRequestsTotal.inc({ provider, status: 'success' });
    } catch (err: any) {
      logger.error({ err }, '[Fastify] Stream error');
      streamRequestsTotal.inc({ provider, status: 'error' });
      const errorData = JSON.stringify({ error: { message: err.message } });
      reply.raw.write(`data: ${errorData}\n\n`);
    } finally {
      reply.raw.end();
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
        adapter,
        apiKey
      );
      return reply.send({ jobId, status: 'pending' });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  try {
    await app.listen({ port, host: '127.0.0.1' });
    logger.info(`[Fastify] Backend Server listening on port ${port}`);
  } catch (err) {
    logger.error({ err }, '[Fastify] Failed to start server');
    process.exit(1);
  }
}

// Ensure the fastify instance is not accidentally started multiple times
// by checking if this file is the main entry point
let isMain = false;
try {
  if (typeof process !== 'undefined' && process.argv[1]) {
    const filePath = fileURLToPath(import.meta.url);
    if (process.argv[1] === filePath) {
      isMain = true;
    }
  }
} catch (e) {
  // CommonJS fallback if import.meta.url is not available
  if (require.main === module) {
    isMain = true;
  }
}

if (isMain) {
  startFastifyServer().catch(console.error);
}
