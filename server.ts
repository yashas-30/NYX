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

import './server/lib/apiAgent.ts'; // 🚀 Init global connection pooling

// New extracted routes
import { vaultRouter } from './server/features/vault/vault.router.ts';
import { adminRouter, setScraplingHealthState } from './server/features/admin/admin.router.ts';
import { systemRouter } from './server/features/system/system.router.ts';
import { chatRouter } from './server/features/chat/chat.router.ts';
import { healthRouter } from './server/features/system/health.router.ts';
import { metricsRouter } from './server/features/system/metrics.router.ts';
import { conversationsRouter } from './server/features/conversations/conversations.router.ts';
import { cacheRouter } from './server/features/cache/cache.router.ts';
import { workspaceRouter } from './server/features/workspace/workspace.router.ts';
/**
 * WRONG-3 / BAD-2 fix: modelProxyRouter proxies requests to multiple AI provider endpoints
 * through a single /api/models/* interface. fastifyProxyRouter bridges requests from
 * the frontend to the Fastify SSE server (port 3001) for providers that require
 * zero-copy streaming. Both are intentionally kept as thin routing layers.
 */
import { modelProxyRouter } from './server/features/model-proxy/modelProxy.router.ts';
import { fastifyProxyRouter } from './server/features/model-proxy/fastifyProxy.router.ts';

// Existing routes
import { geminiRouter } from './server/features/ai-providers/gemini.router.ts';
import { terminalRouter } from './server/features/terminal/terminal.router.ts';
import { agentsRouter } from './server/features/agents/agents.router.ts';
import { nyxRouter } from './server/features/nyx/nyx.router.ts';
import { localModelsRouter } from './server/features/local-models/localModels.router.ts';

import { warmupDNS, startFastifyServer } from './server/lib/fastifyApi.ts';
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

const execAsync = promisify(exec);

// DNS override removed: breaks enterprise VPNs and split-horizon DNS.

const _dirname = typeof __dirname !== 'undefined' ? __dirname : '';
const PORT = parseInt(process.env.PORT || '3000', 10);
const FASTIFY_PORT = parseInt(process.env.FASTIFY_PORT || '3001', 10);

/**
 * MISSING-7: Startup dependency health checks.
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
  } catch (err: any) {
    logger.warn(
      { err: err.message },
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

  // MISSING-7: Startup dependency health checks
  await runDependencyHealthChecks();

  // MISSING-6: Scan and load plugins
  await pluginRegistry.loadPlugins();

  try {
    await warmupDNS();
    await startFastifyServer(FASTIFY_PORT);
  } catch (err: any) {
    logger.error({ err: err.message }, `Failed to start Fastify server on port ${FASTIFY_PORT}`);
  }

  const SCRAPLING_PORT = parseInt(process.env.SCRAPLING_PORT || '3002', 10);
  let scraplingProc: ReturnType<typeof spawn> | null = null;

  const ANTIGRAVITY_PORT = parseInt(process.env.ANTIGRAVITY_PORT || '3003', 10);
  let antigravityProc: ReturnType<typeof spawn> | null = null;

  function spawnScrapling() {
    try {
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
    } catch (err: any) {
      logger.error({ err: err.message }, '[Scrapling] Failed to spawn Scrapling local service');
      setScraplingHealthState('offline');
    }
  }

  function spawnAntigravity() {
    try {
      const pythonPath = findPythonPath();
      const antigravityScriptPath = path.join(_dirname, 'server', 'python', 'antigravity_service.py');
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
    } catch (err: any) {
      logger.error({ err: err.message }, '[Antigravity] Failed to spawn Antigravity local service');
    }
  }

  spawnScrapling();
  spawnAntigravity();

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

  const app = express();
  app.use(requestIdMiddleware);

  // Structured Logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info(
        {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          latencyMs: Date.now() - start,
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

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'"],
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

  app.use(express.json({ limit: '10mb' }));
  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-NYX-Session-Token', 'x-nyx-session-token', 'traceparent', 'tracestate', 'Connection', 'Accept'],
      credentials: false,
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
      '/api/health',
      '/api/vault/status',
      '/api/vault/token',
      '/api/auth/session',
      '/api/admin/logs',
    ]).has(fullPath);

    if (isPublic) return next();

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ') && verifySessionToken(authHeader.substring(7))) {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token' });
  };

  app.use('/api', sessionValidationMiddleware);

  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10000,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', generalLimiter);

  // Mount routes
  app.use('/api/vault', vaultRouter);
  app.get('/api/auth/session', (req, res) => {
    const isStream = req.query.stream === 'true';
    res.json({ token: createSessionToken(isStream), expiresAt: Date.now() + 5 * 60 * 1000 });
  });
  app.use('/api/admin', adminRouter);
  app.use('/api', systemRouter);
  app.use('/api', healthRouter);
  app.use('/api', metricsRouter);
  app.use(express.json({ limit: '10mb' })); // Ensure consistency after limit updates
  app.use('/api/conversations', conversationsRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/cache', cacheRouter);
  app.use('/api/workspace', workspaceRouter);
  app.use('/api/models', modelProxyRouter);
  app.use('/api/fastify', fastifyProxyRouter);

  // Existing Provider routes with per-provider rate limits
  const localModelLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10000,
    message: { error: 'Local model rate limit exceeded.' },
    skip: () => true,
  });

  app.use('/api/gemini', providerRateLimiter('gemini'), geminiRouter);
  app.use('/api/terminal', sessionValidationMiddleware, terminalRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/nyx/local-models', localModelLimiter, localModelsRouter);
  app.use('/api/nyx', nyxRouter);

  if (isProd) {
    let distPath = path.join(_dirname, 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      distPath = path.join(_dirname, '../dist');
    }
    logger.info(`[Server] Serving static assets from: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Endpoint not found' });
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: path.join(_dirname, '..'),
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            '**/.nyx-cache/**',
            '**/.nyx-models/**',
            '**/.nyx-logs/**',
            '**/nyx.db*',
            '**/scratch/**',
            '**/server.log',
            '**/server.err',
            /[/\\]nyx\.db.*/,
            /.*nyx\.db.*/,
          ],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

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
      const { pathname } = new URL(
        request.url || '',
        `http://${request.headers.host || 'localhost'}`
      );
      if (pathname === '/ws/session-sync') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch (err) {
      logger.error({ err }, '[WebSocket] Upgrade error');
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    logger.info('[WebSocket] Client connected to session sync');

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        logger.info({ event: data.event }, '[WebSocket] Received event');

        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1) {
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

  const shutdown = () => {
    logger.info('[Server] Gracefully shutting down...');
    cleanupProcesses();
    try {
      CodebaseScanner.dispose();
    } catch (e: any) {
      logger.error({ err: e }, '[Shutdown] Failed to dispose CodebaseScanner');
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
  } catch (err: any) {
    logger.error({ err }, '[UncaughtException] Failed to dispose CodebaseScanner');
  }
  process.exit(1);
});
