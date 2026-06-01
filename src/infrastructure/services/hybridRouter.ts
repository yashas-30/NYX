/**
 * @file src/infrastructure/services/hybridRouter.ts
 * @description Production-grade hybrid model router with predictive latency,
 *   cost optimization, per-request isolation, and Claude/Kimi-parity routing.
 *   Exclusively supports Gemini and local models (nyx-native, qwen-local).
 */

import { AVAILABLE_MODELS } from '@shared/config/models';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { Provider, RoutingDecision, SubagentTask, LocalModelState, AIResponse } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelPerformance {
  modelId: string;
  provider: string;
  avgLatencyMs: number;
  successRate: number; // 0-1
  lastUsed: number;
  costPer1KTokens: number;
  capabilities: string[];
}

interface RoutingContext {
  task: SubagentTask;
  apiKeys: Record<string, string>;
  requiresStreaming: boolean;
  requiresTools: boolean;
  requiresVision: boolean;
  maxLatencyMs?: number;
  maxCostPer1K?: number;
  preferredProviders?: string[];
}

interface WarmthPrediction {
  modelId: string;
  timeToWarmMs: number;
  vramRequiredMB: number;
  confidence: number; // 0-1
}

interface CircuitState {
  failures: number;
  successes: number;
  consecutiveFailures: number;
  lastFailure: number;
  lastSuccess: number;
  open: boolean;
  latencyWindow: number[]; // Last 10 latencies
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 30000;
const LATENCY_WINDOW_SIZE = 10;
const WARM_BOOT_TIME_MS = 2500;
const POOL_REFRESH_INTERVAL_MS = 30000;

// Cost estimates (USD per 1K tokens) for Gemini and Local models
const COST_TABLE: Record<string, number> = {
  'gemini-3.5-flash': 0.000075,
  'gemini-3-flash': 0.000075,
  'gemini-3.1-pro': 0.00125,
  'gemini-2.5-flash': 0.000075,
  'gemma-4-31b-it': 0.0001,
  'gemma-4-27b-it': 0.0001,
  'qwen2.5-coder-1.5b-native': 0,
  'qwen2.5-coder-3b-native': 0,
  'llama-3.2-3b-native': 0,
  'airllm-llama-3.3-70b': 0,
};

// ---------------------------------------------------------------------------
// Per-request router instance (isolated state)
// ---------------------------------------------------------------------------

export class HybridModelRouter {
  private localModelPool: Map<string, LocalModelState> = new Map();
  private performanceLog: Map<string, ModelPerformance> = new Map();
  private circuits: Map<string, CircuitState> = new Map();
  private lastPoolRefresh = 0;
  private poolRefreshPromise: Promise<void> | null = null;

  // -------------------------------------------------------------------------
  // Pool management
  // -------------------------------------------------------------------------

  async refreshLocalModelPool(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastPoolRefresh < POOL_REFRESH_INTERVAL_MS) {
      return;
    }

    // Deduplicate concurrent refreshes
    if (this.poolRefreshPromise) {
      return this.poolRefreshPromise;
    }

    this.poolRefreshPromise = this.doRefreshPool();
    try {
      await this.poolRefreshPromise;
    } finally {
      this.poolRefreshPromise = null;
      this.lastPoolRefresh = Date.now();
    }
  }

  private async doRefreshPool(): Promise<void> {
    const localEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('llm_ref_local_models_enabled') === 'true';
    if (!localEnabled) {
      this.localModelPool.clear();
      return;
    }
    try {
      const res = await fetchWithAuth('/api/nyx/local-models');
      if (!res.ok) return;

      const data = await res.json();
      const activeModelId = data.activeModelId;
      const models = data.models || [];

      for (const m of models) {
        const isHot = activeModelId === m.id;
        const existing = this.localModelPool.get(m.id);

        this.localModelPool.set(m.id, {
          modelId: m.id,
          status: isHot ? 'hot' : m.status === 'completed' ? 'cold' : 'failed',
          lastUsed: existing?.lastUsed || Date.now(),
          vramUsageMB: isHot ? (m.vramUsageMB || 4096) : 0,
          avgLatencyMs: isHot ? (m.avgLatencyMs || 150) : 0,
          totalRequests: existing?.totalRequests || 0,
        });
      }
    } catch (e) {
      console.warn('[HybridModelRouter] Pool refresh failed:', e);
    }
  }

