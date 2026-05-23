// ─── Model & Provider Types ───────────────────────────────────────────────────
// Add new providers here → they will automatically appear in the UI selector

export type ModelProvider =
  | 'gemini'
  | 'openrouter'
  | 'nvidia'
  | 'terminal'
  | 'lmstudio'
  | 'opencode'
  | 'pollinations'
  | 'ollama'
  | 'nyx-native'
  | 'qwen-local';

export interface OllamaModel {
  name: string;
  size: number;
}

export interface LMStudioModel {
  id: string;
  object: string;
  owned_by: string;
}

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
