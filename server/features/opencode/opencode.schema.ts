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

const gatewayUrlsSchema = z.record(z.string(), z.string().url()).optional();

export const opencodeStreamSchema = z.object({
  model: z.string().min(1).max(256),
  prompt: z.string().min(1).max(65536),
  apiKey: z.string().max(512).optional(),
  settings: aiSettingsSchema,
  systemInstruction: z.string().max(16384).optional(),
  history: z.array(chatMessageSchema).max(500).optional(),
  gatewayUrls: gatewayUrlsSchema,
});