  // -------------------------------------------------------------------------
  // Warmth prediction
  // -------------------------------------------------------------------------

  predictWarmth(modelId: string): WarmthPrediction {
    const model = this.localModelPool.get(modelId);
    const isHot = model?.status === 'hot';

    if (isHot) {
      return {
        modelId,
        timeToWarmMs: 0,
        vramRequiredMB: model?.vramUsageMB || 4096,
        confidence: 1.0,
      };
    }

    const isCold = model?.status === 'cold';
    if (isCold) {
      return {
        modelId,
        timeToWarmMs: WARM_BOOT_TIME_MS,
        vramRequiredMB: model?.vramUsageMB || 4096,
        confidence: 0.8,
      };
    }

    // Unknown model — high uncertainty
    return {
      modelId,
      timeToWarmMs: WARM_BOOT_TIME_MS * 2,
      vramRequiredMB: 8192,
      confidence: 0.3,
    };
  }

  // -------------------------------------------------------------------------
  // Circuit breaker (per-model, not per-provider)
  // -------------------------------------------------------------------------

  private getCircuit(modelId: string): CircuitState {
    if (!this.circuits.has(modelId)) {
      this.circuits.set(modelId, {
        failures: 0,
        successes: 0,
        consecutiveFailures: 0,
        lastFailure: 0,
        lastSuccess: Date.now(),
        open: false,
        latencyWindow: [],
      });
    }
    return this.circuits.get(modelId)!;
  }

  private isCircuitOpen(modelId: string): boolean {
    const state = this.getCircuit(modelId);
    if (!state.open) return false;

    if (Date.now() - state.lastFailure > CIRCUIT_RESET_MS) {
      state.open = false;
      state.consecutiveFailures = 0;
      return false;
    }
    return true;
  }

  recordSuccess(modelId: string, latencyMs: number): void {
    const state = this.getCircuit(modelId);
    state.successes++;
    state.consecutiveFailures = 0;
    state.lastSuccess = Date.now();
    state.open = false;

    state.latencyWindow.push(latencyMs);
    if (state.latencyWindow.length > LATENCY_WINDOW_SIZE) {
      state.latencyWindow.shift();
    }

    // Update performance log
    const perf = this.performanceLog.get(modelId) || {
      modelId,
      provider: this.inferProvider(modelId),
      avgLatencyMs: latencyMs,
      successRate: 1,
      lastUsed: Date.now(),
      costPer1KTokens: COST_TABLE[modelId] || 0.001,
      capabilities: [],
    };

    perf.avgLatencyMs =
      state.latencyWindow.reduce((a, b) => a + b, 0) / state.latencyWindow.length;
    perf.successRate = state.successes / (state.successes + state.failures);
    perf.lastUsed = Date.now();
    this.performanceLog.set(modelId, perf);
  }

  recordFailure(modelId: string): void {
    const state = this.getCircuit(modelId);
    state.failures++;
    state.consecutiveFailures++;
    state.lastFailure = Date.now();

    if (state.consecutiveFailures >= CIRCUIT_THRESHOLD) {
      state.open = true;
      console.warn(`[HybridModelRouter] Circuit OPEN for ${modelId}`);
    }
  }

  // -------------------------------------------------------------------------
  // Scoring
  // -------------------------------------------------------------------------

