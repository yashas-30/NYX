import { LRUCache } from 'lru-cache';

interface CacheEntry {
  data: any;
}

export class ModelCacheService {
  private cache: LRUCache<string, CacheEntry>;

  constructor() {
    this.cache = new LRUCache({
      max: 500, // maximum items
      ttl: 1000 * 60 * 5, // 5 minutes
    });
  }

  get(key: string): any | undefined {
    const entry = this.cache.get(key);
    return entry ? entry.data : undefined;
  }

  set(key: string, data: any): void {
    this.cache.set(key, { data });
  }

  generateKey(provider: string, endpoint: string, apiKey?: string): string {
    // Basic hash of key just for isolation.
    const keyPrefix = apiKey ? apiKey.substring(0, 8) : 'public';
    return `${provider}:${endpoint}:${keyPrefix}`;
  }
}

export const modelCache = new ModelCacheService();
