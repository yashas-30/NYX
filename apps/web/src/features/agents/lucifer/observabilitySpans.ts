/**
 * observabilitySpans.ts
 *
 * Structured distributed-tracing–style span system for the Lucifer agent.
 * Every routing decision, tool call, search, LLM invocation, and memory
 * operation is recorded as a parent–child span tree per conversation turn.
 *
 * Design goals:
 * - Zero network overhead (all in-memory, flushed to Zustand only)
 * - Parent→child nesting: a "turn" span contains sub-spans for each step
 * - Correlatable by conversationId + turnId
 * - Rich metadata: model, tokens, cost, latency, status, fallback info
 */

import { create } from 'zustand';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SpanStatus = 'pending' | 'ok' | 'error' | 'fallback' | 'skipped';

export type SpanKind =
  | 'turn'           // Top-level: one full user→assistant exchange
  | 'intent_analysis'
  | 'context_analysis'
  | 'model_routing'
  | 'agentic_rag'
  | 'search'
  | 'page_fetch'
  | 'deep_research'
  | 'memory_read'
  | 'memory_write'
  | 'llm_call'
  | 'capability_fetch'
  | 'reflexion'
  | 'tool_call';

export interface LuciferSpan {
  spanId: string;
  parentSpanId?: string;
  turnId: string;           // Groups all spans from one user message
  conversationId?: string;
  kind: SpanKind;
  name: string;             // Human-readable label
  startMs: number;
  endMs?: number;
  durationMs?: number;
  status: SpanStatus;

  // LLM-specific
  model?: string;
  provider?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;

  // Search-specific
  searchProvider?: string;
  searchQuery?: string;
  resultCount?: number;

  // Routing-specific
  routingScore?: number;
  routingCandidates?: string[];

  // Reflexion-specific
  reflexionPassed?: boolean;
  reflexionIssues?: string[];

  // Generic metadata
  metadata?: Record<string, unknown>;
  error?: string;
}

// ── Span builder ──────────────────────────────────────────────────────────────

let _spanCounter = 0;
function newSpanId(): string {
  return `sp_${Date.now().toString(36)}_${(++_spanCounter).toString(36)}`;
}

