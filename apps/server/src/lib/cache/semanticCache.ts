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

  async get(query: string, queryEmbedding: number[]): Promise<string | null> {
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
    // Assuming vectorStore is globally available LanceDB instance
    /*
    const similar = await vectorStore.search(queryEmbedding).limit(5).toArray();
    for (const result of similar) {
      if (cosineSimilarity(queryEmbedding, result.embedding) > 0.95) {
        return result.response;
      }
    }
    */

    return null;
  }

  async set(query: string, response: string, embedding?: number[]) {
    this.memoryCache.set(query, response);
    if (this.redisCache) {
      await this.redisCache.set(`cache:${query}`, response, 'EX', 3600); // 1 hour
    }
    // L3 save skipped here for simplicity
  }
}
