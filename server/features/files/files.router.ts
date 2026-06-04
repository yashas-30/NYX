import { FastifyInstance } from 'fastify';
import logger from '../../lib/logger.ts';
import { FilesService } from './files.service.ts';

export async function filesRouter(fastify: FastifyInstance) {
  const filesService = new FilesService();

  fastify.post('/upload', async (request, reply) => {
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
