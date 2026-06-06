import logger from './logger.js';
import crypto from 'crypto';
import { CacheRepository } from '../repositories/cache.repo.js';

interface CacheMetadata {
  provider: string;
  model: string;
  promptHash: string;
  createdAt: number;
  size: number;
}

const MAX_ITEMS = 100; // LRU Eviction Limit: max 100 items

export class CacheServer {
  private static stats = {
    hits: 0,
    misses: 0,
  };

  private static sortKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(CacheServer.sortKeys);
    }
    const sortedKeys = Object.keys(obj).sort();
    const result: any = {};
    for (const key of sortedKeys) {
      if (obj[key] !== undefined) {
        result[key] = CacheServer.sortKeys(obj[key]);
      }
    }
    return result;
  }

  /**
   * Generates a unique SHA-256 cache key based on query parameters
   */
  public static generateKey(body: any): string {
    const sortedInput = CacheServer.sortKeys({
      _version: 1, // cache key versioning
      provider: body.provider || '',
      model: body.model || '',
      prompt: body.prompt || '',
      systemInstruction: body.systemInstruction || '',
      history: body.history || [],
      settings: body.settings || {},
    });
    const hashInput = JSON.stringify(sortedInput);
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Retrieves a value from the cache
   */
  public static async get(key: string): Promise<string | null> {
    try {
      const entry = await CacheRepository.get(key);
      if (!entry) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return entry.data;
    } catch (error: any) {
      logger.error('[CacheServer] Failed to read cache:', error.message);
      return null;
    }
  }

  /**
   * Stores a value in the cache
   */
  public static async set(
    key: string,
    data: string,
    provider: string,
    model: string
  ): Promise<void> {
    const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
    return this.setWithTTL(key, data, provider, model, DEFAULT_TTL_MS);
  }

  /**
   * Stores a value with a TTL (time-to-live). Use for web search results and other short-lived data.
   */
  public static async setWithTTL(
    key: string,
    data: string,
    provider: string,
    model: string,
    ttlMs = 0
  ): Promise<void> {
    try {
      if (ttlMs > 0) {
        logger.info(
          `[CacheServer] Storing entry with TTL=${ttlMs}ms (expires in ${(ttlMs / 1000).toFixed(0)}s): ${key.slice(0, 12)}...`
        );
      }

      await CacheRepository.set(key, data, provider, model, ttlMs);
      
      // Async I/O: Run eviction without blocking the response
      const MAX_CACHE_SIZE_BYTES = Number(process.env.MAX_CACHE_SIZE) || 1024 * 1024 * 1024; // 1GB
      CacheRepository.evictOldestIfNeeded(MAX_CACHE_SIZE_BYTES).catch(err => 
        logger.error({ err, key }, '[CacheServer] Async eviction failed')
      );
    } catch (error: any) {
      logger.error({ err: error, key, provider, model }, '[CacheServer] Failed to write cache');
    }
  }

  /**
   * Gets stats about the cache
   */
  public static async getStats() {
    try {
      const dbStats = await CacheRepository.getStats();
      return {
        itemCount: dbStats.itemCount,
        totalSizeBytes: dbStats.totalSizeBytes,
        hits: this.stats.hits,
        misses: this.stats.misses,
        items: dbStats.items,
      };
    } catch (e: any) {
      logger.error('[CacheServer] Failed to get stats:', e);
      return {
        itemCount: 0,
        totalSizeBytes: 0,
        hits: this.stats.hits,
        misses: this.stats.misses,
        items: [],
      };
    }
  }

  /**
   * Deletes all entries in the cache
   */
  public static async clear(): Promise<{ success: boolean; clearedCount: number }> {
    try {
      const res = await CacheRepository.clear();
      this.stats.hits = 0;
      this.stats.misses = 0;
      return res;
    } catch (e: any) {
      logger.error('[CacheServer] Failed to clear cache:', e);
      return { success: false, clearedCount: 0 };
    }
  }
}

export class TTLCache<V> {
  private cache = new Map<string, { value: V; expiresAt: number }>();
  private defaultTTLMs: number;
  private maxSize: number;

  constructor(defaultTTLMs: number = 60000, maxSize: number = MAX_ITEMS) {
    this.defaultTTLMs = defaultTTLMs;
    this.maxSize = maxSize;
  }

  set(key: string, value: V, ttlMs?: number) {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // LRU Eviction: Map guarantees keys are returned in insertion order
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    
    const expiresAt = Date.now() + (ttlMs || this.defaultTTLMs);
    // Delete first to enforce insertion order (LRU)
    this.cache.delete(key);
    this.cache.set(key, { value, expiresAt });
  }

  get(key: string): V | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Refresh LRU order
    this.cache.delete(key);
    this.cache.set(key, item);

    return item.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string) {
    this.cache.delete(key);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

export const dedupeCache = new TTLCache<boolean>(10000); // 10s default TTL

