import { z } from 'zod';

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'model']),
  content: z.string().max(10 * 1024 * 1024)
});

export const conversationSchema = z.object({
  id: z.string().min(1).max(256),
  title: z.string().max(1024),
  messages: z.array(chatMessageSchema).max(10000),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive()
});

export const exportSchema = z.object({
  format: z.enum(['markdown', 'json'])
});
