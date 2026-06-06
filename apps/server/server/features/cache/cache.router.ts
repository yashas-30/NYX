import { FastifyInstance } from 'fastify';
import { validate } from '../../middleware/validate.js';
import { CacheService } from './cache.service.js';
import { cacheSetSchema } from './cache.schema.js';

export async function cacheRouter(fastify: FastifyInstance) {
  const service = new CacheService();

  fastify.post('/get', async (request, reply) => {
    try {
      if (
        !(request.body as any) ||
        typeof (request.body as any) !== 'object' ||
        Array.isArray(request.body as any)
      ) {
        return reply.code(400).send({ error: 'Invalid payload: request body must be an object' });
      }
      const key = service.generateKey(request.body as any);
      // fallow-ignore-next-line code-duplication
      const text = await service.get(key);
      if (text !== null) {
        return reply.send({ hit: true, text, key });
      }
      return reply.send({ hit: false, key });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/set', { preHandler: [validate(cacheSetSchema)] }, async (request, reply) => {
    const { key, data, provider, model } = request.body as any;
    try {
      // fallow-ignore-next-line code-duplication
      await service.set(key, data, provider, model);
      reply.send({ success: true });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.get('/stats', async (_req, reply) => {
    try {
      const stats = await service.getStats();
      reply.send(stats);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.get('/health', async (_req, reply) => {
    try {
      const stats = await service.getStats();
      const maxSize = Number(process.env.MAX_CACHE_SIZE) || 1024 * 1024 * 1024;
      const health = {
        status: stats.totalSizeBytes > maxSize * 0.9 ? 'warning' : 'ok',
        utilization: (stats.totalSizeBytes / maxSize) * 100,
        itemCount: stats.itemCount,
        maxSize
      };
      reply.send(health);
    } catch (error: any) {
      reply.code(500).send({ status: 'error', error: error.message });
    }
  });

  fastify.post('/clear', (_req, reply) => {
    try {
      const result = service.clear();
      reply.send(result);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });
}
