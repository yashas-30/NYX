import { describe, it, expect } from 'vitest';
import { OPENROUTER_MODELS } from '../src/models/openrouter';
import { detectProvider, getModelCapabilities, parseTokenCount } from '../src/provider';

describe('OpenRouter Live Free Models Catalog', () => {
  it('contains exactly the 17 current live free models from OpenRouter API', () => {
    expect(OPENROUTER_MODELS).toHaveLength(17);

    const modelIds = OPENROUTER_MODELS.map((m) => m.id);
    expect(modelIds).toEqual([
      'inclusionai/ling-3.0-flash-sante:free',
      'inclusionai/ling-3.0-flash-fin:free',
      'dots-studio/dots-3-note-preview:free',
      'liquid/lfm-2.5-2.6b:free',
      'nvidia/nemotron-3.5-lightning:free',
      'thinkingmachines/inkling-small:free',
      'poolside/laguna-s-2.1:free',
      'thinkingmachines/inkling:free',
      'poolside/laguna-xs-2.1:free',
      'cohere/north-mini-code:free',
      'nvidia/nemotron-3.5-content-safety:free',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      'google/gemma-4-26b-a4b-it:free',
      'google/gemma-4-31b-it:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'openrouter/free',
    ]);
  });

  it('sets provider to openrouter for all 17 models', () => {
    for (const model of OPENROUTER_MODELS) {
      expect(model.provider).toBe('openrouter');
    }
  });

  it('contains exclusively free models (all ending with :free or openrouter/free)', () => {
    for (const model of OPENROUTER_MODELS) {
      const isFree = model.id.endsWith(':free') || model.id === 'openrouter/free';
      expect(isFree).toBe(true);
    }
  });

  it('accurately specifies context windows for all free models', () => {
    const ctxMap = Object.fromEntries(
      OPENROUTER_MODELS.map((m) => [m.id, parseTokenCount(m.specs?.contextWindow)])
    );

    // 1M models
    expect(ctxMap['nvidia/nemotron-3.5-lightning:free']).toBe(1000000);
    expect(ctxMap['thinkingmachines/inkling-small:free']).toBe(1048576);
    expect(ctxMap['thinkingmachines/inkling:free']).toBe(1048576);
    expect(ctxMap['nvidia/nemotron-3-ultra-550b-a55b:free']).toBe(1000000);

    // 512K model
    expect(ctxMap['dots-studio/dots-3-note-preview:free']).toBe(512000);

    // 262K / 256K models
    expect(ctxMap['inclusionai/ling-3.0-flash-sante:free']).toBe(262144);
    expect(ctxMap['inclusionai/ling-3.0-flash-fin:free']).toBe(262144);
    expect(ctxMap['poolside/laguna-s-2.1:free']).toBe(262144);
    expect(ctxMap['poolside/laguna-xs-2.1:free']).toBe(262144);
    expect(ctxMap['cohere/north-mini-code:free']).toBe(256000);
    expect(ctxMap['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free']).toBe(256000);
    expect(ctxMap['google/gemma-4-26b-a4b-it:free']).toBe(262144);
    expect(ctxMap['google/gemma-4-31b-it:free']).toBe(262144);
    expect(ctxMap['nvidia/nemotron-3-super-120b-a12b:free']).toBe(262144);

    // 200K Free Router
    expect(ctxMap['openrouter/free']).toBe(200000);

    // 128K model
    expect(ctxMap['nvidia/nemotron-3.5-content-safety:free']).toBe(128000);

    // 65K model
    expect(ctxMap['liquid/lfm-2.5-2.6b:free']).toBe(65536);
  });

  it('routes every free model ID to openrouter via detectProvider', () => {
    for (const model of OPENROUTER_MODELS) {
      expect(detectProvider(model.id)).toBe('openrouter');
    }
  });

  it('maintains strict isolation for Gemma 4 31B across Google, NVIDIA, and OpenRouter', () => {
    expect(detectProvider('google/gemma-4-31b-it:free')).toBe('openrouter');
    expect(detectProvider('google/gemma-4-31b-it')).toBe('nvidia-nim');
    expect(detectProvider('gemma-4-31b-it')).toBe('gemini');
  });

  it('getModelCapabilities parses vision and structured output for OpenRouter free models', () => {
    const dotsCaps = getModelCapabilities('dots-studio/dots-3-note-preview:free');
    expect(dotsCaps.contextWindow).toBe(512000);
    expect(dotsCaps.maxOutputTokens).toBe(460800);
    expect(dotsCaps.supportsVision).toBe(true);
    expect(dotsCaps.supportsTools).toBe(true);

    const inklingCaps = getModelCapabilities('thinkingmachines/inkling:free');
    expect(inklingCaps.contextWindow).toBe(1048576);
    expect(inklingCaps.maxOutputTokens).toBe(262144);
    expect(inklingCaps.supportsVision).toBe(true);
  });
});
