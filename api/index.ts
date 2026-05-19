import express from 'express';
import compression from 'compression';

import '../server/lib/apiAgent.js'; // 🚀 Init global connection pooling

import { geminiRouter }     from '../server/routes/gemini.js';
import { openrouterRouter } from '../server/routes/openrouter.js';
import { nvidiaRouter }     from '../server/routes/nvidia.js';
import { terminalRouter }   from '../server/routes/terminal.js';
import { agentsRouter }     from '../server/routes/agents.js';
import { opencodeRouter }   from '../server/routes/opencode.js';
import { CacheServer }      from '../server/lib/cache.js';

const app = express();

// ── Optimization: Compress non-streaming responses ──────────────────────────
app.use(compression({
  filter: (req: express.Request, res: express.Response) => {
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
app.use('/api/gemini',     geminiRouter);
app.use('/api/openrouter', openrouterRouter);
app.use('/api/nvidia',     nvidiaRouter);
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

// Fastify compatibility layer (empty/mock or fail gracefully since fastify isn't on Vercel)
app.all('/api/fastify/*', (req, res) => {
  res.status(503).json({ error: "Local/Fastify server is not active in production/Vercel deployment." });
});

export default app;
