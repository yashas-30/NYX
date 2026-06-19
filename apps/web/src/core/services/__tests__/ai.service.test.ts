import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  countTokens,
  estimateTokens,
  cancelRequest,
  cancelAllRequests,
  cancelCurrentRequest,
  AIService,
} from '../ai.service';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { parseSSEStream } from '@src/infrastructure/api/streamParser';

// ---------------------------------------------------------------------------
// Mocks — all vi.mock() calls are hoisted by vitest
// ---------------------------------------------------------------------------

vi.mock('@src/infrastructure/services/continuationManager', () => ({
  ContinuationManager: {
    executeWithContinuation: vi.fn(),
  },
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
  getEffectiveApiKey: vi.fn((_provider: string, keys: Record<string, string>) => keys?.gemini || ''),
}));

// ---------------------------------------------------------------------------
// Token counting
// ---------------------------------------------------------------------------

describe('countTokens', () => {
  it('should return a positive integer for non-empty text', () => {
    const result = countTokens('hello world');
    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('should return 0 for empty string', () => {
    expect(countTokens('')).toBe(0);
  });

  it('should scale roughly with text length', () => {
    const short = countTokens('hi');
    const long = countTokens('a'.repeat(1000));
    expect(long).toBeGreaterThan(short);
  });
});

// ---------------------------------------------------------------------------
// estimateTokens (provider-specific ratios)
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  const text = 'a'.repeat(100);

  it('should use ~3.5 chars/token for gemini', () => {
    expect(estimateTokens(text, 'gemini')).toBe(Math.ceil(100 / 3.5));
  });

  it('should use ~3.7 chars/token for anthropic', () => {
    expect(estimateTokens(text, 'anthropic')).toBe(Math.ceil(100 / 3.7));
  });

  it('should use ~4.0 chars/token for openai', () => {
    expect(estimateTokens(text, 'openai')).toBe(Math.ceil(100 / 4.0));
  });

  it('should use ~4.0 chars/token for openrouter', () => {
    expect(estimateTokens(text, 'openrouter')).toBe(Math.ceil(100 / 4.0));
  });

  it('should use ~4.0 chars/token for deepseek', () => {
    expect(estimateTokens(text, 'deepseek')).toBe(Math.ceil(100 / 4.0));
  });

  it('should use ~3.8 chars/token for unknown providers', () => {
    expect(estimateTokens(text, 'unknown-provider')).toBe(Math.ceil(100 / 3.8));
  });

  it('should return 0 for empty text', () => {
    expect(estimateTokens('', 'gemini')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Request cancellation
// ---------------------------------------------------------------------------

describe('cancelRequest / cancelAllRequests / cancelCurrentRequest', () => {
  beforeEach(() => {
    cancelAllRequests();
  });

  it('cancelRequest with unknown id should not throw', () => {
    expect(() => cancelRequest('nonexistent-id')).not.toThrow();
  });

  it('cancelAllRequests should not throw when empty', () => {
    expect(() => cancelAllRequests()).not.toThrow();
  });

  it('cancelCurrentRequest should delegate to cancelAllRequests', () => {
    expect(typeof cancelCurrentRequest).toBe('function');
    expect(() => cancelCurrentRequest()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AIService.compressPrompt (static pure method)
// ---------------------------------------------------------------------------

describe('AIService.compressPrompt', () => {
  it('should return the prompt unchanged when under maxTokens', () => {
    const prompt = 'short prompt';
    expect(AIService.compressPrompt(prompt, 100000)).toBe(prompt);
  });

  it('should truncate long prompts with marker', () => {
    const longPrompt = 'x'.repeat(5000);
    const result = AIService.compressPrompt(longPrompt, 100);
    expect(result).toContain('[TRUNCATED FOR LENGTH]');
    expect(result.length).toBeLessThan(longPrompt.length);
  });

  it('should keep both head and tail after truncation', () => {
    const prompt = 'A'.repeat(5000) + 'MIDDLE' + 'B'.repeat(5000);
    const result = AIService.compressPrompt(prompt, 100);
    expect(result.startsWith('A')).toBe(true);
    expect(result.endsWith('B')).toBe(true);
    expect(result).toContain('[TRUNCATED FOR LENGTH]');
  });
});

// ---------------------------------------------------------------------------
// AIService.validateApiKey (tested via execute)
// ---------------------------------------------------------------------------

describe('AIService API key validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw for missing API key on cloud providers', async () => {
    await expect(
      AIService.execute('gemini-2.0-flash', 'gemini', 'test')
    ).rejects.toThrow('requires an API key');
  });

  it('should throw for short Gemini API keys', async () => {
    await expect(
      AIService.execute('gemini-2.0-flash', 'gemini', 'test', 'short')
    ).rejects.toThrow('Invalid gemini API key format');
  });
});

// ---------------------------------------------------------------------------
// AIService.checkStatus
// ---------------------------------------------------------------------------

describe('AIService.checkStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return "no-key" for cloud provider without key', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    const result = await AIService.checkStatus('gemini');
    expect(result).toBe('no-key');
  });

  it('should return "online" for cloud provider with key', async () => {
    const result = await AIService.checkStatus('gemini', 'fake-key-1234567890');
    expect(result).toBe('online');
  });

  it('should return "offline" for ollama when status endpoint fails', async () => {
    vi.mocked(fetchWithAuth).mockRejectedValue(new Error('Connection refused'));

    const result = await AIService.checkStatus('ollama');
    expect(result).toBe('offline');
  });

  it('should return "online" for ollama when activeModelId is present', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ activeModelId: 'llama3' }),
    } as Response);

    const result = await AIService.checkStatus('ollama');
    expect(result).toBe('online');
  });

  it('should return "offline" for ollama when no activeModelId', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    const result = await AIService.checkStatus('ollama');
    expect(result).toBe('offline');
  });
});

// ---------------------------------------------------------------------------
// AIService session tokens
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// AIService deduplication map
// ---------------------------------------------------------------------------

describe('AIService deduplication', () => {
  it('inFlightRequests map should be a Map', () => {
    expect(AIService.inFlightRequests).toBeInstanceOf(Map);
  });
});

// ---------------------------------------------------------------------------
// Provider token differentiation
// ---------------------------------------------------------------------------

describe('provider defaults', () => {
  it('estimateTokens should differentiate providers', () => {
    const text = 'a'.repeat(100);
    // Gemini uses ~3.5 chars/token → fewer tokens than OpenAI at ~4.0 chars/token
    expect(estimateTokens(text, 'gemini')).toBeGreaterThan(
      estimateTokens(text, 'openai')
    );
  });
});
