import { describe, it, expect } from 'vitest';
import { detectProvider, getModelCapabilities, getProviderForModel } from '../src/provider';
import { GEMINI_MODELS } from '../src/models/gemini';
import { NVIDIA_MODELS } from '../src/models/nvidia';
import { GROQ_MODELS } from '../src/models/groq';
import { MISTRAL_MODELS } from '../src/models/mistral';
import { OPENROUTER_MODELS } from '../src/models/openrouter';

describe('Catalog-Driven Provider Resolution & Disambiguation', () => {
  describe('Gemma 4 31B Isolation across Distinct Endpoints', () => {
    it('resolves Google AI Studio Gemma 4 31B to gemini provider', () => {
      // From Google AI Studio (packages/shared/src/models/gemini.ts)
      expect(detectProvider('gemma-4-31b-it')).toBe('gemini');
      expect(getProviderForModel('gemma-4-31b-it')).toBe('gemini');

      const caps = getModelCapabilities('gemma-4-31b-it');
      expect(caps.contextWindow).toBe(262144);
      expect(caps.maxOutputTokens).toBe(32768);
      expect(caps.supportsVision).toBe(true);
      expect(caps.supportsTools).toBe(true);
    });

    it('resolves NVIDIA NIM Gemma 4 31B to nvidia-nim provider', () => {
      // From NVIDIA NIM (packages/shared/src/models/nvidia.ts)
      expect(detectProvider('google/gemma-4-31b-it')).toBe('nvidia-nim');
      expect(getProviderForModel('google/gemma-4-31b-it')).toBe('nvidia-nim');

      const caps = getModelCapabilities('google/gemma-4-31b-it');
      expect(caps.contextWindow).toBe(262144);
      expect(caps.maxOutputTokens).toBe(32768);
      expect(caps.supportsVision).toBe(true);
      expect(caps.supportsTools).toBe(true);
    });

    it('resolves OpenRouter Gemma 4 31B to openrouter provider', () => {
      // From OpenRouter (packages/shared/src/models/openrouter.ts)
      expect(detectProvider('google/gemma-4-31b-it:free')).toBe('openrouter');
      expect(getProviderForModel('google/gemma-4-31b-it:free')).toBe('openrouter');
    });

    it('respects providerHint for Gemma disambiguation', () => {
      expect(detectProvider('gemma-4-31b-it', 'gemini')).toBe('gemini');
      expect(detectProvider('gemma-4-31b-it', 'nvidia-nim')).toBe('nvidia-nim');
    });
  });

  describe('NVIDIA NIM Curated Models Catalog Resolution', () => {
    it('resolves all 12 official NVIDIA NIM models by full ID', () => {
      for (const model of NVIDIA_MODELS) {
        expect(detectProvider(model.id)).toBe('nvidia-nim');
      }
    });

    it('resolves all NVIDIA NIM models by un-namespaced alias/basename', () => {
      const aliases = [
        'kimi-k3',
        'deepseek-v4-pro-0813',
        'nemotron-3.5-lightning-30b-a3b',
        'muse-glimmer-30b',
        'laguna-xs-2.1',
        'nemotron-3-ultra-550b-a55b',
        'nemotron-3-nano-omni-30b-a3b-reasoning',
        'nemotron-3-super-120b-a12b',
        'gpt-oss-20b',
        'llama-3.2-90b-vision-instruct',
        'llama-3.2-11b-vision-instruct',
      ];

      for (const alias of aliases) {
        expect(detectProvider(alias)).toBe('nvidia-nim');
      }
    });

    it('isolates NVIDIA NIM Nemotron Super 120B from OpenRouter Nemotron Super 120B:free', () => {
      expect(detectProvider('nvidia/nemotron-3-super-120b-a12b')).toBe('nvidia-nim');
      expect(detectProvider('nvidia/nemotron-3-super-120b-a12b:free')).toBe('openrouter');
    });

    it('isolates NVIDIA NIM GPT OSS 20B from Groq GPT OSS 120B', () => {
      expect(detectProvider('openai/gpt-oss-20b')).toBe('nvidia-nim');
      expect(detectProvider('openai/gpt-oss-120b')).toBe('groq');
    });

    it('disambiguates shared model IDs using providerHint', () => {
      expect(detectProvider('openai/gpt-oss-20b', 'nvidia-nim')).toBe('nvidia-nim');
      expect(detectProvider('openai/gpt-oss-20b', 'groq')).toBe('groq');
    });
  });

  describe('Other Providers Preservation & Cross-Provider Integrity', () => {
    it('resolves all Gemini models directly from gemini catalog', () => {
      for (const model of GEMINI_MODELS) {
        expect(detectProvider(model.id)).toBe('gemini');
      }
    });

    it('resolves Groq models with providerHint or unique IDs', () => {
      for (const model of GROQ_MODELS) {
        expect(detectProvider(model.id, 'groq')).toBe('groq');
      }
      expect(detectProvider('openai/gpt-oss-120b')).toBe('groq');
      expect(detectProvider('groq/compound')).toBe('groq');
      expect(detectProvider('groq/compound-mini')).toBe('groq');
      expect(detectProvider('qwen/qwen3.6-27b')).toBe('groq');
    });

    it('resolves all Mistral models directly from mistral catalog', () => {
      for (const model of MISTRAL_MODELS) {
        expect(detectProvider(model.id)).toBe('mistral');
      }
    });

    it('resolves OpenRouter models correctly', () => {
      for (const model of OPENROUTER_MODELS) {
        expect(detectProvider(model.id)).toBe('openrouter');
      }
    });

    it('resolves local/native model formats to nyx-native', () => {
      expect(detectProvider('llama-3-8b.gguf')).toBe('nyx-native');
      expect(detectProvider('mistral-7b-instruct.safetensors')).toBe('nyx-native');
      expect(detectProvider('ollama/llama3')).toBe('nyx-native');
      expect(detectProvider('vllm/model')).toBe('nyx-native');
      expect(detectProvider('local/my-model')).toBe('nyx-native');
    });
  });
});
