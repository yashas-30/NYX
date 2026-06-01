/**
 * @file src/types/agent.ts
 * @description Core agent types for NYX autonomous agent.
 *              Multi-modal, streaming-aware, tool-orchestrated type system.
 *              Modeled after Claude's content blocks and Kimi's streaming protocol.
 */

// ============================================================================
// BASE PRIMITIVES
// ============================================================================

/** Complexity assessment for task routing and model selection */
export type ComplexityLevel =
  | 'trivial' // < 5 min, single file, no dependencies
  | 'simple' // < 30 min, few files, known patterns
  | 'moderate' // < 2 hrs, multiple files, some investigation
  | 'complex' // < 1 day, cross-module, architectural decisions
  | 'very_complex' // 1-3 days, system-wide, performance critical
  | 'enterprise'; // > 3 days, multi-service, compliance/security

/** User intent classification for routing and prompt engineering */
export type IntentType =
  | 'chat' // General conversation
  | 'code_generation' // Write new code
  | 'debugging' // Find and fix bugs
  | 'explanation' // Explain code/concepts
  | 'refactoring' // Restructure existing code
  | 'testing' // Write/run tests
  | 'documentation' // Write docs/README
  | 'review' // Code review/audit
  | 'architecture' // Design patterns/system design
  | 'deployment' // CI/CD, Docker, infra
  | 'general_chat'; // Non-technical chat

/** Model capability flags for feature gating */
export type CapabilityKey =
  | 'chat' // Conversational ability
  | 'coding' // Code generation/understanding
  | 'reasoning' // Step-by-step reasoning (o1-style)
  | 'vision' // Image understanding
  | 'tools' // Tool use/function calling
  | 'memory' // Long-term memory/persistence
  | 'planning' // Multi-step planning (Kimi-planner)
  | 'search'; // Web/codebase search

/** Safety/content moderation levels */
export type SafetyLevel =
  | 'none' // No filtering
  | 'low' // Basic profanity filter
  | 'medium' // Standard safety (default)
  | 'high' // Strict, no code execution
  | 'maximum'; // Paranoid, manual review required

// ============================================================================
// MESSAGE SYSTEM (Claude-style Content Blocks + Kimi Streaming)
// ============================================================================

/** Role identifiers for conversation turns */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** Base content block — discriminated union for type-safe streaming */
export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock
  | ImageBlock
  | DocumentBlock
  | ErrorBlock;

/** Plain text content */
export interface TextBlock {
  type: 'text';
  text: string;
  /** Optional citations for grounded responses */
  citations?: Citation[];
}

/** Extended thinking/reasoning (Claude's extended thinking, Kimi's reasoning_content) */
export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  /** Cryptographic signature for thinking authenticity (Claude feature) */
  signature?: string;
  /** Whether this thinking is visible to user or internal only */
  visibility: 'visible' | 'hidden';
  /** Thinking duration in milliseconds */
  durationMs?: number;
}

/** Tool invocation requested by model */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string; // Unique call ID: "call_abc123"
  name: string; // Tool name from registry
  input: Record<string, any>; // Parsed arguments
  /** Raw JSON for debugging/validation */
  rawInput?: string;
}

/** Result of tool execution returned to model */
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string; // Matches ToolUseBlock.id
  content: string | Array<TextBlock | ImageBlock>;
  /** Whether tool execution succeeded */
  is_error: boolean;
  /** Error details if is_error */
  error?: ToolError;
  /** Execution metadata */
  metadata?: ToolResultMetadata;
}

/** Image input/output (user upload or model generation) */
export interface ImageBlock {
  type: 'image';
  source: ImageSource;
  /** Optional description for accessibility */
  alt_text?: string;
}

/** Document input (PDF, markdown, etc.) */
export interface DocumentBlock {
  type: 'document';
  source: DocumentSource;
  title?: string;
  /** Extracted text content if available */
  content?: string;
  /** Page count for paginated documents */
  page_count?: number;
}

/** Error block for graceful degradation */
export interface ErrorBlock {
  type: 'error';
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    recoverable: boolean;
  };
}

// ============================================================================
// CONTENT BLOCK SOURCES
// ============================================================================

