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
import { vectorStore } from '../features/rag/vectorStore.js';
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

  // Metrics endpoint
  app.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

  // Gemini specific upload endpoint for multimodal support
  app.post('/api/gemini/upload', async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      const { pipeline } = await import('stream/promises');
      const fs = await import('fs');
      const path = await import('path');
      const { UPLOADS_DIR } = await import('../lib/paths.js');
      const GEMINI_UPLOADS_DIR = path.join(UPLOADS_DIR, 'gemini');

      if (!fs.existsSync(GEMINI_UPLOADS_DIR)) {
        fs.mkdirSync(GEMINI_UPLOADS_DIR, { recursive: true });
      }

      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(data.filename);
      const basename = path.basename(data.filename, ext);
      const newFilename = `${basename}-${uniqueSuffix}${ext}`;
      const filepath = path.join(GEMINI_UPLOADS_DIR, newFilename);

      await pipeline(data.file, fs.createWriteStream(filepath));

      return reply.send({
        message: 'File uploaded successfully',
        filename: newFilename,
        path: `/uploads/gemini/${newFilename}`,
        mimeType: data.mimetype,
      });
    } catch (err: any) {
      logger.error({ err }, '[Gemini Upload] Error uploading file');
      return reply.code(500).send({ error: err.message });
    }
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

  const MODEL_FALLBACKS: Record<string, string[]> = {
    // Gemini 1.5 Pro
    'gemini-1.5-pro': ['gemini-1.5-flash', 'gemini-1.5-flash-8b'],
    'gemini-1.5-pro-latest': ['gemini-1.5-flash-latest', 'gemini-1.5-flash-8b-latest'],
    'gemini-1.5-pro-exp-0827': ['gemini-1.5-flash-exp-0827'],
    
    // Gemini 1.5 Flash
    'gemini-1.5-flash': ['gemini-1.5-flash-8b'],
    'gemini-1.5-flash-latest': ['gemini-1.5-flash-8b-latest'],

    // Gemini 2.0 (Hypothetical / Newer)
    'gemini-2.0-flash-exp': ['gemini-1.5-flash'],
    'gemini-2.0-pro-exp-0205': ['gemini-2.0-flash-exp', 'gemini-1.5-pro'],
    'gemini-2.0-flash-thinking-exp-01-21': ['gemini-2.0-flash-exp'],

    // The user specifically requested examples
    'gemini-3.5-flash': ['gemini-3.1-flash-lite', 'gemini-1.5-flash'],
    'gemini/gemini-3.5-flash': ['gemini/gemini-3.1-flash-lite', 'gemini/gemini-1.5-flash']
  };

  /**
   * Helper function for executing a chat stream without retry logic (fails fast on rate limit)
   */
  async function* executeWithRetry(
    adapter: ProviderAdapter,
    chatReq: ChatRequest,
    provider: string,
    maxRetries = 1 // Kept for signature compatibility
  ): AsyncGenerator<string, void, unknown> {
    const apiKey = keyManager.getNextKey(provider);
    
    const fallbackChain = [chatReq.model];
    // Try to find fallbacks for either exact model string or without provider prefix
    const rawModelName = chatReq.model.replace(provider + '/', '');
    const mappedFallbacks = MODEL_FALLBACKS[chatReq.model] || MODEL_FALLBACKS[rawModelName];
    
    if (mappedFallbacks) {
      // Re-add provider prefix if it was present
      const hasPrefix = chatReq.model.startsWith(provider + '/');
      const formattedFallbacks = hasPrefix 
        ? mappedFallbacks.map(m => m.startsWith(provider + '/') ? m : `${provider}/${m}`)
        : mappedFallbacks;
        
      fallbackChain.push(...formattedFallbacks);
    }
    
    let lastError: Error | null = null;

    for (const modelAttempt of fallbackChain) {
      try {
        const stream = adapter.streamChat({ ...chatReq, model: modelAttempt }, apiKey);
        for await (const chunk of stream) {
          yield chunk;
        }
        return; // Success
      } catch (err: any) {
        lastError = err;
        if (err.message && err.message.includes('429')) {
          keyManager.markRateLimited(provider, apiKey, 60);
          logger.warn(`[Fastify] Rate limited for model ${modelAttempt}. Attempting fallback if available.`);
          if (modelAttempt === fallbackChain[fallbackChain.length - 1]) {
            throw new Error(`Server is busy or rate limit exceeded for ${provider} models. Please try again later.`);
          }
        } else {
          throw err;
        }
      }
    }
    if (lastError) throw lastError;
  }

  app.post('/api/models/stream', async (request, reply) => {
    const { provider, request: chatReq } = request.body as any;
    if (!provider || !adapters[provider]) {
      return reply.code(400).send({ error: 'Unsupported provider' });
    }

    const { initFastifySse } = await import('../lib/sseHelpers.js');
    initFastifySse(reply);
    try {
      // 1. Find the last user message to use as the search query
      const lastMessage = chatReq.messages[chatReq.messages.length - 1];
      if (lastMessage && lastMessage.role === 'user') {
        const queryText = typeof lastMessage.content === 'string' 
          ? lastMessage.content 
          : Array.isArray(lastMessage.content) 
            ? lastMessage.content.map((c: any) => c.type === 'text' ? c.text : '').join(' ')
            : '';
        
        // 2. Search LanceDB using the selected provider's embedding model
        if (queryText && (provider === 'gemini' || provider === 'ollama')) {
          try {
            const results = await vectorStore.similaritySearch(queryText, provider, 3);
            if (results && results.length > 0) {
              const contextText = results.map(r => `Source: ${r.source}\nContent: ${r.text}`).join('\n\n');
              
              // 3. Inject context into the system message
              const systemMessage = {
                role: 'system',
                content: `You have access to the following reference documents. Use them to answer the user's question.\n\n[RAG CONTEXT]\n${contextText}\n[/RAG CONTEXT]`
              };
              
              chatReq.messages.unshift(systemMessage);
            }
          } catch (ragErr: any) {
            logger.warn({ err: ragErr.message }, '[RAG] Failed to retrieve context or table missing.');
          }
        }
      }

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
        adapter,
        apiKey
      );
      return reply.send({ jobId, status: 'pending' });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });
};
