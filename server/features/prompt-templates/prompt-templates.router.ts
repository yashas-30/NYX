import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PromptTemplatesStore } from './prompt-templates.service.ts';

export async function promptTemplatesRouter(fastify: FastifyInstance) {
  const store = new PromptTemplatesStore();

  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const templates = await store.list();
      reply.send(templates);
    } catch (err: any) {
      reply.code(500).send({ error: err.message });
    }
  });

  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as any;
      const { name, content, type } = request.body as any;
      await store.update(id, { name, content, type });
      reply.send({ success: true });
    } catch (err: any) {
      reply.code(500).send({ error: err.message });
    }
  });

  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as any;
      await store.delete(id);
      reply.send({ success: true });
    } catch (err: any) {
      reply.code(500).send({ error: err.message });
    }
  });
}
