// ─── server.ts (entry point) ──────────────────────────────────────────────────
// Thin assembler — wires routes together and starts Vite + Express.
// To add a new provider: create server/routes/myprovider.ts, then add 2 lines here.

import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'node:http';
import dns from 'node:dns';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';

import './server/lib/apiAgent.ts'; // 🚀 Init global connection pooling

import { geminiRouter }     from './server/routes/gemini.ts';
import { openrouterRouter } from './server/routes/openrouter.ts';
import { nvidiaRouter }     from './server/routes/nvidia.ts';
import { terminalRouter }   from './server/routes/terminal.ts';
import { agentsRouter }     from './server/routes/agents.ts';
import { opencodeRouter }   from './server/routes/opencode.ts';
import { nyxRouter }        from './server/routes/nyx.ts';
import { pollinationsRouter } from './server/routes/pollinations.ts';
import { localModelsRouter } from './server/routes/localModels.ts';
import { qwenLocalRouter }   from './server/routes/qwenLocal.ts';
import { LocalModelRunner }  from './server/lib/localModelRunner.ts';
import { CacheServer }      from './server/lib/cache.ts';
import compression from 'compression';
import { warmupDNS, startFastifyServer } from './server/lib/fastifyApi.ts';

import { requestIdMiddleware } from './server/middleware/requestId.ts';
import logger from './server/lib/logger.ts';
import { safetyGateMiddleware } from './server/middleware/safetyGate.ts';
import { loadKeys, saveKeys, createSessionToken, verifySessionToken, getVaultStatus } from './server/lib/keyVault.ts';


// ── DNS: prefer Cloudflare for fastest lookups on Windows ─────────────────────
try { dns.setServers(['1.1.1.1', '8.8.8.8']); } catch { }

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PORT       = parseInt(process.env.PORT || '3000', 10);

import { spawn } from 'child_process';

function startPythonHFServer() {
  console.log('[Server] Spawning local Python Hugging Face server (Qwen/Qwen2.5-Coder-1.5B-Instruct) via uvicorn...');
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const child = spawn(pythonCmd, ['-m', 'uvicorn', 'server.python.hf_service_fastapi:app', '--host', '127.0.0.1', '--port', '3002'], {
    stdio: 'inherit',
    detached: false
  });

  child.on('error', (err) => {
    console.error('[Server] ERROR: Failed to start Python local HF server:', err.message);
    console.error('[Server] Please ensure Python is installed and run "python -m uvicorn server.python.hf_service_fastapi:app --host 127.0.0.1 --port 3002" manually.');
  });

  process.on('exit', () => {
    child.kill();
  });
}

