// ─── Model & Provider Types ───────────────────────────────────────────────────
// Add new providers here → they will automatically appear in the UI selector

import { ModelProvider, ModelSpecs, ModelOption, Provider } from '@nyx/shared';
export type { ModelProvider, ModelSpecs, ModelOption, Provider };

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

// fallow-ignore-next-line code-duplication
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
  availableQuantizations?: string[];
}
