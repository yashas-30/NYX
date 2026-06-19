import { z } from 'zod';

export const chatInputSchema = z.object({
  message: z
    .string()
    .min(1)
    .max(1024 * 102), // max ~100kb
  sessionId: z.string().max(256).optional(),
});

export const configUpdateSchema = z.object({
  activeEngine: z.enum(['local', 'dialogflow', 'rasa', 'botframework']),
});
