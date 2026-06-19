import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { validate } from '../../middleware/validate.js';
import { AssistantService } from './assistant.service.js';
import { chatInputSchema, configUpdateSchema } from './assistant.schema.js';

export const assistantRouter: FastifyPluginAsync = async (app: FastifyInstance) => {

{
// Wrapping block to avoid scope issues, typically you can remove the wrapper entirely
const router = assistantRouter;
  const service = new AssistantService();

  // POST /chat - Chat interaction with NLU intent parsing and backend execution
  app.post('/chat', { preHandler: [validate(chatInputSchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { message, sessionId } = request.body as { message: string; sessionId?: string };
      const result = await service.processMessage(message, sessionId || 'default');
      return reply.send(result);
    }
  );

  // GET /config - Get status of all pluggable NLU engines and active engine configuration
  app.get('/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const config = await service.getConfig();
    return reply.send(config);
  });

  // POST /config - Dynamically switch the active NLU engine
  app.post('/config', { preHandler: [validate(configUpdateSchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { activeEngine } = request.body as {
        activeEngine: 'local' | 'dialogflow' | 'rasa' | 'botframework';
      };
      AssistantService.setActiveEngine(activeEngine);
      const config = await service.getConfig();
      return reply.send({ success: true, config });
    }
  );


}

};
