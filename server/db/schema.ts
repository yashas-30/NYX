import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Legacy tables (kept for migration purposes)
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  model: text('model').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  model: text('model').notNull(),
  timestamp: integer('timestamp').notNull(),
});

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
