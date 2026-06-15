import { FastifyInstance } from 'fastify';
import { DocumentPipeline } from './documentPipeline.js';
import logger from '../../lib/logger.js';

export async function documentRouter(fastify: FastifyInstance) {
  // POST /api/v1/documents/upload
  fastify.post('/documents/upload', async (req, reply) => {
    try {
      const data = await req.file();
      if (!data) return reply.status(400).send({ error: 'No file uploaded' });

      const buffer = await data.toBuffer();
      const result = await DocumentPipeline.ingest(
        buffer,
        data.filename,
        data.mimetype
      );

      logger.info(`[DocumentRouter] Ingested: ${data.filename} — ${result.chunks} chunks`);
      return reply.status(200).send(result);
    } catch (err: any) {
      logger.error('[DocumentRouter] Upload error:', err.message);
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /api/v1/documents
  fastify.get('/documents', async (_req, reply) => {
    return reply.send({ documents: DocumentPipeline.listDocuments() });
  });

  // DELETE /api/v1/documents/:fileId
  fastify.delete<{ Params: { fileId: string } }>('/documents/:fileId', async (req, reply) => {
    DocumentPipeline.removeDocument(req.params.fileId);
    return reply.send({ success: true });
  });
}
