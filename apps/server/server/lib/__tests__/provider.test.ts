import { describe, it, expect } from 'vitest';
import {
  detectProvider,
  getProviderForModel,
  isLocalModel,
  requiresApiKey,
  getEffectiveApiKey,
} from '@nyx/shared';

describe('AI Provider Utility Functions', () => {
  describe('detectProvider', () => {
    it('detects local model patterns', () => {
      expect(detectProvider('llama3:latest')).toBe('ollama');
      expect(detectProvider('lmstudio-community')).toBe('lmstudio');
    });

    it('throws error for unknown patterns', () => {
      expect(() => detectProvider('my-strange-local-model')).toThrow();
      expect(() => detectProvider('')).toThrow();
    });

    it('defaults to Gemini for gemini model IDs', () => {
      expect(detectProvider('gemini-2.5-flash-preview-05-20')).toBe('gemini');
    });
  });

  describe('isLocalModel', () => {
    it('returns true for known local model IDs', () => {
      expect(isLocalModel('llama3:latest')).toBe(true);
      expect(isLocalModel('lmstudio-community')).toBe(true);
    });

    it('returns false for cloud models', () => {
      expect(isLocalModel('gemini-1.5-pro')).toBe(false);
    });
  });

  describe('requiresApiKey', () => {
    it('returns true for gemini', () => {
      expect(requiresApiKey('gemini')).toBe(true);
    });

    it('returns false for local providers', () => {
      expect(requiresApiKey('ollama')).toBe(false);
      expect(requiresApiKey('lmstudio')).toBe(false);
    });
  });

  describe('getEffectiveApiKey', () => {
    it('retrieves and trims non-empty keys correctly', () => {
      const keys = { gemini: '  my-gemini-key  ' };
      expect(getEffectiveApiKey('gemini', keys)).toBe('my-gemini-key');
    });
  });
});
