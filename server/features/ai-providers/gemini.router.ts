import { FastifyInstance } from 'fastify';
import { sendSseTokenRotate } from '../../lib/sseHelpers.ts';
import { GeminiService } from './gemini.service.ts';
import logger from '../../lib/logger.ts';

export async function geminiRouter(fastify: FastifyInstance) {
  const service = new GeminiService();

  interface StreamListener {
    write: (chunk: string) => void;
    end: () => void;
  }

  const activeStreams = new Map<
    string,
    { listeners: Set<StreamListener>; controller: AbortController }
  >();

  fastify.post('/stream', async (request, reply) => {
    logger.info('[Gemini Router] Received /stream request:', {
      headers: request.headers,
      model: (request.body as any)?.model,
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
    } = (request.body as any) || {};

    if (!model) {
      logger.error(
        '[Gemini Router] Returning 400 because model is missing. Body was:',
        request.body as any
      );
      // fallow-ignore-next-line code-duplication
      return reply.code(400).send({ error: 'Model is required' });
    }

    // Set event-stream headers immediately
    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    reply.header('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();
    sendSseTokenRotate(reply.raw as any);

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
        reply.raw.write(chunk);
      },
      end: () => {
        reply.raw.end();
      },
    };

    if (activeStreams.has(fingerprint)) {
      logger.info(`[Express Stream Dedupe] Multiplexing concurrent stream for model ${model}`);
      const streamGroup = activeStreams.get(fingerprint)!;
      streamGroup.listeners.add(listener);

      request.raw.on('close', () => {
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

    request.raw.on('close', () => {
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
}
