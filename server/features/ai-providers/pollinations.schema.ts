import { z } from 'zod';
import { aiSettingsSchema, chatMessageSchema } from './shared.schema.ts';

export const pollinationsStreamSchema = z.object({
  model: z.string().min(1).max(256),
  prompt: z.string().min(1).max(65536),
  settings: aiSettingsSchema,
  systemInstruction: z.string().max(16384).optional(),
  history: z.array(chatMessageSchema).max(500).optional(),
});
