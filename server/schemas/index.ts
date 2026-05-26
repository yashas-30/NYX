import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// API Key Format Validators (per-provider regex patterns)
// ─────────────────────────────────────────────────────────────────────────────
export const apiKeySchemas = {
  gemini:     z.string().min(30).max(256).regex(/^[A-Za-z0-9_\-]{30,}$/, 'Invalid Gemini API key format'),
  openrouter: z.string().regex(/^sk-or-v1-/, 'OpenRouter key must start with sk-or-v1-').max(512),
  nvidia:     z.string().regex(/^nvapi-/, 'NVIDIA key must start with nvapi-').max(512),
  opencode:   z.string().min(20).max(512),
  openai:     z.string().regex(/^sk-/, 'OpenAI key must start with sk-').max(512),
  anthropic:  z.string().regex(/^sk-ant-/, 'Anthropic key must start with sk-ant-').max(512),
  deepseek:   z.string().min(20).max(512),
  groq:       z.string().regex(/^gsk_/, 'Groq key must start with gsk_').max(512),
  mistral:    z.string().min(20).max(512),
  together:   z.string().regex(/^sk-/, 'Together AI key must start with sk-').max(512),
  serpapi:    z.string().min(20).max(512),
  brave:      z.string().min(20).max(512),
} as const;

// Generic key validator (for unknown providers)
const genericKeySchema = z.string().min(1).max(512).trim();

// ─────────────────────────────────────────────────────────────────────────────
// Vault / Auth Schemas
// ─────────────────────────────────────────────────────────────────────────────
export const vaultStoreSchema = z.object({
  keys: z.record(z.string(), z.string()).refine((val) => Object.keys(val).length <= 100, {
    message: 'Keys object can contain at most 100 entries'
  })
});

export const vaultStoreKeySchema = z.object({
  provider: z.string().min(1).max(64).trim(),
  key: genericKeySchema
});

export const vaultDeleteKeySchema = z.object({
  provider: z.string().min(1).max(64).trim()
});

export const vaultValidateSchema = z.object({
  provider: z.enum(['gemini', 'openrouter', 'nvidia', 'opencode', 'openai', 'anthropic', 'deepseek', 'groq', 'mistral', 'together', 'serpapi', 'brave']),
  key: genericKeySchema.optional()
});

// ─────────────────────────────────────────────────────────────────────────────
// AI / Chat Schemas
// ─────────────────────────────────────────────────────────────────────────────
const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'model']),
  content: z.string().max(65536)
});

const aiSettingsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(131072).optional(),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().int().min(1).max(100).optional(),
  stream: z.boolean().optional()
}).optional();

export const chatRequestSchema = z.object({
  model: z.string().min(1).max(256),
  provider: z.string().min(1).max(64),
  prompt: z.string().min(1).max(65536),
  systemInstruction: z.string().max(16384).optional(),
  history: z.array(chatMessageSchema).max(500).optional(),
  settings: aiSettingsSchema,
  // NOTE: apiKey intentionally not accepted here — resolved from vault server-side
  gatewayUrls: z.record(z.string(), z.string().url()).optional()
});

export const streamRequestSchema = z.object({
  model: z.string().min(1).max(256),
  provider: z.string().min(1).max(64),
  prompt: z.string().min(1).max(65536).optional(),
  messages: z.array(chatMessageSchema).max(500).optional(),
  systemInstruction: z.string().max(16384).optional(),
  history: z.array(chatMessageSchema).max(500).optional(),
  settings: aiSettingsSchema,
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(131072).optional(),
  gatewayUrls: z.record(z.string(), z.string().url()).optional()
});

// ─────────────────────────────────────────────────────────────────────────────
// Terminal Schemas
// ─────────────────────────────────────────────────────────────────────────────
export const terminalRunSchema = z.object({
  command: z.string().min(1).max(2048).trim(),
  cwd: z.string().max(1024).optional()
});

