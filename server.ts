import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
// @ts-ignore - cors has no default export in CommonJS declaration types
import cors from 'cors';
import { fileURLToPath } from 'url';
import { isProd } from './server/lib/paths.ts';
import path from 'path';
import http from 'node:http';
import fs from 'fs';
import compression from 'compression';
import helmet from 'helmet';

import './server/lib/apiAgent.ts'; // 🚀 Init global connection pooling

// New extracted routes
import { vaultRouter } from './server/routes/vault.ts';
import { adminRouter } from './server/routes/admin.ts';
import { systemRouter } from './server/routes/system.ts';
import { healthRouter } from './server/routes/health.ts';
import { metricsRouter } from './server/routes/metrics.ts';
import { conversationsRouter } from './server/routes/conversations.ts';
import { cacheRouter } from './server/routes/cache.ts';
import { workspaceRouter } from './server/routes/workspace.ts';
import { modelProxyRouter } from './server/routes/modelProxy.ts';
import { fastifyProxyRouter } from './server/routes/fastifyProxy.ts';

// Existing routes
import { geminiRouter } from './server/routes/gemini.ts';
import { openrouterRouter } from './server/routes/openrouter.ts';
import { nvidiaRouter } from './server/routes/nvidia.ts';
import { terminalRouter } from './server/routes/terminal.ts';
import { agentsRouter } from './server/routes/agents.ts';
import { opencodeRouter } from './server/routes/opencode.ts';
import { nyxRouter } from './server/routes/nyx.ts';
import { pollinationsRouter } from './server/routes/pollinations.ts';
import { localModelsRouter } from './server/routes/localModels.ts';
import { qwenLocalRouter } from './server/routes/qwenLocal.ts';

import { warmupDNS, startFastifyServer } from './server/lib/fastifyApi.ts';
import { requestIdMiddleware } from './server/middleware/requestId.ts';
import logger from './server/lib/logger.ts';
import { safetyGateMiddleware } from './server/middleware/safetyGate.ts';
import { createSessionToken, verifySessionToken } from './server/lib/keyVault.ts';
import { cleanupProcesses } from './server/lib/processRegistry.ts';
import { CodebaseScanner } from './server/lib/codebaseScanner.ts';
import { runMigrations } from './server/db/migrator.ts';
import { migrateOldStore } from './server/lib/conversationStore.ts';

// DNS override removed: breaks enterprise VPNs and split-horizon DNS.

const _filename = typeof __filename !== 'undefined' ? __filename : '';
const _dirname = typeof __dirname !== 'undefined' ? __dirname : '';
const PORT = parseInt(process.env.PORT || '3000', 10);
const FASTIFY_PORT = parseInt(process.env.FASTIFY_PORT || '3001', 10);

async function startServer() {
  // Initialize SQLite schema and migrate legacy JSON chat files
  runMigrations();
  migrateOldStore();

  try {
    await warmupDNS();
    await startFastifyServer(FASTIFY_PORT);
  } catch (err: any) {
    console.error(`Failed to start Fastify server on port ${FASTIFY_PORT}:`, err.message);
  }

  const app = express();
  app.use(requestIdMiddleware);

  // Structured Logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info({
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        latencyMs: Date.now() - start
      }, `Request finished: ${req.method} ${req.path}`);
    });
    next();
  });

  // Compression
  app.use(compression({
    filter: (req, res) => {
      if (
        req.headers.accept === 'text/event-stream' || 
        req.path.includes('/stream') || 
        req.path.includes('/chat') || 
        req.path.includes('/local-models')
      ) return false;
      return compression.filter(req, res);
    }
  }));

  // Security Headers
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], connectSrc: ["'self'", 'http://127.0.0.1:3001', 'http://127.0.0.1:3002', 'https://generativelanguage.googleapis.com', 'https://openrouter.ai', 'https://integrate.api.nvidia.com', 'https://opencode.ai', 'https://text.pollinations.ai', 'ws://localhost:*', 'wss://localhost:*'] } }, crossOriginEmbedderPolicy: false }));

  app.use(express.json({ limit: '4mb' }));
  app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-NYX-Session-Token'],
    credentials: false
  }));

  // Session middleware
  const sessionValidationMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const isPublic = new Set([
      '/api/health',
      '/api/vault/status',
      '/api/vault/token',
      '/api/auth/session',
      '/api/admin/logs'
    ]).has(req.path.replace(/\/$/, ''));

    if (isPublic) return next();

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ') && verifySessionToken(authHeader.substring(7))) {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token' });
  };

  app.use('/api', sessionValidationMiddleware);

  const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
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
  app.use('/api/conversations', conversationsRouter);
  app.use('/api/cache', cacheRouter);
  app.use('/api/workspace', workspaceRouter);
  app.use('/api/models', modelProxyRouter);
  app.use('/api/fastify', fastifyProxyRouter);

  // Existing Provider routes
  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'AI request rate limit exceeded.' }
  });

  const localModelLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10000,
    message: { error: 'Local model rate limit exceeded.' },
    skip: () => true
  });

  app.use('/api/gemini',       aiLimiter, safetyGateMiddleware, geminiRouter);
  app.use('/api/openrouter',   aiLimiter, safetyGateMiddleware, openrouterRouter);
  app.use('/api/nvidia',       aiLimiter, safetyGateMiddleware, nvidiaRouter);
  app.use('/api/terminal',     sessionValidationMiddleware, terminalRouter);
  app.use('/api/agents',       agentsRouter);
  app.use('/api/opencode',     aiLimiter, safetyGateMiddleware, opencodeRouter);
  app.use('/api/nyx/local-models', localModelLimiter, localModelsRouter);
  app.use('/api/nyx',          nyxRouter);
  app.use('/api/pollinations', aiLimiter, safetyGateMiddleware, pollinationsRouter);
  app.use('/api/qwen-local',   aiLimiter, safetyGateMiddleware, qwenLocalRouter);

  if (isProd) {
    let distPath = path.join(_dirname, 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      distPath = path.join(_dirname, '../dist');
    }
    console.log(`[Server] Serving static assets from: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Endpoint not found' });
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  const server = http.createServer(app);
  server.keepAliveTimeout = 75_000;
  server.headersTimeout   = 76_000;
  server.maxConnections   = 512;
  server.on('connection', (socket) => socket.setNoDelay(true));

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`🚀 NYX READY: http://localhost:${PORT}`);
  });

  const shutdown = () => {
    console.log('[Server] Gracefully shutting down...');
    cleanupProcesses();
    try {
      CodebaseScanner.dispose();
    } catch (e: any) {
      console.error('[Shutdown] Failed to dispose CodebaseScanner:', e.message);
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

process.on('unhandledRejection', (e) => console.error('[UnhandledRejection]', e));
process.on('uncaughtException',  (e) => {
  console.error('[UncaughtException]', e);
  cleanupProcesses();
  try {
    CodebaseScanner.dispose();
  } catch (err: any) {
    console.error('[UncaughtException] Failed to dispose CodebaseScanner:', err.message);
  }
  process.exit(1);
});
