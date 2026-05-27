import { z } from 'zod';

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'model']),
  content: z.string().max(65536)
});

const aiSettingsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(131072).optional(),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().int().min(1).max(100).optional(),
  stream: z.boolean().optional()
}).optional();

const inferenceSettingsSchema = z.object({
  gpuLayers: z.number().int().min(0).max(999).optional(),
  threads: z.number().int().min(1).max(256).optional(),
  contextSize: z.number().int().min(512).max(131072).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(131072).optional()
}).optional();

export const localModelStartSchema = z.object({
  modelId: z.string().min(1).max(256),
  settings: inferenceSettingsSchema
});

export const localModelDownloadSchema = z.object({
  modelId: z.string().min(1).max(512)
});

export const localModelDeleteSchema = z.object({
  modelId: z.string().min(1).max(256)
});

export const localModelChatSchema = z.object({
  model: z.string().min(1).max(256),
  messages: z.array(chatMessageSchema).min(1).max(500),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(131072).optional()
});

export const qwenLocalStreamSchema = z.object({
  model: z.string().min(1).max(256).optional(),
  prompt: z.string().min(1).max(65536),
  settings: aiSettingsSchema,
  systemInstruction: z.string().max(16384).optional(),
  history: z.array(chatMessageSchema).max(500).optional(),
});
