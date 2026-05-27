import { z } from 'zod';
import { aiSettingsSchema, chatMessageSchema, gatewayUrlsSchema } from './shared.schema.ts';

export const openrouterStreamSchema = z.object({
  model: z.string().min(1).max(256),
  prompt: z.string().min(1).max(65536),
  apiKey: z.string().min(1).max(512),
  settings: aiSettingsSchema,
  systemInstruction: z.string().max(16384).optional(),
  history: z.array(chatMessageSchema).max(500).optional(),
  gatewayUrls: gatewayUrlsSchema,
});
