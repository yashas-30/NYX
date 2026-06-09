import { pgTable, text as pgText, timestamp as pgTimestamp, integer as pgInteger, real as pgReal } from 'drizzle-orm/pg-core';

// PostgreSQL Versions
export const pgDbSessions = pgTable('db_sessions', {
  id: pgText('id').primaryKey(),
  name: pgText('name').notNull(),
  modelId: pgText('model_id').notNull(),
  provider: pgText('provider').notNull(),
  createdAt: pgTimestamp('created_at').defaultNow(),
  updatedAt: pgTimestamp('updated_at').defaultNow(),
});

export const pgDbMessages = pgTable('db_messages', {
  id: pgText('id').primaryKey(),
  sessionId: pgText('session_id').notNull().references(() => pgDbSessions.id, { onDelete: 'cascade' }),
  role: pgText('role').notNull(),
  content: pgText('content').notNull(),
  status: pgText('status').default('success'),
  latencyMs: pgInteger('latency_ms'),
  tokens: pgInteger('tokens'),
  tps: pgReal('tps'),
  timestamp: pgTimestamp('timestamp').defaultNow(),
});

export const pgDbUsage = pgTable('db_usage', {
  id: pgText('id').primaryKey(),
  provider: pgText('provider').notNull(),
  modelId: pgText('model_id').notNull(),
  tokens: pgInteger('tokens').notNull(),
  latencyMs: pgInteger('latency_ms').notNull(),
  timestamp: pgTimestamp('timestamp').defaultNow(),
});

export const pgDbRules = pgTable('db_rules', {
  id: pgText('id').primaryKey(),
  metric: pgText('metric').notNull(),
  critique: pgText('critique').notNull(),
  rule: pgText('rule').notNull(),
  timestamp: pgTimestamp('timestamp').defaultNow(),
});

export const pgDbCache = pgTable('db_cache', {
  key: pgText('key').primaryKey(),
  provider: pgText('provider').notNull(),
  model: pgText('model').notNull(),
  data: pgText('data').notNull(),
  createdAt: pgTimestamp('createdAt').defaultNow(),
  expiresAt: pgTimestamp('expires_at'),
  hitCount: pgInteger('hit_count').default(0),
});

export const pgPromptVersions = pgTable('prompt_versions', {
  id: pgText('id').primaryKey(),
  name: pgText('name').notNull(),
  content: pgText('content').notNull(),
  version: pgInteger('version').notNull(),
  createdAt: pgTimestamp('created_at').defaultNow(),
  avgTokens: pgReal('avg_tokens'),
  avgLatency: pgReal('avg_latency'),
  successRate: pgReal('success_rate'),
  userRating: pgReal('user_rating'),
  isActive: pgInteger('is_active').default(0).notNull(),
});
