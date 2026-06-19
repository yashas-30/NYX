import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { projects, projectFiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../lib/logger.js';

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function projectsRouter(fastify: FastifyInstance) {
  // List projects
  fastify.get('/', async (request, reply) => {
    try {
      const allProjects = await db.select().from(projects);
      reply.send(allProjects);
    } catch (error: any) {
      logger.error({ err: error }, 'Failed to list projects');
      reply.code(500).send({ error: 'Failed to list projects' });
    }
  });

  // Create project
  fastify.post('/', async (request, reply) => {
    try {
      const { name, description } = createProjectSchema.parse(request.body);
      const id = uuidv4();
      
      await db.insert(projects).values({
        id,
        name,
        description: description || null,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      });

      const newProject = await db.select().from(projects).where(eq(projects.id, id));
      reply.code(201).send(newProject[0]);
    } catch (error: any) {
      logger.error({ err: error }, 'Failed to create project');
      reply.code(400).send({ error: error.message });
    }
  });

  // Get project by ID
  fastify.get('/:id', async (request: any, reply) => {
    try {
      const { id } = request.params;
      const project = await db.select().from(projects).where(eq(projects.id, id));
      
      if (!project.length) {
        return reply.code(404).send({ error: 'Project not found' });
      }
      
      reply.send(project[0]);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Get project context
  fastify.get('/:id/context', async (request: any, reply) => {
    try {
      const { id } = request.params;
      const { db, isPg } = await import('../../db/client.js');
      const { projectFiles, pgDbProjectFiles } = await import('../../db/schema.js');

      const files = !isPg
        ? await db.select().from(projectFiles).where(eq(projectFiles.projectId, id))
        : await db.select().from(pgDbProjectFiles).where(eq(pgDbProjectFiles.projectId, id));

      if (!files || files.length === 0) {
        return reply.send({ context: '' });
      }

      const context = '\n\n[Project Context Files]:\n' + files.map((f: any) => 
        `--- ${f.fileName} ---\n${f.extractedText || '(Empty or unsupported file)'}`
      ).join('\n\n');

      reply.send({ context });
    } catch (error: any) {
      logger.error({ err: error }, 'Failed to fetch project context');
      reply.code(500).send({ error: error.message });
    }
  });
}