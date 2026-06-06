import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.string().default('3000'),
  NYX_MASTER_KEY: z.string().min(32).default('00000000000000000000000000000000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CACHE_TTL: z.string().default('86400'),
  MAX_REQUESTS_PER_MINUTE: z.string().default('100'),
  UNLEASH_URL: z.string().url().optional(),
  UNLEASH_API_KEY: z.string().optional()
});

export const config = configSchema.parse(process.env);
