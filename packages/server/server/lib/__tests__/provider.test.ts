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
    it('detects local GGUF model patterns', () => {
      expect(detectProvider('nyx-gemma-4-e2b-it')).toBe('ollama');
      expect(detectProvider('my-model.gguf')).toBe('ollama');
    });

    it('detects custom patterns as nyx-native', () => {
      expect(detectProvider('custom-my-model')).toBe('ollama');
    });

    it('throws error for unknown patterns', () => {
      expect(() => detectProvider('my-strange-local-model')).toThrow('Unknown model');
      expect(() => detectProvider('')).toThrow('Model ID is required');
    });

    it('defaults to Gemini for gemini model IDs', () => {
      expect(detectProvider('gemini-2.5-flash-preview-05-20')).toBe('gemini');
    });
  });

  describe('isLocalModel', () => {
    it('returns true for known local model IDs', () => {
      expect(isLocalModel('nyx-gemma-4-e2b-it')).toBe(true);
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
    });
  });

  describe('getEffectiveApiKey', () => {
    it('retrieves and trims non-empty keys correctly', () => {
      const keys = { gemini: '  my-gemini-key  ' };
      expect(getEffectiveApiKey('gemini', keys)).toBe('my-gemini-key');
    });
  });
});
