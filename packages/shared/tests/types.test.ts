import { describe, it, expect } from 'vitest';
import {
  TelemetryMetricsSchema,
  AISettingsSchema,
  ChatMessageSchema,
  ModelSpecsSchema,
  ModelOptionSchema,
} from '../src/types';

describe('Shared Zod Schemas', () => {
  describe('TelemetryMetricsSchema', () => {
    it('validates correct metrics', () => {
      const valid = {
        latency: 120,
        tokens: 50,
        tps: 25.5,
        ttft: 45,
      };
      const result = TelemetryMetricsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('fails validation on missing required fields', () => {
      const invalid = {
        latency: 120,
      };
      const result = TelemetryMetricsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('AISettingsSchema', () => {
    it('validates empty/optional settings', () => {
      const valid = {};
      const result = AISettingsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('validates correct settings', () => {
      const valid = {
        temperature: 0.7,
        maxTokens: 1024,
        antigravity: true,
      };
      const result = AISettingsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe('ChatMessageSchema', () => {
    it('validates a correct user message', () => {
      const valid = {
        role: 'user',
        content: 'Hello, World!',
      };
      const result = ChatMessageSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('fails validation with invalid role', () => {
      const invalid = {
        role: 'invalid-role',
        content: 'Hello',
      };
      const result = ChatMessageSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('ModelSpecsSchema', () => {
    it('validates valid model specs', () => {
      const valid = {
        contextWindow: '8k',
        trainingData: '2023',
        maxOutput: '4k',
        modality: 'text',
      };
      const result = ModelSpecsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe('ModelOptionSchema', () => {
    it('validates correct model options', () => {
      const valid = {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        provider: 'gemini',
        description: 'Advanced model',
      };
      const result = ModelOptionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('validates nvidia-nim model options', () => {
      const valid = {
        id: 'nvidia/nemotron-3-super-120b-a12b',
        name: 'Nemotron 3 Super 120B',
        provider: 'nvidia-nim',
        description: 'NVIDIA NIM flagship model',
      };
      const result = ModelOptionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('validates groq model options', () => {
      const valid = {
        id: 'openai/gpt-oss-120b',
        name: 'GPT OSS 120B (Groq LPU)',
        provider: 'groq',
        description: 'Groq LPU accelerated model',
      };
      const result = ModelOptionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('validates mistral model options', () => {
      const valid = {
        id: 'mistral-large-latest',
        name: 'Mistral Large 3',
        provider: 'mistral',
        description: 'Mistral AI flagship model',
      };
      const result = ModelOptionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });
});
