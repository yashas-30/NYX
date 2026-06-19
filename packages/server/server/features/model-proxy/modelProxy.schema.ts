import { z } from 'zod';

export const modelQuerySchema = z.object({
  provider: z.string().min(1).max(64),
});
