/**
 * @file services/analysis/types.ts
 * @description Shared types and interfaces for the prompt analysis modules.
 */

import { PromptAnalysis } from '@src/types/agent';

// ---------------------------------------------------------------------------
// Analysis options
// ---------------------------------------------------------------------------

export interface AnalysisOptions {
  useEmbedding?: boolean;     // Force embedding-based analysis
  useLLM?: boolean;           // Force LLM-based analysis (slower, accurate)
  timeout?: number;           // Max ms to spend analyzing
  history?: string[];         // Previous messages for context-aware analysis
}

// ---------------------------------------------------------------------------
// Embedding-based classifier interface
// ---------------------------------------------------------------------------

export interface EmbeddingClassifier {
  embed(text: string): Promise<number[]>;
  classify(embedding: number[], candidates: string[]): Promise<{ label: string; score: number }>;
}

// ---------------------------------------------------------------------------
// Conversation message type for history context
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: string;
  content: string;
}

// ---------------------------------------------------------------------------
// LLM router interface
// ---------------------------------------------------------------------------

export interface LLMRouter {
  route(prompt: string, history?: string[]): Promise<Partial<PromptAnalysis>>;
}
