import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { validate } from '../../middleware/validate.js';
import { CacheService } from './cache.service.js';
import { cacheSetSchema } from './cache.schema.js';

export const cacheRouter: FastifyPluginAsync = async (app: FastifyInstance) => {

{
// Wrapping block to avoid scope issues, typically you can remove the wrapper entirely
const router = cacheRouter;
  const service = new CacheService();

  app.post('/get', async (request: FastifyRequest, reply: FastifyReply) => {
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

  app.post('/set', { preHandler: [validate(cacheSetSchema)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { key, data, provider, model } = request.body as any;
    try {
      // fallow-ignore-next-line code-duplication
      await service.set(key, data, provider, model);
      reply.send({ success: true });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  app.get('/stats', (_req, reply) => {
    try {
      const stats = service.getStats();
      reply.send(stats);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  app.post('/clear', (_req, reply) => {
    try {
      const result = service.clear();
      reply.send(result);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });


}

};
