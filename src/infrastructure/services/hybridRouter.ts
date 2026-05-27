/**
 * @file src/core/services/hybridRouter.ts
 * @description Advanced Hybrid Model Router with warmth prediction, VRAM management, and a robust fallback chain.
 */

import { AVAILABLE_MODELS } from '@src/features/model-registry/config/models';
import { AIService } from '@src/core/services/ai.service';
import { Provider, RoutingDecision, SubagentTask, LocalModelState, AIResponse } from '../types';

let localModelPool: Map<string, LocalModelState> = new Map();

export class HybridModelRouter {
  static getLocalModelPool(): Map<string, LocalModelState> {
    return localModelPool;
  }

  /**
   * Refreshes the warmth status and performance of local models from GGUF service endpoints.
   */
  static async updateLocalModelPool(): Promise<void> {
    try {
      const res = await AIService.fetchWithAuth('/api/nyx/local-models');
      if (res.ok) {
        const data = await res.json();
        const activeModelId = data.activeModelId;
        const models = data.models || [];

        for (const m of models) {
          const isHot = activeModelId === m.id;
          localModelPool.set(m.id, {
            modelId: m.id,
            status: isHot ? 'hot' : (m.status === 'completed' ? 'cold' : 'failed'),
            lastUsed: Date.now(),
            vramUsageMB: isHot ? 4096 : 0, // Approx base size
            avgLatencyMs: isHot ? 150 : 0,
            totalRequests: 0
          });
        }
      }
    } catch (e) {
      console.warn('[HybridModelRouter] Failed to sync local model pool:', e);
    }
  }

  /**
   * Selects the cheapest/fastest model for coordinating the planning stage.
   * Priority: local GGUF → local Qwen fallback → cloud free tier.
   */
  static async selectPlannerModel(apiKeys: Record<string, string>): Promise<RoutingDecision> {
    await this.updateLocalModelPool();

    const localStatus = await AIService.checkStatus('nyx-native').catch(() => 'offline' as const);
    if (localStatus === 'online') {
      let activeId = 'nyx-gemma-4-e2b-it';
      const hotModel = Array.from(localModelPool.values()).find(m => m.status === 'hot');
      if (hotModel) activeId = hotModel.modelId;

      return {
        modelId: activeId,
        provider: 'nyx-native' as Provider,
        reasoning: 'Local GGUF model active in RAM — zero network latency for planning',
        estimatedLatency: 50,
        estimatedCost: 'free'
      };
    }

    const qwenStatus = await AIService.checkStatus('qwen-local').catch(() => 'offline' as const);
    if (qwenStatus === 'online') {
      return {
        modelId: 'qwen-1.5b-local',
        provider: 'qwen-local' as Provider,
        reasoning: 'Qwen Python engine is available locally',
        estimatedLatency: 100,
        estimatedCost: 'free'
      };
    }

    return {
      modelId: 'pollinations/openai-fast',
      provider: 'pollinations' as Provider,
      reasoning: 'Local models cold — calling free pollinations planner',
      estimatedLatency: 800,
      estimatedCost: 'free'
    };
  }

  /**
   * Intelligently routes a subagent task based on warmth prediction rules.
   * Simple tasks trigger background boot of cold local models if they fit constraints.
   */
  static async routeSubagent(task: SubagentTask, apiKeys: Record<string, string>): Promise<RoutingDecision> {
    await this.updateLocalModelPool();

    const isComplex = task.complexity === 'complex' || task.complexity === 'enterprise';

    if (!isComplex && !task.requiresCloud) {
      const localStatus = await AIService.checkStatus('nyx-native').catch(() => 'offline' as const);
      if (localStatus === 'online') {
        let activeId = 'nyx-gemma-4-e2b-it';
        const hotModel = Array.from(localModelPool.values()).find(m => m.status === 'hot');
        if (hotModel) activeId = hotModel.modelId;

        return {
          modelId: activeId,
          provider: 'nyx-native' as Provider,
          reasoning: `Local GGUF model is hot in VRAM. Slashes task latency for simple ${task.type}.`,
          estimatedLatency: 150,
          estimatedCost: 'free'
        };
      } else {
        // Cold model warmth prediction check
        const isSimpleTask = task.complexity === 'simple' || task.complexity === 'trivial';
        if (isSimpleTask) {
          console.log(`[HybridModelRouter] Warmth match: booting cold local model for task: "${task.description}"`);
          
          // Fire-and-forget background boot request (keeps context size 4096)
          AIService.fetchWithAuth('/api/nyx/local-models/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId: 'nyx-gemma-4-e2b-it', settings: { contextSize: 4096 } })
          }).catch(() => {});

          return {
            modelId: 'nyx-gemma-4-e2b-it',
            provider: 'nyx-native' as Provider,
            reasoning: 'Warming cold local model: Slices round-trip overhead for simple task execution.',
            estimatedLatency: 2500, // Compensates for boot spin-up
            estimatedCost: 'free'
          };
        }
      }
    }

