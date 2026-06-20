import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyCompress from '@fastify/compress';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import fastifyWebsocket from '@fastify/websocket';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import crypto from 'crypto';
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

// PII patterns for log scrubbing (enabled when PII_SCRUB_ENABLED is true)
const PII_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, label: '[SSN]' },                                    // SSN
  { pattern: /\b\d{16}\b/g, label: '[PAN]' },                                                // bare 16-digit PAN
  { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, label: '[PAN]' },                  // formatted card number
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, label: '[EMAIL]' },     // email
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, label: '[PHONE]' },                          // US phone
  { pattern: /\b(?:\+?\d{1,3}[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/g, label: '[PHONE]' },// international phone
];

function scrubPII(value: string): string {
  if (!env.PII_SCRUB_ENABLED) return value;
  let result = value;
  for (const { pattern, label } of PII_PATTERNS) {
    result = result.replace(pattern, label);
  }
  return result;
}

function sanitizePayload(payload: any): any {
  if (!payload) return payload;
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      return JSON.stringify(sanitizePayload(parsed));
    } catch {
      return env.PII_SCRUB_ENABLED ? scrubPII(payload) : payload;
    }
  }
  if (typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload.map(sanitizePayload);

  const sanitized = { ...payload };
  const sensitiveKeys = /key|password|secret|token|authorization/i;
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'string') {
      sanitized[key] = env.PII_SCRUB_ENABLED ? scrubPII(sanitized[key]) : sanitized[key];
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
  }).withTypeProvider<ZodTypeProvider>();

  // Set Zod compilers
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Middlewares / Hooks
  app.addHook('onRequest', requestIdMiddleware);

  const { registerMetricsHook } = await import('./metrics.js');
  registerMetricsHook(app);

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

  await app.register(fastifyCompress, {
    customTypes: /text\/html|text\/plain|application\/json/,
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

      if (!isProd) {
        const devOrigins = [
          'http://localhost:3000',
          'http://127.0.0.1:3000',
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

      const allowedOriginsStr = env.ALLOWED_ORIGINS || '';
      if (allowedOriginsStr) {
        const allowedOrigins = allowedOriginsStr.split(',').map((o) => o.trim());
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
      } else {
        if (origin === 'tauri://localhost' || origin === 'nyx://localhost') {
          return callback(null, true);
        }
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
    ],
    credentials: true,
  });

  // Add rate limiting
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

  app.get('/ws/downloads', { websocket: true }, async (socket, req) => {
    const searchParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const token = searchParams.get('token');
    if (!token || !verifySessionToken(token)) {
      socket.close(1008, 'Unauthorized');
      return;
    }
    const { LocalModelManager } = await import('../features/local-models/localModelManager.js');
    LocalModelManager.addClient(socket as any);
  });

  const wsPingInterval = setInterval(() => {
    app.websocketServer.clients.forEach((ws: any) => {
      ws.ping();
    });
  }, 30000);

  app.addHook('onClose', (instance, done) => {
    clearInterval(wsPingInterval);
    done();
  });

  // Mount model and application routes
  await app.register(fastifyModelRoutes);
  await registerRoutes(app);

  await setupOpenApi(app);

  app.setErrorHandler(errorHandler);

  return app;
}
