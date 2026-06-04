import { FastifyInstance } from 'fastify';
import { validate } from '../../middleware/validate.ts';
import { modelQuerySchema } from './modelProxy.schema.ts';
import { ModelProxyService } from './modelProxy.service.ts';

export async function modelProxyRouter(fastify: FastifyInstance) {
  const service = new ModelProxyService();

  fastify.post(
    '/list',
    {
      preHandler: [validate(modelQuerySchema)],
    },
    async (request, reply) => {
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

  fastify.post(
    '/quota',
    {
      preHandler: [validate(modelQuerySchema)],
    },
    async (request, reply) => {
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
