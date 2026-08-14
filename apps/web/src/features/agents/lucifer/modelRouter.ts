/**
 * modelRouter.ts
 *
 * Multi-objective dynamic model router for Lucifer.
 *
 * Given a task description + constraints, scores every available model
 * across 4 dimensions (quality, speed, cost, privacy) and selects the
 * best fit. Also handles:
 * - Capability filtering (vision required? reasoning required?)
 * - Privacy routing (sensitive queries → local model)
 * - Budget guardian (session cost > threshold → downgrade to local)
 * - Latency-budget awareness (real-time tasks → flash models)
 */

import { ModelCapabilityCard } from './useLuciferStore';
import { startSpan, endSpan } from './observabilitySpans';
import { AVAILABLE_MODELS } from '@shared/config/models';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoutingConstraints {
  /** Require vision/image input support */
  requiresVision?: boolean;
  /** Require extended reasoning (chain-of-thought) */
  requiresReasoning?: boolean;
  /** Require real-time web access (cloud only) */
  requiresRealtime?: boolean;
  /** Require image generation */
  requiresImageGen?: boolean;
  /** Require tool/function calling */
  requiresTools?: boolean;
  /** Message contains PII / sensitive data — route locally */
  isSensitive?: boolean;
  /** Max acceptable latency class */
  maxLatency?: 'ultra-fast' | 'fast' | 'medium' | 'slow';
  /** Quality vs speed tradeoff weight (0=speed, 1=quality) */
  qualityWeight?: number;
  /** Accumulated session cost in USD — triggers budget downgrade */
  sessionCostUsd?: number;
  /** Session budget limit in USD */
  budgetLimitUsd?: number;
  /** Current model ID (used as fallback) */
  currentModelId?: string;
  /** Current provider */
  currentProvider?: string;
  /** Available API keys */
  apiKeys?: Record<string, string | undefined>;
  /** Loaded local model ID (if any) */
  loadedLocalModel?: string | null;
  turnId: string;
  parentSpanId?: string;
}

export interface RoutingDecision {
  /** Recommended model ID */
  modelId: string;
  /** Provider string */
  provider: string;
  /** Why this model was chosen */
  reason: string;
  /** Composite score (0–1) */
  score: number;
  /** Whether the router overrode the user's current model */
  overrideApplied: boolean;
  /** Override reason (budget, privacy, capability) */
  overrideReason?: string;
  /** All scored candidates */
  candidates: Array<{ modelId: string; provider: string; score: number; reason: string }>;
}

// ── Model quality profiles ─────────────────────────────────────────────────

/**
 * Rough quality scores by model family (0–1).
 * These are heuristic estimates, not benchmark numbers.
 */
const MODEL_QUALITY_PROFILES: Record<string, number> = {
  // Gemini
  'gemini-3.6-flash': 0.85,
  'gemini-3.5-flash': 0.82,
  'gemini-3.5-pro': 0.93,
  'gemini-3.1-flash-lite': 0.70,
  'gemini-3.5-flash-lite': 0.72,
  // OpenRouter hosted models
  'anthropic/claude-sonnet': 0.94,
  'anthropic/claude': 0.94,
  'openai/gpt-4': 0.92,
  'openai/gpt-4o': 0.91,
  'openai/o1': 0.95,
  'openai/o3': 0.97,
  'deepseek/deepseek-reasoner': 0.90,
  'deepseek/deepseek-chat': 0.85,
  'google/gemini': 0.88,
  // Local models (lower bound — depends on specific model)
  'nyx-native': 0.72,
};

function getQualityScore(modelId: string, provider: string): number {
  const lower = modelId.toLowerCase();
  // Try exact match first
  for (const [key, score] of Object.entries(MODEL_QUALITY_PROFILES)) {
    if (lower.includes(key)) return score;
  }
  // Provider-level defaults
  if (provider === 'nyx-native') return 0.68;
  if (provider === 'gemini') return 0.82;
  if (provider === 'openrouter') return 0.80;
  return 0.75;
}

const LATENCY_SCORES: Record<string, number> = {
  'ultra-fast': 1.0,
  'fast': 0.85,
  'medium': 0.60,
  'slow': 0.30,
};

function getLatencyScore(card: ModelCapabilityCard | undefined, modelId: string): number {
  if (card?.latencyClass) return LATENCY_SCORES[card.latencyClass] ?? 0.60;
  const lower = modelId.toLowerCase();
  if (lower.includes('flash-lite') || lower.includes('flash')) return 0.90;
  if (lower.includes('pro') || lower.includes('reasoner')) return 0.55;
  if (lower.includes('nyx-native') || lower.includes('local')) return 0.65; // local is medium
  return 0.70;
}

function getCostScore(card: ModelCapabilityCard | undefined, provider: string): number {
  if (provider === 'nyx-native') return 1.0; // free
  if (!card?.pricing?.inputPer1MTokens) {
    // Estimate by provider
    if (provider === 'gemini') return 0.80;
    if (provider === 'openrouter') return 0.65;
    return 0.70;
  }
  const inputCost = card.pricing.inputPer1MTokens;
  if (inputCost === 0) return 1.0;
  if (inputCost < 0.20) return 0.95;
  if (inputCost < 1.0) return 0.85;
  if (inputCost < 5.0) return 0.70;
  if (inputCost < 15.0) return 0.50;
  return 0.30;
}

