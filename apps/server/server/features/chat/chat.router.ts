import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import logger from '../../lib/logger.js';
import { ChatService } from './chat.service.js';

const uploadImageSchema = z.object({
  name: z.string(),
  mimeType: z.string(),
  data: z.string(),
});

const chatStreamSchema = z.object({
  prompt: z.string().min(1),
  history: z.array(z.any()).optional(),
  provider: z.string().optional(),
  modelId: z.string().optional(),
  settings: z.record(z.any()).optional(),
  systemInstruction: z.string().optional(),
  enableWebSearch: z.boolean().optional(),
  images: z.array(z.any()).optional(),
});

const suggestionsSchema = z.object({
  history: z.array(z.any()).optional(),
});

export async function chatRouter(fastify: FastifyInstance) {
  const chatService = new ChatService();

  fastify.post('/upload-image', {
    schema: {
      tags: ['chat'],
      summary: 'Upload an image for chat context',
      body: uploadImageSchema,
    }
  }, async (request, reply) => {
    try {
      const { name, mimeType, data } = request.body as z.infer<typeof uploadImageSchema>;
      if (!data) {
        return reply.code(400).send({ error: 'Missing image data' });
      }

      const buffer = Buffer.from(data, 'base64');
      let base64Data = data;

      try {
        const sharpModule = await import('sharp');
        const sharp = sharpModule.default || sharpModule;
        // Process the image using sharp (resize to max 1024px width/height to keep context token count reasonable)
        const processedBuffer = await sharp(buffer)
          .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
          .toBuffer();

        base64Data = processedBuffer.toString('base64');
      } catch (sharpErr: any) {
        logger.warn(
          { err: sharpErr.message || sharpErr },
          'Sharp image processing unavailable, using original image'
        );
      }

      reply.send({
        success: true,
        name,
        mimeType,
        data: base64Data,
      });
    } catch (error: any) {
      logger.error({ error }, 'Image processing failed');
      reply.code(500).send({ error: 'Failed to process image' });
    }
  });

  fastify.post('/stream', {
    schema: {
      tags: ['chat'],
      summary: 'Stream a chat completion',
      body: chatStreamSchema,
    }
  }, async (request, reply) => {
    try {
      const {
        prompt,
        history,
        provider,
        modelId,
        settings,
        systemInstruction,
        enableWebSearch,
        images,
      } = request.body as z.infer<typeof chatStreamSchema>;
      if (!prompt) {
        return reply.code(400).send({ error: 'Missing prompt' });
      }

      const { initFastifySse } = await import('../../lib/sseHelpers.js');
      initFastifySse(reply);

      // Abort signal handling if client disconnects
      const abortController = new AbortController();
      request.raw.on('close', () => abortController.abort());

      await chatService.streamChat(
        {
          prompt,
          history,
          provider,
          modelId,
          settings,
          systemInstruction,
          enableWebSearch,
          images,
        },
        abortController.signal,
        (chunk: any) => {
          try {
            const payload = typeof chunk === 'string' ? { type: 'text', content: chunk } : chunk;
            reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
            if (typeof (reply.raw as any).flush === 'function') (reply.raw as any).flush();
          } catch (e) {
            logger.error(e, 'Error writing chunk to stream');
          }
        },
        () => {
          reply.raw.write('data: [DONE]\n\n');
          if (typeof (reply.raw as any).flush === 'function') (reply.raw as any).flush();
          reply.raw.end();
        }
      );
    } catch (error: any) {
      logger.error({ error }, 'Chat stream failed');
      if (!reply.raw.headersSent) {
        reply.code(500).send({ error: error.message || 'Chat stream failed' });
      } else {
        reply.raw.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        reply.raw.end();
      }
    }
  });

  fastify.post('/suggestions', {
    schema: {
      tags: ['chat'],
      summary: 'Get prompt suggestions based on chat history',
      body: suggestionsSchema,
    }
  }, async (request, reply) => {
    try {
      const { history } = request.body as z.infer<typeof suggestionsSchema>;
      const suggestions = await chatService.getSuggestions(history || []);
      reply.send({ suggestions });
    } catch (error: any) {
      logger.error({ error }, 'Failed to get suggestions');
      reply.code(500).send({ error: 'Failed to get suggestions' });
    }
  });
}