export type ImageSource =
  | {
      type: 'base64';
      media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
      data: string;
    }
  | { type: 'url'; url: string }
  | { type: 'file'; file_path: string; workspace_relative: boolean };

export type DocumentSource =
  | { type: 'base64'; media_type: 'application/pdf' | 'text/plain' | 'text/markdown'; data: string }
  | { type: 'url'; url: string }
  | { type: 'file'; file_path: string };

// ============================================================================
// CITATIONS & GROUNDING
// ============================================================================

/** Source attribution for generated content */
export interface Citation {
  type: 'char_location' | 'page_location' | 'content_block';
  /** Cited text snippet */
  cited_text: string;
  /** Document identifier */
  document_index?: number;
  /** Character offsets in source */
  start_char_index?: number;
  end_char_index?: number;
  /** Page numbers for PDFs */
  start_page_number?: number;
  end_page_number?: number;
}

// ============================================================================
// MESSAGES
// ============================================================================

/** Complete message in conversation */
export interface Message {
  role: MessageRole;
  content: string | ContentBlock[];
  /** Unique message ID for tracking/retrieval */
  id?: string;
  /** Timestamp for session reconstruction */
  timestamp?: string;
  /** Token usage for this message */
  usage?: TokenUsage;
  /** Stop reason for assistant messages */
  stop_reason?: StopReason;
  /** Model identifier that generated this */
  model?: string;
}

/** System message with special configuration */
export interface SystemMessage extends Message {
  role: 'system';
  /** Whether to cache this system prompt (Claude prompt caching) */
  cache_control?: { type: 'ephemeral' };
  /** Context assembly from WorkspaceIntelligence */
  workspace_context?: string;
}

/** User message with multi-modal support */
export interface UserMessage extends Message {
  role: 'user';
  /** Files attached to this message */
  attachments?: Array<ImageBlock | DocumentBlock>;
  /** Explicit intent override */
  intent?: IntentType;
  /** Complexity hint from frontend */
  complexity_hint?: ComplexityLevel;
}

/** Assistant message with streaming support */
export interface AssistantMessage extends Message {
  role: 'assistant';
  /** Thinking content if model supports reasoning */
  thinking?: ThinkingBlock[];
  /** Tool calls pending execution */
  tool_calls?: ToolUseBlock[];
  /** Whether response is complete or streaming */
  stream_status?: 'in_progress' | 'complete' | 'interrupted';
}

/** Tool message wrapping results */
export interface ToolMessage extends Message {
  role: 'tool';
  /** Results for each tool call */
  tool_results: ToolResultBlock[];
}

// ============================================================================
// STREAMING (Real-time chunk delivery like Kimi/Claude)
// ============================================================================

/** Streaming event types */
export type AgentStreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | PingEvent
  | ErrorEvent;

export interface MessageStartEvent {
  type: 'message_start';
  message: {
    id: string;
    role: 'assistant';
    model: string;
    usage?: TokenUsage;
  };
}

export interface ContentBlockStartEvent {
  type: 'content_block_start';
  index: number; // Block position in message
  content_block: ContentBlock;
}

export interface ContentBlockDeltaEvent {
  type: 'content_block_delta';
  index: number;
  delta: TextDelta | ThinkingDelta | ToolUseDelta | InputJsonDelta;
}

export interface ContentBlockStopEvent {
  type: 'content_block_stop';
  index: number;
  content_block: ContentBlock;
}

export interface MessageDeltaEvent {
  type: 'message_delta';
  delta: {
    stop_reason?: StopReason;
    stop_sequence?: string;
  };
  usage?: TokenUsage;
}

export interface MessageStopEvent {
  type: 'message_stop';
}

export interface PingEvent {
  type: 'ping';
}

