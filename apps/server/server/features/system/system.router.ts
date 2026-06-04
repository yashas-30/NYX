import { FastifyInstance } from 'fastify';
import { SystemService } from './system.service.js';

export async function systemRouter(fastify: FastifyInstance) {
  const service = new SystemService();

  fastify.get('/system', async (request, reply) => {
    const modelId = (request.query as any).modelId as string;
    try {
      const specs = await service.getSystemSpecs(modelId);
      reply.send(specs);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });
}
