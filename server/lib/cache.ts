import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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

export class CacheServer {
  private static stats = {
    hits: 0,
    misses: 0
  };

  /**
   * Generates a unique SHA-256 cache key based on query parameters
   */
  public static generateKey(body: any): string {
    const hashInput = JSON.stringify({
      provider: body.provider || '',
      model: body.model || '',
      prompt: body.prompt || '',
      systemInstruction: body.systemInstruction || '',
      history: body.history || [],
      settings: body.settings || {}
    });
    
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Retrieves a value from the cache
   */
  public static get(key: string): string | null {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.stats.hits++;
        return parsed.data || null;
      } catch (e) {
        console.error('[CacheServer] Failed to read cache file:', e);
        return null;
      }
    }
    this.stats.misses++;
    return null;
  }

  /**
   * Stores a value in the cache
   */
  public static set(key: string, data: string, provider: string, model: string): void {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    try {
      const payload = {
        key,
        provider,
        model,
        timestamp: Date.now(),
        data
      };
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (e) {
      console.error('[CacheServer] Failed to write cache file:', e);
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
      files.forEach(file => {
        if (file.endsWith('.json')) {
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
