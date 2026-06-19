import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import logger from '../../lib/logger.js';
import { FilesService } from './files.service.js';

export const filesRouter: FastifyPluginAsync = async (app: FastifyInstance) => {

{
// Wrapping block to avoid scope issues, typically you can remove the wrapper entirely
const router = filesRouter;
  const filesService = new FilesService();

  app.post('/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { name, mimeType, data } = request.body as any;
      if (!data || !name || !mimeType) {
        return reply.code(400).send({ error: 'Missing required file data' });
      }

      const filePath = await filesService.saveFile(name, mimeType, data);

      reply.send({
        success: true,
        name,
        mimeType,
        path: filePath,
      });
    } catch (error: any) {
      logger.error({ error }, 'File upload failed');
      reply.code(500).send({ error: 'Failed to upload file' });
    }
  });


}

};
