// ─── server/routes/nvidia.ts ──────────────────────────────────────────────────
// NVIDIA NIM API streaming proxy (OpenAI-compatible SSE format).
// To change NVIDIA config (thinking mode, temperature, max_tokens): edit only this file.

import { Router } from 'express';

export const nvidiaRouter = Router();

nvidiaRouter.post('/stream', async (req, res) => {
    const { model, prompt, apiKey, settings, systemInstruction, history } = req.body;
    if (!model || !prompt || !apiKey) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    // Enable thinking mode only for -think models
    const enableThinking = model.includes('-think');

    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // 🚀 Disable Nginx buffering
      res.flushHeaders();

      // 🚀 Reduced preamble (512 bytes is usually enough to poke buffers)
      res.write(`: ${' '.repeat(512)}\n\n`);

      const messages = [];
      if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
      }

      // Inject history if provided
      if (history && Array.isArray(history)) {
        messages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
      }

      messages.push({ role: 'user', content: prompt });

    const requestBody: any = {
      model,
      messages,
      stream: true,
      max_tokens: settings?.maxTokens || 16384,
      temperature: settings?.temperature ?? 1.0,
      top_p: settings?.topP ?? 1.0,
    };

    // Explicitly set thinking mode
    requestBody.chat_template_kwargs = { thinking: enableThinking };

    const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'text/event-stream',
        'Connection': 'keep-alive',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60000), // 🚀 60s timeout to prevent hanging
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: `NVIDIA Error ${r.status}` }));
      throw new Error(err.error?.message || err.error || `NVIDIA Error ${r.status}`);
    }

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
