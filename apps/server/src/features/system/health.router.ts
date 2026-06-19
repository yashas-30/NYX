import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { SystemService } from './system.service.js';

export const healthRouter: FastifyPluginAsync = async (app: FastifyInstance) => {

{
// Wrapping block to avoid scope issues, typically you can remove the wrapper entirely
const router = healthRouter;
  const service = new SystemService();

  app.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { overall, checks } = await service.getHealth();
      reply.code(200).send({ status: 'ok', uptime: process.uptime(), version: '3.0.0', ...checks });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  app.get('/ready', async (request: FastifyRequest, reply: FastifyReply) => {
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

};
