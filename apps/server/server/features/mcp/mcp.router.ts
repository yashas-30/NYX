import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { mcpClientManager, McpServerConfig } from '../../lib/mcp/McpClientManager.js';
import logger from '../../lib/logger.js';
import { randomUUID } from 'crypto';

const AddServerSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['stdio', 'sse']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().url().optional(),
}).refine(data => {
  if (data.type === 'stdio') return !!data.command;
  if (data.type === 'sse') return !!data.url;
  return false;
}, {
  message: "stdio requires a command, sse requires a url",
});

export async function mcpRouter(fastify: FastifyInstance) {
  // List all servers
  fastify.get('/servers', async (request, reply) => {
    // We expose a protected read to the manager via internal state
    const clients = (mcpClientManager as any).clients as Map<string, { config: McpServerConfig }>;
    const servers = Array.from(clients.values()).map(c => c.config);
    return { servers };
  });

  // List all tools discovered
  fastify.get('/tools', async (request, reply) => {
    try {
      const tools = await mcpClientManager.getAvailableTools();
      return { tools };
    } catch (error: any) {
      logger.error({ error: error.message }, '[MCP Router] Failed to list tools');
      reply.code(500).send({ error: 'Failed to list MCP tools' });
    }
  });

  // Add/Connect to a new MCP server
  fastify.post('/servers', {
    schema: { body: AddServerSchema },
  }, async (request, reply) => {
    const parseResult = AddServerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Invalid config', details: parseResult.error.flatten() });
    }

    const id = randomUUID();
    const config: McpServerConfig = {
      id,
      ...parseResult.data,
      status: 'disconnected',
    };

    try {
      await mcpClientManager.connectServer(config);
      return { status: 'success', server: config };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message, server: config });
    }
  });

  // Disconnect & remove a server
  fastify.delete('/servers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await mcpClientManager.disconnectServer(id);
      return { status: 'success', id };
    } catch (error: any) {
      logger.error({ id, error: error.message }, '[MCP Router] Failed to disconnect server');
      reply.code(500).send({ error: 'Failed to disconnect server' });
    }
  });
}
