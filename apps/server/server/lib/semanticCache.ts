import { LRUCache } from 'lru-cache';
import logger from './logger.js';

interface CacheEntry {
  response: string;
  embedding: number[];
  timestamp: number;
  hits: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

const CACHE_THRESHOLD = 0.92; // 92% cosine similarity = cache hit
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class SemanticCache {
  private cache: LRUCache<string, CacheEntry>;
  private embedder: ((text: string) => Promise<number[]>) | null = null;

  constructor(maxEntries: number = 500) {
    this.cache = new LRUCache<string, CacheEntry>({
      max: maxEntries,
      ttl: CACHE_TTL_MS,
    });
  }

  async init(embedFn: (text: string) => Promise<number[]>) {
    this.embedder = embedFn;
  }

  async get(prompt: string): Promise<string | null> {
    if (!this.embedder) return null;
    try {
      const queryEmbedding = await this.embedder(prompt);
      let bestMatch: { key: string; similarity: number; entry: CacheEntry } | null = null;

      for (const [key, entry] of this.cache.entries()) {
        // Skip entries older than TTL
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
          this.cache.delete(key);
          continue;
        }
        const sim = cosineSimilarity(queryEmbedding, entry.embedding);
        if (sim >= CACHE_THRESHOLD && (!bestMatch || sim > bestMatch.similarity)) {
          bestMatch = { key, similarity: sim, entry };
        }
      }

      if (bestMatch) {
        bestMatch.entry.hits++;
        logger.info(`[SemanticCache] HIT (similarity: ${bestMatch.similarity.toFixed(3)})`);
        return bestMatch.entry.response;
      }
    } catch (e: any) {
      logger.warn('[SemanticCache] get failed:', e.message);
    }
    return null;
  }

  async set(prompt: string, response: string) {
    if (!this.embedder) return;
    try {
      const embedding = await this.embedder(prompt);
      const key = `prompt:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      this.cache.set(key, { response, embedding, timestamp: Date.now(), hits: 0 });
    } catch (e: any) {
      logger.warn('[SemanticCache] set failed:', e.message);
    }
  }

  stats() {
    return { size: this.cache.size, maxSize: 500 };
  }

  clear() {
    this.cache.clear();
  }
}

export const semanticCache = new SemanticCache(500);
