import * as lancedb from 'vectordb';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';
import logger from '../logger.js';
import { hybridRetriever } from './hybridRetriever.js';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const lancedbPath = path.join(os.homedir(), '.nyx', 'lancedb');
if (!fs.existsSync(lancedbPath)) {
  fs.mkdirSync(lancedbPath, { recursive: true });
}

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
  if (!embedder) throw new Error('[VectorStore] Embedding model unavailable — skipping vector op');
  try {
    const output = await embedder(text, { pooling: 'mean', normalize: true });
    const vec = Array.from(output.data as Float32Array);
    // Sanity-check: a zero vector means the model silently failed
    const isZero = vec.every(v => v === 0);
    if (isZero) throw new Error('[VectorStore] Embedder returned zero vector');
    return vec;
  } catch (e: any) {
    logger.warn('[VectorStore] Embedding failed:', e.message);
    throw e; // Propagate so callers can skip storage rather than write garbage
  }
}

let _table: any = null;

export async function initVectorStore() {
  if (_table) return _table;
  const db = await lancedb.connect(lancedbPath);
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

let _semanticTable: any = null;

export async function initSemanticCacheTable() {
  if (_semanticTable) return _semanticTable;
  const db = await lancedb.connect(lancedbPath);
  const tableNames = await db.tableNames();
  if (!tableNames.includes('semantic_cache')) {
    _semanticTable = await db.createTable('semantic_cache', [
      { id: 'init', prompt: 'init', embedding: new Array(384).fill(0), provider: 'system', model: 'system', timestamp: Date.now() }
    ]);
  } else {
    _semanticTable = await db.openTable('semantic_cache');
  }
  return _semanticTable;
}

export async function storeSemanticCache(prompt: string, cacheKey: string, provider: string, model: string) {
  try {
    const table = await initSemanticCacheTable();
    const embedding = await embedText(prompt);
    await table.add([{ id: cacheKey, prompt, embedding, provider, model, timestamp: Date.now() }]);
  } catch (e: any) {
    logger.warn('[VectorStore] storeSemanticCache skipped:', e.message);
  }
}

export async function checkSemanticCache(prompt: string, provider: string, model: string, threshold = 0.95): Promise<string | null> {
  try {
    const table = await initSemanticCacheTable();
    const embedding = await embedText(prompt);
    // LanceDB cosine metric returns distance (1 - cosine_similarity).
    // So similarity > 0.95 means distance < 0.05
    const results = await table.search(embedding).metricType('cosine').limit(1).execute();
    if (results.length > 0 && results[0].id !== 'init') {
      const distance = results[0]._distance as number;
      if (distance < (1 - threshold) && results[0].provider === provider && results[0].model === model) {
        logger.info(`[VectorStore] Semantic Cache hit! Distance: ${distance.toFixed(4)}`);
        return results[0].id as string; // returns cacheKey
      }
    }
    return null;
  } catch (e: any) {
    logger.warn('[VectorStore] checkSemanticCache failed:', e.message);
    return null;
  }
}


export async function storeMemory(content: string, sessionId: string, type: string = 'conversation') {
  try {
    const table = await initVectorStore();
    const embedding = await embedText(content); // throws if embedder unavailable — caught below
    const id = `${sessionId}-${Date.now()}`;
    await table.add([{ id, content, embedding, timestamp: Date.now(), sessionId, type }]);
    hybridRetriever.addDocument(id, content, sessionId);
    return id;
  } catch (e: any) {
    // Silently skip — never write zero-vector garbage to the store
    logger.warn('[VectorStore] storeMemory skipped (embedder unavailable or zero-vector):', e.message);
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
