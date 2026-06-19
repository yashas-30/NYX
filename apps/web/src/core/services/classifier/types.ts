/**
 * @file types.ts
 * @description Types for the semantic prompt classifier module.
 */

import type { HardwareAnalysis } from '@nyx/shared';

// ---------------------------------------------------------------------------
// Prompt Intent (16 intent categories)
// ---------------------------------------------------------------------------

export type PromptIntent =
  | 'greeting'
  | 'farewell'
  | 'gratitude'
  | 'general_chat'
  | 'code_generation'
  | 'code_debug'
  | 'code_review'
  | 'architecture_design'
  | 'refactor'
  | 'explain_code'
  | 'terminal_command'
  | 'file_operation'
  | 'web_search'
  | 'codebase_query'
  | 'clarification'
  | 'correction'
  | 'continuation'
  | 'data_analysis';

// ---------------------------------------------------------------------------
// Prompt Analysis Result
// ---------------------------------------------------------------------------

export interface PromptAnalysis {
  intent: PromptIntent;
  tone?: string;
  confidence: number;
  detectedLanguages: string[];
  frameworks: string[];
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'enterprise';
  requiresContext: boolean;
  requiresExecution: boolean;
  estimatedTokens: number;
  suggestedModel: 'fast' | 'balanced' | 'powerful';
  hardware?: HardwareAnalysis;
  multiIntent?: PromptIntent[];
  urgency: 'low' | 'normal' | 'high';
  isFollowUp: boolean;
  suggestedExecutionMode?: 'standard' | 'parallel' | 'ensemble' | 'ab-test';
  suggestedExecutionReasoning?: string;
}

// ---------------------------------------------------------------------------
// Conversation State
// ---------------------------------------------------------------------------

export interface ConversationState {
  turnCount: number;
  lastIntent: PromptIntent | null;
  lastLanguages: string[];
  lastFrameworks: string[];
  pendingToolCalls: boolean;
  userFrustrationLevel: number;
  topicDrift: number;
}

// ---------------------------------------------------------------------------
// Agent Routing
// ---------------------------------------------------------------------------

export type ToolCapability =
  | 'web_search'
  | 'terminal'
  | 'file_write'
  | 'file_read'
  | 'image_analysis';

export interface AgentRoute {
  agent: 'chat' | 'architect';
  reasoning: string;
  shouldUseSubagents: boolean;
  systemPrompt: string;
  tools: ToolCapability[];
  modelTier: 'fast' | 'balanced' | 'powerful';
  temperature: number;
  maxTokens: number;
}

// ---------------------------------------------------------------------------
// Intent Embeddings
// ---------------------------------------------------------------------------

export interface IntentEmbedding {
  intent: PromptIntent;
  vectors: string[];
  keywords: string[];
  antiKeywords: string[];
  weight: number;
}

// ---------------------------------------------------------------------------
// Language / Framework Patterns
// ---------------------------------------------------------------------------

export interface LanguagePattern {
  id: string;
  pattern: RegExp;
  tokenMultiplier: number;
}

export interface FrameworkPattern {
  id: string;
  pattern: RegExp;
  aliases: string[];
  tokenMultiplier: number;
}
