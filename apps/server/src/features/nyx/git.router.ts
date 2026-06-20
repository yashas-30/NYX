import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { GitService } from './git.service.js';
import logger from '../../lib/logger.js';

export const gitRouter: FastifyPluginAsync = async (app: FastifyInstance) => {
  const gitService = new GitService();

  // GET /api/v1/git/status
  app.get('/status', async (request, reply) => {
    try {
      const { cwd } = request.query as { cwd?: string };
      const status = await gitService.getStatus(cwd);
      reply.send(status);
    } catch (error: any) {
      logger.error('[Git Router] status failed:', error);
      reply.code(500).send({ success: false, message: error.message });
    }
  });

  // GET /api/v1/git/log
  app.get('/log', async (request, reply) => {
    try {
      const { n, cwd } = request.query as { n?: string; cwd?: string };
      const limit = n ? parseInt(n, 10) : 10;
      const log = await gitService.getLog(limit, cwd);
      reply.send(log);
    } catch (error: any) {
      logger.error('[Git Router] log failed:', error);
      reply.code(500).send({ success: false, message: error.message });
    }
  });

  // GET /api/v1/git/branches
  app.get('/branches', async (request, reply) => {
    try {
      const { cwd } = request.query as { cwd?: string };
      const branches = await gitService.getBranches(cwd);
      reply.send(branches);
    } catch (error: any) {
      logger.error('[Git Router] branches failed:', error);
      reply.code(500).send({ success: false, message: error.message });
    }
  });

  // POST /api/v1/git/diff
  app.post('/diff', async (request, reply) => {
    try {
      const { filePath, cwd } = request.body as { filePath?: string; cwd?: string };
      const diff = await gitService.getDiff(filePath, cwd);
      reply.send(diff);
    } catch (error: any) {
      logger.error('[Git Router] diff failed:', error);
      reply.code(500).send({ success: false, message: error.message });
    }
  });

  // POST /api/v1/git/stage
  app.post('/stage', async (request, reply) => {
    try {
      const { files, cwd } = request.body as { files: string[]; cwd?: string };
      const result = await gitService.stage(files, cwd);
      reply.send(result);
    } catch (error: any) {
      logger.error('[Git Router] stage failed:', error);
      reply.code(500).send({ success: false, message: error.message });
    }
  });

  // POST /api/v1/git/commit
  app.post('/commit', async (request, reply) => {
    try {
      const { message, cwd } = request.body as { message: string; cwd?: string };
      const result = await gitService.commit(message, cwd);
      reply.send(result);
    } catch (error: any) {
      logger.error('[Git Router] commit failed:', error);
      reply.code(500).send({ success: false, message: error.message });
    }
  });
};
