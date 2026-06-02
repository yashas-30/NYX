import { Router, Response } from 'express';
import { sendSseTokenRotate } from '../../lib/sseHelpers.ts';
import { GeminiService } from './gemini.service.ts';
import logger from '../../lib/logger.ts';

export const geminiRouter = Router();
const service = new GeminiService();

interface StreamListener {
  write: (chunk: string) => void;
  end: () => void;
}

const activeStreams = new Map<
  string,
  { listeners: Set<StreamListener>; controller: AbortController }
>();

geminiRouter.post('/stream', async (req, res) => {
  logger.info('[Gemini Router] Received /stream request:', {
    headers: req.headers,
    model: req.body?.model,
  });

  const {
    model,
    prompt,
    settings,
    systemInstruction,
    history,
    apiKey,
    images,
    gatewayUrls,
    tools,
  } = req.body || {};

  if (!model) {
    logger.error('[Gemini Router] Returning 400 because model is missing. Body was:', req.body);
    return res.status(400).json({ error: 'Model is required' });
  }

  // Set event-stream headers immediately
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  sendSseTokenRotate(res);

  let finalSystemInstruction = systemInstruction || '';
  try {
    const { MemoryService } = await import('../nyx/memory.service.ts');
    const memories = MemoryService.getMemoriesString();
    if (memories) {
      finalSystemInstruction = `${finalSystemInstruction}\n\n${memories}`.trim();
    }
  } catch (error: any) {
    logger.warn('[Gemini Router] Failed to load memory keeper context: ' + error.message);
  }

  const fingerprint = JSON.stringify({
    model,
    prompt: prompt || '',
    systemInstruction: finalSystemInstruction,
    history: history || [],
    settings: settings || {},
    images: images || [],
    apiKey: apiKey || '',
    tools: tools || [],
  });

  const listener: StreamListener = {
    write: (chunk: string) => {
      res.write(chunk);
    },
    end: () => {
      res.end();
    },
  };

  if (activeStreams.has(fingerprint)) {
    logger.info(`[Express Stream Dedupe] Multiplexing concurrent stream for model ${model}`);
    const streamGroup = activeStreams.get(fingerprint)!;
    streamGroup.listeners.add(listener);

    req.on('close', () => {
      streamGroup.listeners.delete(listener);
      if (streamGroup.listeners.size === 0) {
        streamGroup.controller.abort();
        activeStreams.delete(fingerprint);
      }
    });
    return;
  }

  const controller = new AbortController();
  const listeners = new Set<StreamListener>([listener]);
  activeStreams.set(fingerprint, { listeners, controller });

  req.on('close', () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      controller.abort();
      activeStreams.delete(fingerprint);
    }
  });

  try {
    logger.info({ model }, 'Routing request to LLM Service');

    // Telemetry to NYX Debug Console
    fetch('http://localhost:3099', { method: 'POST' }).catch(() => {});
    try {
      const WebSocket = require('ws');
      const ws = new WebSocket('ws://localhost:3099?client=server');
      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'LOG',
            message: `dYs? LLM is generating response for model: ${model}...`,
          })
        );
        ws.close();
      });
      ws.on('error', () => {});
    } catch (e: any) {}

    await service.executeStream(
      {
        model,
        prompt,
        settings,
        systemInstruction: finalSystemInstruction,
        history,
        apiKey,
        images,
        gatewayUrls,
        tools,
      },
      (chunk) => {
        const payload = `data: ${JSON.stringify(chunk)}\n\n`;
        for (const l of listeners) {
          try {
            l.write(payload);
          } catch {}
        }
      },
      () => {
        const payload = 'data: [DONE]\n\n';
        for (const l of listeners) {
          try {
            l.write(payload);
            l.end();
          } catch {}
        }
        activeStreams.delete(fingerprint);
      }
    );
  } catch (error: any) {
    logger.error('[Gemini Route Proxy Error]:', error.message);
    const payload = `data: ${JSON.stringify({ error: error.message })}\n\n`;
    for (const l of listeners) {
      try {
        l.write(payload);
        l.end();
      } catch {}
    }
    activeStreams.delete(fingerprint);
  }
});
