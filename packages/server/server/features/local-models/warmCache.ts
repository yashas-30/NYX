import logger from '../../lib/logger.js';
import { LocalModelRunner } from './localModelRunner.js';

interface CachedModel {
  modelId: string;
  loadedAt: number;
  lastUsedAt: number;
  useCount: number;
  profile: any;
}

export class ModelWarmCache {
  private static instance: ModelWarmCache;
  private cache = new Map<string, CachedModel>();
  private maxCacheSize = 2; // Keep last 2 models warm
  private evictionTimer: NodeJS.Timeout | null = null;
  private readonly EVICTION_TTL_MS = 30 * 60 * 1000; // 30 minutes

  private constructor() {}

  public static getInstance(): ModelWarmCache {
    if (!ModelWarmCache.instance) {
      ModelWarmCache.instance = new ModelWarmCache();
    }
    return ModelWarmCache.instance;
  }

  async keepWarm(modelId: string, profile?: any): Promise<void> {
    // If already warm, just update timestamp
    if (this.cache.has(modelId)) {
      const cached = this.cache.get(modelId)!;
      cached.lastUsedAt = Date.now();
      cached.useCount++;

      // If already running with enough context size, just return
      if (LocalModelRunner.getActiveModel() === modelId && LocalModelRunner.isRunning()) {
        const activeContext = LocalModelRunner.getActiveContextSize();
        const requestedContext = profile?.contextSize || 2048;
        if (activeContext >= requestedContext) {
          this.startEvictionTimer();
          return;
        }
      }
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxCacheSize && !this.cache.has(modelId)) {
      await this.evictLRU();
    }

    // Stop current model if different
    const currentModel = LocalModelRunner.getActiveModel();
    if (currentModel && currentModel !== modelId) {
      logger.info(`[ModelWarmCache] Evicting active model ${currentModel} to load ${modelId}`);
      await LocalModelRunner.stop();
    }

    // Start new model
    await LocalModelRunner.start(modelId, profile || { contextSize: 8192 });

    this.cache.set(modelId, {
      modelId,
      loadedAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: this.cache.has(modelId) ? this.cache.get(modelId)!.useCount + 1 : 1,
      profile,
    });

    this.startEvictionTimer();
  }

  private async evictLRU(): Promise<void> {
    let oldest: CachedModel | null = null;
    let oldestKey = '';

    for (const [key, model] of this.cache) {
      if (!oldest || model.lastUsedAt < oldest.lastUsedAt) {
        oldest = model;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      // Only stop if it's the currently active model
      if (LocalModelRunner.getActiveModel() === oldestKey) {
        await LocalModelRunner.stop();
      }
      this.cache.delete(oldestKey);
      logger.info(`[ModelCache] Evicted ${oldestKey} (LRU)`);
    }
  }

  private startEvictionTimer(): void {
    if (this.evictionTimer) return;

    this.evictionTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, model] of this.cache) {
        if (now - model.lastUsedAt > this.EVICTION_TTL_MS) {
          if (LocalModelRunner.getActiveModel() === key) {
            LocalModelRunner.stop().catch(() => {});
          }
          this.cache.delete(key);
          logger.info(`[ModelCache] Evicted ${key} (TTL expired)`);
        }
      }

      if (this.cache.size === 0) {
        clearInterval(this.evictionTimer!);
        this.evictionTimer = null;
      }
    }, 60 * 1000); // Check every minute

    if (this.evictionTimer && typeof this.evictionTimer.unref === 'function') {
      this.evictionTimer.unref();
    }
  }

  async stop(): Promise<void> {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
    }
    await LocalModelRunner.stop();
    this.cache.clear();
  }

  getWarmModels(): string[] {
    return Array.from(this.cache.keys());
  }

  isWarm(modelId: string): boolean {
    return this.cache.has(modelId);
  }
}
