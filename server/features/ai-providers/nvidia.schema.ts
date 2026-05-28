import { z } from 'zod';
import {
  aiSettingsSchema,
  chatMessageSchema,
  gatewayUrlsSchema,
  imagesSchema,
} from './shared.schema.ts';

export const nvidiaStreamSchema = z.object({
  model: z.string().min(1).max(256),
  prompt: z
    .string()
    .min(1)
    .max(10 * 1024 * 1024),
  apiKey: z
    .string()
    .regex(/^nvapi-/)
    .max(512)
    .optional(),
  settings: aiSettingsSchema,
  systemInstruction: z.string().max(16384).optional(),
  history: z.array(chatMessageSchema).max(500).optional(),
  gatewayUrls: gatewayUrlsSchema,
  images: imagesSchema,
});
