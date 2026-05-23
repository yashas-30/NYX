// ─── Model & Provider Types ───────────────────────────────────────────────────
// Add new providers here → they will automatically appear in the UI selector

export type ModelProvider =
  | 'gemini'
  | 'openrouter'
  | 'nvidia'
  | 'terminal'
  | 'opencode'
  | 'pollinations'
  | 'nyx-native'
  | 'qwen-local';

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
