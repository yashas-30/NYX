import * as lancedb from 'vectordb';
import path from 'path';
import fs from 'fs';
import MiniSearch from 'minisearch';
import { EmbeddingService } from './embeddingService.js';
import logger from '../../lib/logger.js';

export interface DocumentChunk {
  id: string;
  text: string;
  source: string;
  parentId: string;
  parentText: string;
  vector: number[];
}

let rerankPipeline: any = null;
async function getReranker() {
  if (rerankPipeline) return rerankPipeline;
  try {
    const { pipeline } = await import('@xenova/transformers');
    rerankPipeline = await pipeline('text-classification', 'Xenova/bge-reranker-base', {
      quantized: true,
    });
    logger.info('[VectorStore] Reranker model loaded');
  } catch (e: any) {
    logger.warn('[VectorStore] Could not load reranker model:', e.message);
    rerankPipeline = null;
  }
  return rerankPipeline;
}

export class VectorStore {
  private db: lancedb.Connection | null = null;
  private tableName = 'rag_documents_v2'; // Use v2 to avoid schema conflicts with v1
  private miniSearch: MiniSearch;
  private localDocsCache = new Map<string, { id: string; text: string; source: string; parentId: string; parentText: string }>();
  private bootstrapped = false;

  constructor() {
    this.miniSearch = new MiniSearch({
      fields: ['text', 'source'],
      storeFields: ['id', 'text', 'source', 'parentId', 'parentText'],
      searchOptions: {
        boost: { text: 2, source: 1 },
        prefix: true,
        fuzzy: 0.2,
      }
    });
  }

  private async getDb() {
    if (!this.db) {
      const dbPath = path.resolve(process.cwd(), 'server', 'db', 'lancedb');
      if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(dbPath, { recursive: true });
      }
      this.db = await lancedb.connect(dbPath);
    }
    return this.db;
  }

  private async getTable(dimension: number) {
    const db = await this.getDb();
    const tableNames = await db.tableNames();
    let table;
    let isNew = false;
    
    if (!tableNames.includes(this.tableName)) {
      const dummyVector = new Array(dimension).fill(0);
      table = await db.createTable(this.tableName, [{
        id: 'init',
        text: '',
        source: '',
        parentId: '',
        parentText: '',
        vector: dummyVector
      }]);
      isNew = true;
    } else {
      table = await db.openTable(this.tableName);
    }

    if (!this.bootstrapped && !isNew) {
      this.bootstrapped = true;
      this.bootstrapMiniSearch(table);
    }

    return table;
  }

  private async bootstrapMiniSearch(table: any) {
    try {
      const allDocs = await table.execute();
      for (const doc of allDocs) {
        if (doc.id === 'init') continue;
        const mapped = {
          id: doc.id as string,
          text: (doc.text || '') as string,
          source: (doc.source || '') as string,
          parentId: (doc.parentId || '') as string,
          parentText: (doc.parentText || '') as string,
        };
        try {
          this.miniSearch.add(mapped);
        } catch {}
        this.localDocsCache.set(doc.id, mapped);
      }
      logger.info(`[VectorStore] Bootstrapped MiniSearch index with ${this.localDocsCache.size} documents.`);
    } catch (err: any) {
      logger.warn('[VectorStore] MiniSearch bootstrapping failed:', err.message);
    }
  }

  /**
   * Upserts document chunks into LanceDB and MiniSearch
   */
  async upsertDocuments(chunks: DocumentChunk[]) {
    if (chunks.length === 0) return;
    const table = await this.getTable(chunks[0].vector.length);
    
    // Append the new chunks
    await table.add(chunks as unknown as Record<string, unknown>[]);

    // Index in MiniSearch and cache
    for (const chunk of chunks) {
      const mapped = {
        id: chunk.id,
        text: chunk.text,
        source: chunk.source,
        parentId: chunk.parentId,
        parentText: chunk.parentText,
      };
      try {
        this.miniSearch.add(mapped);
      } catch {}
      this.localDocsCache.set(chunk.id, mapped);
    }
  }

  /**
   * Performs similarity search with hybrid retrieval, RRF and cross-encoder reranking.
   */
  async similaritySearch(query: string, provider: 'gemini' | 'ollama', limit = 5) {
    const queryVector = await EmbeddingService.embedText(query, { provider });
    const table = await this.getTable(queryVector.length);
    
    // 1. Vector semantic search
    let vectorResults: any[] = [];
    try {
      vectorResults = await table
        .search(queryVector)
        .limit(limit * 3)
        .execute();
    } catch (e: any) {
      logger.warn('[VectorStore] LanceDB vector search failed:', e.message);
    }

    const cleanedVectorResults = vectorResults
      .filter((r: any) => r.id !== 'init')
      .map((r: any, i: number) => ({
        id: r.id as string,
        text: r.text as string,
        source: r.source as string,
        parentId: r.parentId as string || '',
        parentText: r.parentText as string || r.text as string,
        rank: i,
        score: 1 / (60 + i), // Reciprocal Rank score
      }));

    // 2. Keyword Search
    const keywordResults = this.miniSearch.search(query).slice(0, limit * 3);
    const cleanedKeywordResults = keywordResults.map((r: any, i: number) => {
      const doc = this.localDocsCache.get(r.id);
      return {
        id: r.id as string,
        text: (doc?.text || r.text || '') as string,
        source: (doc?.source || r.source || '') as string,
        parentId: (doc?.parentId || r.parentId || '') as string,
        parentText: (doc?.parentText || r.parentText || doc?.text || '') as string,
        rank: i,
        score: 1 / (60 + i),
      };
    });

    // 3. Reciprocal Rank Fusion (RRF)
    const candidatesMap = new Map<string, any>();
    const mergeRRF = (list: any[]) => {
      list.forEach((item) => {
        const existing = candidatesMap.get(item.id);
        if (existing) {
          existing.rrfScore += item.score;
        } else {
          candidatesMap.set(item.id, {
            ...item,
            rrfScore: item.score
          });
        }
      });
    };

    mergeRRF(cleanedVectorResults);
    mergeRRF(cleanedKeywordResults);

    let candidates = Array.from(candidatesMap.values());

    // 4. Cross-Encoder Reranking
    const reranker = await getReranker();
    if (reranker && candidates.length > 0) {
      try {
        const inputs = candidates.map(c => ({
          text: query,
          text_pair: c.text
        }));
        const outputs = await reranker(inputs);
        candidates = candidates.map((c, idx) => {
          const score = outputs[idx]?.score ?? 0;
          return { ...c, finalScore: score };
        });
        candidates.sort((a, b) => b.finalScore - a.finalScore);
      } catch (err: any) {
        logger.warn('[VectorStore] Reranking failed, falling back to RRF sorting:', err.message);
        candidates.sort((a, b) => b.rrfScore - a.rrfScore);
      }
    } else {
      candidates.sort((a, b) => b.rrfScore - a.rrfScore);
    }

    // 5. Parent-Child Context Retrieval & Deduplication
    const finalResults: any[] = [];
    const seenParentIds = new Set<string>();

    for (const c of candidates) {
      const parentId = c.parentId || c.id;
      if (seenParentIds.has(parentId)) continue;
      seenParentIds.add(parentId);

      finalResults.push({
        id: c.id,
        text: c.parentText || c.text,
        source: c.source,
        score: c.finalScore ?? c.rrfScore
      });

      if (finalResults.length >= limit) break;
    }

    return finalResults;
  }
}

export const vectorStore = new VectorStore();
