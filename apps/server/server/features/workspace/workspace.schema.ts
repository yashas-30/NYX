import { z } from 'zod';

export const workspaceSchema = z.object({
  path: z.string().min(1).max(1024),
});
