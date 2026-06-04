import { FastifyInstance } from 'fastify';
import { ConversationStore, FolderStore } from './conversations.service.js';

function getAgentType(request: any): 'chat' | 'code' {
  const t = request.query?.agentType;
  return t === 'coder' || t === 'code' ? 'code' : 'chat';
}

export async function conversationsRouter(fastify: FastifyInstance) {
  // Folders routes
  fastify.get('/folders', (request, reply) => {
    try {
      reply.send(FolderStore.list());
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/folders', (request, reply) => {
    try {
      const { name } = request.body as any;
      if (!name) return reply.code(400).send({ error: 'Name is required' });
      const id = FolderStore.create(name);
      reply.send({ id });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.put('/folders/:id', (request, reply) => {
    try {
      const { name } = request.body as any;
      if (!name) return reply.code(400).send({ error: 'Name is required' });
      const ok = FolderStore.update((request.params as any).id, name);
      // fallow-ignore-next-line code-duplication
      if (!ok) return reply.code(404).send({ error: 'Folder not found' });
      reply.send({ ok: true });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.delete('/folders/:id', (request, reply) => {
    try {
      const ok = FolderStore.delete((request.params as any).id);
      // fallow-ignore-next-line code-duplication
      if (!ok) return reply.code(404).send({ error: 'Folder not found' });
      reply.send({ ok: true });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.get('/', (request, reply) => {
    try {
      const agentType = getAgentType(request);
      reply.send(ConversationStore.list(agentType));
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.get('/share/:shareId', (request, reply) => {
    try {
      const c = ConversationStore.getByShareId((request.params as any).shareId);
      if (c) {
        reply.send(c);
      } else {
        reply.code(404).send({ error: 'Shared conversation not found' });
      }
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/:id/share', (request, reply) => {
    try {
      const agentType = getAgentType(request);
      const shareId = ConversationStore.generateShareId((request.params as any).id, agentType);
      reply.send({ shareId });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.get('/:id', (request, reply) => {
    try {
      const agentType = getAgentType(request);
      const c = ConversationStore.get((request.params as any).id, agentType);
      if (c) {
        reply.send(c);
      } else {
        reply.code(404).send({ error: 'Not found' });
      }
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/', (request, reply) => {
    try {
      const agentType = getAgentType(request);
      ConversationStore.upsert(request.body as any, agentType);
      reply.send({ ok: true });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.delete('/:id', (request, reply) => {
    try {
      const agentType = getAgentType(request);
      ConversationStore.delete((request.params as any).id, agentType);
      reply.send({ ok: true });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.delete('/', (request, reply) => {
    try {
      const agentType = getAgentType(request);
      ConversationStore.clear(agentType);
      reply.send({ ok: true });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.get('/:id/export', (request, reply) => {
    try {
      const agentType = getAgentType(request);
      const c = ConversationStore.get((request.params as any).id, agentType);
      if (!c) {
        return reply.code(404).send({ error: 'Not found' });
      }

      const format = (((request.query as any).format as string) || 'json').toLowerCase();

      if (format === 'markdown' || format === 'md') {
        let md = `# NYX Chat Export\n\n`;
        md += `**Title:** ${c.title}\n`;
        md += `**Model:** ${c.model}\n`;
        md += `**Date:** ${new Date(c.createdAt).toLocaleString()}\n\n`;
        md += `---\n\n`;

        for (const msg of c.messages) {
          const roleName = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
          md += `### ${roleName} (${new Date(msg.timestamp).toLocaleTimeString()})\n\n`;
          md += `${msg.content}\n\n`;
          md += `---\n\n`;
        }

        reply.header('Content-Type', 'text/markdown');
        reply.header('Content-Disposition', `attachment; filename="nyx-chat-${c.id}.md"`);
        return reply.send(md);
      } else {
        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', `attachment; filename="nyx-chat-${c.id}.json"`);
        return reply.send(c);
      }
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });
}
