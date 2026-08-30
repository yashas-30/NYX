/**
 * types.ts
 *
 * Core type definitions for NYX context engineering, prompt synthesis,
 * category classification, and token budgeting.
 */

import type { ChatMessage } from '@src/infrastructure/types';

export type PromptCategory =
  | 'presentation'
  | 'websearch'
  | 'research'
  | 'diagram'
  | 'code'
  | 'general';

export type SafetyLevel = 'standard' | 'enhanced' | 'strict';

export interface UserPreferences {
  preferredName?: string;
  expertiseLevel?: 'beginner' | 'intermediate' | 'expert' | 'principal';
  detailPreference?: 'concise' | 'balanced' | 'thorough' | 'exhaustive';
  formatPreference?: 'paragraph' | 'bullets' | 'mixed' | 'table';
  tonePreference?: 'casual' | 'professional' | 'technical' | 'academic';
  lastTopics?: string[];
}

export interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
  required?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}

export interface ChatContext {
  userName?: string;
  userPreferences?: UserPreferences;
  conversationTone: 'casual' | 'professional' | 'technical' | 'academic';
  detectedLanguage: string;
  topicDomain?: string;
  previousMessages: number;
  lightningDirectives?: string[];
  availableTools?: ToolDefinition[];
  enableCitations?: boolean;
  maxResponseTokens?: number;
  historySummary?: string;
  reasoningEnabled?: boolean;
  /** True when the request executes on a local GGUF model via llama-server / nyx-native. */
  localModel?: boolean;
  customSystemPrompt?: string;
  hasWebSearch?: boolean;
  hasDeepResearch?: boolean;
  promptCategory?: PromptCategory;
  activeProjectId?: string;
  workspacePath?: string;
}

export interface ChatPromptMetadata {
  version: string;
  category: PromptCategory;
  estimatedTokens: number;
  contextBreakdown: Record<string, number>;
  safetyLevel: SafetyLevel;
  timestamp: string;
}

export interface ChatPromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  metadata: ChatPromptMetadata;
}

/**
 * Fast, conservative token count estimator (~4 characters per token for English text/code).
 */
export function estimatePromptTokens(text?: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
