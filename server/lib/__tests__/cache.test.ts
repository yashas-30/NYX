import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CacheServer } from '../cache.ts';
import * as fs from 'fs';
import * as path from 'path';
import { CACHE_DIR } from '../paths.ts';

describe('CacheServer', () => {
  const testKey = 'test-cache-key';

  beforeEach(() => {
    // Clear any test files before starting
    const filePath = path.join(CACHE_DIR, `${testKey}.json`);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  });

  afterEach(() => {
    // Clean up after test run
    const filePath = path.join(CACHE_DIR, `${testKey}.json`);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  });

  it('stores and retrieves cache data correctly', async () => {
    // Write cache
    await CacheServer.set(testKey, 'sample response text data', 'gemini', 'gemini-2.5-flash');

    // Retrieve cache
    const cached = await CacheServer.get(testKey);
    expect(cached).toBe('sample response text data');
  });

  it('returns null for a missing cache key', async () => {
    const missing = await CacheServer.get('non-existent-key-123');
    expect(missing).toBeNull();
  });

  describe('generateKey Hashing Determinism', () => {
    it('produces identical keys regardless of object property order (determinism)', () => {
      const payload1 = {
        provider: 'gemini',
        model: 'gemini-1.5-pro',
        prompt: 'test prompt',
        settings: { temperature: 0.7, topP: 0.95 }
      };

      const payload2 = {
        settings: { topP: 0.95, temperature: 0.7 },
        prompt: 'test prompt',
        model: 'gemini-1.5-pro',
        provider: 'gemini'
      };

      const key1 = CacheServer.generateKey(payload1);
      const key2 = CacheServer.generateKey(payload2);

      expect(key1).toBe(key2);
    });

    it('produces distinct keys for different prompts (collision resistance)', () => {
      const payload1 = {
        provider: 'gemini',
        model: 'gemini-1.5-pro',
        prompt: 'test prompt 1'
      };

      const payload2 = {
        provider: 'gemini',
        model: 'gemini-1.5-pro',
        prompt: 'test prompt 2'
      };

      const key1 = CacheServer.generateKey(payload1);
      const key2 = CacheServer.generateKey(payload2);

      expect(key1).not.toBe(key2);
    });
  });
});
