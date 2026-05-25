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
});