// ── Sensitivity detector ───────────────────────────────────────────────────

const SENSITIVE_PATTERNS =
  /\b(?:password|secret|api[_\s]key|private[_\s]key|ssn|social\s+security|credit\s+card|bank\s+account|medical|diagnosis|prescription|confidential|internal\s+only|not\s+for\s+sharing|patient|hipaa|pii|gdpr)\b/i;

export function isSensitiveQuery(query: string): boolean {
  return SENSITIVE_PATTERNS.test(query);
}

// ── Model candidate builder ────────────────────────────────────────────────

interface ModelCandidate {
  modelId: string;
  provider: string;
  isLocal: boolean;
  hasApiKey: boolean;
  capabilityCard?: ModelCapabilityCard;
}

function buildCandidates(
  constraints: RoutingConstraints,
  capabilityCardCache: Map<string, ModelCapabilityCard>
): ModelCandidate[] {
  const candidates: ModelCandidate[] = [];
  const apiKeys = constraints.apiKeys ?? {};

  // Add current model as first candidate (it's the user's choice)
  if (constraints.currentModelId && constraints.currentProvider) {
    const isLocal = constraints.currentProvider === 'nyx-native';
    const hasKey = isLocal || !!apiKeys[constraints.currentProvider];
    candidates.push({
      modelId: constraints.currentModelId,
      provider: constraints.currentProvider,
      isLocal,
      hasApiKey: hasKey,
      capabilityCard: capabilityCardCache.get(`${constraints.currentProvider}:${constraints.currentModelId}`),
    });
  }

  // Add loaded local model as a local candidate
  if (constraints.loadedLocalModel && constraints.loadedLocalModel !== constraints.currentModelId) {
    candidates.push({
      modelId: constraints.loadedLocalModel,
      provider: 'nyx-native',
      isLocal: true,
      hasApiKey: true,
      capabilityCard: capabilityCardCache.get(`nyx-native:${constraints.loadedLocalModel}`),
    });
  }

  // Add top cloud models as candidates (filtering by API key availability)
  const cloudModels = AVAILABLE_MODELS.slice(0, 8) as any[];
  for (const m of cloudModels) {
    if (m.id === constraints.currentModelId) continue;
    const hasKey = !!apiKeys[m.provider];
    if (!hasKey) continue;
    candidates.push({
      modelId: m.id,
      provider: m.provider,
      isLocal: false,
      hasApiKey: true,
      capabilityCard: capabilityCardCache.get(`${m.provider}:${m.id}`),
    });
  }

  return candidates;
}

// ── Capability filter ──────────────────────────────────────────────────────

function meetsCapabilityConstraints(
  candidate: ModelCandidate,
  constraints: RoutingConstraints
): { passes: boolean; failReason?: string } {
  const c = candidate.capabilityCard;

  if (!candidate.hasApiKey) {
    return { passes: false, failReason: 'no API key' };
  }
  if (constraints.requiresVision && !c?.supportsVision && !candidate.isLocal) {
    return { passes: false, failReason: 'vision not supported' };
  }
  if (constraints.requiresReasoning && !c?.supportsReasoning) {
    // Don't hard-fail on reasoning — just score lower
  }
  if (constraints.requiresRealtime && candidate.isLocal) {
    return { passes: false, failReason: 'realtime requires cloud' };
  }
  if (constraints.requiresImageGen && !candidate.isLocal) {
    // Image gen: prefer local GGUF image models or cloud with image gen
    // For now: don't filter, just score
  }
  if (constraints.isSensitive && !candidate.isLocal) {
    return { passes: false, failReason: 'sensitive query must use local model' };
  }
  return { passes: true };
}

// ── Scoring function ───────────────────────────────────────────────────────

function scoreCandidate(
  candidate: ModelCandidate,
  constraints: RoutingConstraints
): { score: number; reason: string } {
  const qualityWeight = constraints.qualityWeight ?? 0.50;
  const speedWeight = 1 - qualityWeight;
  const costWeight = 0.20; // Always a factor

  const quality = getQualityScore(candidate.modelId, candidate.provider);
  const latency = getLatencyScore(candidate.capabilityCard, candidate.modelId);
  const cost = getCostScore(candidate.capabilityCard, candidate.provider);

  // Bonus: reasoning model gets quality boost for reasoning tasks
  const reasoningBonus =
    constraints.requiresReasoning && candidate.capabilityCard?.supportsReasoning ? 0.10 : 0;
  // Bonus: local model gets speed boost (no network) and privacy score
  const localBonus = candidate.isLocal ? 0.05 : 0;

  const score = Math.min(
    1,
    quality * qualityWeight +
    latency * speedWeight * 0.80 +
    cost * costWeight +
    reasoningBonus +
    localBonus
  );

  const reasons: string[] = [];
  if (quality > 0.88) reasons.push('high quality');
  if (latency > 0.85) reasons.push('fast');
  if (cost > 0.90) reasons.push('free/cheap');
  if (candidate.isLocal) reasons.push('on-device privacy');
  if (reasoningBonus > 0) reasons.push('reasoning specialist');

  return { score, reason: reasons.join(', ') || 'general purpose' };
}

