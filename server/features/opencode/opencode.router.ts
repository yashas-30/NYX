import { Router } from 'express';
import { OpenCodeService } from './opencode.service.ts';
import { sendSseTokenRotate } from '../../lib/sseHelpers.ts';
import { validate } from '../../middleware/validate.ts';
import { opencodeStreamSchema } from './opencode.schema.ts';
import logger from '../../lib/logger.ts';

export const opencodeRouter = Router();
const service = new OpenCodeService();

opencodeRouter.post('/stream', validate(opencodeStreamSchema), async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => {
    controller.abort();
  });

  try {
    const { model, prompt } = req.body;
    
    if (!model || !prompt) {
      return res.status(400).json({ error: 'Model and prompt are required' });
    }

    const reqData = service.prepareRequest(req.body);

    // Set event-stream headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    sendSseTokenRotate(res);

    // Make request to OpenCode Zen API
    const response = await fetch(reqData.url, {
      method: 'POST',
      headers: reqData.headers,
      body: JSON.stringify(reqData.body),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      let errorMessage = `OpenRouter Error ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
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
            // ignore JSON errors
          }
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    logger.error({ err: error }, 'OpenCode stream error');
    if (error.name === 'AbortError') {
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});
