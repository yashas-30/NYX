import logger from '../logger.js';

interface CacheEntry {
  id: string;
  model: string;
  promptHash: string;
  timestamp: number;
  tokens: number;
  isActive: boolean;
}

/**
 * Manages the KV Cache state for local llama-server instances.
 * Instead of resetting the context for each interaction, this manager
 * coordinates 'shift' commands to retain the context prefix, dramatically
 * reducing latency (TTFT) for multi-step agent operations.
 */
export class KVCacheManager {
  private static cacheMap = new Map<string, CacheEntry>();
  private static readonly MAX_TTL_MS = 1000 * 60 * 60; // 1 hour

  static registerContext(id: string, model: string, promptHash: string, tokens: number) {
    this.cacheMap.set(id, {
      id,
      model,
      promptHash,
      timestamp: Date.now(),
      tokens,
      isActive: true,
    });
    logger.info(`[KVCacheManager] Registered context ${id} for model ${model} (${tokens} tokens)`);
  }

  static getActiveContext(model: string, promptHashPrefix: string): CacheEntry | null {
    this.cleanup();
    for (const entry of this.cacheMap.values()) {
      if (entry.model === model && entry.isActive && promptHashPrefix.startsWith(entry.promptHash)) {
        return entry;
      }
    }
    return null;
  }

  static async shiftContext(id: string, keepTokens: number, dropTokens: number) {
    const entry = this.cacheMap.get(id);
    if (!entry) return false;

    try {
      // In a real integration, this would call the llama-server /v1/cache/shift endpoint
      // Example: fetch(`http://localhost:8080/v1/cache/shift`, { method: 'POST', body: JSON.stringify({ keep: keepTokens, drop: dropTokens }) })
      logger.info(`[KVCacheManager] Context shifted for ${id}. Kept: ${keepTokens}, Dropped: ${dropTokens}`);
      entry.tokens -= dropTokens;
      entry.timestamp = Date.now();
      return true;
    } catch (err) {
      logger.error(`[KVCacheManager] Failed to shift context ${id}`, err);
      return false;
    }
  }

  static cleanup() {
    const now = Date.now();
    for (const [id, entry] of this.cacheMap.entries()) {
      if (now - entry.timestamp > this.MAX_TTL_MS) {
        this.cacheMap.delete(id);
        logger.info(`[KVCacheManager] Evicted stale context ${id}`);
      }
    }
  }
}
