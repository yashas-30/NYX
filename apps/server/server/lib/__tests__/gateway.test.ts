import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Gateway } from '../gateway.js';
import { getKeysSync } from '../../features/vault/vault.service.js';

// Mock vault.service getKeysSync
vi.mock('../../features/vault/vault.service.js', () => ({
  getKeysSync: vi.fn(),
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
      vi.mocked(getKeysSync).mockReturnValue(mockKeys);

      const result = Gateway.getActiveKey('gemini', undefined);
      expect(result).toBe('vault-stored-key');
    });

    it('falls back to environment keys if both user and vault keys are absent', () => {
      vi.mocked(getKeysSync).mockReturnValue({});
      const result = Gateway.getActiveKey('gemini', undefined);
      expect(typeof result).toBe('string');
    });
  });

  describe('validateAuth', () => {
    it('always permits local providers without keys', () => {
      expect(Gateway.validateAuth('ollama', 'llama3').valid).toBe(true);
    });

    it('demands keys for gemini when not configured', () => {
      vi.mocked(getKeysSync).mockReturnValue({});
      const auth = Gateway.validateAuth('gemini', 'gemini-2.5-pro', undefined);
      expect(auth.valid).toBe(false);
      expect(auth.error).toContain('No API key detected for gemini');
    });

    it('permits gemini when key is configured', () => {
      vi.mocked(getKeysSync).mockReturnValue({ gemini: 'some-key' });
      const auth = Gateway.validateAuth('gemini', 'gemini-2.5-pro', undefined);
      expect(auth.valid).toBe(true);
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
