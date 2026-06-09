import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyCompress from '@fastify/compress';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import vitePlugin from '@fastify/vite';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import logger from './logger.js';
import { env } from '../config/env.js';
import { isProd } from './paths.js';
import { requestIdMiddleware } from '../middleware/requestId.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { setupOpenApi } from '../docs/openapi.js';
import { fastifyModelRoutes } from '../fastify/fastify.server.js';
import { registerRoutes } from '../routes/index.js';
import { verifySessionToken } from '../features/vault/vault.service.js';
import { workspaceWatcher } from '../features/workspace/workspace.watcher.js';

const _serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function sanitizePayload(payload: any): any {
  if (!payload) return payload;
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      return JSON.stringify(sanitizePayload(parsed));
    } catch {
      return payload;
    }
  }
  if (typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload.map(sanitizePayload);

  const sanitized = { ...payload };
  const sensitiveKeys = /key|password|secret|token|authorization/i;
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizePayload(sanitized[key]);
    }
  }
  return sanitized;
}

export async function buildFastifyServer(): Promise<FastifyInstance> {
  const app = fastify({
    logger: {
      transport: {
        target: 'pino/file',
        options: { destination: 1 },
      },
    },
    keepAliveTimeout: 75_000,
    maxParamLength: 512,
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  // Set Zod compilers
  app.setValidatorCompiler(({ schema }) => {
    return (data) => {
      const parsed = (schema as any).safeParse(data);
      if (parsed.success) {
        return { value: parsed.data };
      }
      return { error: parsed.error };
    };
  });
  app.setSerializerCompiler(serializerCompiler);

  // Middlewares / Hooks
  app.addHook('onRequest', requestIdMiddleware);


  app.addHook('onResponse', (request, reply, done) => {
    const latency = reply.elapsedTime;
    logger.info(
      {
        requestId: (request as any).requestId,
        method: request.method,
        path: request.url,
        statusCode: reply.statusCode,
        latencyMs: latency,
        reqBody: sanitizePayload(request.body),
      },
      `Request finished: ${request.method} ${request.url}`
    );
    done();
  });

  // Disable global compression to compress specific routes (like SSE agent streams)
  await app.register(fastifyCompress, {
    global: false,
    encodings: ['gzip', 'deflate'],
  });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        frameAncestors: ["'none'"],
        connectSrc: [
          "'self'",
          'http://127.0.0.1:*',
          'http://localhost:*',
          'https://generativelanguage.googleapis.com',
          'ws://localhost:*',
          'wss://localhost:*',
          'tauri://localhost',
          'nyx://localhost',
        ],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  const fastifyMetrics = await import('fastify-metrics').then((m) => m.default || m);
  await app.register(fastifyMetrics as any, { endpoint: '/api/v1/metrics/fastify' });

  const fastifyCookie = await import('@fastify/cookie').then((m) => m.default || m);
  await app.register(fastifyCookie, {
    secret: env.NYX_MASTER_KEY || crypto.randomBytes(32).toString('hex'),
  });

  const fastifyCsrf = await import('@fastify/csrf-protection').then((m) => m.default || m);
  await app.register(fastifyCsrf, {
    cookieOpts: { signed: true, httpOnly: true, sameSite: 'lax' },
  });

  app.get('/api/v1/csrf-token', async (request, reply) => {
    const token = await reply.generateCsrf();
    reply.send({ token });
  });

  app.addHook('onRequest', async (request, reply) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
      const fullPath = request.url.split('?')[0].replace(/\/$/, '');
      const isPublic = new Set([
        '/api/v1/health',
        '/api/v1/vault/status',
        '/api/v1/vault/token',
        '/api/v1/auth/session',
        '/api/v1/auth/handshake',
        '/api/v1/admin/logs',
        '/api/v1/metrics',
        '/api/v1/csrf-token',
      ]).has(fullPath);

      if (!isPublic) {
        try {
          if (
            (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') ||
            request.headers['csrf-token'] ||
            request.headers['xsrf-token'] ||
            request.headers['x-csrf-token']
          ) {
            await (app as any).csrfProtection(request, reply);
          }
        } catch (err) {
          reply.code(403).send({ error: 'Invalid CSRF token' });
          return reply;
        }
      }
    }
  });

  await app.register(fastifyCors, {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const corsOrigin = process.env.CORS_ORIGIN || env.ALLOWED_ORIGINS || '';
      if (corsOrigin) {
        const allowedOrigins = corsOrigin.split(',').map((o) => o.trim());
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          return callback(null, true);
        }
      }

      if (!isProd) {
        const devOrigins = [
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'http://localhost:3010',
          'http://127.0.0.1:3010',
          'http://localhost:1420',
          'http://127.0.0.1:1420',
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          'tauri://localhost',
          'nyx://localhost',
        ];
        if (devOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'), false);
      }

      if (origin === 'tauri://localhost' || origin === 'nyx://localhost') {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-NYX-Session-Token',
      'x-nyx-session-token',
      'traceparent',
      'tracestate',
      'Connection',
      'Accept',
      'Accept-Encoding',
    ],
    credentials: true,
  });

  // Add rate limiting (Redis optional — falls back to in-memory if unavailable)
  const { Redis: IORedis } = await import('ioredis');
  const redis = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: (times) => {
      if (times > 10) return null;
      return Math.min(times * 500, 30_000);
    },
    maxRetriesPerRequest: 0,
  });
  redis.on('error', () => {}); // Suppress unhandled errors

  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) => (req.headers['x-nyx-session-token'] as string) || req.ip,
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  await app.register(fastifyWebsocket);

  // WebSocket connections configuration
  app.get('/ws/session-sync', { websocket: true }, (socket, req) => {
    const searchParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const token = searchParams.get('token');
    if (!token || !verifySessionToken(token)) {
      logger.warn('[WebSocket] Unauthorized connection attempt');
      socket.close(1008, 'Unauthorized');
      return;
    }

    (socket as any).roomId = searchParams.get('roomId') || 'global';
    socket.on('message', (message: string) => {
      try {
        app.websocketServer.clients.forEach((client) => {
          if (
            client !== socket &&
            client.readyState === 1 &&
            (client as any).roomId === (socket as any).roomId
          ) {
            client.send(message);
          }
        });
      } catch (err) {
        logger.error({ err }, '[WebSocket] Failed to process message');
      }
    });
  });

  app.get('/ws/file-watcher', { websocket: true }, (socket, req) => {
    const searchParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const token = searchParams.get('token');
    if (!token || !verifySessionToken(token)) {
      socket.close(1008, 'Unauthorized');
      return;
    }
    workspaceWatcher.addClient(socket as any);
  });



  // Mount model and application routes
  await app.register(fastifyModelRoutes);
  await registerRoutes(app);

  await setupOpenApi(app);

  if (isProd) {
    // Serve the SPA using @fastify/vite for prod only
    await app.register(vitePlugin, {
      root: path.resolve(_serverDir, '../web'),
      dev: false,
      spa: true,
    });
  }

  app.ready(() => {
    console.log("=== FASTIFY ROUTES ===");
    console.log(app.printRoutes());
    console.log("======================");
  });

  app.setErrorHandler(errorHandler);

  return app;
}
