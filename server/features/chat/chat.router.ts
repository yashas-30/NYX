import { FastifyInstance } from 'fastify';
import logger from '../../lib/logger.ts';
import { ChatService } from './chat.service.ts';

export async function chatRouter(fastify: FastifyInstance) {
  const chatService = new ChatService();

  fastify.post('/upload-image', async (request, reply) => {
    try {
      const { name, mimeType, data } = request.body as any;
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

  fastify.post('/stream', async (request, reply) => {
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
      } = request.body as any;
      if (!prompt) {
        return reply.code(400).send({ error: 'Missing prompt' });
      }

      reply.header('Content-Type', 'text/event-stream');
      reply.header('Cache-Control', 'no-cache');
      reply.header('Connection', 'keep-alive');

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
        (chunk: string) => {
          try {
            reply.raw.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
            if (typeof (reply.raw as any).flush === 'function') (reply.raw as any).flush();
          } catch (e) {
            logger.error('Error writing chunk to stream', e);
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

  fastify.post('/suggestions', async (request, reply) => {
    try {
      const { history } = request.body as any;
      const suggestions = await chatService.getSuggestions(history || []);
      reply.send({ suggestions });
    } catch (error: any) {
      logger.error({ error }, 'Failed to get suggestions');
      reply.code(500).send({ error: 'Failed to get suggestions' });
    }
  });
}
