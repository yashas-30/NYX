import { Router } from 'express';
import { sendSseTokenRotate } from '../../lib/sseHelpers.ts';
import { validate } from '../../middleware/validate.js';
import { nvidiaStreamSchema } from './nvidia.schema.ts';
import { NvidiaService } from './nvidia.service.ts';
import logger from '../../lib/logger.ts';

export const nvidiaRouter = Router();
const service = new NvidiaService();

nvidiaRouter.post('/stream', validate(nvidiaStreamSchema), async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => {
    controller.abort();
  });

  try {
    const { model, prompt, apiKey, settings, systemInstruction, history } = req.body;

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
      { model, prompt, apiKey, settings, systemInstruction, history },
      controller.signal,
      (chunk) => {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      },
      () => {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    );
  } catch (e: any) {
    logger.error({ err: e }, 'NVIDIA stream error');
    if (e.name === 'AbortError') {
      res.end();
      return;
    }
    if (!res.headersSent) {
      return res.status(400).json({ error: e.message });
    }
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});
