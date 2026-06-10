export interface ModelCapabilities {
  id: string;
  contextWindow: number;
  costPer1kTokens: number;
  avgLatency: number;
  codingScore: number;
  reasoningScore: number;
  creativityScore: number;
  isAvailable: boolean;
}

export interface TaskProfile {
  type: 'coding' | 'reasoning' | 'creative';
  estimatedTokens: number;
  maxCost?: number;
  maxLatency?: number;
}

export interface ModelRecommendation {
  primary: ModelCapabilities;
  fallbacks: ModelCapabilities[];
}

const AVAILABLE_MODELS: ModelCapabilities[] = [
  { id: 'gemini-3.1-pro-preview', contextWindow: 2000000, costPer1kTokens: 0.01, avgLatency: 2000, codingScore: 95, reasoningScore: 95, creativityScore: 90, isAvailable: true },
  { id: 'gemini-3.5-flash', contextWindow: 1000000, costPer1kTokens: 0.001, avgLatency: 500, codingScore: 80, reasoningScore: 80, creativityScore: 85, isAvailable: true },
  { id: 'gemini-3.1-flash-lite', contextWindow: 1000000, costPer1kTokens: 0.0005, avgLatency: 300, codingScore: 70, reasoningScore: 72, creativityScore: 75, isAvailable: true },
  { id: 'nyx-gemma-4-e2b-it', contextWindow: 131072, costPer1kTokens: 0, avgLatency: 100, codingScore: 65, reasoningScore: 60, creativityScore: 65, isAvailable: true }
];

export function selectModel(task: TaskProfile): ModelRecommendation {
  const scores = AVAILABLE_MODELS.map(model => {
    let score = 0;

    if (task.type === 'coding') score += model.codingScore;
    if (task.type === 'reasoning') score += model.reasoningScore;
    if (task.type === 'creative') score += model.creativityScore;

    if (task.estimatedTokens > model.contextWindow * 0.8) score -= 100;
    else if (task.estimatedTokens < model.contextWindow * 0.3) score += 10;

    if (task.maxCost && model.costPer1kTokens * task.estimatedTokens > task.maxCost) score -= 1000;
    if (task.maxLatency && model.avgLatency > task.maxLatency) score -= 500;
    if (!model.isAvailable) score -= 10000;

    return { model, score };
  });

  scores.sort((a, b) => b.score - a.score);
  return {
    primary: scores[0].model,
    fallbacks: scores.slice(1, 3).map(s => s.model)
  };
}
