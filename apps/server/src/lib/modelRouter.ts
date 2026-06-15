export interface ModelCapabilities {
  id: string;
  contextWindow: number;
  costPer1kTokens: number;
  avgLatency: number;
  codingScore: number;
  reasoningScore: number;
  creativityScore: number;
  isAvailable: boolean;
  provider: string;
}

export interface TaskProfile {
  type: 'coding' | 'reasoning' | 'creative' | 'search' | 'general';
  estimatedTokens: number;
  maxCost?: number;
  maxLatency?: number;
}

export interface ModelRecommendation {
  primary: ModelCapabilities;
  fallbacks: ModelCapabilities[];
}

const AVAILABLE_MODELS: ModelCapabilities[] = [
  { id: 'gemini-3.5-flash', provider: 'gemini', contextWindow: 1000000, costPer1kTokens: 0.001, avgLatency: 500, codingScore: 80, reasoningScore: 80, creativityScore: 85, isAvailable: true },
  { id: 'gemini-3.1-flash-lite', provider: 'gemini', contextWindow: 1000000, costPer1kTokens: 0.0005, avgLatency: 300, codingScore: 70, reasoningScore: 72, creativityScore: 75, isAvailable: true },
  { id: 'deepseek-r1', provider: 'local', contextWindow: 64000, costPer1kTokens: 0, avgLatency: 1200, codingScore: 98, reasoningScore: 99, creativityScore: 60, isAvailable: true },
  { id: 'llama-3.1-8b', provider: 'local', contextWindow: 128000, costPer1kTokens: 0, avgLatency: 200, codingScore: 75, reasoningScore: 70, creativityScore: 80, isAvailable: true },
];

/**
 * Lightweight intent classification to route to the best Mixture of Agents (MoA)
 */
export function classifyIntent(prompt: string): TaskProfile['type'] {
  const lowerPrompt = prompt.toLowerCase();
  if (lowerPrompt.includes('code') || lowerPrompt.includes('function') || lowerPrompt.includes('refactor') || lowerPrompt.includes('bug')) {
    return 'coding';
  }
  if (lowerPrompt.includes('think') || lowerPrompt.includes('analyze') || lowerPrompt.includes('why') || lowerPrompt.includes('plan')) {
    return 'reasoning';
  }
  if (lowerPrompt.includes('search') || lowerPrompt.includes('find') || lowerPrompt.includes('latest')) {
    return 'search';
  }
  return 'general';
}

export function selectModel(task: TaskProfile, prompt?: string): ModelRecommendation {
  const actualType = prompt ? classifyIntent(prompt) : task.type;

  const scores = AVAILABLE_MODELS.map(model => {
    let score = 0;

    if (actualType === 'coding') score += model.codingScore * 1.5;
    if (actualType === 'reasoning') score += model.reasoningScore * 1.5;
    if (actualType === 'creative') score += model.creativityScore * 1.5;
    if (actualType === 'search') score += (model.avgLatency < 400 ? 50 : 0); // Fast models for search
    if (actualType === 'general') score += (model.avgLatency < 600 ? 30 : 0) + model.creativityScore;

    if (task.estimatedTokens > model.contextWindow * 0.8) score -= 200;
    else if (task.estimatedTokens < model.contextWindow * 0.3) score += 20;

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

/**
 * Dynamic Context Compression
 * Trims older context messages if they exceed the maxTokens limit,
 * ensuring the model never crashes due to context window limits.
 */
export async function compressContext(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number
): Promise<Array<{ role: string; content: string }>> {
  if (!messages || messages.length === 0) return messages;

  const { getEncoding } = await import('js-tiktoken');
  const enc = getEncoding('cl100k_base'); // standard for most models

  let currentTokens = 0;
  const compressed: Array<{ role: string; content: string }> = [];

  // Always keep the system prompt (usually the first message)
  let startIndex = 0;
  if (messages[0].role === 'system') {
    currentTokens += enc.encode(messages[0].content).length;
    compressed.push(messages[0]);
    startIndex = 1;
  }

  // Iterate backwards to keep the most recent context
  const recentMessages: Array<{ role: string; content: string }> = [];
  for (let i = messages.length - 1; i >= startIndex; i--) {
    const msgTokens = enc.encode(messages[i].content).length;
    if (currentTokens + msgTokens > maxTokens) {
      break; // Stop adding more context
    }
    currentTokens += msgTokens;
    recentMessages.unshift(messages[i]);
  }

  return [...compressed, ...recentMessages];
}
