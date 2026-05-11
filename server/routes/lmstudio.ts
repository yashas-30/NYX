import { Router } from 'express';

export const lmStudioRouter = Router();

// ── List local models ─────────────────────────────────────────────────────────
lmStudioRouter.get('/models', async (req, res) => {
  try {
    const baseUrl = req.query.baseUrl as string;
    if (!baseUrl) return res.status(400).json({ error: 'baseUrl required' });

    const url = baseUrl.replace(/\/$/, '');
    const r = await fetch(`${url}/v1/models`);
    if (!r.ok) throw new Error(`LM Studio HTTP ${r.status}`);
    const data = await r.json();
    res.json(data);
  } catch (e: any) {
    res.status(503).json({ error: e.message || 'LM Studio Offline' });
  }
});

// ── List exact loaded instances ───────────────────────────────────────────────
lmStudioRouter.get('/instances', async (req, res) => {
  try {
    const baseUrl = req.query.baseUrl as string;
    if (!baseUrl) return res.status(400).json({ error: 'baseUrl required' });

    const url = baseUrl.replace(/\/$/, '');
    const r = await fetch(`${url}/api/v1/models`);
    if (!r.ok) throw new Error(`LM Studio HTTP ${r.status}`);
    const data = await r.json();
    res.json(data);
  } catch (e: any) {
    res.status(503).json({ error: e.message || 'LM Studio Offline' });
  }
});

// ── Load Model ──────────────────────────────────────────────────────────────
lmStudioRouter.post('/load', async (req, res) => {
  try {
    const { model, baseUrl } = req.body;
    if (!model || !baseUrl) return res.status(400).json({ error: 'model and baseUrl required' });
    const url = baseUrl.replace(/\/$/, '');
    const r = await fetch(`${url}/api/v1/models/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    });
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({}));
      const msg = errBody?.error?.message || errBody?.error || `HTTP ${r.status}`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    const data = await r.json();
    res.json(data);
  } catch (e: any) {
    res.status(503).json({ error: e.message || 'LM Studio Load Failed' });
  }
});

// ── Unload Model ────────────────────────────────────────────────────────────
lmStudioRouter.post('/unload', async (req, res) => {
  try {
    const { model, baseUrl } = req.body;
    if (!model || !baseUrl) return res.status(400).json({ error: 'model and baseUrl required' });
    const url = baseUrl.replace(/\/$/, '');
    const r = await fetch(`${url}/api/v1/models/unload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance_id: model })
    });
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({}));
      const msg = errBody?.error?.message || errBody?.error || `HTTP ${r.status}`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    const data = await r.json();
    res.json(data);
  } catch (e: any) {
    res.status(503).json({ error: e.message || 'LM Studio Unload Failed' });
  }
});

// ── Chat stream proxy ─────────────────────────────────────────────────────────
lmStudioRouter.post('/chat', async (req, res) => {
  const { model, prompt, systemInstruction, baseUrl, settings, history } = req.body;
  if (!model || !prompt || !baseUrl) return res.status(400).json({ error: 'model, prompt, and baseUrl required' });

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const url = baseUrl.replace(/\/$/, '');

  // ── Helper: extract a readable string from LM Studio error payloads ──────
  // LM Studio returns errors as { error: { message: "...", type: "..." } }
  // (OpenAI-compatible format). We must dig into this to avoid [object Object].
  const extractErrorMessage = (err: any, fallback: string): string => {
    if (typeof err === 'string') return err;
    if (err?.message) return err.message;
    if (err?.error) {
      if (typeof err.error === 'string') return err.error;
      if (err.error?.message) return err.error.message;
      return JSON.stringify(err.error);
    }
    return fallback;
  };

  try {
    const r = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          ...(history && Array.isArray(history) ? history.map((m: any) => ({ role: m.role, content: m.content })) : []),
          { role: 'user', content: prompt }
        ],
        stream: true,
        temperature: settings?.temperature ?? 0.7,
        max_tokens: settings?.maxTokens ?? 2048,
      }),
      signal: controller.signal,
    });

    if (!r.ok || !r.body) {
      const errBody = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      throw new Error(extractErrorMessage(errBody, `HTTP ${r.status}`));
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
        const cleanLine = line.trim();
        // End-of-stream sentinel — tell the client we're done
        if (cleanLine === 'data: [DONE]') {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          return;
        }
        if (!cleanLine || !cleanLine.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(cleanLine.slice(6));
          if (parsed.error) {
            const errMsg = extractErrorMessage(parsed, 'Stream error');
            res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
            res.end();
            return;
          }
          // LM Studio uses OpenAI-compatible format: choices[0].delta.content
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
          }
        } catch { /* partial JSON line, skip */ }
      }
    }
    res.end();
  } catch (e: any) {
    if (e.name === 'AbortError') { res.end(); return; }
    res.write(`data: ${JSON.stringify({ error: e.message || 'Unknown LM Studio error' })}\n\n`);
    res.end();
  }
});
