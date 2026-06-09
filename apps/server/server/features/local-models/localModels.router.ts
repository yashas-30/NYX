import { FastifyInstance } from 'fastify';
import { LocalModelsService } from './localModels.service.js';

export async function localModelsRouter(fastify: FastifyInstance) {
  const service = new LocalModelsService();

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
