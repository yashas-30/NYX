/**
 * @file documentPipeline.ts
 * @description PDF/DOCX/TXT ingestion pipeline with chunking and LanceDB indexing.
 * Provides Kimi-parity document understanding to NYX.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../../lib/logger.js';
import { initVectorStore, embedText } from '../../lib/memory/vectorStore.js';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DB_PATH = path.join(_dirname, '../../../../.nyx-uploads/docs');

export interface DocumentChunk {
  id: string;
  sourceFile: string;
  originalName: string;
  pageNumber?: number;
  chunkIndex: number;
  text: string;
  charStart: number;
  charEnd: number;
}

const CHUNK_SIZE = 1800;  // ~450 tokens
const CHUNK_OVERLAP = 200; // ~50 tokens overlap

// Active document index (in-memory for fast search, persisted in LanceDB)
const _documentIndex = new Map<string, DocumentChunk[]>();

// ── Text chunker with sliding window overlap ─────────────────────────────────
function chunkText(text: string, sourceFile: string, originalName: string): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = '';
  let charStart = 0;
  let chunkIdx = 0;

  for (const sentence of sentences) {
    if ((current + sentence).length > CHUNK_SIZE && current.length > 0) {
      chunks.push({
        id: `${sourceFile}-chunk-${chunkIdx}`,
        sourceFile,
        originalName,
        chunkIndex: chunkIdx,
        text: current.trim(),
        charStart,
        charEnd: charStart + current.length,
      });
      chunkIdx++;
      // Overlap: keep last CHUNK_OVERLAP chars
      const overlap = current.slice(-CHUNK_OVERLAP);
      charStart = charStart + current.length - overlap.length;
      current = overlap + ' ' + sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }

  if (current.trim()) {
    chunks.push({
      id: `${sourceFile}-chunk-${chunkIdx}`,
      sourceFile,
      originalName,
      chunkIndex: chunkIdx,
      text: current.trim(),
      charStart,
      charEnd: charStart + current.length,
    });
  }

  return chunks;
}

// ── PDF ingestion ─────────────────────────────────────────────────────────────
async function parsePDF(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  try {
    const pdf = (await import('pdf-parse')) as any;
    const pdfParse = pdf.default || pdf;
    const data = await pdfParse(buffer);
    return { text: data.text, pageCount: data.numpages };
  } catch (e: any) {
    logger.warn('[DocumentPipeline] pdf-parse failed, trying raw text extraction:', e.message);
    // Fallback: try to extract raw text from buffer
    const raw = buffer.toString('utf8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ');
    return { text: raw.slice(0, 100000), pageCount: 0 };
  }
}

// ── DOCX ingestion ────────────────────────────────────────────────────────────
async function parseDOCX(buffer: Buffer): Promise<{ text: string }> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value };
}

// ── Main ingestion API ────────────────────────────────────────────────────────
export class DocumentPipeline {
  /**
   * Ingest a file buffer and index it for semantic search.
   * @returns metadata about the indexed document
   */
  static async ingest(
    buffer: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<{ chunks: number; pageCount: number; filename: string; fileId: string }> {
    logger.info(`[DocumentPipeline] Ingesting: ${originalName} (${mimeType})`);

    let text = '';
    let pageCount = 0;
    const fileId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Parse based on mime type
    if (mimeType === 'application/pdf' || originalName.endsWith('.pdf')) {
      const parsed = await parsePDF(buffer);
      text = parsed.text;
      pageCount = parsed.pageCount;
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      originalName.endsWith('.docx')
    ) {
      const parsed = await parseDOCX(buffer);
      text = parsed.text;
    } else {
      // Plain text, markdown, CSV, etc.
      text = buffer.toString('utf8');
    }

    if (!text || text.trim().length < 10) {
      throw new Error('Document appears empty or could not be parsed');
    }

    // Clean text
    text = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{4,}/g, '\n\n')
      .replace(/[^\S\n]{3,}/g, ' ')
      .trim();

    // Chunk the text
    const chunks = chunkText(text, fileId, originalName);
    logger.info(`[DocumentPipeline] Created ${chunks.length} chunks for ${originalName}`);

    // Store in memory index
    _documentIndex.set(fileId, chunks);

    // Persist chunks to LanceDB with embeddings (best-effort — non-blocking)
    DocumentPipeline.indexChunksAsync(chunks).catch(e =>
      logger.warn('[DocumentPipeline] Background indexing failed:', e.message)
    );

    return { chunks: chunks.length, pageCount, filename: originalName, fileId };
  }

  /** Non-blocking background embedding and storage */
  private static async indexChunksAsync(chunks: DocumentChunk[]): Promise<void> {
    try {
      const table = await initVectorStore();
      for (const chunk of chunks) {
        try {
          const embedding = await embedText(chunk.text);
          await table.add([{
            id: chunk.id,
            content: `[${chunk.originalName}] ${chunk.text}`,
            embedding,
            timestamp: Date.now(),
            sessionId: chunk.sourceFile,
            type: 'document',
          }]);
        } catch {
          // Skip chunk if embedding fails
        }
      }
      logger.info(`[DocumentPipeline] Indexed ${chunks.length} chunks in LanceDB`);
    } catch (e: any) {
      logger.warn('[DocumentPipeline] LanceDB indexing failed:', e.message);
    }
  }

  /**
   * Search across all indexed document chunks.
   */
  static async search(query: string, limit = 5): Promise<DocumentChunk[]> {
    if (_documentIndex.size === 0) return [];

    const allChunks: DocumentChunk[] = [];
    for (const chunks of _documentIndex.values()) {
      allChunks.push(...chunks);
    }

    // Simple keyword-based search on in-memory chunks (fast)
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const scored = allChunks.map(chunk => {
      const text = chunk.text.toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        const occurrences = (text.match(new RegExp(word, 'g')) || []).length;
        score += occurrences;
      }
      return { chunk, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.chunk);
  }

  /** List all indexed documents */
  static listDocuments(): { fileId: string; originalName: string; chunks: number }[] {
    const docs: { fileId: string; originalName: string; chunks: number }[] = [];
    for (const [fileId, chunks] of _documentIndex.entries()) {
      if (chunks.length > 0) {
        docs.push({ fileId, originalName: chunks[0].originalName, chunks: chunks.length });
      }
    }
    return docs;
  }

  /** Remove a document from the index */
  static removeDocument(fileId: string): void {
    _documentIndex.delete(fileId);
  }
}
