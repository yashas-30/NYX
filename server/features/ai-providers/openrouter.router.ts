import { Router } from 'express';
import { sendSseTokenRotate } from '../../lib/sseHelpers.ts';
import { validate } from '../../middleware/validate.js';
import { openrouterStreamSchema } from './openrouter.schema.ts';
import { OpenRouterService } from './openrouter.service.ts';
import { Gateway } from '../../lib/gateway.js';

export const openrouterRouter = Router();
const service = new OpenRouterService();

openrouterRouter.post('/stream', validate(openrouterStreamSchema), async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => {
    controller.abort();
  });

  try {
    const { model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls } = req.body;

    // Auth validation
    const authResult = Gateway.validateAuth('openrouter', model, apiKey);
    if (!authResult.valid) {
      return res.status(401).json({ error: authResult.error });
    }

    if (!model || !prompt) {
      return res.status(400).json({ error: 'Model and prompt are required' });
    }

    // Set event-stream headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    sendSseTokenRotate(res);

    await service.executeStream(
      { model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls },
      controller.signal,
      (chunk) => {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      },
      () => {
        res.write('data: [DONE]\n\n');
        res.end();
      },
      (err) => {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    );
  } catch (e: any) {
    console.error('[OpenRouter Error]:', e.message);
    if (e.name === 'AbortError') {
      res.end();
      return;
    }
    if (!res.headersSent) {
      return res.status(500).json({ error: e.message });
    }
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});