  private scoreModel(
    modelId: string,
    provider: string,
    context: RoutingContext
  ): number {
    const perf = this.performanceLog.get(modelId);
    const warmth = this.predictWarmth(modelId);

    // Hard constraints
    if (this.isCircuitOpen(modelId)) return -Infinity;
    if (context.requiresStreaming && !this.supportsStreaming(provider)) return -Infinity;
    if (context.requiresTools && !this.supportsTools(modelId)) return -Infinity;
    if (context.requiresVision && !this.supportsVision(modelId)) return -Infinity;
    if (context.maxLatencyMs && warmth.timeToWarmMs > context.maxLatencyMs) return -Infinity;

    // Latency score (lower is better)
    const predictedLatency = perf?.avgLatencyMs || warmth.timeToWarmMs || 1000;
    const latencyScore = Math.max(0, 1 - predictedLatency / 5000);

    // Cost score (lower is better)
    const cost = perf?.costPer1KTokens || COST_TABLE[modelId] || 0.001;
    const maxCost = context.maxCostPer1K || 0.01;
    const costScore = Math.max(0, 1 - cost / maxCost);

    // Success rate score
    const successScore = perf?.successRate || 0.5;

    // Warmth bonus
    const warmthBonus = warmth.timeToWarmMs === 0 ? 0.3 : 0;

    // Provider preference
    const preferenceBonus = context.preferredProviders?.includes(provider) ? 0.2 : 0;

    // Complexity match
    const complexityMatch = this.matchesComplexity(modelId, context.task.complexity) ? 0.2 : 0;

    return (
      latencyScore * 0.35 +
      costScore * 0.25 +
      successScore * 0.2 +
      warmthBonus +
      preferenceBonus +
      complexityMatch
    );
  }

  // -------------------------------------------------------------------------
  // Main routing
  // -------------------------------------------------------------------------

  async selectModel(context: RoutingContext): Promise<RoutingDecision> {
    await this.refreshLocalModelPool();

    const localEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('llm_ref_local_models_enabled') === 'true';
    const candidates = AVAILABLE_MODELS.filter((m) => {
      // Exclusively support Gemini and local models (nyx-native)
      if (m.provider === 'nyx-native') return localEnabled;
      if (m.provider === 'gemini') return !!context.apiKeys['gemini']?.trim();
      return false;
    });

    const scored = candidates
      .map((m) => ({
        model: m,
        score: this.scoreModel(m.id, m.provider, context),
      }))
      .filter((s) => s.score > -Infinity)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return {
        modelId: 'gemini-3.5-flash',
        provider: 'gemini' as Provider,
        reasoning: 'No viable models — falling back to Gemini 3.5 Flash',
        estimatedLatency: 2000,
        estimatedCost: 'low',
      };
    }

    const best = scored[0];
    const warmth = this.predictWarmth(best.model.id);
    const isLocal = best.model.provider === 'nyx-native';

    // Auto-warm cold local models for simple tasks
    if (isLocal && warmth.timeToWarmMs > 0 && context.task.complexity !== 'enterprise') {
      this.warmModel(best.model.id);
    }

