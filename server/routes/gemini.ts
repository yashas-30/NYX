import { Router } from 'express';
import { UnifiedEngine } from '../lib/unifiedEngine.js';
import { sendSseTokenRotate } from '../lib/sseHelpers.ts';
import { validate } from '../middleware/validate.js';
import { geminiStreamSchema } from '../schemas/index.js';
import logger from '../lib/logger.ts';

export const geminiRouter = Router();

geminiRouter.post('/stream', validate(geminiStreamSchema), async (req, res) => {
  const { model, prompt, settings, systemInstruction, history, apiKey } = req.body;

  if (!model) {
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

  try {
    logger.info({ model }, 'Forwarding request to actual Gemini API');

    const messages = [];
    if (systemInstruction) {
      messages.push({ role: 'system' as const, content: systemInstruction });
    }
    if (history && Array.isArray(history)) {
      messages.push(...history.map((m: any) => ({ role: m.role as any, content: m.content })));
    }
    messages.push({ role: 'user' as const, content: prompt });

    await UnifiedEngine.executeStream(
      {
        provider: 'gemini',
        model,
        messages,
        settings,
        apiKey
      },
      (chunk) => {
        if (!isClosed) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      },
      () => {
        if (!isClosed) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }
    );
  } catch (e: any) {
    console.error('[Gemini Route Proxy Error]:', e.message);
    if (!isClosed) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
    }
  }
});

