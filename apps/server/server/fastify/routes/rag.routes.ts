import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { DocumentParser } from '../../features/rag/documentParser.js';
import { vectorStore } from '../../features/rag/vectorStore.js';
import logger from '../../lib/logger.js';

export const ragRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Upload and ingest document
  app.post('/api/rag/ingest', async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      const buffer = await data.toBuffer();
      
      // Parse document
      const parsedDoc = await DocumentParser.parseBuffer(buffer, data.mimetype, data.filename);
      
      // Chunk document
      const chunks = await DocumentParser.chunkText(parsedDoc);
      
      // Upsert to Vector Store
      // Assuming 'gemini' as default embedding provider for ingestion. 
      // In a real scenario, this could be passed as a query param.
      const provider = (request.query as any).provider || 'gemini';
      
      // Vectorize chunks
      const { EmbeddingService } = await import('../../features/rag/embeddingService.js');
      const chunksWithVectors = [];
      for (const chunk of chunks) {
        const vector = await EmbeddingService.embedText(chunk.text, { provider });
        chunksWithVectors.push({ ...chunk, vector });
      }

      await vectorStore.upsertDocuments(chunksWithVectors);

      return reply.send({
        message: 'Document ingested successfully',
        filename: data.filename,
        chunks: chunks.length,
      });
    } catch (err: any) {
      logger.error({ err }, '[RAG Ingest] Error ingesting document');
      return reply.code(500).send({ error: err.message });
    }
  });
};
