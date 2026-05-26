import { describe, it, expect } from 'vitest';
import {
  detectProvider,
  getProviderForModel,
  isLocalModel,
  requiresApiKey,
  getEffectiveApiKey
} from '../../../src/core/utils/provider.ts';

describe('AI Provider Utility Functions', () => {
  describe('detectProvider', () => {
    it('detects OpenCode provider patterns', () => {
      expect(detectProvider('opencode/qwen-coder')).toBe('opencode');
      expect(detectProvider('opencode-custom-model')).toBe('opencode');
    });

    it('detects Pollinations provider patterns', () => {
      expect(detectProvider('pollinations/text-model')).toBe('pollinations');
      expect(detectProvider('pollinations-image-gen')).toBe('pollinations');
    });

    it('detects OpenRouter patterns for slash-separated unknown models', () => {
      expect(detectProvider('meta-llama/llama-3-8b')).toBe('openrouter');
      expect(detectProvider('mistralai/mistral-7b')).toBe('openrouter');
    });

    it('defaults to Gemini for unknown patterns without slashes', () => {
      expect(detectProvider('my-strange-local-model')).toBe('gemini');
    });
  });

  describe('isLocalModel', () => {
    it('returns true for known local model IDs', () => {
      expect(isLocalModel('nyx-gemma-4-e2b-it')).toBe(true);
    });

    it('returns false for cloud models', () => {
      expect(isLocalModel('gemini-1.5-pro')).toBe(false);
      expect(isLocalModel('opencode/minimax')).toBe(false);
    });
  });

  describe('requiresApiKey', () => {
    it('returns true for cloud models requiring keys', () => {
      expect(requiresApiKey('gemini')).toBe(true);
      expect(requiresApiKey('nvidia')).toBe(true);
      expect(requiresApiKey('openrouter')).toBe(true);
      expect(requiresApiKey('opencode')).toBe(true);
    });

    it('returns false for local and free providers', () => {
      expect(requiresApiKey('nyx-native')).toBe(false);
      expect(requiresApiKey('qwen-local')).toBe(false);
      expect(requiresApiKey('pollinations')).toBe(false);
    });
  });

  describe('getEffectiveApiKey', () => {
    it('retrieves and trims non-empty keys correctly', () => {
      const keys = { gemini: '  my-gemini-key  ', openrouter: '' };
      expect(getEffectiveApiKey('gemini', keys)).toBe('my-gemini-key');
      expect(getEffectiveApiKey('openrouter', keys)).toBeUndefined();
      expect(getEffectiveApiKey('nvidia', keys)).toBeUndefined();
    });
  });
});
