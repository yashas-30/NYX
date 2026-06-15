import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiCacheManager } from '../geminiCacheManager.js';

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    caches = {
      create: vi.fn().mockResolvedValue({
        name: 'cachedContents/mock-cache-id',
      }),
    };
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
  };
});

describe('GeminiCacheManager', () => {
  beforeEach(() => {
    // Reset private activeCaches map between tests
    (GeminiCacheManager as any).activeCaches.clear();
  });

  it('hashes messages consistently', () => {
    const messages1 = [{ role: 'user', content: 'hello' }];
    const messages2 = [{ role: 'user', content: 'hello' }];
    const messages3 = [{ role: 'user', content: 'world' }];

    expect(GeminiCacheManager.hashMessages(messages1)).toBe(GeminiCacheManager.hashMessages(messages2));
    expect(GeminiCacheManager.hashMessages(messages1)).not.toBe(GeminiCacheManager.hashMessages(messages3));
  });

  it('creates and retrieves a cache', async () => {
    const messages = [
      { role: 'system', content: 'you are a bot' },
      { role: 'user', content: 'hello' },
    ];

    const result = await GeminiCacheManager.getOrCreateCache(
      messages,
      'you are a bot',
      'gemini-2.5-flash',
      'mock-api-key'
    );

    expect(result.cacheName).toBe('cachedContents/mock-cache-id');
    expect(result.cachedCount).toBe(2);

    // Call it again to hit cache
    const result2 = await GeminiCacheManager.getOrCreateCache(
      messages,
      'you are a bot',
      'gemini-2.5-flash',
      'mock-api-key'
    );
    expect(result2.cacheName).toBe('cachedContents/mock-cache-id');
  });

  it('finds matching cache prefix', async () => {
    const prefix = [
      { role: 'user', content: 'message 1' },
      { role: 'assistant', content: 'message 2' },
    ];
    const fullHistory = [
      ...prefix,
      { role: 'user', content: 'message 3' },
      { role: 'assistant', content: 'message 4' },
    ];

    // Cache the prefix first
    await GeminiCacheManager.getOrCreateCache(
      prefix,
      undefined,
      'gemini-2.5-flash',
      'mock-api-key'
    );

    // Now look up fullHistory prefix match
    const match = GeminiCacheManager.findMatchingCache(fullHistory, 'gemini-2.5-flash');
    expect(match).not.toBeNull();
    expect(match?.cacheName).toBe('cachedContents/mock-cache-id');
    expect(match?.messageCount).toBe(2);
  });
});
