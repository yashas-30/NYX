// ─── server.ts (entry point) ──────────────────────────────────────────────────
// Thin assembler — wires routes together and starts Vite + Express.
// To add a new provider: create server/routes/myprovider.ts, then add 2 lines here.

import express from 'express';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'node:http';
import dns from 'node:dns';

import './server/lib/apiAgent.js'; // 🚀 Init global connection pooling

import { geminiRouter }     from './server/routes/gemini.js';
import { openrouterRouter } from './server/routes/openrouter.js';
import { nvidiaRouter }     from './server/routes/nvidia.js';
import { ollamaRouter }     from './server/routes/ollama.js';
import { lmStudioRouter }   from './server/routes/lmstudio.js';
import { terminalRouter }   from './server/routes/terminal.js';
import { agentsRouter }     from './server/routes/agents.js';
import { opencodeRouter }   from './server/routes/opencode.js';
import compression from 'compression';

// ── DNS: prefer Cloudflare for fastest lookups on Windows ─────────────────────
try { dns.setServers(['1.1.1.1', '8.8.8.8']); } catch { }

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PORT       = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  const app = express();
  
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

  // ── Health check ─────────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // ── Provider routes ───────────────────────────────────────────────────────────
  // To add a new provider: import its router above and mount it here
  app.use('/api/gemini',     geminiRouter);
  app.use('/api/openrouter', openrouterRouter);
  app.use('/api/nvidia',     nvidiaRouter);
  app.use('/api/ollama',     ollamaRouter);
  app.use('/api/lmstudio',   lmStudioRouter);
  app.use('/api/terminal',   terminalRouter);
  app.use('/api/agents',     agentsRouter);
  app.use('/api/opencode',   opencodeRouter);

  // ── Model list proxy (Settings page live model discovery) ────────────────────
  app.post('/api/models/list', async (req, res) => {
    const { provider, apiKey } = req.body;
    try {
      let url = '';
      const headers: Record<string, string> = {};
      if (provider === 'gemini')     url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      if (provider === 'openrouter') { url = 'https://openrouter.ai/api/v1/models'; headers['Authorization'] = `Bearer ${apiKey}`; }
      if (provider === 'nvidia')     { url = 'https://integrate.api.nvidia.com/v1/models'; headers['Authorization'] = `Bearer ${apiKey}`; }

      const r = await fetch(url, { headers });
      const data = await r.json();

      let models: string[] = [];
      if (provider === 'gemini')     models = data.models?.map((m: any) => m.name.replace('models/', '')) || [];
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
      if (provider === 'openrouter') {
        const r = await fetch('https://openrouter.ai/api/v1/credits', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const data = await r.json();
        return res.json(data);
      }
      if (provider === 'gemini') {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (r.ok) return res.json({ status: 'ok' });
      }
      res.json({});
    } catch (e: any) {
      res.status(500).json({ error: e.message });
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
    console.log(`🚀 LLMLAB READY: http://localhost:${PORT}`);
  });
}

startServer();
process.on('unhandledRejection', (e) => console.error('[UnhandledRejection]', e));
process.on('uncaughtException',  (e) => console.error('[UncaughtException]', e));
