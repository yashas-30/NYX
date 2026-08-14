export interface LuciferPersonaOptions {
  modelId?: string;
  provider?: string;
  isLocalModel?: boolean;
  capabilityCard?: {
    contextWindow: number;
    maxOutputTokens: number;
    supportsVision: boolean;
    supportsTools: boolean;
    supportsReasoning: boolean;
    supportsAudio: boolean;
    trainingCutoff?: string;
    pricing?: { inputPer1MTokens?: number; outputPer1MTokens?: number; currency?: string };
    latencyClass?: string;
  };
  previousResponseSnippet?: string;
}

/**
 * Builds the Lucifer system persona with model-aware context injection.
 * Uses flat markdown prose without XML tags or token-priming negative constraints.
 */
export function getLuciferPersona(options?: LuciferPersonaOptions): string {
  return `You are Lucifer, an AI assistant. Answer directly, accurately, and concisely.`;
}

/**
 * Static default persona (no model context) — kept for backward compatibility.
 */
export const LUCIFER_PERSONA = getLuciferPersona();
