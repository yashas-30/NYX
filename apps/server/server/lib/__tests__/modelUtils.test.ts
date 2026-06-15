import { describe, it, expect } from 'vitest';
import { resolveRealGeminiModel, ABSTENTION_INSTRUCTION } from '../modelUtils.js';

describe('modelUtils', () => {
  describe('ABSTENTION_INSTRUCTION', () => {
    it('should export a valid abstention instruction string', () => {
      expect(typeof ABSTENTION_INSTRUCTION).toBe('string');
      expect(ABSTENTION_INSTRUCTION.length).toBeGreaterThan(0);
      expect(ABSTENTION_INSTRUCTION).toContain("I don't have enough context to answer this reliably");
    });
  });

  describe('resolveRealGeminiModel', () => {
    it('should resolve standard user-facing IDs to canonical Gemini API model IDs', () => {
      expect(resolveRealGeminiModel('gemini-3.5-flash')).toBe('gemini-3.5-flash');
      expect(resolveRealGeminiModel('gemini-3-flash')).toBe('gemini-3-flash-preview');
      expect(resolveRealGeminiModel('gemini-3.5-pro')).toBe('gemini-3.5-pro');
      expect(resolveRealGeminiModel('gemma-4-26b-it')).toBe('gemma-4-26b-a4b-it');
    });

    it('should pass through unknown model IDs unchanged', () => {
      expect(resolveRealGeminiModel('unknown-model-id')).toBe('unknown-model-id');
      expect(resolveRealGeminiModel('llama-3.1-8b')).toBe('llama-3.1-8b');
    });
  });
});
