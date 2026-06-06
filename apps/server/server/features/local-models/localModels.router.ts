import logger from '../../lib/logger.js';
import { FastifyInstance } from 'fastify';
import { validate } from '../../middleware/validate.js';
import { sendSseTokenRotate, sseWrite, formatSseChunk, formatSseDone, formatSseError } from '../../lib/sseHelpers.js';
import { LocalModelsService } from './localModels.service.js';
import {
  localModelStartSchema,
  localModelDownloadSchema,
  localModelDeleteSchema,
  localModelChatSchema,
} from './localModels.schema.js';

export async function localModelsRouter(fastify: FastifyInstance) {
  const service = new LocalModelsService();

  // List presets and their installation status
  fastify.get('/', async (_req, reply) => {
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
  fastify.get('/compatibility', async (_req, reply) => {
    try {
      reply.send(await service.getDeviceCompatibility());
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Auto-select optimal model for device specs and start downloading
  fastify.post('/auto-setup', async (_req, reply) => {
    try {
      reply.send(await service.autoSetup());
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Auto-detect and download all compatible models for the device specs
  fastify.post('/download-all-compatible', async (_req, reply) => {
    try {
      reply.send(await service.downloadAllCompatible());
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Start GGUF model download
  fastify.post(
    '/download',
    {
      preHandler: [validate(localModelDownloadSchema)],
    },
    (request, reply) => {
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
  fastify.get('/download-progress', (request, reply) => {
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
  fastify.post('/pause', (request, reply) => {
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
  fastify.post('/resume', (request, reply) => {
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
  fastify.post('/cancel', (request, reply) => {
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
  fastify.post(
    '/run',
    {
      preHandler: [validate(localModelStartSchema)],
    },
    async (request, reply) => {
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
  fastify.post('/stop', async (_req, reply) => {
    try {
      reply.send(await service.stopModel());
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Delete a downloaded GGUF model from disk
  // fallow-ignore-next-line code-duplication
  fastify.delete(
    '/delete',
    {
      preHandler: [validate(localModelDeleteSchema)],
    },
    (request, reply) => {
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
  fastify.get('/status', (_req, reply) => {
    try {
      reply.send(service.getStartStatus());
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Proxy streaming chat completion to llama-server port
  fastify.post(
    '/chat',
    {
      preHandler: [validate(localModelChatSchema)],
    },
    async (request, reply) => {
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

        const { initFastifySse, sendSseTokenRotate, sseWrite, formatSseDone, formatSseChunk } = await import('../../lib/sseHelpers.js');
        initFastifySse(reply);
        sendSseTokenRotate(reply.raw as any);

        if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  sseWrite(reply.raw, formatSseDone());
                } else {
                  try {
                    const parsed = JSON.parse(data);
                    const chunk = parsed.choices?.[0]?.delta?.content || '';
                    sseWrite(reply.raw, formatSseChunk({ chunk }));
                  } catch {
                    sseWrite(reply.raw, formatSseChunk({ chunk: data }));
                  }
                }
              }
            }
          }
        }
        reply.raw.end();
      } catch (error: any) {
        logger.error('[Local runner proxy error]:', error.message);
        if (reply.raw.headersSent) {
          // Headers already sent (streaming started) — write an SSE error event and close
          try {
            sseWrite(reply.raw, formatSseError(error.message));
            reply.raw.end();
          } catch {
            /* socket already closed */
          }
        } else {
          reply
            .code(500)
            .send({ error: `Connection to local model runner failed: ${error.message}` });
        }
      }
    }
  );

  // ==========================================
  // OLLAMA ROUTES
  // ==========================================

  fastify.get('/ollama/models', async (_req, reply) => {
    try {
      reply.send(await service.listOllamaModels());
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/ollama/pull', async (request, reply) => {
    const { name } = request.body as any;
    if (!name) return reply.code(400).send({ error: 'Missing name' });
    try {
      reply.send(await service.pullOllamaModel(name));
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.delete('/ollama/models/:name', async (request, reply) => {
    const { name } = request.params as any;
    if (!name) return reply.code(400).send({ error: 'Missing name' });
    try {
      reply.send(await service.deleteOllamaModel(name));
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });
}
