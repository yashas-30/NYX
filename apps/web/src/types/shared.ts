// Shared primitive types to avoid circular dependencies between agent.ts and inference.ts

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

export interface TelemetryMetrics {
  latency: number;
  tokens: number;
  tps: number;
  ttft?: number;
}

export interface AIResponse {
  text: string;
  metrics: TelemetryMetrics;
}
