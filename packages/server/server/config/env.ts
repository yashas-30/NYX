import 'dotenv/config';
import { z } from 'zod';
import { PORTS, LOCAL_MODEL_PORT } from '@nyx/shared';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z
      .string()
      .default(String(PORTS.API))
      .transform((val) => parseInt(val, 10)),
    SENTRY_DSN: z.string().url().optional().or(z.literal('')),
    SCRAPLING_PORT: z
      .string()
      .default(String(PORTS.SCRAPLING))
      .transform((val) => parseInt(val, 10)),
    ANTIGRAVITY_PORT: z
      .string()
      .default(String(PORTS.ANTIGRAVITY))
      .transform((val) => parseInt(val, 10)),
    LLAMA_PORT: z
      .string()
      .default(String(LOCAL_MODEL_PORT))
      .transform((val) => parseInt(val, 10)),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    OTLP_TRACE_ENDPOINT: z.string().url().optional().or(z.literal('')),
    RABBITMQ_URL: z.string().default('amqp://localhost'),
    REDIS_HOST: z.string().optional(),
    REDIS_PORT: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : undefined)),
    NYX_WORKSPACE_ROOT: z.string().optional(),
    NYX_PYTHON_PATH: z.string().optional(),
    NYX_MASTER_KEY: z
      .string()
      .min(32, 'NYX_MASTER_KEY must be at least 32 characters long')
      .optional()
      .or(z.literal('')),
    NYX_ALLOW_RAW_TERMINAL: z
      .string()
      .default('false')
      .transform((val) => val === 'true'),
    CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
    CLOUDFLARE_GATEWAY_NAME: z.string().optional(),
    USE_CLOUDFLARE_GATEWAY: z
      .string()
      .default('false')
      .transform((val) => val === 'true'),
    GEMINI_API_KEY: z.string().optional(),
    LLM_API_KEY: z.string().optional(),
    SLACK_WEBHOOK_URL: z.string().url().optional().or(z.literal('')),
    PAGERDUTY_ROUTING_KEY: z.string().optional(),
    ANTIGRAVITY_URL: z.string().optional(),
    ENFORCE_REQUEST_SIGNATURE: z
      .string()
      .default('false')
      .transform((val) => val === 'true'),
    PLUGINS_DIR: z.string().optional(),
    IS_PACKAGED: z
      .string()
      .default('false')
      .transform((val) => val === 'true'),
    ALLOWED_ORIGINS: z.string().optional(),
    DIALOGFLOW_PROJECT_ID: z.string().optional(),
    DIALOGFLOW_ACCESS_TOKEN: z.string().optional(),
    RASA_URL: z.string().optional(),
    ANTIGRAVITY_API_KEY: z.string().optional(),
    RULES_DB_MAX_ENTRIES: z
      .string()
      .default('500')
      .transform((val) => parseInt(val, 10)),
    DATA_RETENTION_DAYS: z
      .string()
      .default('365')
      .transform((val) => parseInt(val, 10)),
    AUDIT_LOG_RETENTION_DAYS: z
      .string()
      .default('90')
      .transform((val) => parseInt(val, 10)),
    PII_SCRUB_ENABLED: z
      .string()
      .default('true')
      .transform((val) => val === 'true'),
    DATABASE_URL: z.string().url().optional(),
  })
  .passthrough();

// Validate process.env
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

// Additional strict check for production environment
if (parsed.data.NODE_ENV === 'production' && !parsed.data.NYX_MASTER_KEY) {
  console.error(
    '❌ Invalid environment configuration: NYX_MASTER_KEY is required in production mode.'
  );
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
