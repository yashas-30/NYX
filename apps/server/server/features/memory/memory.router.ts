import { FastifyInstance } from 'fastify';
import { db } from '../../db/client.js';
import { userMemories } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export async function memoryRouter(fastify: FastifyInstance) {
  // GET /api/v1/memory — list all memories
  fastify.get('/memory', async (_req, reply) => {
    try {
      const memories = await db.select().from(userMemories).orderBy(userMemories.createdAt);
      return reply.send({ memories });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/v1/memory — add a memory manually
  fastify.post<{ Body: { fact: string; category?: string } }>('/memory', async (req, reply) => {
    const { fact, category = 'manual' } = req.body;
    if (!fact || !fact.trim()) return reply.status(400).send({ error: 'fact is required' });
    try {
      const memory = {
        id: uuidv4(),
        fact: fact.trim(),
        category,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sessionId: 'manual',
      };
      await db.insert(userMemories).values(memory);
      return reply.status(201).send({ memory });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // DELETE /api/v1/memory/:id — remove a single memory
  fastify.delete<{ Params: { id: string } }>('/memory/:id', async (req, reply) => {
    try {
      await db.delete(userMemories).where(eq(userMemories.id, req.params.id));
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // DELETE /api/v1/memory — clear ALL memories
  fastify.delete('/memory', async (_req, reply) => {
    try {
      await db.delete(userMemories);
      return reply.send({ success: true, cleared: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