export interface ErrorEvent {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

/** Delta types for partial content */
export interface TextDelta {
  type: 'text_delta';
  text: string;
}

export interface ThinkingDelta {
  type: 'thinking_delta';
  thinking: string;
  signature?: string;
}

export interface ToolUseDelta {
  type: 'tool_use_delta';
  id: string;
  name: string;
  partial_json: string;
}

export interface InputJsonDelta {
  type: 'input_json_delta';
  partial_json: string;
}

// ============================================================================
// TOOL SYSTEM TYPES
// ============================================================================

/** Tool execution error details */
export interface ToolError {
  code: string;
  message: string;
  /** Stack trace for debugging (sanitized in production) */
  stack?: string;
  /** Suggested fix or retry strategy */
  suggestion?: string;
}

/** Tool result metadata */
export interface ToolResultMetadata {
  /** Execution duration in milliseconds */
  duration_ms: number;
  /** Timestamp of execution */
  timestamp: string;
  /** Retry count */
  retry_count: number;
  /** Whether result was truncated */
  truncated: boolean;
  /** Approximate token count */
  token_count: number;
  /** Files modified by this tool */
  modified_files?: string[];
}

// ============================================================================
// TOKEN USAGE & BILLING
// ============================================================================

/** Token consumption tracking */
export interface TokenUsage {
  /** Input tokens (prompt + context) */
  input_tokens: number;
  /** Output tokens (generated content) */
  output_tokens: number;
  /** Thinking/reasoning tokens (Claude extended thinking) */
  thinking_tokens?: number;
  /** Cache creation tokens (Claude prompt caching) */
  cache_creation_input_tokens?: number;
  /** Cache read tokens (Claude prompt caching) */
  cache_read_input_tokens?: number;
  /** Total tokens = input + output + thinking */
  total_tokens: number;
  /** Estimated cost in USD */
  estimated_cost_usd?: number;
}

// ============================================================================
// STOP REASONS
// ============================================================================

export type StopReason =
  | 'end_turn' // Natural completion
  | 'max_tokens' // Hit token limit
  | 'stop_sequence' // Hit custom stop sequence
  | 'tool_use' // Paused for tool execution
  | 'content_filter' // Triggered safety filter
  | 'interrupted' // User cancelled
  | 'error'; // Error occurred

// ============================================================================
// SESSION & PLANNING (Kimi-planner + Claude checkpoints)
// ============================================================================

/** Session lifecycle management */
export interface Session {
  id: string;
  created_at: string;
  updated_at: string;
  /** Conversation history */
  messages: Message[];
  /** Workspace context snapshot */
  workspace_snapshot?: WorkspaceSnapshot;
  /** Active execution plan */
  active_plan?: ExecutionPlan;
  /** Session checkpoints for rewind/fork */
  checkpoints: Checkpoint[];
  /** Context pressure (0-1) */
  context_pressure: number;
  /** Whether session is compacted */
  is_compacted: boolean;
  /** Compacted summary if applicable */
  compacted_summary?: string;
}

/** Workspace state snapshot */
export interface WorkspaceSnapshot {
  root_path: string;
  open_files: string[];
  git_branch?: string;
  git_commit?: string;
  modified_files: string[];
  /** Semantic index version */
  index_version: string;
}

/** Execution plan for multi-step tasks (Kimi-planner style) */
export interface ExecutionPlan {
  id: string;
  description: string;
  status: 'planning' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  /** High-level phases */
  phases: PlanPhase[];
  /** Current phase index */
  current_phase: number;
  /** Estimated total tokens needed */
  estimated_tokens: number;
  /** Actual tokens consumed */
  actual_tokens: number;
  /** Created from which user message */
  source_message_id: string;
}

export interface PlanPhase {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  /** Tools expected to be used */
  required_tools: string[];
  /** Files expected to be modified */
  target_files: string[];
  /** Sub-tasks within phase */
  steps: PlanStep[];
  /** Verification criteria */
  verification?: string[];
}

export interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  /** Tool call if executed */
  tool_call?: ToolUseBlock;
  /** Tool result if executed */
  tool_result?: ToolResultBlock;
  /** Error if failed */
  error?: ToolError;
}

/** Session checkpoint for rewind/fork (Claude feature) */
export interface Checkpoint {
  id: string;
  message_index: number;
  description: string;
  created_at: string;
  /** Token usage at checkpoint */
  usage_at_checkpoint: TokenUsage;
  /** Whether this is an auto-save or manual */
  type: 'auto' | 'manual';
}

// ============================================================================
// AGENT CONFIGURATION
// ============================================================================

