import { describe, it, expect } from 'vitest';
import { NVIDIA_MODELS } from '../src/models/nvidia';
import { detectProvider, getModelCapabilities, parseTokenCount } from '../src/provider';

describe('NVIDIA NIM Curated Models Catalog', () => {
  it('contains exactly the 12 verified models requested', () => {
    expect(NVIDIA_MODELS).toHaveLength(12);

    const modelIds = NVIDIA_MODELS.map((m) => m.id);
    expect(modelIds).toEqual([
      'moonshotai/kimi-k3',
      'deepseek-ai/deepseek-v4-pro-0813',
      'nvidia/nemotron-3.5-lightning-30b-a3b',
      'meta/muse-glimmer-30b',
      'poolside/laguna-xs-2.1',
      'nvidia/nemotron-3-ultra-550b-a55b',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
      'google/gemma-4-31b-it',
      'nvidia/nemotron-3-super-120b-a12b',
      'openai/gpt-oss-20b',
      'meta/llama-3.2-90b-vision-instruct',
      'meta/llama-3.2-11b-vision-instruct',
    ]);
  });

  it('sets provider to nvidia-nim for all 12 models', () => {
    for (const model of NVIDIA_MODELS) {
      expect(model.provider).toBe('nvidia-nim');
    }
  });

  it('accurately specifies context windows for all 12 models', () => {
    const ctxMap = Object.fromEntries(
      NVIDIA_MODELS.map((m) => [m.id, parseTokenCount(m.specs?.contextWindow)])
    );

    // 1M models
    expect(ctxMap['moonshotai/kimi-k3']).toBe(1048576);
    expect(ctxMap['deepseek-ai/deepseek-v4-pro-0813']).toBe(1048576);
    expect(ctxMap['nvidia/nemotron-3.5-lightning-30b-a3b']).toBe(1048576);
    expect(ctxMap['nvidia/nemotron-3-ultra-550b-a55b']).toBe(1048576);
    expect(ctxMap['nvidia/nemotron-3-super-120b-a12b']).toBe(1048576);

    // 262K models
    expect(ctxMap['poolside/laguna-xs-2.1']).toBe(262144);
    expect(ctxMap['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning']).toBe(262144);
    expect(ctxMap['google/gemma-4-31b-it']).toBe(262144);

    // 131K models
    expect(ctxMap['meta/muse-glimmer-30b']).toBe(131072);
    expect(ctxMap['openai/gpt-oss-20b']).toBe(131072);
    expect(ctxMap['meta/llama-3.2-90b-vision-instruct']).toBe(131072);
    expect(ctxMap['meta/llama-3.2-11b-vision-instruct']).toBe(131072);
  });

  it('accurately specifies tool calling capabilities', () => {
    const toolMap = Object.fromEntries(
      NVIDIA_MODELS.map((m) => [m.id, !!m.capabilities?.toolCalling])
    );

    // Models 1..10 support tools
    expect(toolMap['moonshotai/kimi-k3']).toBe(true);
    expect(toolMap['deepseek-ai/deepseek-v4-pro-0813']).toBe(true);
    expect(toolMap['nvidia/nemotron-3.5-lightning-30b-a3b']).toBe(true);
    expect(toolMap['meta/muse-glimmer-30b']).toBe(true);
    expect(toolMap['poolside/laguna-xs-2.1']).toBe(true);
    expect(toolMap['nvidia/nemotron-3-ultra-550b-a55b']).toBe(true);
    expect(toolMap['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning']).toBe(true);
    expect(toolMap['google/gemma-4-31b-it']).toBe(true);
    expect(toolMap['nvidia/nemotron-3-super-120b-a12b']).toBe(true);
    expect(toolMap['openai/gpt-oss-20b']).toBe(true);

    // Vision-only models do NOT support tools
    expect(toolMap['meta/llama-3.2-90b-vision-instruct']).toBe(false);
    expect(toolMap['meta/llama-3.2-11b-vision-instruct']).toBe(false);
  });

  it('accurately specifies structured output capabilities', () => {
    const structMap = Object.fromEntries(
      NVIDIA_MODELS.map((m) => [m.id, !!m.capabilities?.structuredOutput])
    );

    expect(structMap['moonshotai/kimi-k3']).toBe(true);
    expect(structMap['deepseek-ai/deepseek-v4-pro-0813']).toBe(true);
    expect(structMap['nvidia/nemotron-3.5-lightning-30b-a3b']).toBe(true);
    expect(structMap['nvidia/nemotron-3-super-120b-a12b']).toBe(true);
    expect(structMap['openai/gpt-oss-20b']).toBe(true);

    expect(structMap['meta/muse-glimmer-30b']).toBe(false);
    expect(structMap['poolside/laguna-xs-2.1']).toBe(false);
    expect(structMap['nvidia/nemotron-3-ultra-550b-a55b']).toBe(false);
    expect(structMap['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning']).toBe(false);
    expect(structMap['google/gemma-4-31b-it']).toBe(false);
    expect(structMap['meta/llama-3.2-90b-vision-instruct']).toBe(false);
    expect(structMap['meta/llama-3.2-11b-vision-instruct']).toBe(false);
  });

  it('accurately specifies vision/multimodal capabilities', () => {
    const visionMap = Object.fromEntries(
      NVIDIA_MODELS.map((m) => [m.id, !!m.capabilities?.vision])
    );

    expect(visionMap['moonshotai/kimi-k3']).toBe(true);
    expect(visionMap['meta/muse-glimmer-30b']).toBe(true);
    expect(visionMap['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning']).toBe(true);
    expect(visionMap['google/gemma-4-31b-it']).toBe(true);
    expect(visionMap['meta/llama-3.2-90b-vision-instruct']).toBe(true);
    expect(visionMap['meta/llama-3.2-11b-vision-instruct']).toBe(true);

    expect(visionMap['deepseek-ai/deepseek-v4-pro-0813']).toBe(false);
    expect(visionMap['nvidia/nemotron-3.5-lightning-30b-a3b']).toBe(false);
    expect(visionMap['poolside/laguna-xs-2.1']).toBe(false);
    expect(visionMap['nvidia/nemotron-3-ultra-550b-a55b']).toBe(false);
    expect(visionMap['nvidia/nemotron-3-super-120b-a12b']).toBe(false);
    expect(visionMap['openai/gpt-oss-20b']).toBe(false);
  });

  it('routes all 12 models and aliases strictly to nvidia-nim provider', () => {
    const testCases = [
      'moonshotai/kimi-k3',
      'kimi-k3',
      'deepseek-ai/deepseek-v4-pro-0813',
      'deepseek-v4-pro-0813',
      'nvidia/nemotron-3.5-lightning-30b-a3b',
      'nemotron-3.5-lightning-30b-a3b',
      'meta/muse-glimmer-30b',
      'muse-glimmer-30b',
      'poolside/laguna-xs-2.1',
      'laguna-xs-2.1',
      'nvidia/nemotron-3-ultra-550b-a55b',
      'nemotron-3-ultra-550b-a55b',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
      'nemotron-3-nano-omni-30b-a3b-reasoning',
      'google/gemma-4-31b-it',
      'nvidia/nemotron-3-super-120b-a12b',
      'nemotron-3-super-120b-a12b',
      'openai/gpt-oss-20b',
      'gpt-oss-20b',
      'meta/llama-3.2-90b-vision-instruct',
      'llama-3.2-90b-vision-instruct',
      'meta/llama-3.2-11b-vision-instruct',
      'llama-3.2-11b-vision-instruct',
    ];

    for (const tc of testCases) {
      expect(detectProvider(tc)).toBe('nvidia-nim');
    }

    // Google AI Studio's Gemma 4 31B remains under Gemini
    expect(detectProvider('gemma-4-31b-it')).toBe('gemini');
  });

  it('getModelCapabilities extracts full context window and max output tokens', () => {
    const kimiCaps = getModelCapabilities('moonshotai/kimi-k3');
    expect(kimiCaps.contextWindow).toBe(1048576);
    expect(kimiCaps.maxOutputTokens).toBe(65536);
    expect(kimiCaps.supportsVision).toBe(true);
    expect(kimiCaps.supportsReasoning).toBe(true);
    expect(kimiCaps.supportsTools).toBe(true);

    const lagunaCaps = getModelCapabilities('poolside/laguna-xs-2.1');
    expect(lagunaCaps.contextWindow).toBe(262144);
    expect(lagunaCaps.maxOutputTokens).toBe(32768);
    expect(lagunaCaps.supportsTools).toBe(true);

    const llamaVisionCaps = getModelCapabilities('meta/llama-3.2-90b-vision-instruct');
    expect(llamaVisionCaps.contextWindow).toBe(131072);
    expect(llamaVisionCaps.supportsVision).toBe(true);
    expect(llamaVisionCaps.supportsTools).toBe(false);
  });
});
