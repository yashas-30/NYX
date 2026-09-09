import { describe, it, expect } from 'vitest';
import { GROQ_MODELS } from '../src/models/groq';
import { detectProvider, getModelCapabilities, parseTokenCount } from '../src/provider';

describe('Groq Cloud Models Catalog', () => {
  it('contains exactly the 5 curated Groq models matching the official specification', () => {
    expect(GROQ_MODELS).toHaveLength(5);

    const modelIds = GROQ_MODELS.map((m) => m.id);
    expect(modelIds).toEqual([
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'groq/compound',
      'groq/compound-mini',
      'qwen/qwen3.6-27b',
    ]);
  });

  it('sets provider to groq for all 5 models', () => {
    for (const model of GROQ_MODELS) {
      expect(model.provider).toBe('groq');
    }
  });

  it('verifies all 5 models have a 131K (131,072) context window', () => {
    for (const model of GROQ_MODELS) {
      const parsedCtx = parseTokenCount(model.specs?.contextWindow);
      expect(parsedCtx).toBe(131072);
    }
  });

  it('verifies max output limits match the official specs', () => {
    const maxOutMap = Object.fromEntries(
      GROQ_MODELS.map((m) => [m.id, parseTokenCount(m.specs?.maxOutput)])
    );

    // 65K max output
    expect(maxOutMap['openai/gpt-oss-120b']).toBe(65536);
    expect(maxOutMap['openai/gpt-oss-20b']).toBe(65536);

    // 16K max output
    expect(maxOutMap['qwen/qwen3.6-27b']).toBe(16384);

    // 8K max output
    expect(maxOutMap['groq/compound']).toBe(8192);
    expect(maxOutMap['groq/compound-mini']).toBe(8192);
  });

  it('verifies rate limits for free tier', () => {
    for (const model of GROQ_MODELS) {
      expect(model.limits?.rpm).toBe(30);
    }

    const rpdMap = Object.fromEntries(GROQ_MODELS.map((m) => [m.id, m.limits?.rpd]));

    // 1,000 RPD
    expect(rpdMap['openai/gpt-oss-120b']).toBe(1000);
    expect(rpdMap['openai/gpt-oss-20b']).toBe(1000);
    expect(rpdMap['qwen/qwen3.6-27b']).toBe(1000);

    // 250 RPD
    expect(rpdMap['groq/compound']).toBe(250);
    expect(rpdMap['groq/compound-mini']).toBe(250);
  });

  it('verifies text modality and reasoning capabilities', () => {
    for (const model of GROQ_MODELS) {
      expect(model.specs?.modality).toBe('Text');
      expect(model.capabilities?.vision).toBe(false);
      expect(model.capabilities?.toolCalling).toBe(true);
    }

    // Models with thinking/reasoning streams
    const thinkingModels = GROQ_MODELS.filter((m) => m.supportsThinking).map((m) => m.id);
    expect(thinkingModels).toEqual(['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'groq/compound']);

    // Models without thinking streams
    const nonThinkingModels = GROQ_MODELS.filter((m) => !m.supportsThinking).map((m) => m.id);
    expect(nonThinkingModels).toEqual(['groq/compound-mini', 'qwen/qwen3.6-27b']);
  });

  it('correctly resolves provider routing via detectProvider', () => {
    // Unique to Groq
    expect(detectProvider('openai/gpt-oss-120b')).toBe('groq');
    expect(detectProvider('groq/compound')).toBe('groq');
    expect(detectProvider('groq/compound-mini')).toBe('groq');
    expect(detectProvider('qwen/qwen3.6-27b')).toBe('groq');

    // Namespaced Groq prefix
    expect(detectProvider('groq/openai/gpt-oss-120b')).toBe('groq');
    expect(detectProvider('groq/openai/gpt-oss-20b')).toBe('groq');

    // Provider hint routing
    for (const model of GROQ_MODELS) {
      expect(detectProvider(model.id, 'groq')).toBe('groq');
    }

    // Disambiguation for shared model names: openai/gpt-oss-20b
    expect(detectProvider('openai/gpt-oss-20b', 'groq')).toBe('groq');
    expect(detectProvider('openai/gpt-oss-20b', 'nvidia-nim')).toBe('nvidia-nim');
  });
});
