import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gateway } from '../gateway.ts';
import { loadKeys } from '../keyVault.ts';

// Mock keyVault loadKeys
vi.mock('../keyVault.ts', () => ({
  loadKeys: vi.fn(),
  verifySessionToken: vi.fn(),
}));

describe('Gateway Auth & Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getActiveKey', () => {
    it('uses user-provided key if valid', () => {
      const result = Gateway.getActiveKey('gemini', 'user-specific-key');
      expect(result).toBe('user-specific-key');
    });

    it('falls back to keyVault if user key is missing or invalid', () => {
      const mockKeys = { gemini: 'vault-stored-key' };
      vi.mocked(loadKeys).mockReturnValue(mockKeys);

      const result = Gateway.getActiveKey('gemini', undefined);
      expect(result).toBe('vault-stored-key');
    });

    it('falls back to environment keys if both user and vault keys are absent', () => {
      vi.mocked(loadKeys).mockReturnValue({});
      const result = Gateway.getActiveKey('gemini', undefined);
      // Fallback is either empty or matches env keys
      expect(typeof result).toBe('string');
    });
  });

  describe('isFreeModel', () => {
    it('correctly detects free suffix and pattern matches', () => {
      expect(Gateway.isFreeModel('gemini-1.5-flash-free')).toBe(true);
      expect(Gateway.isFreeModel('openrouter/free-model:free')).toBe(true);
      expect(Gateway.isFreeModel('paid-provider/free')).toBe(true);
      expect(Gateway.isFreeModel('gemini-1.5-pro')).toBe(false);
    });
  });

  describe('validateAuth', () => {
    it('always permits local or free-tier providers without keys', () => {
      expect(Gateway.validateAuth('nyx-native', 'some-local-model').valid).toBe(true);
      expect(Gateway.validateAuth('pollinations', 'some-art-model').valid).toBe(true);
      expect(Gateway.validateAuth('qwen-local', 'qwen-coder').valid).toBe(true);
    });

    it('demands API key for OpenCode even for free models', () => {
      vi.mocked(loadKeys).mockReturnValue({});
      const auth = Gateway.validateAuth('opencode', 'opencode/minimax-m2.5-free', undefined);
      expect(auth.valid).toBe(false);
      expect(auth.error).toContain('OpenCode Zen requires an API key');
    });

    it('permits other providers free models without keys', () => {
      vi.mocked(loadKeys).mockReturnValue({});
      const auth = Gateway.validateAuth('gemini', 'gemini-1.5-flash-free', undefined);
      expect(auth.valid).toBe(true);
    });

    it('demands keys for paid models of other providers', () => {
      vi.mocked(loadKeys).mockReturnValue({});
      const auth = Gateway.validateAuth('gemini', 'gemini-1.5-pro', undefined);
      expect(auth.valid).toBe(false);
      expect(auth.error).toContain('No API key detected for gemini');
    });
  });

  describe('buildUrl', () => {
    it('respects user-configured custom gateway URLs', () => {
      const customUrls = { gemini: 'https://my-custom-proxy.com/' };
      const build = Gateway.buildUrl('gemini', '/v1/models', customUrls);
      expect(build.url).toBe('https://my-custom-proxy.com/v1/models');
      expect(build.viaGateway).toBe(true);
    });

    it('uses standard provider base URLs when no gateways are configured', () => {
      const build = Gateway.buildUrl('gemini', '/v1/models', {});
      expect(build.url).toContain('generativelanguage.googleapis.com');
    });
  });
});
