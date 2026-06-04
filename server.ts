// fallow-ignore-file code-duplication
import 'dotenv/config';
import './server/lib/otel.ts';
import fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyCompress from '@fastify/compress';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyMultipart from '@fastify/multipart';
import { isProd, findPythonPath } from './server/lib/paths.ts';
import { setScraplingHealthState } from './server/features/admin/admin.router.ts';
import { workspaceWatcher } from './server/features/workspace/workspace.watcher.ts';
import path from 'path';
import fs from 'fs';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import http from 'node:http'; // Used for port check only
import * as Sentry from '@sentry/node';

// Initialize Sentry before anything else
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
  });
}

// Side-effect import to register apiAgent in the factory
import './server/lib/apiAgent.ts'; // 🚀 Init global connection pooling

import { setupRoutes } from './server/api/routes.ts';
import { requestIdMiddleware } from './server/middleware/requestId.ts';
import logger from './server/lib/logger.ts';
import { verifySessionToken } from './server/features/vault/vault.service.ts';
import { cleanupProcesses, registerProcess } from './server/lib/processRegistry.ts';
import { CodebaseScanner } from './server/features/workspace/codebaseScanner.ts';
import { runMigrations } from './server/db/migrator.ts';
import {
  migrateOldStore,
  migrateSqliteStore,
} from './server/features/conversations/conversations.service.ts';
import { pluginRegistry } from './server/lib/pluginRegistry.ts';
import { errorHandler } from './server/middleware/errorHandler.ts';
import { setupOpenApi } from './server/docs/openapi.ts';
import { fastifyModelRoutes } from './server/fastify/fastify.server.ts';

const execAsync = promisify(exec);
import { PORTS } from './src/shared/constants.ts';

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || String(PORTS.API), 10);
// FASTIFY_PORT is removed as everything is on PORT 3000 now

async function runDependencyHealthChecks() {
  logger.info('[DepCheck] Running startup dependency health checks...');

  // Check Python availability
  try {
    const pythonPath = findPythonPath();
    await execAsync(`"${pythonPath}" --version`, { timeout: 5_000 });
    logger.info({ pythonPath }, '[DepCheck] Python: OK');
  } catch (error: any) {
    logger.warn(
      { error: error.message },
      '[DepCheck] Python: NOT FOUND — Scrapling service will be unavailable'
    );
  }

  // Check llama-server binary
  const llamaPaths = [
    path.join(_dirname, '.nyx-models', 'llama-server.exe'),
    path.join(_dirname, '.nyx-models', 'llama-server'),
    path.join(_dirname, 'llama-server.exe'),
    path.join(_dirname, 'llama-server'),
  ];
  const llamaBinaryExists = llamaPaths.some((p) => fs.existsSync(p));
  if (llamaBinaryExists) {
    logger.info('[DepCheck] llama-server binary: OK');
  } else {
    logger.warn(
      '[DepCheck] llama-server binary: NOT FOUND — Local GGUF models will require download on first use'
    );
  }

  // Check Vulkan driver
  try {
    await execAsync('vulkaninfo --summary 2>&1 | head -5', { timeout: 5_000 });
    logger.info('[DepCheck] Vulkan driver: OK');
  } catch {
    try {
      await execAsync('dxdiag /t nul 2>&1', { timeout: 5_000 });
      logger.info('[DepCheck] Vulkan driver: Using DirectX fallback (GPU detected)');
    } catch {
      logger.warn(
        '[DepCheck] Vulkan driver: NOT DETECTED — GPU acceleration may be unavailable for local models'
      );
    }
  }
  logger.info('[DepCheck] Startup dependency health checks complete.');
}

async function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(true);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

