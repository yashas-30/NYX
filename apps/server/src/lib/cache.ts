import logger from './logger.js';
import crypto from 'crypto';
import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.nyx-cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CACHE_ENTRIES = 10000;
const MAX_CACHE_SIZE_MB = 500;

interface CacheEntry {
  data: string;
  provider: string;
  model: string;
  createdAt: number;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

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
      result[key] = CacheServer.sortKeys(obj[key]);
    }
    return result;
  }

  public static generateKey(body: any): string {
    const sortedInput = CacheServer.sortKeys({
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

  public static async get(key: string): Promise<string | null> {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    try {
      const raw = await fsp.readFile(filePath, 'utf-8');
      const entry: CacheEntry = JSON.parse(raw);

      if (Date.now() > entry.expiresAt) {
        await fsp.unlink(filePath).catch(() => {});
        this.stats.misses++;
        return null;
      }

      entry.accessCount++;
      entry.lastAccessed = Date.now();
      fsp.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8').catch(e => 
        logger.error('[CacheServer] Failed to update cache stats:', e.message)
      );

      this.stats.hits++;
      return entry.data;
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.error('[CacheServer] Failed to read cache:', error.message);
      }
      this.stats.misses++;
      return null;
    }
  }

  public static async set(
    key: string,
    data: string,
    provider: string,
    model: string,
    ttlMs = DEFAULT_TTL_MS
  ): Promise<void> {
    await this.enforceSizeLimit();

    const entry: CacheEntry = {
      data,
      provider,
      model,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      accessCount: 1,
      lastAccessed: Date.now()
    };

    const filePath = path.join(CACHE_DIR, `${key}.json`);
    try {
      await fsp.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
    } catch (error: any) {
      logger.error('[CacheServer] Failed to write cache:', error.message);
    }
  }

  public static async setWithTTL(
    key: string,
    data: string,
    provider: string,
    model: string,
    ttlMs = DEFAULT_TTL_MS
  ): Promise<void> {
    return this.set(key, data, provider, model, ttlMs);
  }

  public static async getStats() {
    let itemCount = 0;
    let totalSizeBytes = 0;
    
    try {
      const files = (await fsp.readdir(CACHE_DIR)).filter(f => f.endsWith('.json'));
      itemCount = files.length;
      
      for (const file of files) {
        try {
          const stat = await fsp.stat(path.join(CACHE_DIR, file));
          totalSizeBytes += stat.size;
        } catch { }
      }
    } catch (err) {
      logger.error({ err: String(err) }, '[CacheServer] Failed to read cache dir stats:');
    }

    return {
      itemCount,
      totalSizeBytes,
      hits: this.stats.hits,
      misses: this.stats.misses,
      items: [],
    };
  }

  public static async clear(): Promise<{ success: boolean; clearedCount: number }> {
    try {
      const files = (await fsp.readdir(CACHE_DIR)).filter(f => f.endsWith('.json'));
      let clearedCount = 0;
      for (const file of files) {
        await fsp.unlink(path.join(CACHE_DIR, file)).catch(() => {});
        clearedCount++;
      }
      this.stats.hits = 0;
      this.stats.misses = 0;
      return { success: true, clearedCount };
    } catch (e: any) {
      logger.error('[CacheServer] Failed to clear cache:', e.message);
      return { success: false, clearedCount: 0 };
    }
  }

  private static async enforceSizeLimit(): Promise<void> {
    try {
      const files = (await fsp.readdir(CACHE_DIR)).filter(f => f.endsWith('.json'));
      if (files.length <= MAX_CACHE_ENTRIES) return;

      const entries = await Promise.all(
        files.map(async file => {
          const fp = path.join(CACHE_DIR, file);
          try {
            const stat = await fsp.stat(fp);
            return { file, mtime: stat.mtimeMs, size: stat.size };
          } catch {
            return null;
          }
        })
      );

      const validEntries = entries.filter(e => e !== null) as { file: string; mtime: number; size: number }[];
      validEntries.sort((a, b) => a.mtime - b.mtime);

      const toDelete = Math.ceil(validEntries.length * 0.1);
      for (let i = 0; i < toDelete; i++) {
        await fsp.unlink(path.join(CACHE_DIR, validEntries[i].file)).catch(() => {});
      }
    } catch (e: any) {
      logger.error('[CacheServer] Error enforcing size limit:', e.message);
    }
  }
}

export class TTLCache<V> {
  private cache = new Map<string, { value: V; expiresAt: number }>();
  private defaultTTLMs: number;

  constructor(defaultTTLMs: number = 60000) {
    this.defaultTTLMs = defaultTTLMs;
  }

  set(key: string, value: V, ttlMs?: number) {
    const expiresAt = Date.now() + (ttlMs || this.defaultTTLMs);
    this.cache.set(key, { value, expiresAt });
  }

  get(key: string): V | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

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