    return {
      modelId: best.model.id,
      provider: best.model.provider as Provider,
      reasoning: `Selected ${best.model.name} (score: ${best.score.toFixed(2)}). ${
        warmth.timeToWarmMs > 0 ? `Cold boot: ${warmth.timeToWarmMs}ms.` : 'Hot in VRAM.'
      }`,
      estimatedLatency: warmth.timeToWarmMs + (this.performanceLog.get(best.model.id)?.avgLatencyMs || 500),
      estimatedCost: best.model.provider === 'nyx-native' ? 'free' : 'low',
    };
  }

  async selectPlannerModel(
    apiKeys: Record<string, string>,
    checkStatusFn: (provider: string) => Promise<'online' | 'offline' | 'no-key'>
  ): Promise<RoutingDecision> {
    return this.selectModel({
      task: { type: 'planning', complexity: 'moderate', description: 'planning' } as any as SubagentTask,
      apiKeys,
      requiresStreaming: false,
      requiresTools: false,
      requiresVision: false,
      maxLatencyMs: 2000,
      preferredProviders: ['nyx-native', 'gemini'],
    });
  }

  async routeSubagent(
    task: SubagentTask,
    apiKeys: Record<string, string>,
    checkStatusFn: (provider: string) => Promise<'online' | 'offline' | 'no-key'>
  ): Promise<RoutingDecision> {
    return this.selectModel({
      task,
      apiKeys,
      requiresStreaming: false,
      requiresTools: (task as any).requiresTools || false,
      requiresVision: (task as any).requiresVision || false,
      maxLatencyMs: (task as any).maxLatencyMs,
      preferredProviders: (task as any).preferredProviders,
    });
  }

  // -------------------------------------------------------------------------
  // Fallback chain execution
  // -------------------------------------------------------------------------

  async executeWithFallbackChain(
    executeFn: (
      modelId: string,
      provider: string,
      prompt: string,
      apiKey: string,
      systemInstruction?: string,
      settings?: any,
      onStream?: (text: string) => void,
      signal?: AbortSignal
    ) => Promise<AIResponse>,
    checkStatusFn: (provider: string) => Promise<'online' | 'offline' | 'no-key'>,
    modelId: string,
    provider: string,
    prompt: string,
    apiKeys: Record<string, string>,
    systemInstruction?: string,
    settings?: any,
    onStream?: (text: string) => void,
    signal?: AbortSignal
  ): Promise<AIResponse> {
    // Build dynamic fallback chain based on current performance (Gemini & Local only)
    const alternatives = AVAILABLE_MODELS.filter((m) => {
      if (m.id === modelId) return false;
      if (this.isCircuitOpen(m.id)) return false;
      if (m.provider === 'nyx-native') return true;
      if (m.provider === 'gemini') return !!apiKeys['gemini']?.trim();
      return false;
    }).sort((a, b) => {
      const scoreA = this.scoreModel(a.id, a.provider, {
        task: { type: 'fallback', complexity: 'moderate', description: 'fallback' } as any as SubagentTask,
        apiKeys,
        requiresStreaming: !!onStream,
        requiresTools: false,
        requiresVision: false,
      });
      const scoreB = this.scoreModel(b.id, b.provider, {
        task: { type: 'fallback', complexity: 'moderate', description: 'fallback' } as any as SubagentTask,
        apiKeys,
        requiresStreaming: !!onStream,
        requiresTools: false,
        requiresVision: false,
      });
      return scoreB - scoreA;
    });

    const chain = [
      { id: modelId, provider },
      ...alternatives.slice(0, 3).map((m) => ({ id: m.id, provider: m.provider })),
      { id: 'gemini-3.5-flash', provider: 'gemini' },
    ];

    let lastError: any = null;

    for (let i = 0; i < chain.length; i++) {
      const current = chain[i];
      const apiKey = apiKeys[current.provider] || '';

      if (current.provider !== 'nyx-native' && current.provider !== 'qwen-local' && !apiKey) {
        continue;
      }

      try {
        console.log(`[FallbackChain] ${current.id} (${current.provider}) [${i + 1}/${chain.length}]`);

        if (current.provider === 'nyx-native') {
          const status = await checkStatusFn('nyx-native').catch(() => 'offline');
          if (status !== 'online') {
            console.log('[FallbackChain] Booting cold local model fallback...');
            await fetchWithAuth('/api/nyx/local-models/run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ modelId: current.id, settings: { contextSize: 4096 } }),
            }).catch(() => {});
            await new Promise((r) => setTimeout(r, 2000)); // Sleep to allow start
          }
        }

        const startTime = performance.now();
        const res = await executeFn(
          current.id,
          current.provider,
          prompt,
          apiKey,
          systemInstruction,
          settings,
          onStream,
          signal
        );

        const latency = Math.round(performance.now() - startTime);
        this.recordSuccess(current.id, latency);
        return res;
      } catch (err: any) {
        lastError = err;
        const isAbort = err.name === 'AbortError' || signal?.aborted;
        if (isAbort) throw err;

        this.recordFailure(current.id);
        console.warn(`[FallbackChain] Failed: ${err.message}`);

        // OOM recovery
        if (/OOM|out of memory|vram|allocate/i.test(err.message)) {
          await this.handleOOM(current.id);
        }
      }
    }

    throw lastError || new Error('All fallback options exhausted');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async warmModel(modelId: string): Promise<void> {
    fetchWithAuth('/api/nyx/local-models/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId, settings: { contextSize: 4096 } }),
    }).catch(() => {});
  }

  private async handleOOM(modelId: string): Promise<void> {
    console.warn(`[HybridModelRouter] OOM for ${modelId} — stopping local models`);
    try {
      await fetchWithAuth('/api/nyx/local-models/stop', { method: 'POST' });
      // Clear hot models
      for (const [id, state] of this.localModelPool) {
        if (state.status === 'hot') {
          this.localModelPool.set(id, { ...state, status: 'cold', vramUsageMB: 0 });
        }
      }
    } catch (e) {
      console.error('[HybridModelRouter] OOM recovery failed:', e);
    }
  }

  private inferProvider(modelId: string): string {
    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    return model?.provider || 'unknown';
  }

  private supportsStreaming(provider: string): boolean {
    return true; // Gemini and local models natively support streaming in NYX
  }

  private supportsTools(modelId: string): boolean {
    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    return model?.specs?.modality?.includes('Multimodal') || false;
  }

  private supportsVision(modelId: string): boolean {
    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    return model?.specs?.modality?.includes('Multimodal') || false;
  }

  private matchesComplexity(modelId: string, complexity: string): boolean {
    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!model) return false;
    const tiers: Record<string, number> = { trivial: 1, simple: 2, moderate: 3, complex: 4, enterprise: 5 };
    const modelTier = tiers[model.id.includes('pro') ? 'complex' : 'moderate'] || 3;
    const taskTier = tiers[complexity] || 3;
    return modelTier >= taskTier;
  }

  getPool(): Map<string, LocalModelState> {
    return new Map(this.localModelPool);
  }

  getPerformanceLog(): Map<string, ModelPerformance> {
    return new Map(this.performanceLog);
  }

  // -------------------------------------------------------------------------
  // Static methods for backward compatibility delegating to global instance
  // -------------------------------------------------------------------------
  static getLocalModelPool(): Map<string, LocalModelState> {
    return getHybridRouter().getPool();
  }

  static async updateLocalModelPool(): Promise<void> {
    await getHybridRouter().refreshLocalModelPool();
  }

  static async selectPlannerModel(
    apiKeys: Record<string, string>,
    checkStatusFn: (provider: string) => Promise<'online' | 'offline' | 'no-key'>
  ): Promise<RoutingDecision> {
    return getHybridRouter().selectPlannerModel(apiKeys, checkStatusFn);
  }

  static async routeSubagent(
    task: SubagentTask,
    apiKeys: Record<string, string>,
    checkStatusFn: (provider: string) => Promise<'online' | 'offline' | 'no-key'>
  ): Promise<RoutingDecision> {
    return getHybridRouter().routeSubagent(task, apiKeys, checkStatusFn);
  }

  static async executeWithFallbackChain(
    executeWithContinuationFn: any,
    checkStatusFn: (provider: string) => Promise<'online' | 'offline' | 'no-key'>,
    modelId: string,
    provider: Provider | string,
    prompt: string,
    apiKeys: Record<string, string>,
    systemInstruction?: string,
    settings?: any,
    onStream?: (text: string) => void,
    signal?: AbortSignal
  ): Promise<AIResponse> {
    return getHybridRouter().executeWithFallbackChain(
      executeWithContinuationFn,
      checkStatusFn,
      modelId,
      provider,
      prompt,
      apiKeys,
      systemInstruction,
      settings,
      onStream,
      signal
    );
  }
}

// ---------------------------------------------------------------------------
// Legacy singleton for backward compatibility
// ---------------------------------------------------------------------------

let globalRouter: HybridModelRouter | null = null;

export function getHybridRouter(): HybridModelRouter {
  if (!globalRouter) {
    globalRouter = new HybridModelRouter();
  }
  return globalRouter;
}
