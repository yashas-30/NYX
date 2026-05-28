import { z } from 'zod';

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'model']),
  content: z.string().max(10 * 1024 * 1024),
  images: z
    .array(
      z.object({
        name: z.string().max(256),
        mimeType: z.string().max(128),
        data: z.string().max(10 * 1024 * 1024),
      })
    )
    .optional(),
});

export const aiSettingsSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(1).max(131072).optional(),
    topP: z.number().min(0).max(1).optional(),
    topK: z.number().int().min(1).max(100).optional(),
    stream: z.boolean().optional(),
  })
  .optional();

export const gatewayUrlsSchema = z.record(z.string(), z.string().url()).optional();

export const imagesSchema = z
  .array(
    z.object({
      name: z.string().max(256),
      mimeType: z.string().max(128),
      data: z.string().max(10 * 1024 * 1024),
    })
  )
  .optional();
