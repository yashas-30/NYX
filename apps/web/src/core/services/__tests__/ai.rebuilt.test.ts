import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@src/infrastructure/services/continuationManager', () => ({
  ContinuationManager: { executeWithContinuation: vi.fn() },
}));
vi.mock('@src/infrastructure/api/authFetch', () => {
  let token: string | null = 'test-session-token';
  return {
    fetchWithAuth: vi.fn(),
    getSessionToken: vi.fn(() => token),
    setSessionToken: vi.fn((newToken: string | null) => { token = newToken; }),
  };
});
vi.mock('@src/infrastructure/api/streamParser', () => ({
  parseSSEStream: vi.fn(),
}));
vi.mock('@src/shared/store/useNyxStore', () => ({
  useNyxStore: {
    getState: vi.fn(() => ({
      apiKeys: { gemini: 'test-key', openai: 'test-key' },
    })),
  },
}));
vi.mock('@src/infrastructure/utils/provider', () => ({
  getEffectiveApiKey: vi.fn((_p: string, keys: Record<string, string>) => keys?.gemini || ''),
}));

import {
  countTokens,
  estimateTokens,
  cancelRequest,
  cancelAllRequests,
  cancelCurrentRequest,
  AIService,
} from '../ai.service';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

describe('countTokens', () => {
  it('should return a positive integer for non-empty text', () => {
    const result = countTokens('hello world');
    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });
  it('should return 0 for empty string', () => {
    expect(countTokens('')).toBe(0);
  });
});

describe('estimateTokens', () => {
  const text = 'a'.repeat(100);
  it('should use ~3.5 chars/token for gemini', () => {
    expect(estimateTokens(text, 'gemini')).toBe(Math.ceil(100 / 3.5));
  });
  it('should return 0 for empty text', () => {
    expect(estimateTokens('', 'gemini')).toBe(0);
  });
});

describe('cancelRequest', () => {
  beforeEach(() => { cancelAllRequests(); });
  it('cancelRequest with unknown id should not throw', () => {
    expect(() => cancelRequest('nonexistent-id')).not.toThrow();
  });
  it('cancelCurrentRequest should call cancelAllRequests without throwing', () => {
    expect(() => cancelCurrentRequest()).not.toThrow();
  });
});

describe('AIService.compressPrompt', () => {
  it('should return unchanged when under maxTokens', () => {
    expect(AIService.compressPrompt('short', 100000)).toBe('short');
  });
  it('should truncate long prompts', () => {
    const result = AIService.compressPrompt('x'.repeat(5000), 100);
    expect(result).toContain('[TRUNCATED FOR LENGTH]');
  });
});

describe('AIService API key validation', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('should throw for missing API key', async () => {
    await expect(AIService.execute('gemini-2.0-flash', 'gemini', 'test')).rejects.toThrow('requires an API key');
  });
});

describe('AIService.checkStatus', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('should return "no-key" for cloud provider without key', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue({
      ok: true, json: () => Promise.resolve({}),
    } as Response);
    const result = await AIService.checkStatus('gemini');
    expect(result).toBe('no-key');
  });
});

describe('AIService session tokens', () => {
  it('getSessionToken should return current token', () => {
    const token = AIService.getSessionToken();
    expect(typeof token === 'string' || token === null).toBe(true);
  });
  it('setSessionToken should update the token', () => {
    AIService.setSessionToken('my-test-token');
    expect(AIService.getSessionToken()).toBe('my-test-token');
    AIService.setSessionToken(null);
  });
});

describe('AIService deduplication', () => {
  it('inFlightRequests should be a Map', () => {
    expect(AIService.inFlightRequests).toBeInstanceOf(Map);
  });
});

describe('provider defaults', () => {
  it('estimateTokens differentiates providers', () => {
    const text = 'a'.repeat(100);
    expect(estimateTokens(text, 'gemini')).toBeGreaterThan(estimateTokens(text, 'openai'));
  });
});
