import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { pgTable, text as pgText, timestamp as pgTimestamp, integer as pgInteger, real as pgReal } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';


// Legacy tables (kept for migration purposes)
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  model: text('model').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'user' | 'assistant' | 'system'
    content: text('content').notNull(),
    model: text('model').notNull(),
    timestamp: integer('timestamp').notNull(),
  },
  (table) => ({
    conversationTimestampIdx: index('idx_messages_conversation_timestamp').on(
      table.conversationId,
      table.timestamp
    ),
  })
);

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

// Model Configurations
export const modelConfigs = sqliteTable('model_configs', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  name: text('name').notNull(),
  config: text('config').notNull(), // JSON string representing settings
  updatedAt: integer('updated_at').notNull(),
});

// Legacy usage logs
export const usageLogs = sqliteTable('usage_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  cost: real('cost').notNull(),
  timestamp: integer('timestamp').notNull(),
});

// UGLY-7 & MISSING-3: Separated Chat & Coder tables + Cost Tracking table
export const chatFolders = sqliteTable('chat_folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const promptTemplates = sqliteTable('prompt_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  type: text('type').notNull(),
});

export const chatConversations = sqliteTable('chat_conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  model: text('model').notNull(),
  folderId: text('folder_id').references(() => chatFolders.id, { onDelete: 'set null' }),
  tags: text('tags'),
  shareId: text('share_id').unique(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => chatConversations.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  model: text('model').notNull(),
  isPinned: integer('is_pinned', { mode: 'boolean' }).default(false),
  timestamp: integer('timestamp').notNull(),
  tokenUsage: text('token_usage'),
  attachments: text('attachments'),
  feedback: integer('feedback'), // 1 = thumbs up, -1 = thumbs down, null = unrated
});

export const codeConversations = sqliteTable('code_conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  model: text('model').notNull(),
  workspacePath: text('workspace_path'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const codeMessages = sqliteTable('code_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => codeConversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  model: text('model').notNull(),
  timestamp: integer('timestamp').notNull(),
  toolCalls: text('tool_calls'), // JSON string representing tool calls
});

export const usageCosts = sqliteTable('usage_costs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  estimatedCostUsd: real('estimated_cost_usd'),
  sessionId: text('session_id'),
  timestamp: integer('timestamp').notNull(),
});

export const asyncJobs = sqliteTable('async_jobs', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  status: text('status').notNull(), // 'pending', 'processing', 'completed', 'failed'
  webhookUrl: text('webhook_url').notNull(),
  requestPayload: text('request_payload').notNull(),
  resultPayload: text('result_payload'),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// Session Management
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // Usually UUID
  tokenHash: text('token_hash').notNull().unique(), // Store SHA-256 hash of the token for security
  isStreamNonce: integer('is_stream_nonce', { mode: 'boolean' }).default(false).notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
});

// New Relations
export const chatConversationsRelations = relations(chatConversations, ({ many }) => ({
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
}));

export const codeConversationsRelations = relations(codeConversations, ({ many }) => ({
  messages: many(codeMessages),
}));

export const codeMessagesRelations = relations(codeMessages, ({ one }) => ({
  conversation: one(codeConversations, {
    fields: [codeMessages.conversationId],
    references: [codeConversations.id],
  }),
}));

// Search Integration
export const searchQueries = sqliteTable('search_queries', {
  id: text('id').primaryKey(),
  query: text('query').notNull(),
  engine: text('engine').notNull(),
  type: text('type').default('text').notNull(),
  timestamp: integer('timestamp').notNull(),
});

export const searchResults = sqliteTable('search_results', {
  id: text('id').primaryKey(),
  queryId: text('query_id')
    .notNull()
    .references(() => searchQueries.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  title: text('title').notNull(),
  markdown: text('markdown').notNull(),
  rank: integer('rank').notNull(),
});

export const searchQueriesRelations = relations(searchQueries, ({ many }) => ({
  results: many(searchResults),
}));

export const searchResultsRelations = relations(searchResults, ({ one }) => ({
  query: one(searchQueries, {
    fields: [searchResults.queryId],
    references: [searchQueries.id],
  }),
}));

export const promptOptimizations = sqliteTable('prompt_optimizations', {
  id: text('id').primaryKey(),
  originalPrompt: text('original_prompt').notNull(),
  optimizedPrompt: text('optimized_prompt').notNull(),
  domain: text('domain').notNull(),
  version: text('version').notNull(),
  rating: integer('rating'), // 1 for thumbs up, -1 for thumbs down, null for unrated
  timestamp: integer('timestamp').notNull(),
});

export const promptVersions = sqliteTable('prompt_versions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  version: integer('version').notNull(),
  createdAt: integer('created_at').notNull(),
  avgTokens: real('avg_tokens'),
  avgLatency: real('avg_latency'),
  successRate: real('success_rate'),
  userRating: real('user_rating'),
  isActive: integer('is_active', { mode: 'boolean' }).default(false).notNull(),
});

