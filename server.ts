import 'dotenv/config';
import './server/lib/otel.ts';
import express from 'express';
import rateLimit from 'express-rate-limit';
// cors has no default export in CommonJS declaration types
import cors from 'cors';
import { isProd, findPythonPath } from './server/lib/paths.ts';
import path from 'path';
import http from 'node:http';
import fs from 'fs';
import { WebSocketServer } from 'ws';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import compression from 'compression';
import helmet from 'helmet';
import { fileURLToPath } from 'url';

import crypto from 'crypto';

// Side-effect import to register apiAgent in the factory
import './server/lib/apiAgent.ts'; // 🚀 Init global connection pooling

// New extracted routes
import { cacheRouter } from './server/features/cache/cache.router.ts';
import { graphqlRouter } from './server/features/graphql/graphql.router.ts';
import { uploadRouter } from './server/features/upload/upload.router.ts';
import { vaultRouter } from './server/features/vault/vault.router.ts';
import { adminRouter, setScraplingHealthState } from './server/features/admin/admin.router.ts';
import { systemRouter } from './server/features/system/system.router.ts';
import { chatRouter } from './server/features/chat/chat.router.ts';
import { healthRouter } from './server/features/system/health.router.ts';
import { metricsRouter } from './server/features/system/metrics.router.ts';
import { conversationsRouter } from './server/features/conversations/conversations.router.ts';
import { workspaceRouter } from './server/features/workspace/workspace.router.ts';
import { filesRouter } from './server/features/files/files.router.ts';
import { workspaceWatcher } from './server/features/workspace/workspace.watcher.ts';
/**
 * WRONG-3 / BAD-2 fix: modelProxyRouter proxies requests to multiple AI provider endpoints
 * through a single /api/models/* interface. fastifyProxyRouter bridges requests from
 * the frontend to the Fastify SSE server (port 3001) for providers that require
 * zero-copy streaming. Both are intentionally kept as thin routing layers.
 */
import { modelProxyRouter } from './server/features/model-proxy/modelProxy.router.ts';
import { promptTemplatesRouter } from './server/features/prompt-templates/prompt-templates.router.ts';

// Existing routes
import { geminiRouter } from './server/features/ai-providers/gemini.router.ts';
import { terminalRouter } from './server/features/terminal/terminal.router.ts';
import { agentsRouter } from './server/features/agents/agents.router.ts';
import { nyxRouter } from './server/features/nyx/nyx.router.ts';
import { localModelsRouter } from './server/features/local-models/localModels.router.ts';

import { requestIdMiddleware } from './server/middleware/requestId.ts';
import logger from './server/lib/logger.ts';
import { safetyGateMiddleware } from './server/middleware/safetyGate.ts';
import { providerRateLimiter } from './server/middleware/rateLimit.ts';
import { createSessionToken, verifySessionToken } from './server/features/vault/vault.service.ts';
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
import { startFastifyServer } from './server/fastify/fastify.server.ts';

const execAsync = promisify(exec);

// Removed DNS override as it breaks enterprise VPNs and split-horizon DNS.

import { PORTS } from './src/shared/constants.ts';

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || String(PORTS.API), 10);
const FASTIFY_PORT = parseInt(process.env.FASTIFY_PORT || String(PORTS.FASTIFY), 10);

/**
 * TODO(github-issue): MISSING-7: Startup dependency health checks.
 * Warns (not fatal) for optional deps (Vulkan, Python).
 * All results logged via pino structured logger.
 */
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
      // Windows fallback: check via DirectX diag or GPU info
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

