// ─── server/routes/openrouter.ts ──────────────────────────────────────────────
// OpenRouter streaming proxy (OpenAI-compatible SSE format).
// To change OpenRouter config: edit only this file.

import { Router } from 'express';

export const openrouterRouter = Router();

openrouterRouter.post('/stream', async (req, res) => {
    const { model, prompt, apiKey, settings, systemInstruction, history } = req.body;
    if (!model || !prompt || !apiKey) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders();
      
      // 🚀 Preamble to bypass intermediate proxy buffering (pokes the buffer)
      res.write(`: ${' '.repeat(2048)}\n\n`);

      const messages = [];
      if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
      }
      
      // Inject history if provided
      if (history && Array.isArray(history)) {
        messages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
      }

      messages.push({ role: 'user', content: prompt });

    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Connection': 'keep-alive', // 🚀 Ensure persistent connection to OpenRouter
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        ...settings,
      }),
    });

    if (!r.ok) throw new Error(`OpenRouter Error ${r.status}`);

    const reader = r.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') { res.end(); return; }
        try {
          const parsed = JSON.parse(raw);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
        } catch { /* partial chunk, skip */ }
      }
    }
    res.end();
  } catch (e: any) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});
