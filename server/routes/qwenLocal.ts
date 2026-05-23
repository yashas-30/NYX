import { Router } from 'express';

export const qwenLocalRouter = Router();

qwenLocalRouter.post('/stream', async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => {
    controller.abort();
  });

  try {
    const { model, prompt, settings, systemInstruction, history } = req.body;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    console.log(`[Qwen Local Proxy] Forwarding stream request to local Python server for model "${model}"`);

    const response = await fetch('http://127.0.0.1:3002/api/gemini/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        history,
        systemInstruction,
        settings,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      res.write(`data: ${JSON.stringify({ error: `Local Python Qwen Server Error: ${errorText}` })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body.getReader();
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
        res.write(line + '\n');
      }
    }

    if (buf.trim()) {
      res.write(buf + '\n');
    }
    res.end();
  } catch (error: any) {
    console.error('[Qwen Local Proxy Error]:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});