export function newTurnId(): string {
  return `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Creates and immediately starts a span.
 * Call `endSpan(span, status, extra)` to finalize it.
 */
export function startSpan(
  kind: SpanKind,
  name: string,
  turnId: string,
  parentSpanId?: string,
  extra?: Partial<LuciferSpan>
): LuciferSpan {
  return {
    spanId: newSpanId(),
    parentSpanId,
    turnId,
    kind,
    name,
    startMs: Date.now(),
    status: 'pending',
    ...extra,
  };
}

/**
 * Finalizes a span and emits it to the Lucifer observability store.
 * Returns the completed span for chaining.
 */
export function endSpan(
  span: LuciferSpan,
  status: SpanStatus,
  extra?: Partial<LuciferSpan>
): LuciferSpan {
  const endMs = Date.now();
  const completed: LuciferSpan = {
    ...span,
    ...extra,
    endMs,
    durationMs: endMs - span.startMs,
    status,
  };

  // Emit to store
  try {
    useLuciferObservabilityStore.getState().addSpan(completed);
  } catch {
    // Store not initialized yet (e.g. during module evaluation / testing) — safe no-op
  }

  return completed;
}

/**
 * Convenience wrapper: runs an async fn inside a span, auto-ends it.
 */
export async function withSpan<T>(
  kind: SpanKind,
  name: string,
  turnId: string,
  fn: (span: LuciferSpan) => Promise<T>,
  parentSpanId?: string,
  extra?: Partial<LuciferSpan>
): Promise<T> {
  const span = startSpan(kind, name, turnId, parentSpanId, extra);
  try {
    const result = await fn(span);
    endSpan(span, 'ok');
    return result;
  } catch (err: any) {
    endSpan(span, 'error', { error: String(err) });
    throw err;
  }
}

// ── Observability store (separate from useLuciferStore to avoid bloat) ────────

const MAX_SPANS = 500;
const MAX_TURNS = 50;

interface ObservabilityState {
  spans: LuciferSpan[];
  /** Map of turnId → spans for that turn (derived, kept in sync) */
  turnIndex: Record<string, LuciferSpan[]>;
  /** Last N turn IDs in order */
  recentTurnIds: string[];
  activeTurnId: string | null;

  addSpan: (span: LuciferSpan) => void;
  setActiveTurnId: (id: string | null) => void;
  getSpansForTurn: (turnId: string) => LuciferSpan[];
  getTurnSummary: (turnId: string) => TurnSummary | null;
  clearOldTurns: () => void;
}

export interface TurnSummary {
  turnId: string;
  totalDurationMs: number;
  modelUsed?: string;
  provider?: string;
  tokensIn: number;
  tokensOut: number;
  estimatedCostUsd: number;
  searchCount: number;
  memoryReads: number;
  reflexionPassed: boolean | null;
  fallbacks: number;
  errors: number;
  spanCount: number;
}

export const useLuciferObservabilityStore = create<ObservabilityState>((set, get) => ({
  spans: [],
  turnIndex: {},
  recentTurnIds: [],
  activeTurnId: null,

  addSpan: (span) => {
    set((state) => {
      const newSpans = [...state.spans, span].slice(-MAX_SPANS);

      // Update turn index
      const newTurnIndex = { ...state.turnIndex };
      if (!newTurnIndex[span.turnId]) {
        newTurnIndex[span.turnId] = [];
      }
      newTurnIndex[span.turnId] = [...newTurnIndex[span.turnId], span];

      // Track recent turn IDs
      const recentTurnIds = state.recentTurnIds.includes(span.turnId)
        ? state.recentTurnIds
        : [...state.recentTurnIds, span.turnId].slice(-MAX_TURNS);

      return { spans: newSpans, turnIndex: newTurnIndex, recentTurnIds };
    });
  },

  setActiveTurnId: (id) => set({ activeTurnId: id }),

  getSpansForTurn: (turnId) => {
    return get().turnIndex[turnId] ?? [];
  },

  getTurnSummary: (turnId): TurnSummary | null => {
    const spans = get().turnIndex[turnId];
    if (!spans?.length) return null;

    const llmSpan = spans.find(s => s.kind === 'llm_call');
    const reflexionSpan = spans.find(s => s.kind === 'reflexion');
    const searchSpans = spans.filter(s => s.kind === 'search');
    const memSpans = spans.filter(s => s.kind === 'memory_read');
    const errorSpans = spans.filter(s => s.status === 'error');
    const fallbackSpans = spans.filter(s => s.status === 'fallback');

    const turnSpan = spans.find(s => s.kind === 'turn');
    const totalDuration = turnSpan?.durationMs
      ?? (spans[spans.length - 1].endMs ?? Date.now()) - spans[0].startMs;

    const tokensIn = spans.reduce((acc, s) => acc + (s.tokensIn ?? 0), 0);
    const tokensOut = spans.reduce((acc, s) => acc + (s.tokensOut ?? 0), 0);
    const estimatedCostUsd = spans.reduce((acc, s) => acc + (s.costUsd ?? 0), 0);

    return {
      turnId,
      totalDurationMs: totalDuration,
      modelUsed: llmSpan?.model,
      provider: llmSpan?.provider,
      tokensIn,
      tokensOut,
      estimatedCostUsd,
      searchCount: searchSpans.length,
      memoryReads: memSpans.length,
      reflexionPassed: reflexionSpan ? (reflexionSpan.reflexionPassed ?? null) : null,
      fallbacks: fallbackSpans.length,
      errors: errorSpans.length,
      spanCount: spans.length,
    };
  },

  clearOldTurns: () => {
    set((state) => {
      const keep = state.recentTurnIds.slice(-MAX_TURNS);
      const keepSet = new Set(keep);
      return {
        spans: state.spans.filter(s => keepSet.has(s.turnId)),
        turnIndex: Object.fromEntries(
          Object.entries(state.turnIndex).filter(([k]) => keepSet.has(k))
        ),
        recentTurnIds: keep,
      };
    });
  },
}));
