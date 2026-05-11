// ─── server/routes/ollama.ts ──────────────────────────────────────────────────
// Express proxy for Ollama — used as FALLBACK only when browser direct-fetch
// is CORS-blocked. All perf-critical paths go browser → Ollama directly.
//
// To change Ollama server config: edit OLLAMA_BASE below. Nothing else needed.

import { Router } from 'express';

// ── Config ────────────────────────────────────────────────────────────────────
const OLLAMA_BASE = 'http://127.0.0.1:11434';
const KEEP_ALIVE  = '10m';   // How long Ollama keeps a model warm after last use
const NUM_THREADS = 8;       // CPU threads for inference (raise for more CPU cores)

export const ollamaRouter = Router();

// ── List local models ─────────────────────────────────────────────────────────
ollamaRouter.get('/models', async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
    const data = await r.json();
    res.json({ models: data.models || [] });
  } catch {
    res.status(503).json({ error: 'Ollama Offline', models: [] });
  }
});

// ── Pre-warm a model (load into VRAM without running inference) ────────────────
// Called immediately when a user selects an Ollama model in the UI.
// Eliminates the cold-start delay on the first real prompt.
ollamaRouter.post('/warm', async (req, res) => {
  const { model } = req.body;
  if (!model) return res.status(400).json({ error: 'model required' });
  try {
    // Empty prompt + stream:false just loads the model, no inference cost
    await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: KEEP_ALIVE }),
    });
    res.json({ warmed: true });
  } catch {
    res.json({ warmed: false }); // Non-fatal — warm is best-effort
  }
});

// ── Unload a model from VRAM immediately ──────────────────────────────────────
// Called the instant a different model is selected. Frees GPU memory fast.
ollamaRouter.post('/unload', async (req, res) => {
  const { model } = req.body;
  if (!model) return res.status(400).json({ error: 'model required' });
  try {
    await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, keep_alive: 0, stream: false }),
    });
    res.json({ unloaded: true });
  } catch {
    res.json({ unloaded: false }); // Best-effort
  }
});

// ── Chat stream (SSE proxy) ───────────────────────────────────────────────────
// Fallback path used when the browser can't hit Ollama directly.
// The direct browser→Ollama path in ollamaClient.ts is faster (no Express hop).
ollamaRouter.post('/chat', async (req, res) => {
  const { model, prompt, system, options, nodeId, history } = req.body;
  if (!model || !prompt) return res.status(400).json({ error: 'model and prompt required' });

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const isChat = (history && history.length > 0) || system;
    const endpoint = isChat ? '/api/chat' : '/api/generate';

    const body: any = {
      model,
      stream: true,
      keep_alive: KEEP_ALIVE,
      options: {
        ...options,
        num_thread: NUM_THREADS,
      },
    };

    if (isChat) {
      body.messages = [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...(history && Array.isArray(history) ? history.map((m: any) => ({ role: m.role, content: m.content })) : []),
        { role: 'user', content: prompt }
      ];
    } else {
      body.prompt = prompt;
      body.system = system;
    }

    const r = await fetch(`${OLLAMA_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!r.ok || !r.body) {
      const err = await r.json().catch(() => ({ error: `Ollama HTTP ${r.status}` }));
      throw new Error(err.error || `HTTP ${r.status}`);
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.error) throw new Error(parsed.error);
          
          // Handle both /api/generate (response) and /api/chat (message.content)
          const chunk = parsed.message?.content ?? parsed.response ?? '';
          res.write(`data: ${JSON.stringify({ response: chunk, done: !!parsed.done })}\n\n`);
          if (parsed.done) { res.end(); return; }
        } catch (e: any) {
          if (!e.message?.includes('JSON')) throw e;
        }
      }
    }
    res.end();
  } catch (e: any) {
    if (e.name === 'AbortError') { res.end(); return; }
    let msg = e.message ?? 'Unknown Ollama error';
    if (msg.includes('CUDA')) msg = 'GPU VRAM Limit Reached. Try a smaller model.';
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});
