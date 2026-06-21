import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { MemoryService } from '../nyx/memory.service.js';

export const memoryRouter: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const agentType = ((request.query as any).agentType as 'chat' | 'code') || 'code';
      const memories = MemoryService.getMemories(agentType);
      return reply.send(memories);
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { content, category, relevanceKey, agentType } = request.body as any;
      if (!content) {
        return reply.code(400).send({ error: 'Content is required' });
      }
      MemoryService.addMemory(
        content,
        category || 'user_preference',
        relevanceKey || 'manual',
        agentType || 'code'
      );
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  app.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as any;
      MemoryService.deleteMemory(id);
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  app.delete('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const agentType = (request.query as any).agentType as 'chat' | 'code' | undefined;
      MemoryService.resetMemories(agentType);
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });
};
