import { z } from 'zod';

export const nyxCriticSchema = z.object({
  prompt: z.string().min(1).max(32768),
  response: z.string().min(1).max(65536),
  modelId: z.string().max(256).optional(),
  provider: z.string().max(64).optional(),
});

export const nyxSearchSchema = z.object({
  query: z.string().min(1).max(1024).trim(),
});

export const writeFileSchema = z.object({
  filePath: z.string().min(1).max(1024),
  content: z.string().max(10 * 1024 * 1024), // 10MB max file write
  overwrite: z.boolean().optional(),
});
