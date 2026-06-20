import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { validate } from '../../middleware/validate.js';
import { WorkspaceService } from './workspace.service.js';
import { workspaceSchema } from './workspace.schema.js';

export const workspaceRouter: FastifyPluginAsync = async (app: FastifyInstance) => {

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

  app.get('/projects', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const projects = await service.getProjects();
      reply.send(projects);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  app.post('/projects', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const project = await service.createProject(request.body);
      reply.send(project);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  app.put('/projects/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as any;
      const project = await service.updateProject(id, request.body);
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      reply.send(project);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  app.delete('/projects/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as any;
      const result = await service.deleteProject(id);
      reply.send(result);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });
};
