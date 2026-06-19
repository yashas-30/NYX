import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { validate } from '../../middleware/validate.js';
import { WorkspaceService } from './workspace.service.js';
import { workspaceSchema } from './workspace.schema.js';

export const workspaceRouter: FastifyPluginAsync = async (app: FastifyInstance) => {

{
// Wrapping block to avoid scope issues, typically you can remove the wrapper entirely
const router = workspaceRouter;
  const service = new WorkspaceService();

  app.get('/', (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({ workspace: service.getWorkspace() });
  });

  app.post('/', { preHandler: [validate(workspaceSchema)] },
    (request: FastifyRequest, reply: FastifyReply) => {
      const { path: newPath } = request.body as any;
      const success = service.setWorkspace(newPath);
      if (success) {
        reply.send({ success: true, workspace: service.getWorkspace() });
      } else {
        reply.code(400).send({ error: 'Directory does not exist or is invalid' });
      }
    }
  );

  app.post('/select', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await service.selectWorkspace();
      return reply.send(result);
    } catch (error: any) {
      return reply.code(500).send({ error: `Native dialog error: ${error.message}` });
    }
  });

  app.post('/create', async (request: FastifyRequest, reply: FastifyReply) => {
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

};
