import { AISettings, InferenceOptions, InferenceResult, callAI } from './inferenceClient';
import { CostTrackerService } from './costTracker.service';

// Fix 7: Inline provider health tracker (EWMA latency + failure counting)
// Mirrors SmartRouter.updateProviderHealth() but lives in the browser bundle.
interface ProviderHealth {
  status: 'up' | 'down';
  lastChecked: number;
  avgLatency: number;
  failures: number;
}

const providerHealth = new Map<string, ProviderHealth>();

function recordProviderResult(provider: string, latencyMs: number, failed: boolean): void {
  const existing = providerHealth.get(provider);
  const avgLatency = existing
    ? existing.avgLatency * 0.7 + latencyMs * 0.3   // EWMA: α=0.3
    : latencyMs;
  const failures = failed ? (existing?.failures ?? 0) + 1 : 0;
  providerHealth.set(provider, {
    status: failures >= 3 ? 'down' : 'up',
    lastChecked: Date.now(),
    avgLatency,
    failures,
  });
}

export function getProviderHealth(provider: string): ProviderHealth | undefined {
  return providerHealth.get(provider);
}

export interface RouteConfig {
  provider: string;
  modelId: string;
}

export class AutoRouterService {
  private static costVsQuality: number = 0.5; // 0 = cheapest, 1 = best quality

  static setCostVsQuality(value: number) {
    this.costVsQuality = Math.max(0, Math.min(1, value));
  }

  static getFallbackChain(complexity: 'low' | 'medium' | 'high'): RouteConfig[] {
    // 0 = prioritize cost (cheaper models)
    // 1 = prioritize quality (expensive models)

    if (this.costVsQuality < 0.3) {
      return [
        { provider: 'ollama', modelId: 'ollama/qwen2.5-coder-7b' },
        { provider: 'gemini', modelId: 'gemini/gemini-3.5-flash' },
        { provider: 'gemini', modelId: 'gemini/gemma-4-26b-it' },
      ];
    } else if (this.costVsQuality > 0.7) {
      return [
        { provider: 'gemini', modelId: 'gemini/gemini-3.5-flash' },
        { provider: 'gemini', modelId: 'gemini/gemma-4-31b-it' },
        { provider: 'lmstudio', modelId: 'lmstudio/qwen2.5-coder-7b' },
      ];
    } else {
      // Balanced
      if (complexity === 'high') {
        return [
          { provider: 'gemini', modelId: 'gemini/gemini-3.5-flash' },
          { provider: 'ollama', modelId: 'ollama/qwen2.5-coder-7b' },
        ];
      }
      return [
        { provider: 'gemini', modelId: 'gemini/gemini-3.5-flash' },
        { provider: 'lmstudio', modelId: 'lmstudio/qwen2.5-coder-7b' },
      ];
    }
  }

  static determineComplexity(prompt: string): 'low' | 'medium' | 'high' {
    const tokens = CostTrackerService.estimateTokens(prompt);
    if (tokens > 2000) return 'high';
    if (tokens > 500) return 'medium';

    const highComplexityKeywords = [
      'architecture',
      'design pattern',
      'refactor',
      'algorithm',
      'concurrency',
    ];
    if (highComplexityKeywords.some((kw) => prompt.toLowerCase().includes(kw))) {
      return 'high';
    }

    return 'low';
  }

  static async executeWithRetryAndFallback(
    prompt: string,
    apiKeys: Record<string, string>,
    systemInstruction?: string,
    settings?: AISettings,
    onStream?: (text: string) => void,
    signal?: AbortSignal,
    options?: InferenceOptions
  ): Promise<InferenceResult> {
    const complexity = this.determineComplexity(prompt);
    const chain = this.getFallbackChain(complexity);

    let lastError: any;

    for (const route of chain) {
      const apiKey = apiKeys[route.provider];
      if (!apiKey) {
        console.warn(`[AutoRouter] Skipping ${route.provider} due to missing API key`);
        continue;
      }

      try {
        console.log(`[AutoRouter] Attempting route: ${route.provider} - ${route.modelId}`);
        const requestStart = Date.now();
        const result = await callAI(
          route.modelId,
          route.provider,
          prompt,
          apiKey,
          systemInstruction,
          settings,
          onStream,
          0,
          signal,
          undefined,
          options
        );
        // Fix 7: Record actual latency in the EWMA provider health tracker
        const latency = Date.now() - requestStart;
        recordProviderResult(route.provider, latency, false);

        // Record usage
        await CostTrackerService.recordUsage(
          route.modelId,
          route.provider,
          CostTrackerService.estimateTokens(prompt),
          result.tokens || 0
        );

        return result;
      } catch (err: any) {
        lastError = err;
        // Fix 7: Record failure in the EWMA provider health tracker
        recordProviderResult(route.provider, 30_000, true);
        console.warn(`[AutoRouter] Route ${route.provider} failed, failing over...`, err);
        // Break early if user aborted
        if (signal?.aborted) throw err;
      }
    }

    throw new Error(`All fallback routes failed. Last error: ${lastError?.message}`);
  }
}
