import { z } from 'zod';

const genericKeySchema = z.string().min(1).max(512).trim();

// Vault store: accepts any string values (including empty strings for clearing keys)
export const vaultStoreSchema = z.object({
  keys: z.record(z.string(), z.string()).refine((val) => Object.keys(val).length <= 100, {
    message: 'Keys object can contain at most 100 entries',
  }),
});

export const vaultStoreKeySchema = z.object({
  provider: z.string().min(1).max(64).trim(),
  key: genericKeySchema,
});

export const vaultDeleteKeySchema = z.object({
  provider: z.string().min(1).max(64).trim(),
});

export const vaultValidateSchema = z.object({
  provider: z.enum(['gemini', 'scrapling']),
  key: genericKeySchema.optional(),
  scraplingUrl: z.string().optional(),
});
