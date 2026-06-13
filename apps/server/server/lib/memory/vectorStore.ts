import * as lancedb from 'vectordb';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../logger.js';
import { hybridRetriever } from './hybridRetriever.js';

const _dirname = path.dirname(fileURLToPath(import.meta.url));

let embeddingPipeline: any = null;

async function getEmbedder() {
  if (embeddingPipeline) return embeddingPipeline;
  try {
    const { pipeline } = await import('@xenova/transformers');
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
    });
    logger.info('[VectorStore] Embedding model loaded');
  } catch (e: any) {
    logger.warn('[VectorStore] Could not load embedding model:', e.message);
    embeddingPipeline = null;
  }
  return embeddingPipeline;
}

export async function embedText(text: string): Promise<number[]> {
  const embedder = await getEmbedder();
  if (!embedder) return new Array(384).fill(0);
  try {
    const output = await embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  } catch (e: any) {
    logger.warn('[VectorStore] Embedding failed:', e.message);
    return new Array(384).fill(0);
  }
}

let _table: any = null;

export async function initVectorStore() {
  if (_table) return _table;
  const db = await lancedb.connect(path.join(_dirname, '../../../.nyx-memory'));
  const tableNames = await db.tableNames();
  if (!tableNames.includes('conversations')) {
    _table = await db.createTable('conversations', [
      { id: 'init', content: 'init', embedding: new Array(384).fill(0), timestamp: Date.now(), sessionId: 'init', type: 'system' }
    ]);
  } else {
    _table = await db.openTable('conversations');
  }
  return _table;
}


export async function storeMemory(content: string, sessionId: string, type: string = 'conversation') {
  try {
    const table = await initVectorStore();
    const embedding = await embedText(content);
    const id = `${sessionId}-${Date.now()}`;
    await table.add([{ id, content, embedding, timestamp: Date.now(), sessionId, type }]);
    hybridRetriever.addDocument(id, content, sessionId);
    return id;
  } catch (e: any) {
    logger.warn('[VectorStore] storeMemory failed:', e.message);
    return null;
  }
}

export async function searchMemory(query: string, limit: number = 5): Promise<string> {
  try {
    const table = await initVectorStore();
    const embedding = await embedText(query);
    const results = await hybridRetriever.hybridSearch(query, embedding, table, limit);
    return results
      .filter(r => r.id !== 'init')
      .map(r => `Memory: ${r.content}`)
      .join('\n');
  } catch (e: any) {
    logger.warn('[VectorStore] searchMemory failed:', e.message);
    return '';
  }
}
