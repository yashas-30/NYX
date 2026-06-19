import { FastifyInstance } from 'fastify';
import { SystemService } from './system.service.js';

export async function healthRouter(fastify: FastifyInstance) {
  const service = new SystemService();

  fastify.get('/health', async (request, reply) => {
    try {
      const { overall, checks } = await service.getHealth();
      reply.code(200).send({ status: 'ok', uptime: process.uptime(), version: '3.0.0', ...checks });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.get('/ready', async (request, reply) => {
    try {
      const { overall, checks } = await service.getHealth();
      if (overall === 'down') {
        reply.code(503).send(checks);
      } else {
        reply.code(200).send(checks);
      }
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });
}
