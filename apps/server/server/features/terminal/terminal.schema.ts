import { z } from 'zod';

export const terminalRunSchema = z.object({
  command: z.string().min(1).max(2048).trim(),
  cwd: z.string().max(1024).optional(),
});

export const terminalPromptSchema = z.object({
  nodeId: z.string().max(256).optional(),
  prompt: z.string().min(1).max(2048).trim(),
  cwd: z.string().max(1024).optional(),
});
