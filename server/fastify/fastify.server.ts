import fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import promClient from 'prom-client';
import { OpenAIAdapter } from './adapters/openai.adapter.ts';
import { PollinationsAdapter } from './adapters/pollinations.adapter.ts';
import { AnthropicAdapter } from './adapters/anthropic.adapter.ts';
import { GeminiAdapter } from './adapters/gemini.adapter.ts';
import { ProviderAdapter } from './adapters/base.adapter.ts';
import { modelCache } from './modelCache.service.ts';
import logger from '../lib/logger.ts';

const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const streamRequestsTotal = new promClient.Counter({
  name: 'ai_stream_requests_total',
  help: 'Total number of streaming requests',
  labelNames: ['provider', 'status'],
});
registry.registerMetric(streamRequestsTotal);

export async function startFastifyServer(port: number = 3001) {
  const app = fastify({ logger: false });

  await app.register(cors, {
    origin: '*',
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  const adapters: Record<string, ProviderAdapter> = {
    openai: new OpenAIAdapter(),
    pollinations: new PollinationsAdapter(),
    anthropic: new AnthropicAdapter(),
    gemini: new GeminiAdapter(),
  };

  // Metrics endpoint
  app.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

  app.post('/api/models/list', async (request, reply) => {
    const { provider, apiKey } = request.body as any;
    if (!provider || !adapters[provider]) {
      return reply.code(400).send({ error: 'Unsupported provider' });
    }

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
    const { provider, apiKey } = request.body as any;
    if (!provider || !adapters[provider]) {
      return reply.code(400).send({ error: 'Unsupported provider' });
    }

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

  app.post('/api/models/stream', async (request, reply) => {
    const { provider, apiKey, request: chatReq } = request.body as any;
    if (!provider || !adapters[provider]) {
      return reply.code(400).send({ error: 'Unsupported provider' });
    }

    const adapter = adapters[provider];

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    try {
      const stream = adapter.streamChat(chatReq, apiKey);
      for await (const chunk of stream) {
        if (request.raw.aborted) break;
        const eventData = JSON.stringify({ content: chunk });
        reply.raw.write(`data: ${eventData}\n\n`);
      }
      reply.raw.write('data: [DONE]\n\n');
      streamRequestsTotal.inc({ provider, status: 'success' });
    } catch (err: any) {
      logger.error({ err }, '[Fastify] Stream error');
      streamRequestsTotal.inc({ provider, status: 'error' });
      reply.raw.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    } finally {
      reply.raw.end();
    }
  });

  try {
    await app.listen({ port, host: '127.0.0.1' });
    logger.info(`[Fastify] SSE Server listening on port ${port}`);
  } catch (err) {
    logger.error({ err }, '[Fastify] Failed to start server');
    process.exit(1);
  }
}
