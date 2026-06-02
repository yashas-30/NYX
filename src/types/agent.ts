import { ModelProvider } from './models';
import { AIResponse } from './inference';

export type ComplexityLevel =
  | 'trivial'
  | 'simple'
  | 'moderate'
  | 'complex'
  | 'very_complex'
  | 'enterprise';
export type IntentType =
  | 'chat'
  | 'code_generation'
  | 'debugging'
  | 'explanation'
  | 'refactoring'
  | 'testing'
  | 'general_chat';
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
  repeatPenalty?: number;
  gpuLayers?: number;
  threads?: number;
  contextSize?: number;
  batchSize?: number;
  mirostat?: number;
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
  isPinned?: boolean;
  images?: Array<{
    name: string;
    mimeType?: string;
    data?: string;
    url?: string;
  }>;
  reasoning?: string; // Chain-of-thought content
  toolCalls?: ToolCall[]; // Tool invocations
  citations?: Array<{
    url?: string;
    title?: string;
    snippet?: string;
    id?: string;
    source?: string;
    quote?: string;
  }>;
  artifacts?: any[]; // Extracted artifacts like code snippets
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

// ── Stream Event Types (Claude/Kimi-style rich events) ───────────────────────
export type CoderStreamEventType =
  | 'thinking'
  | 'text'
  | 'tool_call'
  | 'tool_result'
  | 'tool_error'
  | 'file_proposal'
  | 'file_write'
  | 'file_error'
  | 'code_block'
  | 'validation'
  | 'citation'
  | 'warning'
  | 'error'
  | 'complete';

export interface CoderStreamEvent {
  type: CoderStreamEventType;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface FileProposal {
  path: string;
  language: string;
  content: string;
  explanation: string;
}

export interface ValidationResult {
  passed: boolean;
  type: 'syntax' | 'types' | 'tests' | 'lint';
  message: string;
  details?: string;
}

// ── Chat Agent Types ─────────────────────────────────────────────────────────
export interface ImageAttachment {
  name: string;
  mimeType: string;
  data: string; // base64
}

export interface Artifact {
  id: string;
  type: 'code' | 'markdown' | 'json' | 'diff' | 'html' | 'svg';
  title: string;
  content: string;
  language?: string;
}

export interface Citation {
  id: string;
  source: string;
  quote: string;
  url?: string;
}

export interface ThinkingStep {
  id: string;
  step: number;
  content: string;
  timestamp: number;
}

export interface StreamMetrics {
  tokensPerSecond: number;
  totalTokens: number;
  latencyMs: number;
  modelName: string;
}

export interface ReasoningStep {
  type: 'thinking' | 'planning' | 'reflection';
  content: string;
  timestamp?: number;
}

export interface ToolResult {
  output?: string;
  content?: string;
  error?: string;
}

export interface StreamEvent {
  type:
    | 'text'
    | 'thinking'
    | 'tool_call'
    | 'tool_result'
    | 'tool_use'
    | 'artifact'
    | 'citation'
    | 'metrics'
    | 'error'
    | 'done'
    | 'complete';
  content?: string;
  metadata?: any;
  tool?: string;
  input?: Record<string, unknown>;
  result?: ToolResult;
  artifactType?: string;
  title?: string;
  language?: string;
  source?: string;
  quote?: string;
  relevance?: number;
}

export interface AIServiceToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

export interface ExecuteOptions {
  history?: ChatMessage[];
  nodeId?: string;
  gatewayUrls?: Record<string, string>;
  agentMode?: 'chat' | 'coder';
  webSearch?: boolean;
  images?: ChatMessage['images'];
  tools?: AIServiceToolDefinition[];
  responseFormat?: 'text' | 'json' | { type: 'json_schema'; schema: object };
  reasoning?: boolean;
  streamEvents?: boolean;
}

export interface EnhancedAIResponse {
  text: string;
  metrics: AIResponse['metrics'];
  reasoning?: ReasoningStep[];
  toolCalls?: ToolCall[];
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  model: string;
  provider: string;
}
