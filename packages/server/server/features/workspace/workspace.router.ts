import { FastifyInstance } from 'fastify';
import { validate } from '../../middleware/validate.js';
import { WorkspaceService } from './workspace.service.js';
import { workspaceSchema } from './workspace.schema.js';

export async function workspaceRouter(fastify: FastifyInstance) {
  const service = new WorkspaceService();

  fastify.get('/', (request, reply) => {
    reply.send({ workspace: service.getWorkspace() });
  });

  fastify.post(
    '/',
    {
      preHandler: [validate(workspaceSchema)],
    },
    (request, reply) => {
      const { path: newPath } = request.body as any;
      const success = service.setWorkspace(newPath);
      if (success) {
        reply.send({ success: true, workspace: service.getWorkspace() });
      } else {
        reply.code(400).send({ error: 'Directory does not exist or is invalid' });
      }
    }
  );

  fastify.post('/select', async (request, reply) => {
    try {
      const result = await service.selectWorkspace();
      return reply.send(result);
    } catch (error: any) {
      return reply.code(500).send({ error: `Native dialog error: ${error.message}` });
    }
  });

  fastify.post('/create', async (request, reply) => {
    try {
      const { path: dirPath, name } = request.body as any;
      if (!dirPath) {
        return reply.code(400).send({ error: 'Directory path is required' });
      }
      const result = await service.createWorkspace(dirPath, name);
      if (result.success) {
        return reply.send(result);
      } else {
        return reply.code(400).send(result);
      }
    } catch (error: any) {
      return reply.code(500).send({ error: `Failed to create workspace: ${error.message}` });
    }
  });
}
