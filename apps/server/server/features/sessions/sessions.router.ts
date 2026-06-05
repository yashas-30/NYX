import { FastifyInstance } from 'fastify';
import { SessionRepository } from '../../repositories/session.repo.js';
import { MessageRepository } from '../../repositories/message.repo.js';
import { v4 as uuidv4 } from 'uuid';

interface CreateSessionRequest {
  name: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
    status?: 'loading' | 'success' | 'error' | 'stopped';
    metrics?: any;
  }>;
  modelId?: string;
}

interface UpdateMessagesRequest {
  messages: Array<{
    id?: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
    status?: 'loading' | 'success' | 'error' | 'stopped';
    metrics?: any;
  }>;
}

export async function sessionsRouter(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    try {
      const sessions = await SessionRepository.listAll();
      reply.send({ sessions });
    } catch (error: any) {
      fastify.log.error(error, 'Failed to list sessions');
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/', async (request, reply) => {
    try {
      const body = request.body as CreateSessionRequest;
      const { name, messages, modelId } = body;

      if (!name) {
        return reply.code(400).send({ error: 'Name is required' });
      }

      const sessionId = uuidv4();
      const session = {
        id: sessionId,
        name,
        modelId: modelId || 'default',
        provider: 'gemini',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await SessionRepository.create(session);

      if (messages && messages.length > 0) {
        for (const msg of messages) {
          await MessageRepository.create({
            id: uuidv4(),
            sessionId,
            role: msg.role,
            content: msg.content,
            status: msg.status || 'success',
            latencyMs: msg.metrics?.latency || null,
            tokens: msg.metrics?.tokens || null,
            tps: msg.metrics?.tps || null,
            timestamp: new Date(msg.timestamp || Date.now()),
          });
        }
      }

      const createdSession = await SessionRepository.getById(sessionId);
      reply.send({ session: createdSession });
    } catch (error: any) {
      fastify.log.error(error, 'Failed to create session');
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const session = await SessionRepository.getById(id);

      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const messages = await MessageRepository.getBySessionId(id);
      reply.send({ session: { ...session, messages } });
    } catch (error: any) {
      fastify.log.error(error, 'Failed to get session');
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/:id/messages', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as UpdateMessagesRequest;
      const { messages } = body;

      const session = await SessionRepository.getById(id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      await MessageRepository.deleteBySessionId(id);

      for (const msg of messages) {
        await MessageRepository.create({
          id: msg.id || uuidv4(),
          sessionId: id,
          role: msg.role,
          content: msg.content,
          status: msg.status || 'success',
          latencyMs: msg.metrics?.latency || null,
          tokens: msg.metrics?.tokens || null,
          tps: msg.metrics?.tps || null,
          timestamp: new Date(msg.timestamp || Date.now()),
        });
      }

      await SessionRepository.updateTimestamp(id);
      reply.send({ ok: true });
    } catch (error: any) {
      fastify.log.error(error, 'Failed to update messages');
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.delete('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await SessionRepository.delete(id);
      reply.send({ ok: true });
    } catch (error: any) {
      fastify.log.error(error, 'Failed to delete session');
      reply.code(500).send({ error: error.message });
    }
  });
}