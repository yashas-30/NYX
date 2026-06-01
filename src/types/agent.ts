import { ModelProvider } from './models';

export type ComplexityLevel = 'trivial' | 'simple' | 'moderate' | 'complex' | 'very_complex' | 'enterprise';
export type IntentType = 'chat' | 'code_generation' | 'debugging' | 'explanation' | 'refactoring' | 'testing' | 'general_chat';
export type CapabilityKey = 'chat' | 'coding' | 'reasoning' | 'vision';

export interface CodeAnalysis {
  complexity: any;
  intent: IntentType;
  subIntents?: IntentType[];
  requiresTools?: boolean;
  requiredTools?: string[];
  requiredCapabilities?: CapabilityKey[];
  estimatedOutputTokens?: number;
  estimatedTokens?: number;
  detectedLanguage?: string;
  requiresVision?: boolean;
  reasoning?: string;
  confidence?: number;
  safety?: { type: string; severity: string; recommendation: string };
  isMultiIntent?: boolean;
  intentScores?: { intent: IntentType; confidence: number }[];
  languageConfidence?: number;
}

// Canonical PromptAnalysis incorporating fields from all definitions
export interface PromptAnalysis {
  intent: any; // Can be string, IntentType, or PromptIntent
  tone?: string;
  complexity: any;
  confidence: number;
  detectedLanguages?: string[];
  detectedLanguage?: string;
  frameworks?: string[];
  requiresContext?: boolean;
  requiresExecution?: boolean;
  requiresWebSearch?: boolean;
  requiresCodebaseContext?: boolean;
  estimatedTokens?: number;
  estimatedTokenCount?: number;
  suggestedModel?: 'fast' | 'balanced' | 'powerful';
  suggestedTools?: string[];
  scope?: 'single_file' | 'multi_file' | 'project_wide' | 'external_knowledge';
  hardware?: any;
  level?: ComplexityLevel;
  score?: number;
  subIntents?: IntentType[];
  requiresTools?: boolean;
  requiredTools?: string[];
  requiredCapabilities?: CapabilityKey[];
  estimatedOutputTokens?: number;
  reasoning?: string;
  safety?: { type: string; severity: string; recommendation: string };
  isMultiIntent?: boolean;
  intentScores?: { intent: IntentType; confidence: number }[];
  languageConfidence?: number;
  requiresVision?: boolean;
}

export type SubagentType = 'planner' | 'researcher' | 'coder' | 'reviewer' | 'tester' | 'optimizer';

export interface RoutingDecision {
  modelId: string;
  provider: ModelProvider;
  reasoning: string;
  estimatedLatency: number;
  estimatedCost: 'free' | 'low' | 'medium' | 'high';
}

export interface SubagentResult {
  taskId: string;
  output: string;
  metrics: any;
  modelUsed: RoutingDecision;
  timestamp: number;
  error?: string;
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

export interface AISettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  antigravity?: boolean;
}

export interface ToolCall {
  id: string;
  type: 'function';
  index?: number;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  status?: 'success' | 'error' | 'stopped' | 'loading' | 'complete';
  metrics?: any;
  rolloutId?: string;
  reward?: number | null;
  images?: Array<{ name: string; mimeType?: string; data?: string; url?: string; dataUrl?: string }>;
  reasoning?: string;           // Chain-of-thought content
  toolCalls?: ToolCall[];        // Tool invocations
  citations?: Array<{ url?: string; title?: string; snippet?: string; id?: string; source?: string; quote?: string }>;
  artifacts?: any[];             // Extracted artifacts like code snippets
}


export interface OrchestratorOptions {
  apiKeys: Record<string, string>;
  modelSettings: AISettings;
  trackUsage: (provider: string, tokens: number) => void;
  history: ChatMessage[];
  updateHistory: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  updateMetrics: (metrics: any) => void;
  getSuggestions: (history: ChatMessage[]) => void;
  setSuggestedPrompts: (prompts: string[]) => void;
  webSearchEnabled: boolean;
  codebaseKnowledgeEnabled: boolean;
  triggerBackgroundCritic?: (prompt: string, response: string) => void;
  originalPrompt: string;
  signal?: AbortSignal;
}

export interface ISubagentOrchestrator {
  onTaskUpdate?: (tasks: SubagentTask[]) => void;
  execute(prompt: string, options: OrchestratorOptions): Promise<SubagentResult[]>;
  abort(): void;
}

export interface AgentPersona {
  id: string;
  name: string;
  version: string;
  systemPrompt: string;
  capabilities: string[];
}

