import { CapabilityKey, ComplexityLevel, IntentType, TelemetryMetrics, AIResponse } from './shared';
import { ModelProvider } from './models';

export type { TelemetryMetrics, AIResponse };

export interface ReasoningStrategy {
  type: 'react' | 'cot' | 'direct';
  showThinking: boolean;
  maxSteps: number;
  reflectionEnabled: boolean;
  verificationEnabled: boolean;
  explorationEnabled: boolean;
}

export interface LocalModelConfig {
  id: string;
  name: string;
  capabilities: CapabilityKey[];
  contextSize: number;
  vramRequiredGB: number;
  taskAffinity: 'chat' | 'code' | 'reasoning';
  totalLayers?: number;
}

export interface ModelSelection {
  model: LocalModelConfig;
  gpuLayers: number;
  cpuSpillLayers: number;
  isPureGpu: boolean;
  estimatedVramMB: number;
  threads: number;
  reason: string;
}

export interface ToolResult {
  output?: string;
  content?: string;
  error?: string;
}

export interface LocalTool {
  name: string;
  description: string;
  execute: (input: Record<string, unknown>, signal?: AbortSignal) => Promise<ToolResult>;
}

export interface HardwareProfile {
  cpuThreads: number;
  primaryGPU?: {
    vramFreeGB: number;
  };
}

export interface LocalModelState {
  modelId: string;
  status: 'cold' | 'warming' | 'hot' | 'failed';
  lastUsed: number;
  vramUsageMB: number;
  avgLatencyMs: number;
  totalRequests: number;
}

// fallow-ignore-next-line code-duplication
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

export interface ModelDefinition {
  id: string;
  name: string;
  provider: ModelProvider;
  description?: string;
  contextWindow?: number | string;
  maxOutputTokens?: number | string;
  isLocal?: boolean;
  specs?: any;
}
