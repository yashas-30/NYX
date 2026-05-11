/**
 * @file src/core/types/index.ts
 * @description Core domain types for the LLM Lab application.
 */

export type Provider = 
  | 'gemini' 
  | 'ollama' 
  | 'lmstudio' 
  | 'openrouter' 
  | 'nvidia' 
  | 'anthropic' 
  | 'openai' 
  | 'groq' 
  | 'mistral' 
  | 'deepseek' 
  | 'together'
  | 'claude'
  | 'terminal'
  | 'opencode';

export interface AISettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  status?: 'success' | 'error' | 'stopped' | 'loading';
  metrics?: TelemetryMetrics;
}

export interface TelemetryMetrics {
  latency: number;
  tokens: number;
  tps: number; // Tokens per second
  ttft?: number; // Time to first token
}

export interface ModelDefinition {
  id: string;
  name: string;
  provider: Provider;
  description?: string;
  contextWindow?: number | string;
  maxOutputTokens?: number | string;
  isLocal?: boolean;
  specs?: any; // Added to support legacy ModelOption compatibility
}

export interface AgentPersona {
  id: string;
  name: string;
  version: string;
  systemPrompt: string;
  capabilities: string[];
}

export interface AIResponse {
  text: string;
  metrics: TelemetryMetrics;
}