export const terminalPromptSchema = z.object({
  nodeId: z.string().max(256).optional(),
  prompt: z.string().min(1).max(2048).trim(),
  cwd: z.string().max(1024).optional()
});

// ─────────────────────────────────────────────────────────────────────────────
// Nyx Agent Schemas
// ─────────────────────────────────────────────────────────────────────────────
export const nyxCriticSchema = z.object({
  prompt: z.string().min(1).max(32768),
  response: z.string().min(1).max(65536),
  modelId: z.string().max(256).optional(),
  provider: z.string().max(64).optional()
  // NOTE: apiKey intentionally excluded — always resolved from vault
});

export const nyxSearchSchema = z.object({
  query: z.string().min(1).max(1024).trim()
});

export const codebaseSearchSchema = z.object({
  query: z.string().min(1).max(1024).trim()
});

export const writeFileSchema = z.object({
  filePath: z.string().min(1).max(1024),
  content: z.string().max(10 * 1024 * 1024), // 10MB max file write
  overwrite: z.boolean().optional()
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache Schemas
// ─────────────────────────────────────────────────────────────────────────────
export const cacheSetSchema = z.object({
  key: z.string().min(1).max(2048),
  data: z.any(),
  provider: z.string().min(1).max(64),
  model: z.string().min(1).max(128)
});

export const cacheGetSchema = z.object({
  provider: z.string().min(1).max(64),
  model: z.string().min(1).max(128),
  prompt: z.string().max(65536).optional(),
  systemInstruction: z.string().max(16384).optional(),
  history: z.array(chatMessageSchema).max(500).optional(),
  settings: aiSettingsSchema
});

// ─────────────────────────────────────────────────────────────────────────────
// Workspace / System Schemas
// ─────────────────────────────────────────────────────────────────────────────
export const workspaceSchema = z.object({
  path: z.string().min(1).max(1024)
});

export const modelQuerySchema = z.object({
  provider: z.string().min(1).max(64)
  // NOTE: apiKey excluded — resolved from vault
});

// ─────────────────────────────────────────────────────────────────────────────
// Local Model Schemas
// ─────────────────────────────────────────────────────────────────────────────
const inferenceSettingsSchema = z.object({
  gpuLayers: z.number().int().min(0).max(999).optional(),
  threads: z.number().int().min(1).max(256).optional(),
  contextSize: z.number().int().min(512).max(131072).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(131072).optional()
}).optional();

export const localModelStartSchema = z.object({
  modelId: z.string().min(1).max(256),
  settings: inferenceSettingsSchema
});

export const localModelDownloadSchema = z.object({
  modelId: z.string().min(1).max(512)
});

export const localModelDeleteSchema = z.object({
  modelId: z.string().min(1).max(256)
});

export const localModelChatSchema = z.object({
  model: z.string().min(1).max(256),
  messages: z.array(chatMessageSchema).min(1).max(500),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(131072).optional()
});

// ─────────────────────────────────────────────────────────────────────────────
// Conversation / Export Schemas
// ─────────────────────────────────────────────────────────────────────────────
export const conversationSchema = z.object({
  id: z.string().min(1).max(256),
  title: z.string().max(1024),
  messages: z.array(chatMessageSchema).max(10000),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive()
});

export const exportSchema = z.object({
  format: z.enum(['markdown', 'json'])
});

// ─────────────────────────────────────────────────────────────────────────────
// Agent Schemas
// ─────────────────────────────────────────────────────────────────────────────
export const agentRunSchema = z.object({
  prompt: z.string().min(1).max(65536),
  modelId: z.string().min(1).max(256).optional(),
  provider: z.string().min(1).max(64).optional(),
  settings: aiSettingsSchema,
  history: z.array(chatMessageSchema).max(500).optional()
  // NOTE: apiKey excluded — resolved from vault
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin / Rules
// ─────────────────────────────────────────────────────────────────────────────
export const rulesResetSchema = z.object({
  confirm: z.literal(true)
});
