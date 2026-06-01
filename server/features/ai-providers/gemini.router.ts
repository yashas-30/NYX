import { Router } from 'express';
import { sendSseTokenRotate } from '../../lib/sseHelpers.ts';
import { GeminiService } from './gemini.service.ts';
import logger from '../../lib/logger.ts';

export const geminiRouter = Router();
const service = new GeminiService();

geminiRouter.post('/stream', async (req, res) => {
  console.log('[Gemini Router] Received /stream request:', {
    headers: req.headers,
    body: req.body,
    model: req.body?.model
  });
  const { model, prompt, settings, systemInstruction, history, apiKey, images } = req.body || {};

  if (!model) {
    console.error('[Gemini Router] Returning 400 because model is missing. Body was:', req.body);
    return res.status(400).json({ error: 'Model is required' });
  }

  // Set event-stream headers immediately
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  sendSseTokenRotate(res);

  let isClosed = false;
  res.on('close', () => {
    isClosed = true;
  });

  let finalSystemInstruction = systemInstruction || '';
  try {
    const { MemoryService } = await import('../nyx/memory.service.ts');
    const memories = MemoryService.getMemoriesString();
    if (memories) {
      finalSystemInstruction = `${finalSystemInstruction}\n\n${memories}`.trim();
    }
  } catch (e: any) {
    logger.warn('[Gemini Router] Failed to load memory keeper context: ' + e.message);
  }

  try {
    logger.info({ model }, 'Routing request to Antigravity SDK Chat Agent integration');

    // Telemetry to NYX Debug Console
    fetch('http://localhost:3099', { method: 'POST' }).catch(() => {}); // Optional HTTP hook if supported
    try {
      const WebSocket = require('ws');
      const ws = new WebSocket('ws://localhost:3099?client=server');
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'LOG',
          message: `🚀 Antigravity SDK is generating response for model: ${model}...`
        }));
        ws.close();
      });
      ws.on('error', () => {});
    } catch(e) {}

    const resAntigravity = await fetch('http://127.0.0.1:3003/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        settings,
        systemInstruction: finalSystemInstruction,
        history,
        apiKey,
        images,
      })
    });

    if (!resAntigravity.ok) {
      throw new Error(`Antigravity proxy error: ${resAntigravity.statusText}`);
    }

    if (resAntigravity.body) {
      const reader = resAntigravity.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!isClosed && value) {
          res.write(Buffer.from(value));
        }
      }
    }

    if (!isClosed) {
      res.end();
    }
  } catch (e: any) {
    console.error('[Gemini Route Proxy Error]:', e.message);
    if (!isClosed) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
    }
  }
});
