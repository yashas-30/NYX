import { AISettings, InferenceOptions, InferenceResult, callAI } from './inferenceClient';
import { CostTrackerService } from './costTracker.service';

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
        { provider: 'nyx-native', modelId: 'nyx-native/qwen2.5-coder-1.5b-native' },
        { provider: 'gemini', modelId: 'gemini/gemini-3.5-flash' },
        { provider: 'gemini', modelId: 'gemini/gemma-4-27b-it' },
      ];
    } else if (this.costVsQuality > 0.7) {
      return [
        { provider: 'gemini', modelId: 'gemini/gemini-3.1-pro' },
        { provider: 'gemini', modelId: 'gemini/gemma-4-31b-it' },
        { provider: 'nyx-native', modelId: 'nyx-native/nyx-gemma-4-e2b-it' },
      ];
    } else {
      // Balanced
      if (complexity === 'high') {
        return [
          { provider: 'gemini', modelId: 'gemini/gemini-3.1-pro' },
          { provider: 'nyx-native', modelId: 'nyx-native/nyx-gemma-4-e2b-it' },
        ];
      }
      return [
        { provider: 'gemini', modelId: 'gemini/gemini-3.5-flash' },
        { provider: 'nyx-native', modelId: 'nyx-native/qwen2.5-coder-3b-native' },
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
        console.warn(`[AutoRouter] Route ${route.provider} failed, failing over...`, err);
        // Break early if user aborted
        if (signal?.aborted) throw err;
      }
    }

    throw new Error(`All fallback routes failed. Last error: ${lastError?.message}`);
  }
}
