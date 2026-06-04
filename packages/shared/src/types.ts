import { z } from 'zod';

// Provider definition
export type ModelProvider = 'gemini' | 'terminal' | 'nyx-native' | 'antigravity-sdk';
export type Provider = ModelProvider;

// Telemetry Metrics schema and type
export const TelemetryMetricsSchema = z.object({
  latency: z.number(),
  tokens: z.number(),
  tps: z.number(),
  ttft: z.number().optional(),
});
export type TelemetryMetrics = z.infer<typeof TelemetryMetricsSchema>;

// AISettings schema and type
export const AISettingsSchema = z.object({
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().optional(),
  repeatPenalty: z.number().optional(),
  gpuLayers: z.number().optional(),
  threads: z.number().optional(),
  contextSize: z.number().optional(),
  batchSize: z.number().optional(),
  mirostat: z.number().optional(),
  antigravity: z.boolean().optional(),
});
export type AISettings = z.infer<typeof AISettingsSchema>;

// ChatMessage schema and type
export const ChatMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant', 'system', 'model']),
  content: z.string(),
  timestamp: z.number().optional(),
  status: z.enum(['success', 'error', 'stopped', 'loading', 'complete']).optional(),
  metrics: z.any().optional(),
  rolloutId: z.string().optional(),
  reward: z.number().nullable().optional(),
  isPinned: z.boolean().optional(),
  images: z.array(z.object({
    name: z.string(),
    mimeType: z.string().optional(),
    data: z.string().optional(), // base64
    url: z.string().optional(),
  })).optional(),
  reasoning: z.string().optional(),
  toolCalls: z.array(z.any()).optional(),
  citations: z.array(z.any()).optional(),
  artifacts: z.array(z.any()).optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// Model Specs schema and type
export const ModelSpecsSchema = z.object({
  contextWindow: z.string(),
  trainingData: z.string(),
  maxOutput: z.string(),
  modality: z.string(),
  parameters: z.string().optional(),
});
export type ModelSpecs = z.infer<typeof ModelSpecsSchema>;

// ModelOption schema and type
export const ModelOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.enum(['gemini', 'terminal', 'nyx-native', 'antigravity-sdk']),
  description: z.string(),
  isLocal: z.boolean().optional(),
  specs: ModelSpecsSchema.optional(),
});
export type ModelOption = z.infer<typeof ModelOptionSchema>;

// Shared Constants
export const PORTS = {
  WEB: 3000,
  API: 3010,
  FASTIFY: 3001,
  SCRAPLING: 3002,
  ANTIGRAVITY: 3003,
  FALLBACK: 12345,
};

export const CONTEXT_SIZES = {
  DEFAULT: 2048,
  COMPLEX: 4096,
  ENTERPRISE: 8192,
};

export const TOKEN_ESTIMATE_DIVISORS = {
  DEFAULT: 4,
  TIGHT: 3.8,
};

export const LOCAL_MODEL_PORT = 12345;

