export interface Task {
  type: string;
  requirements?: string[];
  [key: string]: any;
}

export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  capabilities: string[];
  model: string;
  provider: string;
  maxTokens: number;
  temperature: number;
}

export interface ExecutionPlan {
  agents: string[];
  dependencies: Map<string, string[]>;
  estimatedCost: number;
  estimatedTime: number;
  parallelGroups: string[][];
}
