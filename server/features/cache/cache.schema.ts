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

export const cacheSetSchema = z.object({
  key: z.string().min(1).max(2048),
  data: z.any(),
  provider: z.string().min(1).max(64),
  model: z.string().min(1).max(128)
});

export const cacheGetSchema = z.object({
  provider: z.string().min(1).max(64),
  model: z.string().min(1).max(128),
  prompt: z.string().max(65536).optional(),
  systemInstruction: z.string().max(16384).optional(),
  history: z.array(chatMessageSchema).max(500).optional(),
  settings: aiSettingsSchema
});