async function startServer() {
  // Ensure directories exist
  const VAULT_DIR = path.join(process.cwd(), '.nyx-keys');
  const LOGS_DIR = path.join(process.cwd(), '.nyx-logs');
  if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

  // Start the Python Hugging Face server on port 3002 (disabled by default to optimize CPU RAM; GGUF local models execute in GPU VRAM instead)
  // startPythonHFServer();

  // Start Fastify server for high-performance streaming API proxying
  try {
    await warmupDNS();
    await startFastifyServer(3001);
  } catch (err: any) {
    console.error('Failed to start Fastify server:', err.message);
  }

  const app = express();
  
  // ── Request Correlation ID ───────────────────────────────────────────────────
  app.use(requestIdMiddleware);

  // ── Structured Request Logging ────────────────────────────────────────────────
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const latencyMs = Date.now() - start;
      logger.info({
        requestId: (req as any).requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        latencyMs
      }, `Request finished: ${req.method} ${req.path}`);
    });
    next();
  });

  // ── Optimization: Compress non-streaming responses ──────────────────────────
  app.use(compression({
    filter: (req, res) => {
      // Don't compress SSE streams as it blocks flushing
      if (req.headers.accept === 'text/event-stream' || req.path.includes('/stream')) return false;
      return compression.filter(req, res);
    }
  }));

  // ── Security & performance headers ───────────────────────────────────────────
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.use(express.json({ limit: '4mb' }));

  // ── Session Validation Middleware ───────────────────────────────────────────
  const sessionValidationMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Allow public routes (using originalUrl since this is sub-mounted under /api)
    const originalPath = req.originalUrl.split('?')[0];
    if (
      originalPath === '/api/health' ||
      originalPath === '/api/vault/status' ||
      originalPath === '/api/vault/token' ||
      originalPath === '/api/auth/session' ||
      originalPath === '/api/admin/logs'
    ) {
      return next();
    }

    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      token = (req.headers['x-nyx-session-token'] as string) || (req.query as any)?.session_token;
    }

    if (!token && req.body && typeof req.body === 'object') {
      token = req.body.sessionToken || req.body.session_token;
    }

    if (!token || !verifySessionToken(token)) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token' });
    }

    next();
  };

  app.use('/api', sessionValidationMiddleware);

  // ── Stream Token Rotation Middleware ───────────────────────────────────────
  const streamTokenRotationMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if ((req.path.endsWith('/stream') || req.path.includes('/stream')) && req.path !== '/api/admin/logs') {
      const originalWrite = res.write;
      let metadataSent = false;

      res.write = function (chunk: any, encoding?: any, callback?: any) {
        if (!metadataSent) {
          metadataSent = true;
          // Generate a new standard session token
          const newToken = createSessionToken(false);
          // Write the tokenRotate metadata event first
          const sseMetadata = `event: metadata\ndata: ${JSON.stringify({ tokenRotate: newToken })}\n\n`;
          originalWrite.call(res, sseMetadata, 'utf8');
        }
        return originalWrite.call(res, chunk, encoding, callback);
      } as any;
    }
    next();
  };

  app.use(streamTokenRotationMiddleware);

  // ── Vault API Routes ──────────────────────────────────────────────────────────
  app.post('/api/vault/store', (req, res) => {
    const { keys } = req.body;
    if (!keys || typeof keys !== 'object') {
      return res.status(400).json({ error: 'Invalid payload: keys object required' });
    }
    try {
      const currentKeys = loadKeys();
      const updatedKeys = { ...currentKeys, ...keys };
      saveKeys(updatedKeys);
      res.json({ status: 'ok' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const handleGetToken = (req: express.Request, res: express.Response) => {
    const isStream = req.query.stream === 'true';
    const token = createSessionToken(isStream);
    res.json({ token, expiresAt: Date.now() + 5 * 60 * 1000 });
  };
  app.get('/api/vault/token', handleGetToken);
  app.get('/api/auth/session', handleGetToken);

  app.get('/api/vault/status', (req, res) => {
    res.json(getVaultStatus());
  });

  // ── Secure Admin Log Streaming ──────────────────────────────────────────────
  app.get('/api/admin/logs', (req, res) => {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey) {
      return res.status(404).send('Not Found');
    }
    const clientKey = req.headers['x-admin-key'] || req.query.adminKey;
    if (clientKey !== adminKey) {
      return res.status(401).json({ error: 'Unauthorized: Invalid admin key' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const dateStr = new Date().toISOString().slice(0, 10);
    const logPath = path.join(LOGS_DIR, `nyx-${dateStr}.log`);

    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', logPath })}\n\n`);

    let filePosition = 0;
    try {
      if (fs.existsSync(logPath)) {
        const stats = fs.statSync(logPath);
        filePosition = stats.size; // start streaming from current end
      }
    } catch {}

    const interval = setInterval(() => {
      try {
        if (!fs.existsSync(logPath)) return;
        const stats = fs.statSync(logPath);
        if (stats.size > filePosition) {
          const fd = fs.openSync(logPath, 'r');
          const buffer = Buffer.alloc(stats.size - filePosition);
          fs.readSync(fd, buffer, 0, buffer.length, filePosition);
          fs.closeSync(fd);

          filePosition = stats.size;
          const newLines = buffer.toString('utf8').split('\n');
          for (const line of newLines) {
            const trimmed = line.trim();
            if (trimmed) {
              res.write(`event: log\ndata: ${trimmed}\n\n`);
            }
          }
        }
      } catch (err: any) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      }
    }, 1000);

    req.on('close', () => {
      clearInterval(interval);
    });
  });

  // ── Health check ─────────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // ── System Specs ─────────────────────────────────────────────────────────────
  app.get('/api/system', async (req, res) => {
    const modelId = req.query.modelId as string;
    
    let vram = 0;
    let freeVram = 0;
    try {
      vram = await new Promise((resolve) => {
        const commands = [
          'nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits',
          '"C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe" --query-gpu=memory.total --format=csv,noheader,nounits'
        ];
        const tryExec = (idx: number) => {
          if (idx >= commands.length) {
            resolve(0);
            return;
          }
          exec(commands[idx], (error: any, stdout: string) => {
            if (error) {
              tryExec(idx + 1);
            } else {
              const mem = parseInt(stdout.trim(), 10);
              resolve(isNaN(mem) ? 0 : mem * 1024 * 1024);
            }
          });
        };
        tryExec(0);
      });

      freeVram = await new Promise((resolve) => {
        const commands = [
          'nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits',
          '"C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe" --query-gpu=memory.free --format=csv,noheader,nounits'
        ];
        const tryExec = (idx: number) => {
          if (idx >= commands.length) {
            resolve(0);
            return;
          }
          exec(commands[idx], (error: any, stdout: string) => {
            if (error) {
              tryExec(idx + 1);
            } else {
              const mem = parseInt(stdout.trim(), 10);
              resolve(isNaN(mem) ? 0 : mem * 1024 * 1024);
            }
          });
        };
        tryExec(0);
      });
    } catch {
      vram = 0;
      freeVram = 0;
    }

    let optimalLayers = null;
    if (modelId) {
      try {
        optimalLayers = await LocalModelRunner.calculateOptimalLayers(modelId);
      } catch (err: any) {
        console.error('Error calculating optimal layers on /api/system:', err.message);
      }
    }

    res.json({
      platform: os.platform(),
      totalmem: os.totalmem(),
      freemem: os.freemem(),
      cpus: os.cpus().length,
      vram,
      freeVram,
      optimalLayers
    });
  });

  // ── Provider routes ───────────────────────────────────────────────────────────
  app.use('/api/gemini',     safetyGateMiddleware, geminiRouter);
  app.use('/api/openrouter', safetyGateMiddleware, openrouterRouter);
  app.use('/api/nvidia',     safetyGateMiddleware, nvidiaRouter);
  app.use('/api/terminal',   terminalRouter);
  app.use('/api/agents',     agentsRouter);
  app.use('/api/opencode',   safetyGateMiddleware, opencodeRouter);
  app.use('/api/nyx',        nyxRouter);
  app.use('/api/nyx/local-models', localModelsRouter);
  app.use('/api/pollinations', safetyGateMiddleware, pollinationsRouter);
  app.use('/api/qwen-local',   safetyGateMiddleware, qwenLocalRouter);

  // ── Model list proxy (Settings page live model discovery) ────────────────────
  app.post('/api/models/list', async (req, res) => {
    const { provider, apiKey } = req.body;
    try {
      if (provider === 'gemini') {
        return res.json({ models: ['google/codegemma-2b'] });
      }
      let url = '';
      const headers: Record<string, string> = {};
      if (provider === 'openrouter') { url = 'https://openrouter.ai/api/v1/models'; headers['Authorization'] = `Bearer ${apiKey}`; }
      if (provider === 'nvidia')     { url = 'https://integrate.api.nvidia.com/v1/models'; headers['Authorization'] = `Bearer ${apiKey}`; }

      const r = await fetch(url, { headers });
      const data = await r.json();

      let models: string[] = [];
      if (provider === 'openrouter') models = data.data?.map((m: any) => m.id) || [];
      if (provider === 'nvidia')     models = data.data?.map((m: any) => m.id) || [];

      res.json({ models });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Quota/Credits Proxy ──────────────────────────────────────────────────────
  app.post('/api/models/quota', async (req, res) => {
    const { provider, apiKey } = req.body;
    try {
      if (provider === 'gemini') {
        return res.json({ status: 'ok', local: true });
      }
      if (provider === 'openrouter') {
        if (!apiKey) return res.status(401).json({ error: 'API key required for OpenRouter' });
        const r = await fetch('https://openrouter.ai/api/v1/credits', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const data = await r.json();
        return res.json(data);
      }
      res.json({});
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Cache Server API routes ───────────────────────────────────────────────
  app.post('/api/cache/get', (req, res) => {
    try {
      const key = CacheServer.generateKey(req.body);
      const text = CacheServer.get(key);
      if (text !== null) {
        return res.json({ hit: true, text, key });
      }
      return res.json({ hit: false, key });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/cache/set', (req, res) => {
    const { key, data, provider, model } = req.body;
    try {
      CacheServer.set(key, data, provider, model);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/cache/stats', (_req, res) => {
    try {
      const stats = CacheServer.getStats();
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/cache/clear', (_req, res) => {
    try {
      const result = CacheServer.clear();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Fastify routes (all AI providers) ───────────────────────────────────────
  // Proxy requests to Fastify server on port 3001 to maintain streaming performance
  app.all('/api/fastify/*', async (req, res) => {
    const targetUrl = `http://127.0.0.1:3001${req.url.replace('/api/fastify', '')}`;
    try {
      const headers: Record<string, string> = {};
      Object.entries(req.headers).forEach(([key, value]) => {
        const lowerKey = key.toLowerCase();
        if (lowerKey !== 'content-length' && lowerKey !== 'host' && lowerKey !== 'connection') {
          headers[key] = Array.isArray(value) ? value.join(', ') : (value || '');
        }
      });

      // Ensure we have a valid JSON body for non-GET/HEAD requests
      let requestBody: undefined | string = undefined;
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (req.body === undefined) {
          res.status(400).send({ error: 'JSON body required' });
          return;
        }
        requestBody = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: requestBody
      });
      
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(key, value);
        }
      });
      res.status(response.status);
      res.flushHeaders();
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (e: any) {
      console.error('[Fastify Proxy Error]:', e.message);
      res.status(500).send({ error: `Fastify Proxy Error: ${e.message}` });
    }
  });

  // ── Vite dev middleware ───────────────────────────────────────────────────────
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);

  // ── HTTP server with keep-alive ───────────────────────────────────────────────
  // Keep-alive ensures the browser reuses the same TCP connection for every
  // streaming request, eliminating ~50-150ms of handshake overhead per call.
  const server = http.createServer(app);
  server.keepAliveTimeout = 75_000;  // 75s (stay open)
  server.headersTimeout   = 76_000;
  server.maxConnections   = 512;
  server.on('connection', (socket) => {
    socket.setNoDelay(true); // Disable Nagle's algorithm for instant small packet delivery
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 NYX READY: http://localhost:${PORT}`);
  });
}

startServer();
process.on('unhandledRejection', (e) => console.error('[UnhandledRejection]', e));
process.on('uncaughtException',  (e) => console.error('[UncaughtException]', e));
