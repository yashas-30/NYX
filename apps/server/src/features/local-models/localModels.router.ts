import logger from '../../lib/logger.js';
import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { validate } from '../../middleware/validate.js';
import { sendSseTokenRotate } from '../../lib/sseHelpers.js';
import { LocalModelsService } from './localModels.service.js';
import {
  localModelStartSchema,
  localModelDownloadSchema,
  localModelDeleteSchema,
  localModelChatSchema,
} from './localModels.schema.js';

export const localModelsRouter: FastifyPluginAsync = async (app: FastifyInstance) => {

{
// Wrapping block to avoid scope issues, typically you can remove the wrapper entirely
const router = localModelsRouter;
  const service = new LocalModelsService();

  // List presets and their installation status
  app.get('/', async (_req, reply) => {
    try {
      const listData = service.listModels();

      // Inject metadata (scores, etc.) into the models
      const { modelMetadataService } = await import('./modelMetadata.service.js');
      const enrichedModels = await Promise.all(
        listData.models.map(async (m: any) => {
          const meta = await modelMetadataService.getMetadata(m.id, m.url, m.fileName);
          return {
            ...m,
            metadata: meta,
          };
        })
      );

      reply.send({
        ...listData,
        models: enrichedModels,
      });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Detect hardware compatibility and suggest model presets
  app.get('/compatibility', async (_req, reply) => {
    try {
      reply.send(await service.getDeviceCompatibility());
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Auto-select optimal model for device specs and start downloading
  app.post('/auto-setup', async (_req, reply) => {
    try {
      reply.send(await service.autoSetup());
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Auto-detect and download all compatible models for the device specs
  app.post('/download-all-compatible', async (_req, reply) => {
    try {
      reply.send(await service.downloadAllCompatible());
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Start GGUF model download
  app.post('/download', { preHandler: [validate(localModelDownloadSchema)] },
    (request: FastifyRequest, reply: FastifyReply) => {
      const { modelId, quantization } = request.body as any;
      if (!modelId) {
        return reply.code(400).send({ error: 'Missing modelId in request body.' });
      }
      try {
        reply.send(service.startDownload(modelId, quantization));
      } catch (error: any) {
        reply.code(500).send({ error: error.message });
      }
    }
  );

  // Poll download progress
  app.get('/download-progress', (request: FastifyRequest, reply: FastifyReply) => {
    const { modelId } = request.query as any;
    if (!modelId || typeof modelId !== 'string') {
      return reply.code(400).send({ error: 'Missing or invalid modelId query parameter.' });
    }
    try {
      reply.send(service.getProgress(modelId));
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Pause an active download (keeps .part file for resume)
  // fallow-ignore-next-line code-duplication
  app.post('/pause', (request: FastifyRequest, reply: FastifyReply) => {
    const { modelId } = request.body as any;
    if (!modelId) {
      return reply.code(400).send({ error: 'Missing modelId in request body.' });
    }
    try {
      reply.send(service.pauseDownload(modelId));
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Resume a paused download from where it left off
  // fallow-ignore-next-line code-duplication
  app.post('/resume', (request: FastifyRequest, reply: FastifyReply) => {
    const { modelId } = request.body as any;
    if (!modelId) {
      return reply.code(400).send({ error: 'Missing modelId in request body.' });
    }
    try {
      reply.send(service.resumeDownload(modelId));
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Cancel a download and delete the partial file
  // fallow-ignore-next-line code-duplication
  app.post('/cancel', (request: FastifyRequest, reply: FastifyReply) => {
    const { modelId } = request.body as any;
    if (!modelId) {
      return reply.code(400).send({ error: 'Missing modelId in request body.' });
    }
    try {
      reply.send(service.cancelDownload(modelId));
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Run a model natively via llama-server
  app.post('/run', { preHandler: [validate(localModelStartSchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { modelId, settings } = request.body as any;
      if (!modelId) {
        return reply.code(400).send({ error: 'Missing modelId in request body.' });
      }
      try {
        reply.send(await service.runModel(modelId, settings));
      } catch (error: any) {
        reply.code(500).send({ error: error.message });
      }
    }
  );

  // Stop the native runner and evict model from memory
  app.post('/stop', async (_req, reply) => {
    try {
      reply.send(await service.stopModel());
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Delete a downloaded GGUF model from disk
  // fallow-ignore-next-line code-duplication
  app.delete('/delete', { preHandler: [validate(localModelDeleteSchema)] },
    (request: FastifyRequest, reply: FastifyReply) => {
      const { modelId } = request.body as any;
      if (!modelId) {
        return reply.code(400).send({ error: 'Missing modelId in request body.' });
      }
      try {
        reply.send(service.deleteModel(modelId));
      } catch (error: any) {
        reply.code(500).send({ error: error.message });
      }
    }
  );

  // Get current runner startup status
  app.get('/status', (_req, reply) => {
    try {
      reply.send(service.getStartStatus());
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Proxy streaming chat completion to llama-server port
  app.post('/chat', { preHandler: [validate(localModelChatSchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const model = (request.body as any).model;
      const { messages, temperature, max_tokens, agentMode, webSearch } = request.body as any;
      if (!messages || !Array.isArray(messages)) {
        return reply.code(400).send({ error: 'Invalid or missing messages in request body.' });
      }

      try {
        const response = await service.chat({
          model,
          messages,
          temperature,
          max_tokens,
          agentMode,
          webSearch,
        });

        reply.header('Content-Type', 'text/event-stream');
        reply.header('Cache-Control', 'no-cache');
        reply.header('Connection', 'keep-alive');
        reply.raw.flushHeaders();
        sendSseTokenRotate(reply as any);

        if (response.body) {
          const reader = response.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            reply.raw.write(value);
          }
        }
        reply.raw.end();
      } catch (error: any) {
        logger.error('[Local runner proxy error]:', error.message);
        if (reply.sent) {
          // Headers already sent (streaming started) — write an SSE error event and close
          try {
            reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
            reply.raw.end();
          } catch {
            /* socket already closed */
          }
        } else {
          reply
            .status(500)
            .send({ error: `Connection to local model runner failed: ${error.message}` });
        }
      }
    }
  );

  // ==========================================
  // OLLAMA ROUTES
  // ==========================================

  app.get('/ollama/models', async (_req, reply) => {
    try {
      reply.send(await service.listOllamaModels());
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  app.post('/ollama/pull', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.body as any;
    if (!name) return reply.code(400).send({ error: 'Missing name' });
    try {
      reply.send(await service.pullOllamaModel(name));
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  app.delete('/ollama/models/:name', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.params as any;
    if (!name) return reply.code(400).send({ error: 'Missing name' });
    try {
      reply.send(await service.deleteOllamaModel(name));
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });


  app.post('/reload', async (_req, reply) => {
    try {
      const { LocalModelRunner } = await import('./localModelRunner.js');
      logger.info('[LocalModels Router] /reload called: stopping current model so it hot-reloads on next request (e.g. for new LoRA weights).');
      await LocalModelRunner.stop();
      reply.send({ success: true, message: 'Model stopped and will be reloaded on next request' });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

}

};
