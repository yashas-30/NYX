// ─── Model & Provider Types ───────────────────────────────────────────────────
// Add new providers here → they will automatically appear in the UI selector

export type ModelProvider = 'gemini' | 'terminal' | 'nyx-native';

export interface ModelSpecs {
  contextWindow: string;
  trainingData: string;
  maxOutput: string;
  modality: string;
  parameters?: string;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: ModelProvider;
  description: string;
  isLocal?: boolean;
  specs?: ModelSpecs;
}

export type Provider = ModelProvider;

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  tier: 'fast' | 'balanced' | 'powerful';
  contextWindow: number;
  supportsVision: boolean;
  supportsTools: boolean;
  description: string;
}

export interface LocalModelPreset {
  id: string;
  name: string;
  provider?: string;
  size?: string;
  url?: string;
  fileName?: string;
  description?: string;
  ramRequired?: string;
  vramRequired?: string;
  paramCount?: string;
  quantization?: string;
  contextLength?: string;
  featured?: boolean;
  status?: string;
  progress?: any;
  metadata?: any;
}
