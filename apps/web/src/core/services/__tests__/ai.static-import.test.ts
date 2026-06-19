import { describe, it, expect, vi } from 'vitest';

vi.mock('@src/infrastructure/services/continuationManager', () => ({
  ContinuationManager: { executeWithContinuation: vi.fn() },
}));
vi.mock('@src/infrastructure/api/authFetch', () => ({
  fetchWithAuth: vi.fn(),
  getSessionToken: vi.fn(() => 'test-session-token'),
  setSessionToken: vi.fn(),
}));
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

// Static import — this triggers the full module graph
import { countTokens, AIService } from '../ai.service';

describe('static import with mocks', () => {
  it('countTokens works', () => {
    expect(countTokens('hello')).toBeGreaterThan(0);
  });
  it('AIService.compressPrompt works', () => {
    expect(AIService.compressPrompt('short', 100000)).toBe('short');
  });
});
