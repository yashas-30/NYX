import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { validate } from '../../middleware/validate.js';
import { modelQuerySchema } from './modelProxy.schema.js';
import { ModelProxyService } from './modelProxy.service.js';

export const modelProxyRouter: FastifyPluginAsync = async (app: FastifyInstance) => {

{
// Wrapping block to avoid scope issues, typically you can remove the wrapper entirely
const router = modelProxyRouter;
  const service = new ModelProxyService();

  app.post('/list', { preHandler: [validate(modelQuerySchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // fallow-ignore-next-line code-duplication
      const { provider, apiKey } = request.body as any;
      if (apiKey && !service.validateKey(provider, apiKey)) {
        return reply.code(400).send({ error: 'Invalid API key format for provider: ' + provider });
      }
      try {
        const models = await service.listModels(provider, apiKey);
        reply.send({ models });
      } catch (error: any) {
        reply.code(500).send({ error: error.message });
      }
    }
  );

  app.post('/quota', { preHandler: [validate(modelQuerySchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // fallow-ignore-next-line code-duplication
      const { provider, apiKey } = request.body as any;
      if (apiKey && !service.validateKey(provider, apiKey)) {
        return reply.code(400).send({ error: 'Invalid API key format for provider: ' + provider });
      }
      try {
        const quota = await service.getQuota(provider, apiKey);
        reply.send(quota);
      } catch (error: any) {
        reply.code(500).send({ error: error.message });
      }
    }
  );


}

};
