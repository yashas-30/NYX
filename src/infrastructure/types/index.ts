/**
 * @file src/core/types/index.ts
 * @description Core domain types for the NYX application.
 */

export type Provider = 
  | 'gemini' 
  | 'openrouter' 
  | 'nvidia' 
  | 'terminal'
  | 'opencode'
  | 'pollinations'
  | 'nyx-native';

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
  rolloutId?: string;
  reward?: number | null;
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

// ── Subagent Swarm Types ──────────────────────────────────────────────────────

export type SubagentType = 'planner' | 'researcher' | 'coder' | 'reviewer' | 'tester' | 'optimizer';

export interface RoutingDecision {
  modelId: string;
  provider: Provider;
  reasoning: string;
  estimatedLatency: number;
  estimatedCost: 'free' | 'low' | 'medium' | 'high';
}

export interface SubagentTask {
  id: string;
  type: SubagentType;
  description: string;
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'enterprise';
  requiresCloud: boolean;
  dependencies: string[];
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: SubagentResult;
  assignedModel?: RoutingDecision;
}

export interface SubagentResult {
  taskId: string;
  output: string;
  metrics: TelemetryMetrics;
  modelUsed: RoutingDecision;
  timestamp: number;
  error?: string;
}

export interface SubagentPlan {
  subtasks: Array<{
    id: string;
    type: SubagentType;
    description: string;
    complexity: SubagentTask['complexity'];
    requiresCloud: boolean;
    dependencies: string[];
  }>;
}

export interface HandoffSpecification {
  originalPrompt: string;
  parentOutputs: Record<string, string>;
  codebaseContext: string;
  webSearchContext: string;
  executionMetadata: {
    depth: number;
    path: string[];
  };
}

export interface OrchestratorOptions {
  apiKeys: Record<string, string>;
  modelSettings: AISettings;
  trackUsage: (provider: string, tokens: number) => void;
  history: ChatMessage[];
  updateHistory: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  updateMetrics: (metrics: TelemetryMetrics) => void;
  getSuggestions: (history: ChatMessage[]) => void;
  setSuggestedPrompts: (prompts: string[]) => void;
  webSearchEnabled: boolean;
  codebaseKnowledgeEnabled: boolean;
  triggerBackgroundCritic?: (prompt: string, response: string) => void;
  originalPrompt: string;
  signal?: AbortSignal;
}

export interface WorkspaceProfile {
  rootPath: string;
  projectType: 'react' | 'node' | 'python' | 'rust' | 'go' | 'arduino' | 'generic';
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'cargo' | 'poetry' | null;
  entryPoints: string[];
  keyDependencies: Record<string, string>;
  directoryTree: string;
  testFramework: 'vitest' | 'jest' | 'pytest' | 'cargo-test' | null;
  lintConfig: 'eslint' | 'biome' | 'ruff' | null;
  typescriptConfig: any | null;
  recentGitCommits: string[];
  openFiles: string[];
}

export interface PromptAnalysis {
  intent: 'code_generation' | 'debugging' | 'refactoring' | 'explanation' | 'architecture' | 'testing' | 'deployment' | 'general_chat';
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'enterprise';
  scope: 'single_file' | 'multi_file' | 'project_wide' | 'external_knowledge';
  requiresExecution: boolean;
  requiresWebSearch: boolean;
  requiresCodebaseContext: boolean;
  estimatedTokenCount: number;
  suggestedTools: string[];
  confidence: number;
}

export interface LocalModelState {
  modelId: string;
  status: 'cold' | 'warming' | 'hot' | 'failed';
  lastUsed: number;
  vramUsageMB: number;
  avgLatencyMs: number;
  totalRequests: number;
}
