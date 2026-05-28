import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
// @ts-ignore
import { lock } from 'proper-lockfile';

import { CACHE_DIR } from './paths.ts';

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch (e) {
    console.error('[CacheServer] Failed to create cache dir:', e);
  }
}

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
    misses: 0
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
      result[key] = CacheServer.sortKeys(obj[key]);
    }
    return result;
  }

  /**
   * Generates a unique SHA-256 cache key based on query parameters
   */
  public static generateKey(body: any): string {
    const sortedInput = CacheServer.sortKeys({
      provider: body.provider || '',
      model: body.model || '',
      prompt: body.prompt || '',
      systemInstruction: body.systemInstruction || '',
      history: body.history || [],
      settings: body.settings || {}
    });
    const hashInput = JSON.stringify(sortedInput);
    
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Retrieves a value from the cache with thread-safe lock
   */
  public static async get(key: string): Promise<string | null> {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    if (!fs.existsSync(filePath)) {
      this.stats.misses++;
      return null;
    }
    
    let release: (() => Promise<void>) | null = null;
    try {
      release = await lock(filePath, { realpath: false, retries: 3 });
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      // TTL check: if the entry has an expiresAt field and it's in the past, treat as a miss
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        this.stats.misses++;
        // Evict expired entry asynchronously
        setImmediate(() => {
          try { fs.unlinkSync(filePath); } catch {}
        });
        return null;
      }

      this.stats.hits++;
      
      // Touch file to update mtime for LRU eviction policy
      const now = new Date();
      fs.utimesSync(filePath, now, now);

      return parsed.data || null;
    } catch (e: any) {
      console.error('[CacheServer] Failed to read cache file:', e.message);
      return null;
    } finally {
      if (release) {
        try {
          await release();
        } catch {}
      }
    }
  }

  /**
   * Stores a value in the cache with thread-safe lock and LRU eviction
   */
  public static async set(key: string, data: string, provider: string, model: string): Promise<void> {
    return this.setWithTTL(key, data, provider, model, 0);
  }

  /**
   * Stores a value with a TTL (time-to-live). Use for web search results and other short-lived data.
   * @param ttlMs - TTL in milliseconds. 0 means no expiry (permanent). Default for web search: 300000 (5 min).
   */
  public static async setWithTTL(key: string, data: string, provider: string, model: string, ttlMs = 0): Promise<void> {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    let release: (() => Promise<void>) | null = null;
    try {
      const payload: any = {
        key,
        provider,
        model,
        timestamp: Date.now(),
        data
      };

      // Attach expiry timestamp if TTL is specified
      if (ttlMs > 0) {
        payload.expiresAt = Date.now() + ttlMs;
        console.log(`[CacheServer] Storing entry with TTL=${ttlMs}ms (expires in ${(ttlMs / 1000).toFixed(0)}s): ${key.slice(0, 12)}...`);
      }

      const fileExists = fs.existsSync(filePath);
      if (!fileExists) {
        fs.writeFileSync(filePath, '', 'utf8'); // Touch file
      }

      release = await lock(filePath, { realpath: false, retries: 5 });
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
      
      // Perform LRU Eviction Check asynchronously
      this.evictOldestIfNeeded().catch(err => {
        console.error('[CacheServer] LRU Eviction failed:', err.message);
      });
    } catch (e: any) {
      console.error('[CacheServer] Failed to write cache file:', e.message);
    } finally {
      if (release) {
        try {
          await release();
        } catch {}
      }
    }
  }

  /**
   * Evaluates total cache size and evicts oldest items to stay under limit
   */
  private static async evictOldestIfNeeded(): Promise<void> {
    try {
      const files = fs.readdirSync(CACHE_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const fp = path.join(CACHE_DIR, f);
          const stats = fs.statSync(fp);
          return { name: f, path: fp, mtime: stats.mtimeMs };
        });

      if (files.length > MAX_ITEMS) {
        // Sort ascending by modification time (oldest first)
        files.sort((a, b) => a.mtime - b.mtime);
        const toEvict = files.slice(0, files.length - MAX_ITEMS);
        for (const file of toEvict) {
          try {
            fs.unlinkSync(file.path);
            console.log(`[CacheServer] LRU Evicted old cache entry: ${file.name}`);
          } catch {}
        }
      }
    } catch (e: any) {
      console.error('[CacheServer] Eviction check failed:', e.message);
    }
  }

  /**
   * Gets stats about the cache
   */
  public static getStats() {
    try {
      const files = fs.readdirSync(CACHE_DIR);
      let totalSize = 0;
      const items: CacheMetadata[] = [];

      files.forEach(file => {
        if (file.endsWith('.json')) {
          const filePath = path.join(CACHE_DIR, file);
          try {
            const stat = fs.statSync(filePath);
            totalSize += stat.size;
            
            const raw = fs.readFileSync(filePath, 'utf-8');
            const parsed = JSON.parse(raw);
            items.push({
              provider: parsed.provider || 'unknown',
              model: parsed.model || 'unknown',
              promptHash: file.replace('.json', ''),
              createdAt: parsed.timestamp || stat.mtimeMs,
              size: stat.size
            });
          } catch {
            // fallback
          }
        }
      });

      return {
        itemCount: items.length,
        totalSizeBytes: totalSize,
        hits: this.stats.hits,
        misses: this.stats.misses,
        items: items.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50)
      };
    } catch (e) {
      console.error('[CacheServer] Failed to get stats:', e);
      return {
        itemCount: 0,
        totalSizeBytes: 0,
        hits: this.stats.hits,
        misses: this.stats.misses,
        items: []
      };
    }
  }

  /**
   * Deletes all files in the cache
   */
  public static clear(): { success: boolean; clearedCount: number } {
    try {
      const files = fs.readdirSync(CACHE_DIR);
      let clearedCount = 0;
      const hashRegex = /^[a-f0-9]{64}\.json$/i;
      files.forEach(file => {
        if (hashRegex.test(file)) {
          fs.unlinkSync(path.join(CACHE_DIR, file));
          clearedCount++;
        }
      });
      this.stats.hits = 0;
      this.stats.misses = 0;
      return { success: true, clearedCount };
    } catch (e) {
      console.error('[CacheServer] Failed to clear cache:', e);
      return { success: false, clearedCount: 0 };
    }
  }
}