// ── Main router function ───────────────────────────────────────────────────

const CAPABILITY_CARD_CACHE = new Map<string, ModelCapabilityCard>();

/**
 * Register a fetched capability card so the router can use it for scoring.
 */
export function registerCapabilityCard(card: ModelCapabilityCard): void {
  CAPABILITY_CARD_CACHE.set(`${card.provider}:${card.modelId}`, card);
}

/**
 * Route a task to the best available model given constraints.
 *
 * Returns a RoutingDecision. If the current model is already optimal,
 * `overrideApplied` is false and `modelId` === `constraints.currentModelId`.
 *
 * The router NEVER switches models without the user noticing — it only
 * returns a recommendation. The caller decides whether to apply it.
 */
export function routeModel(constraints: RoutingConstraints): RoutingDecision {
  const routingSpan = startSpan(
    'model_routing',
    'Model Routing',
    constraints.turnId,
    constraints.parentSpanId
  );

  try {
    // Budget guardian: if session cost > limit, force local
    const budgetExceeded =
      constraints.budgetLimitUsd != null &&
      constraints.sessionCostUsd != null &&
      constraints.sessionCostUsd >= constraints.budgetLimitUsd;

    if (budgetExceeded && constraints.loadedLocalModel) {
      const decision: RoutingDecision = {
        modelId: constraints.loadedLocalModel,
        provider: 'nyx-native',
        reason: 'Budget limit reached — switched to on-device model',
        score: 1.0,
        overrideApplied: constraints.loadedLocalModel !== constraints.currentModelId,
        overrideReason: 'budget',
        candidates: [],
      };
      endSpan(routingSpan, 'ok', { metadata: { reason: 'budget_exceeded' } });
      return decision;
    }

    // Privacy routing: force local for sensitive content
    if (constraints.isSensitive && constraints.loadedLocalModel) {
      const decision: RoutingDecision = {
        modelId: constraints.loadedLocalModel,
        provider: 'nyx-native',
        reason: 'Sensitive query — routing to on-device model for privacy',
        score: 1.0,
        overrideApplied: constraints.loadedLocalModel !== constraints.currentModelId,
        overrideReason: 'privacy',
        candidates: [],
      };
      endSpan(routingSpan, 'ok', { metadata: { reason: 'privacy_routing' } });
      return decision;
    }

    // Build and filter candidates
    const candidates = buildCandidates(constraints, CAPABILITY_CARD_CACHE);
    const eligible = candidates.filter(c => meetsCapabilityConstraints(c, constraints).passes);

    if (eligible.length === 0) {
      // Fallback: return current model unchanged
      const fallback: RoutingDecision = {
        modelId: constraints.currentModelId ?? 'unknown',
        provider: constraints.currentProvider ?? 'unknown',
        reason: 'No eligible alternatives found — keeping current model',
        score: 0.5,
        overrideApplied: false,
        candidates: [],
      };
      endSpan(routingSpan, 'fallback');
      return fallback;
    }

    // Score all eligible candidates
    const scored = eligible
      .map(c => {
        const { score, reason } = scoreCandidate(c, constraints);
        return { ...c, score, reason };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const currentIsAlreadyBest =
      best.modelId === constraints.currentModelId &&
      best.provider === constraints.currentProvider;

    const decision: RoutingDecision = {
      modelId: best.modelId,
      provider: best.provider,
      reason: best.reason,
      score: best.score,
      overrideApplied: !currentIsAlreadyBest,
      candidates: scored.map(c => ({
        modelId: c.modelId,
        provider: c.provider,
        score: c.score,
        reason: c.reason,
      })),
    };

    endSpan(routingSpan, 'ok', {
      routingScore: best.score,
      routingCandidates: scored.slice(0, 3).map(c => c.modelId),
    });

    return decision;

  } catch (err) {
    endSpan(routingSpan, 'error', { error: String(err) });
    // Safe fallback
    return {
      modelId: constraints.currentModelId ?? 'unknown',
      provider: constraints.currentProvider ?? 'unknown',
      reason: 'Router error — keeping current model',
      score: 0.5,
      overrideApplied: false,
      candidates: [],
    };
  }
}

/**
 * Budget guardian: calculates whether session cost has exceeded the limit.
 */
export function isOverBudget(sessionCostUsd: number, limitUsd: number): boolean {
  return sessionCostUsd >= limitUsd;
}

/**
 * Estimates the cost of an LLM call from token counts and pricing info.
 */
export function estimateCallCost(
  tokensIn: number,
  tokensOut: number,
  card?: ModelCapabilityCard
): number {
  if (!card?.pricing) return 0;
  const inCost = ((card.pricing.inputPer1MTokens ?? 0) * tokensIn) / 1_000_000;
  const outCost = ((card.pricing.outputPer1MTokens ?? 0) * tokensOut) / 1_000_000;
  return inCost + outCost;
}
