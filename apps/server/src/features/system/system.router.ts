import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { SystemService } from './system.service.js';

export const systemRouter: FastifyPluginAsync = async (app: FastifyInstance) => {

{
// Wrapping block to avoid scope issues, typically you can remove the wrapper entirely
const router = systemRouter;
  const service = new SystemService();

  app.get('/system', async (request: FastifyRequest, reply: FastifyReply) => {
    const modelId = (request.query as any).modelId as string;
    try {
      const specs = await service.getSystemSpecs(modelId);
      reply.send(specs);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });


}

};
