import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { PromptTemplatesStore } from './prompt-templates.service.js';

export const promptTemplatesRouter: FastifyPluginAsync = async (app: FastifyInstance) => {

{
// Wrapping block to avoid scope issues, typically you can remove the wrapper entirely
const router = promptTemplatesRouter;
  const store = new PromptTemplatesStore();

  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const templates = await store.list();
      reply.send(templates);
    } catch (err: any) {
      reply.code(500).send({ error: err.message });
    }
  });

  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { name, content, type } = request.body as any;
      if (!name || !content || !type) {
        reply.code(400).send({ error: 'Missing name, content, or type' });
        return;
      }
      const template = await store.create({ name, content, type });
      reply.send(template);
    } catch (err: any) {
      reply.code(500).send({ error: err.message });
    }
  });

  app.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as any;
      const { name, content, type } = request.body as any;
      await store.update(id, { name, content, type });
      reply.send({ success: true });
    } catch (err: any) {
      reply.code(500).send({ error: err.message });
    }
  });

  app.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as any;
      await store.delete(id);
      reply.send({ success: true });
    } catch (err: any) {
      reply.code(500).send({ error: err.message });
    }
  });


}

};