async function startServer() {
  runMigrations();
  migrateSqliteStore();
  migrateOldStore();

  await runDependencyHealthChecks();
  await pluginRegistry.loadPlugins();

  const SCRAPLING_PORT = parseInt(process.env.SCRAPLING_PORT || String(PORTS.SCRAPLING), 10);
  let scraplingProc: ReturnType<typeof spawn> | null = null;

  const ANTIGRAVITY_PORT = parseInt(process.env.ANTIGRAVITY_PORT || String(PORTS.ANTIGRAVITY), 10);
  let antigravityProc: ReturnType<typeof spawn> | null = null;

  async function spawnScrapling() {
    try {
      const isAvailable = await checkPortAvailable(SCRAPLING_PORT);
      if (!isAvailable) {
        logger.warn(
          `[Scrapling] Port ${SCRAPLING_PORT} is already in use. Skipping spawn to avoid crash-loop. Assuming external instance.`
        );
        return;
      }
      const pythonPath = findPythonPath();
      const scraplingScriptPath = path.join(_dirname, 'server', 'python', 'scrapling_server.py');
      const proc = spawn(pythonPath, [scraplingScriptPath, '--port', String(SCRAPLING_PORT)], {
        cwd: path.dirname(scraplingScriptPath),
        detached: false,
        stdio: ['ignore', 'inherit', 'inherit'],
      });
      registerProcess(proc);
      setScraplingHealthState('running');
      scraplingProc = proc;
      proc.on('exit', () => {
        setScraplingHealthState('offline');
        scraplingProc = null;
      });
    } catch (error: any) {
      logger.error({ error: error.message }, '[Scrapling] Failed to spawn Scrapling local service');
    }
  }

  async function spawnAntigravity() {
    try {
      const isAvailable = await checkPortAvailable(ANTIGRAVITY_PORT);
      if (!isAvailable) {
        logger.warn(
          `[Antigravity] Port ${ANTIGRAVITY_PORT} is already in use. Skipping spawn to avoid crash-loop.`
        );
        return;
      }
      const pythonPath = findPythonPath();
      const antigravityScriptPath = path.join(
        _dirname,
        'server',
        'python',
        'antigravity_service.py'
      );
      const proc = spawn(pythonPath, [antigravityScriptPath, '--port', String(ANTIGRAVITY_PORT)], {
        cwd: path.dirname(antigravityScriptPath),
        detached: false,
        stdio: ['ignore', 'inherit', 'inherit'],
      });
      registerProcess(proc);
      antigravityProc = proc;
      proc.on('exit', () => {
        antigravityProc = null;
      });
    } catch (error: any) {
      logger.error(
        { error: error.message },
        '[Antigravity] Failed to spawn Antigravity local service'
      );
    }
  }

  await spawnScrapling();
  await spawnAntigravity();

  // Health checks
  const scraplingHealthInterval = setInterval(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`http://127.0.0.1:${SCRAPLING_PORT}/health`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      if (!res.ok) throw new Error(`Scrapling health check returned ${res.status}`);
    } catch {
      logger.warn('[Scrapling] Health check failed - restarting Scrapling service...');
      if (scraplingProc) {
        try {
          scraplingProc.kill('SIGTERM');
        } catch {}
        scraplingProc = null;
      }
      setTimeout(() => spawnScrapling(), 2000);
    }
  }, 15_000);
  scraplingHealthInterval.unref();

  const antigravityHealthInterval = setInterval(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`http://127.0.0.1:${ANTIGRAVITY_PORT}/health`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      if (!res.ok) throw new Error(`Antigravity health check returned ${res.status}`);
    } catch {
      logger.warn('[Antigravity] Health check failed — restarting Antigravity service...');
      if (antigravityProc) {
        try {
          antigravityProc.kill('SIGTERM');
        } catch {}
        antigravityProc = null;
      }
      setTimeout(() => spawnAntigravity(), 2000);
    }
  }, 15_000);
  antigravityHealthInterval.unref();

  // Initialize Fastify
  const app = fastify({
    logger: {
      transport: {
        target: 'pino/file',
        options: { destination: 1 },
      },
    },
    keepAliveTimeout: 75_000,
    maxParamLength: 512,
  });

  // Setup Middleware via hooks and plugins
  app.addHook('onRequest', requestIdMiddleware);

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

  app.addHook('onResponse', (request, reply, done) => {
    const latency = reply.elapsedTime;
    let finalResBody = '[Truncated]'; // For streams or large payloads

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
        ],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  const fastifyMetrics = await import('fastify-metrics').then((m) => m.default || m);
  await app.register(fastifyMetrics, { endpoint: '/api/v1/metrics/fastify' });

  // @ts-ignore - dynamic import since we just installed it
  const fastifyCookie = await import('@fastify/cookie').then((m) => m.default || m);
  await app.register(fastifyCookie, {
    secret: process.env.NYX_MASTER_KEY || crypto.randomBytes(32).toString('hex'),
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
          // Temporarily disable CSRF error throwing during development if missing
          if (
            process.env.NODE_ENV !== 'development' ||
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

      const allowedOriginsStr = process.env.ALLOWED_ORIGINS || '';
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

  await app.register(fastifyRateLimit, {
    max: 5000,
    timeWindow: '1 minute',
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  });

  await app.register(fastifyWebsocket);

  // Set up WebSocket handlers inside a plugin or directly
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
        const data = JSON.parse(message);
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
    const { LocalModelManager } =
      await import('./server/features/local-models/localModelManager.ts');
    LocalModelManager.addClient(socket as any);
  });

  // Keep WebSocket alive
  const wsPingInterval = setInterval(() => {
    app.websocketServer.clients.forEach((ws: any) => {
      ws.ping();
    });
  }, 30000);
  app.addHook('onClose', (instance, done) => {
    clearInterval(wsPingInterval);
    done();
  });

  // Mount model routes
  await app.register(fastifyModelRoutes);

  // Setup API Routes
  await setupRoutes(app);

  if (isProd) {
    let distPath = path.join(_dirname, 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      distPath = path.join(_dirname, '../dist');
    }
    logger.info(`[Server] Serving static assets from: ${distPath}`);
    await app.register(fastifyStatic, {
      root: distPath,
      wildcard: false,
    });
    app.get('*', async (request, reply) => {
      if (request.url.startsWith('/api/v1')) {
        reply.code(404).send({ error: 'Endpoint not found' });
      } else {
        return reply.sendFile('index.html');
      }
    });
  }

  // OpenAPI Docs
  await setupOpenApi(app);

  // Global Error Handler
  app.setErrorHandler(errorHandler);

  try {
    await app.listen({ port: PORT, host: '127.0.0.1' });
    logger.info(`🚀 NYX READY: http://localhost:${PORT}`);
  } catch (err) {
    logger.error({ err }, '[Fastify] Startup failed in server.ts');
    process.exit(1);
  }

  const shutdown = () => {
    logger.info('[Server] Gracefully shutting down...');
    cleanupProcesses();
    try {
      CodebaseScanner.dispose();
    } catch (error: any) {
      logger.error({ err: error }, '[Shutdown] Failed to dispose CodebaseScanner');
    }
    app.close().then(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer();

process.on('unhandledRejection', (e) => logger.error({ err: e }, '[UnhandledRejection]'));
process.on('uncaughtException', (e) => {
  logger.error({ err: e }, '[UncaughtException]');
  cleanupProcesses();
  try {
    CodebaseScanner.dispose();
  } catch (error: any) {
    logger.error({ error }, '[UncaughtException] Failed to dispose CodebaseScanner');
    process.exit(1);
  }
  process.exit(1);
});