/** Runtime agent configuration */
export interface AgentConfig {
  /** Model identifier */
  model: string;
  /** Maximum tokens for response */
  max_tokens: number;
  /** Temperature (0-1) */
  temperature?: number;
  /** Top-p sampling */
  top_p?: number;
  /** Stop sequences */
  stop_sequences?: string[];
  /** System prompt override */
  system?: string;
  /** Enabled capabilities */
  capabilities: CapabilityKey[];
  /** Safety level */
  safety_level: SafetyLevel;
  /** Whether to stream responses */
  stream: boolean;
  /** Whether to enable extended thinking (Claude) */
  thinking?: {
    type: 'enabled';
    budget_tokens: number;
  };
  /** Tool configuration */
  tools?: {
    /** Available tools */
    available: string[];
    /** Whether to allow parallel execution */
    parallel: boolean;
    /** Whether to require user confirmation for destructive tools */
    confirm_destructive: boolean;
  };
  /** Memory configuration */
  memory?: {
    enabled: boolean;
    max_memories: number;
    recency_boost: boolean;
  };
  /** Planning configuration (Kimi-planner) */
  planning?: {
    enabled: boolean;
    auto_plan_threshold: ComplexityLevel;
    max_phases: number;
  };
  /** Prompt caching (Claude feature) */
  cache_control?: {
    enabled: boolean;
    cache_system: boolean;
    cache_tools: boolean;
  };
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/** Complete non-streaming response */
export interface AgentResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: ContentBlock[];
  stop_reason: StopReason;
  stop_sequence?: string;
  usage: TokenUsage;
  /** Thinking blocks if enabled */
  thinking?: ThinkingBlock[];
  /** Tool calls to execute */
  tool_calls?: ToolUseBlock[];
  /** Plan if planning mode active */
  plan?: ExecutionPlan;
  /** Safety assessment */
  safety?: SafetyAssessment;
}

/** Streaming response (async iterator) */
export interface StreamingAgentResponse {
  id: string;
  model: string;
  [Symbol.asyncIterator](): AsyncIterator<AgentStreamEvent>;
}

/** Safety assessment post-generation */
export interface SafetyAssessment {
  level: SafetyLevel;
  triggered: boolean;
  categories: Array<{
    category: string;
    score: number;
    threshold: number;
    triggered: boolean;
  }>;
  /** Human review required */
  review_required: boolean;
}

// ============================================================================
// REQUEST TYPES
// ============================================================================

/** User request to agent */
export interface AgentRequest {
  /** Session ID for continuity */
  session_id?: string;
  /** Message history (or fetch from session) */
  messages: Message[];
  /** User's latest message */
  input: UserMessage;
  /** Agent configuration */
  config: AgentConfig;
  /** Workspace context override */
  workspace_context?: string;
  /** Explicit intent if known */
  intent?: IntentType;
  /** Complexity assessment if pre-computed */
  complexity?: ComplexityLevel;
  /** Files to include in context */
  file_context?: string[];
  /** Whether to create a plan first */
  require_plan?: boolean;
}

// ============================================================================
// EVENT TYPES (For UI/observability)
// ============================================================================

/** Agent lifecycle events */
export type AgentEvent =
  | { type: 'session_started'; session: Session }
  | { type: 'message_received'; message: Message }
  | { type: 'thinking_started'; budget_tokens: number }
  | { type: 'thinking_complete'; duration_ms: number; tokens_used: number }
  | { type: 'tool_call_requested'; tool_call: ToolUseBlock }
  | { type: 'tool_result_received'; tool_result: ToolResultBlock }
  | { type: 'plan_created'; plan: ExecutionPlan }
  | { type: 'phase_started'; phase: PlanPhase }
  | { type: 'phase_completed'; phase: PlanPhase }
  | { type: 'checkpoint_created'; checkpoint: Checkpoint }
  | { type: 'session_compacted'; summary: string }
  | { type: 'safety_triggered'; assessment: SafetyAssessment }
  | { type: 'error'; error: AgentError }
  | { type: 'session_ended'; session_id: string; final_usage: TokenUsage };

export interface AgentError {
  code: string;
  message: string;
  recoverable: boolean;
  /** Retryable after delay */
  retry_after_ms?: number;
  /** Suggested user action */
  suggestion?: string;
}

// ============================================================================
// BACKWARD COMPATIBILITY EXPORTS
// ============================================================================

// Barrel export for convenience
export * from '@src/types';