import { index } from 'drizzle-orm/sqlite-core';

export const agentRuns = sqliteTable(
  'agent_runs',
  {
    id: text('id').primaryKey(),
    agentType: text('agent_type').notNull(),
    task: text('task').notNull(),
    status: text('status').notNull(), // 'running', 'completed', 'failed'
    startedAt: integer('started_at').notNull(),
    completedAt: integer('completed_at'),
    tokensUsed: integer('tokens_used'),
    cost: real('cost'),
    error: text('error'),
  },
  (table) => ({
    statusStartedIdx: index('idx_agent_runs_status_started').on(table.status, table.startedAt),
  })
);

export const toolExecutions = sqliteTable(
  'tool_executions',
  {
    id: text('id').primaryKey(),
    agentRunId: text('agent_run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    toolName: text('tool_name').notNull(),
    input: text('input').notNull(),
    output: text('output'),
    durationMs: integer('duration_ms'),
    success: integer('success', { mode: 'boolean' }),
  },
  (table) => ({
    agentRunIdx: index('idx_tool_executions_run_id').on(table.agentRunId),
  })
);

export const fileChanges = sqliteTable('file_changes', {
  id: text('id').primaryKey(),
  agentRunId: text('agent_run_id')
    .notNull()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  filePath: text('file_path').notNull(),
  operation: text('operation').notNull(), // 'create', 'update', 'delete'
  diff: text('diff'),
  appliedAt: integer('applied_at').notNull(),
});

export const pendingFileWrites = sqliteTable('pending_file_writes', {
  id: text('id').primaryKey(),
  agentRunId: text('agent_run_id')
    .notNull()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  filePath: text('file_path').notNull(),
  content: text('content').notNull(),
  diff: text('diff'),
  status: text('status').notNull(), // 'pending', 'approved', 'rejected'
  createdAt: integer('created_at').notNull(),
});

export const userPreferences = sqliteTable('user_preferences', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  category: text('category').notNull(), // 'api_key_usage', 'file_write_attempt', 'terminal_command', 'authentication'
  event: text('event').notNull(), // JSON string representing event details
  status: text('status').notNull(), // 'success', 'failure', 'blocked'
  agentRunId: text('agent_run_id'), // Optional, if performed by an agent
  timestamp: integer('timestamp').notNull(),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  salt: text('salt').notNull(),
  mfaSecret: text('mfa_secret'),
  mfaEnabled: integer('mfa_enabled', { mode: 'boolean' }).default(false).notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// New tables requested in implementation plan


// SQLite Versions
export const dbSessions = sqliteTable('db_sessions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  modelId: text('model_id').notNull(),
  provider: text('provider').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

export const dbMessages = sqliteTable('db_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => dbSessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  status: text('status').default('success'), // 'loading' | 'success' | 'error' | 'stopped'
  latencyMs: integer('latency_ms'),
  tokens: integer('tokens'),
  tps: real('tps'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

export const dbUsage = sqliteTable('db_usage', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  modelId: text('model_id').notNull(),
  tokens: integer('tokens').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

export const dbRules = sqliteTable('db_rules', {
  id: text('id').primaryKey(),
  metric: text('metric').notNull(),
  critique: text('critique').notNull(),
  rule: text('rule').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

export const dbCache = sqliteTable('db_cache', {
  key: text('key').primaryKey(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  data: text('data').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  expiresAt: integer('expires_at', { mode: 'timestamp' }), // nullable TTL
  hitCount: integer('hit_count').default(0),
});

// PostgreSQL Versions (mapped to same database names but using pg core primitives)
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

// ── Telemetry Events ───────────────────────────────────────────────────────────
// Stores structured per-request metrics for local observability dashboards.
export const telemetryEvents = sqliteTable(
  'telemetry_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    eventType: text('event_type').notNull(), // 'request' | 'error' | 'tool_call'
    durationMs: integer('duration_ms'),
    tokensGenerated: integer('tokens_generated'),
    errorType: text('error_type'),
    timestamp: integer('timestamp').notNull(),
  },
  (table) => ({
    providerModelIdx: index('idx_telemetry_provider_model').on(table.provider, table.model),
    timestampIdx: index('idx_telemetry_timestamp').on(table.timestamp),
  })
);
