import { FastifyInstance } from 'fastify';
import { validate } from '../../middleware/validate.js';
import { AssistantService } from './assistant.service.js';
import { chatInputSchema, configUpdateSchema } from './assistant.schema.js';

export async function assistantRouter(fastify: FastifyInstance) {
  const service = new AssistantService();

  // POST /chat - Chat interaction with NLU intent parsing and backend execution
  fastify.post(
    '/chat',
    {
      preHandler: [validate(chatInputSchema)],
    },
    async (request, reply) => {
      const { message, sessionId } = request.body as { message: string; sessionId?: string };
      const result = await service.processMessage(message, sessionId || 'default');
      return reply.send(result);
    }
  );

  // GET /config - Get status of all pluggable NLU engines and active engine configuration
  fastify.get('/config', async (request, reply) => {
    const config = await service.getConfig();
    return reply.send(config);
  });

  // POST /config - Dynamically switch the active NLU engine
  fastify.post(
    '/config',
    {
      preHandler: [validate(configUpdateSchema)],
    },
    async (request, reply) => {
      const { activeEngine } = request.body as {
        activeEngine: 'local' | 'dialogflow' | 'rasa' | 'botframework';
      };
      AssistantService.setActiveEngine(activeEngine);
      const config = await service.getConfig();
      return reply.send({ success: true, config });
    }
  );
}