    return this.selectCloudModel(task, apiKeys);
  }

  /**
   * Evaluates and fires calls down a structured fallback chain with self-healing OOM migrations.
   */
  static async executeWithFallbackChain(
    modelId: string,
    provider: Provider | string,
    prompt: string,
    apiKeys: Record<string, string>,
    systemInstruction?: string,
    settings?: any,
    onStream?: (text: string) => void,
    signal?: AbortSignal
  ): Promise<AIResponse> {
    const chain = [
      { id: modelId, provider },
      { id: 'openrouter/meta-llama/llama-3.3-70b-instruct:free', provider: 'openrouter' },
      { id: 'pollinations/openai-fast', provider: 'pollinations' },
      { id: 'nvidia/meta/llama3-70b-instruct', provider: 'nvidia' },
      { id: 'nyx-gemma-4-e2b-it', provider: 'nyx-native' }
    ];

    let lastError: any = null;

    for (let i = 0; i < chain.length; i++) {
      const current = chain[i];

      if (current.provider === 'openrouter' && !apiKeys['openrouter']) continue;
      if (current.provider === 'nvidia' && !apiKeys['nvidia']) continue;

      try {
        console.log(`[FallbackChain] Attempting ${current.id} (${current.provider}) - Step ${i + 1}/${chain.length}`);

        if (current.provider === 'nyx-native') {
          const status = await AIService.checkStatus('nyx-native').catch(() => 'offline');
          if (status !== 'online') {
            console.log('[FallbackChain] Booting cold local model fallback...');
            await AIService.fetchWithAuth('/api/nyx/local-models/run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ modelId: current.id, settings: { contextSize: 4096 } })
            }).catch(() => {});
            await new Promise(r => setTimeout(r, 2000)); // Sleep to allow start
          }
        }

        const apiKey = apiKeys[current.provider] || '';
        return await AIService.executeWithContinuation(
          current.id,
          current.provider,
          prompt,
          apiKey,
          systemInstruction,
          settings,
          onStream,
          signal
        );
      } catch (err: any) {
        lastError = err;
        console.warn(`[FallbackChain] Failed on ${current.id}:`, err.message || err);

        // Handle native OOM recovery
        if (current.provider === 'nyx-native' && 
            (/OOM|out of memory|allocate|vram/i.test(err.message || ''))) {
          console.warn('[FallbackChain] Local VRAM OOM detected! Freeing assets and migrating to cloud fallback...');
          await AIService.fetchWithAuth('/api/nyx/local-models/stop', { method: 'POST' }).catch(() => {});
        }

        if (err.name === 'AbortError' || err.message?.includes('aborted') || signal?.aborted) {
          throw err;
        }
      }
    }

    throw lastError || new Error('Fallback chain exhausted - all providers failed.');
  }

  private static selectCloudModel(task: SubagentTask, apiKeys: Record<string, string>): RoutingDecision {
    const freeModels = AVAILABLE_MODELS.filter(m => {
      if (m.provider === 'pollinations') return true;
      if (m.provider === 'nvidia') return true;
      if (m.provider === 'opencode' && typeof m.id === 'string' && m.id.includes('free')) return true;
      if (m.provider === 'openrouter' && typeof m.id === 'string' && m.id.includes(':free')) return true;
      return false;
    });

    const availableFree = freeModels.filter(m => {
      if (m.provider === 'pollinations') return true;
      if (m.provider === 'nvidia') return true;
      return !!(apiKeys[m.provider]?.trim());
    });

    if (availableFree.length > 0) {
      const best = availableFree.reduce((acc, curr) => {
        const accCtx = parseInt(String(acc.specs?.contextWindow || '0').replace(/\D/g, '')) || 0;
        const currCtx = parseInt(String(curr.specs?.contextWindow || '0').replace(/\D/g, '')) || 0;
        return currCtx > accCtx ? curr : acc;
      });
      return {
        modelId: best.id,
        provider: best.provider as Provider,
        reasoning: `Cloud free tier: optimal context window for ${task.complexity} ${task.type}`,
        estimatedLatency: 1500,
        estimatedCost: 'free'
      };
    }

    const paidModels = AVAILABLE_MODELS.filter(m => {
      if (m.provider === 'pollinations') return true;
      return !!(apiKeys[m.provider]?.trim());
    });

    if (paidModels.length > 0) {
      const model = paidModels[0];
      return {
        modelId: model.id,
        provider: model.provider as Provider,
        reasoning: 'Paid cloud model selected based on active API keys',
        estimatedLatency: 2000,
        estimatedCost: 'medium'
      };
    }

    return {
      modelId: 'pollinations/openai-fast',
      provider: 'pollinations' as Provider,
      reasoning: 'No keys configured — executing on keyless Pollinations fallback',
      estimatedLatency: 1000,
      estimatedCost: 'free'
    };
  }
}