async function startServer() {
  // Initialize SQLite schema and migrate legacy JSON chat files
  runMigrations();
  migrateSqliteStore();
  migrateOldStore();

  // TODO(github-issue): MISSING-7: Startup dependency health checks
  await runDependencyHealthChecks();

  // TODO(github-issue): MISSING-6: Scan and load plugins
  await pluginRegistry.loadPlugins();

  const SCRAPLING_PORT = parseInt(process.env.SCRAPLING_PORT || String(PORTS.SCRAPLING), 10);
  let scraplingProc: ReturnType<typeof spawn> | null = null;

  const ANTIGRAVITY_PORT = parseInt(process.env.ANTIGRAVITY_PORT || String(PORTS.ANTIGRAVITY), 10);
  let antigravityProc: ReturnType<typeof spawn> | null = null;

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

  async function spawnScrapling() {
    try {
      const isAvailable = await checkPortAvailable(SCRAPLING_PORT);
      if (!isAvailable) {
        logger.warn(
          `[Scrapling] Port ${SCRAPLING_PORT} is already in use. Skipping spawn to avoid crash-loop. Assuming external instance.`
        );
        return; // Don't crash loop, assume it's running externally
      }

      const pythonPath = findPythonPath();
      const scraplingScriptPath = path.join(_dirname, 'server', 'python', 'scrapling_server.py');
      logger.info(
        `[Scrapling] Spawning Scrapling server on port ${SCRAPLING_PORT} using ${pythonPath}...`
      );
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
      setScraplingHealthState('offline');
    }
  }

  async function spawnAntigravity() {
    try {
      const isAvailable = await checkPortAvailable(ANTIGRAVITY_PORT);
      if (!isAvailable) {
        logger.warn(
          `[Antigravity] Port ${ANTIGRAVITY_PORT} is already in use. Skipping spawn to avoid crash-loop. Assuming external instance.`
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
      logger.info(
        `[Antigravity] Spawning Antigravity server on port ${ANTIGRAVITY_PORT} using ${pythonPath}...`
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

  // Start Fastify SSE Server
  startFastifyServer(FASTIFY_PORT).catch((err) => {
    logger.error({ err }, '[Fastify] Startup failed in server.ts');
  });

  // BAD-6: Health-check loop — poll every 15 seconds, auto-restart on failure
  const scraplingHealthInterval = setInterval(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`http://127.0.0.1:${SCRAPLING_PORT}/health`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      if (res.ok) {
        setScraplingHealthState('running');
      } else {
        throw new Error(`Scrapling health check returned ${res.status}`);
      }
    } catch {
      logger.warn('[Scrapling] Health check failed — restarting Scrapling service...');
      setScraplingHealthState('restarting');
      if (scraplingProc) {
        try {
          scraplingProc.kill('SIGTERM');
        } catch {
          /* ignore */
        }
        scraplingProc = null;
      }
      setTimeout(() => spawnScrapling(), 2000); // Allow 2s for process to exit before respawn
    }
  }, 15_000);
  scraplingHealthInterval.unref(); // Don't keep Node.js alive just for this timer

  const antigravityHealthInterval = setInterval(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`http://127.0.0.1:${ANTIGRAVITY_PORT}/health`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      if (!res.ok) {
        throw new Error(`Antigravity health check returned ${res.status}`);
      }
    } catch {
      logger.warn('[Antigravity] Health check failed — restarting Antigravity service...');
      if (antigravityProc) {
        try {
          antigravityProc.kill('SIGTERM');
        } catch {
          /* ignore */
        }
        antigravityProc = null;
      }
      setTimeout(() => spawnAntigravity(), 2000);
    }
  }, 15_000);
  antigravityHealthInterval.unref();

  const app = express();
  app.use(requestIdMiddleware);

  // Structured Logging with body capture
  app.use((req, res, next) => {
    const start = Date.now();
    const oldWrite = res.write;
    const oldEnd = res.end;
    const chunks: Buffer[] = [];

    res.write = function (chunk: any, ...args: any[]) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return oldWrite.apply(res, [chunk, ...args] as any);
    };

    res.end = function (chunk: any, ...args: any[]) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return oldEnd.apply(res, [chunk, ...args] as any);
    };

    res.on('finish', () => {
      // Don't log bodies for large payloads or streams
      let resBody = '';
      if (
        !req.path.includes('/stream') &&
        !req.path.includes('/logs') &&
        res.get('Content-Type')?.includes('application/json')
      ) {
        resBody = Buffer.concat(chunks).toString('utf8');
      }

      logger.info(
        {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          latencyMs: Date.now() - start,
          reqBody: req.body,
          resBody: resBody.length < 5000 ? resBody : '[Truncated]',
        },
        `Request finished: ${req.method} ${req.path}`
      );
    });
    next();
  });

  // Compression
  app.use(
    compression({
      filter: (req, res) => {
        if (
          req.headers.accept === 'text/event-stream' ||
          req.path.includes('/stream') ||
          req.path.includes('/chat') ||
          req.path.includes('/local-models')
        )
          return false;
        return compression.filter(req, res);
      },
    })
  );

  app.set('trust proxy', 1);

  // CSP Nonce generation
  app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-eval'",
            (req, res) => `'nonce-${(res as any).locals.nonce}'`,
          ],

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
    })
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(
    cors({
      origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:1420',
        'http://127.0.0.1:1420',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'tauri://localhost',
        'nyx://localhost',
      ],
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
    })
  );

  // Session middleware
  const sessionValidationMiddleware = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const fullPath = req.originalUrl.split('?')[0].replace(/\/$/, '');
    const isPublic = new Set([
      '/api/v1/health',
      '/api/v1/vault/status',
      '/api/v1/vault/token',
      '/api/v1/auth/session',
      '/api/v1/admin/logs',
      '/api/v1/metrics',
      '/api/v1/graphql',
    ]).has(fullPath);

    if (isPublic) return next();

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ') && verifySessionToken(authHeader.substring(7))) {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token' });
  };

  app.use('/api/v1', sessionValidationMiddleware);

  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5000, // Increased to support frequent frontend polling
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/v1', generalLimiter);

  // Mount routes
  const v1Router = express.Router();
  const v2Router = express.Router(); // Placeholder for migration path

  v1Router.use('/vault', vaultRouter);
  v1Router.get('/auth/session', (req, res) => {
    const isStream = req.query.stream === 'true';
    res.json({ token: createSessionToken(isStream), expiresAt: Date.now() + 5 * 60 * 1000 });
  });
  v1Router.use('/admin', adminRouter);
  v1Router.use('/', systemRouter);
  v1Router.use('/', healthRouter);
  v1Router.use('/', metricsRouter);
  v1Router.use('/conversations', conversationsRouter);
  v1Router.use('/chat', chatRouter);
  v1Router.use('/files', filesRouter);
  v1Router.use('/cache', cacheRouter);
  v1Router.use('/workspace', workspaceRouter);
  v1Router.use('/models', modelProxyRouter);
  v1Router.use('/prompt-templates', promptTemplatesRouter);

  v1Router.use('/gemini', providerRateLimiter('gemini'), geminiRouter);
  v1Router.use('/terminal', terminalRouter);
  v1Router.use('/agents', agentsRouter);
  v1Router.use('/nyx/local-models', localModelsRouter);
  v1Router.use('/nyx', nyxRouter);
  v1Router.use('/graphql', graphqlRouter);
  v1Router.use('/upload', uploadRouter);

  app.use('/api/v1', v1Router);
  app.use('/api/v2', v2Router);

  if (isProd) {
    let distPath = path.join(_dirname, 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      distPath = path.join(_dirname, '../dist');
    }
    logger.info(`[Server] Serving static assets from: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/v1'))
        return res.status(404).json({ error: 'Endpoint not found' });
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Setup OpenAPI Docs route before global error handler
  setupOpenApi(app);

  app.use(errorHandler);

  const server = http.createServer(app);
  server.keepAliveTimeout = 75_000;
  server.headersTimeout = 76_000;
  server.maxConnections = 512;
  server.on('connection', (socket) => socket.setNoDelay(true));

  server.listen(PORT, '127.0.0.1', () => {
    logger.info(`🚀 NYX READY: http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const { pathname, searchParams } = new URL(
        request.url || '',
        `http://${request.headers.host || 'localhost'}`
      );

      const token = searchParams.get('token');
      if (!token || !verifySessionToken(token)) {
        logger.warn('[WebSocket] Unauthorized connection attempt');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      if (pathname === '/ws/session-sync') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          (ws as any).roomId = searchParams.get('roomId') || 'global';
          wss.emit('connection', ws, request);
        });
      } else if (pathname === '/ws/file-watcher') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          workspaceWatcher.addClient(ws);
        });
      } else if (pathname === '/ws/downloads') {
        import('./features/local-models/localModelManager.ts')
          .then(({ LocalModelManager }) => {
            wss.handleUpgrade(request, socket, head, (ws) => {
              LocalModelManager.addClient(ws);
            });
          })
          .catch((err) => {
            logger.error({ err }, '[WebSocket] Failed to load localModelManager for WS');
            socket.destroy();
          });
      } else {
        socket.destroy();
      }
    } catch (err) {
      logger.error({ err }, '[WebSocket] Upgrade error');
      socket.destroy();
    }
  });

  wss.on('connection', (ws: any) => {
    logger.info('[WebSocket] Client connected to session sync');
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message: any) => {
      try {
        const data = JSON.parse(message.toString());
        logger.info({ event: data.event }, '[WebSocket] Received event');

        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1 && (client as any).roomId === ws.roomId) {
            client.send(JSON.stringify(data));
          }
        });
      } catch (err) {
        logger.error({ err }, '[WebSocket] Failed to process message');
      }
    });

    ws.on('close', () => {
      logger.info('[WebSocket] Client disconnected');
    });
  });

  const interval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  const shutdown = () => {
    logger.info('[Server] Gracefully shutting down...');
    cleanupProcesses();
    try {
      CodebaseScanner.dispose();
    } catch (error: any) {
      logger.error({ err: error }, '[Shutdown] Failed to dispose CodebaseScanner');
      throw error; // Escalate failure instead of swallowing silently
    }
    server.close(() => {
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
