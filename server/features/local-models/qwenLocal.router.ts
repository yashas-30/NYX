import { Router } from 'express';
import { sendSseTokenRotate } from '../../lib/sseHelpers.ts';
import { validate } from '../../middleware/validate.js';
import { qwenLocalStreamSchema } from './localModels.schema.ts';
import { QwenLocalService } from './qwenLocal.service.ts';
import logger from '../../lib/logger.ts';

export const qwenLocalRouter = Router();
const service = new QwenLocalService();

qwenLocalRouter.post('/stream', validate(qwenLocalStreamSchema), async (req, res) => {
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
    sendSseTokenRotate(res);

    await service.executeStream(
      { model, prompt, settings, systemInstruction, history },
      controller.signal,
      (chunk) => {
        res.write(chunk);
      },
      () => {
        res.end();
      }
    );
  } catch (error: any) {
    logger.error({ err: error }, 'Qwen Local stream error');
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});
