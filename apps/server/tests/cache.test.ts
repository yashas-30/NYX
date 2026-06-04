import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheServer, TTLCache } from '../server/lib/cache.ts';
import { CacheRepository } from '../server/repositories/cache.repo.ts';

vi.mock('../server/repositories/cache.repo.ts', () => {
  const store = new Map<string, any>();
  return {
    CacheRepository: {
      get: vi.fn(async (key: string) => store.get(key)),
      set: vi.fn(async (key: string, data: string, provider: string, model: string, ttlMs: number) => {
        store.set(key, { key, data, provider, model, createdAt: new Date() });
      }),
      evictOldestIfNeeded: vi.fn(async () => {}),
      clear: vi.fn(async () => {
        store.clear();
        return { success: true, clearedCount: 0 };
      }),
      getStats: vi.fn(async () => ({ itemCount: store.size, totalSizeBytes: 0, items: [] })),
    },
  };
});

describe('CacheServer & TTLCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CacheServer', () => {
    const testKey = 'test-key';

    it('stores and retrieves cache data successfully', async () => {
      await CacheServer.set(testKey, 'cached content', 'gemini', 'gemini-1.5-pro');
      const data = await CacheServer.get(testKey);

      expect(data).toBe('cached content');
      expect(CacheRepository.set).toHaveBeenCalled();
    });

    it('returns null for missing key', async () => {
      const data = await CacheServer.get('missing-key');
      expect(data).toBeNull();
    });

    it('generates deterministic cache keys', () => {
      const payload1 = {
        provider: 'gemini',
        model: 'gemini-1.5-pro',
        prompt: 'test prompt',
      };
      const payload2 = {
        prompt: 'test prompt',
        model: 'gemini-1.5-pro',
        provider: 'gemini',
      };

      const key1 = CacheServer.generateKey(payload1);
      const key2 = CacheServer.generateKey(payload2);

      expect(key1).toBe(key2);
    });
  });

  describe('TTLCache', () => {
    it('evicts expired items based on TTL', async () => {
      const cache = new TTLCache<string>(50); // 50ms TTL
      cache.set('key', 'val');

      expect(cache.get('key')).toBe('val');

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(cache.get('key')).toBeUndefined();
    });
  });
});
