import { LRUCache } from 'lru-cache';
import Redis from 'ioredis';

// Basic similarity function (dot product for normalized vectors)
function cosineSimilarity(a: number[], b: number[]) {
  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
  }
  return dotProduct;
}

export class SemanticCache {
  private memoryCache: LRUCache<string, any>;
  private redisCache: Redis | null = null;
  
  constructor() {
    this.memoryCache = new LRUCache({
      max: 1000,
      ttl: 1000 * 60 * 5, // 5 minutes
    });
    
    try {
      // Connect to local redis if available
      this.redisCache = new Redis({
        host: '127.0.0.1',
        port: 6379,
        lazyConnect: true
      });
      // Don't throw if not running
      this.redisCache.on('error', () => {
        this.redisCache = null;
      });
    } catch (e) {
      this.redisCache = null;
    }
  }

  async get(query: string, queryEmbedding?: number[]): Promise<string | null> {
    // L1: Memory Cache
    const memResult = this.memoryCache.get(query);
    if (memResult) return memResult;

    // L2: Redis Cache (Exact match fallback)
    if (this.redisCache) {
      const redisResult = await this.redisCache.get(`cache:${query}`);
      if (redisResult) {
        this.memoryCache.set(query, redisResult);
        return redisResult;
      }
    }

    // L3: Semantic Vector Search
    try {
      const { pipeline } = await import('@xenova/transformers');
      const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      let qEmbedding = queryEmbedding;
      if (!qEmbedding) {
        const output = await extractor(query, { pooling: 'mean', normalize: true });
        qEmbedding = Array.from(output.data);
      }

      // In-memory linear scan of recent queries for semantic similarity
      for (const [key, value] of this.memoryCache.entries()) {
        if (typeof value === 'object' && value.embedding && value.response) {
          const sim = cosineSimilarity(qEmbedding as number[], value.embedding);
          if (sim > 0.95) {
            return value.response;
          }
        }
      }
    } catch (err) {
      // Ignore embedding failures, fallback to no cache
    }

    return null;
  }

  async set(query: string, response: string, embedding?: number[]) {
    let qEmbedding = embedding;
    if (!qEmbedding) {
      try {
        const { pipeline } = await import('@xenova/transformers');
        const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        const output = await extractor(query, { pooling: 'mean', normalize: true });
        qEmbedding = Array.from(output.data);
      } catch (err) {}
    }
    
    this.memoryCache.set(query, { response, embedding: qEmbedding });
    if (this.redisCache) {
      await this.redisCache.set(`cache:${query}`, response, 'EX', 3600); // 1 hour
    }
  }
}
