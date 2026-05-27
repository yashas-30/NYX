import { z } from 'zod';

export const rulesResetSchema = z.object({
  confirm: z.literal(true)
});
