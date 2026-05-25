/**
 * @file server/routes/pollinations.ts
 * @description Pollinations.ai keyless free AI model proxy.
 */

import { Router } from 'express';
import { sendSseTokenRotate } from '../lib/sseHelpers.ts';

export const pollinationsRouter = Router();

pollinationsRouter.post('/stream', async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => {
    controller.abort();
  });

  try {
    const { model, prompt, settings, systemInstruction, history } = req.body;

    if (!model || !prompt) {
      return res.status(400).json({ error: 'Model and prompt are required' });
    }

    const realModel = model.replace('pollinations/', '');

    // Build messages in OpenAI compatible format
    const messages: any[] = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    if (history && Array.isArray(history)) {
      messages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
    }
    messages.push({ role: 'user', content: prompt });

    const requestBody = {
      model: realModel,
      messages,
      stream: true,
      temperature: settings?.temperature ?? 0.7,
    };

    console.log(`[Pollinations Proxy] Sending to Pollinations.ai: ${realModel}`);

    // Set event-stream headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    sendSseTokenRotate(res);

    const response = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const errText = await response.text();
      console.error(`[Pollinations Error] ${response.status}: ${errText}`);
      res.write(`data: ${JSON.stringify({ error: `Pollinations API Error ${response.status}: ${errText}` })}\n\n`);
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
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Handle raw SSE format from pollinations
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === '[DONE]') {
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
          try {
            const parsed = JSON.parse(dataStr);
            const chunk = parsed.choices?.[0]?.delta?.content ?? '';
            if (chunk) {
              res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
            }
          } catch (e) {
            // ignore JSON parse errors
          }
        } else {
          // Pollinations sometimes sends raw content or lines if not prefixed, or if it claims to be JSON but sent as raw
          try {
            const parsed = JSON.parse(trimmed);
            const chunk = parsed.choices?.[0]?.delta?.content ?? parsed.text ?? '';
            if (chunk) {
              res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
            }
          } catch {
            // Not JSON, just output raw line if it's part of the text
          }
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e: any) {
    console.error('[Pollinations Error]:', e.message);
    if (e.name === 'AbortError') {
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});
