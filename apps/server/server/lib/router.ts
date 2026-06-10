import { ModelOption, Provider } from '@nyx/shared';
// import { loadKeys } from '../vault'; // TODO: adjust import path as needed

interface RoutingDecision {
  provider: Provider;
  modelId: string;
  apiKey: string;
  estimatedCost: number;
  estimatedLatency: number;
  confidence: number;
}

interface RouterConfig {
  primary: ModelOption;
  fallbacks: ModelOption[];
  maxCost?: number;
  maxLatency?: number;
  requireStreaming?: boolean;
}

export class SmartRouter {
  private providerHealth: Map<Provider, { status: 'up' | 'down'; lastChecked: number; avgLatency: number }> = new Map();

  async route(prompt: string, config: RouterConfig, apiKeys: Record<string, string> = {}): Promise<RoutingDecision> {
    const candidates = [config.primary, ...config.fallbacks];

    // Score each candidate
    const scored = await Promise.all(
      candidates.map(async (model) => {
        const health = this.providerHealth.get(model.provider);
        const key = apiKeys[model.provider] || '';

        // Skip if no API key
        if (!key && (model.provider as string) !== 'pollinations' && model.provider !== 'ollama' && model.provider !== 'lmstudio') {
          return null;
        }

        // Skip if provider is down
        if (health?.status === 'down' && Date.now() - health.lastChecked < 60000) {
          return null;
        }

        const cost = this.estimateCost(model, prompt);
        const latency = health?.avgLatency || this.estimateLatency(model);

        // Skip if exceeds budget
        if (config.maxCost && cost > config.maxCost) return null;
        if (config.maxLatency && latency > config.maxLatency) return null;

        // Score based on capability, cost, latency
        const capabilityScore = this.getCapabilityScore(model, prompt);
        const costScore = 1 / (cost + 0.001);
        const latencyScore = 1 / (latency + 1);

        const score = capabilityScore * 0.5 + costScore * 0.3 + latencyScore * 0.2;

        return {
          provider: model.provider,
          modelId: model.id,
          apiKey: key,
          estimatedCost: cost,
          estimatedLatency: latency,
          confidence: score
        };
      })
    );

    const valid = scored.filter((s): s is RoutingDecision => s !== null);
    valid.sort((a, b) => b.confidence - a.confidence);

    if (valid.length === 0) {
      throw new Error('No available models match routing criteria');
    }

    return valid[0];
  }

  private estimateCost(model: ModelOption, prompt: string): number {
    const promptTokens = Math.ceil(prompt.length / 4);
    const outputTokens = 2048; // Assume average output

    const pricing: Record<string, { input: number; output: number }> = {
      'gemini': { input: 0.0000005, output: 0.0000015 },  // $0.50 / 1M tokens
      'openrouter': { input: 0.000001, output: 0.000002 },
      'nvidia': { input: 0, output: 0 },  // Free tier
      'opencode': { input: 0, output: 0 },  // Free
      'pollinations': { input: 0, output: 0 },  // Free
      'ollama': { input: 0, output: 0 },  // Local
      'lmstudio': { input: 0, output: 0 },  // Local
    };

    const price = pricing[model.provider] || pricing.openrouter;
    return (promptTokens * price.input) + (outputTokens * price.output);
  }

  private estimateLatency(model: ModelOption): number {
    const baseLatency: Record<string, number> = {
      'gemini': 500,
      'openrouter': 800,
      'nvidia': 600,
      'opencode': 1000,
      'pollinations': 1500,
      'ollama': 200,  // Local is fastest
      'lmstudio': 200,
    };
    return baseLatency[model.provider] || 1000;
  }

  private getCapabilityScore(model: ModelOption, prompt: string): number {
    const promptLower = prompt.toLowerCase();
    let score = 0.5; // Base score

    // Coding tasks prefer code models
    if (/code|programming|function|class|implement/.test(promptLower)) {
      if (model.id.includes('coder') || model.id.includes('code')) score += 0.3;
    }

    // Long context tasks
    if (prompt.length > 10000) {
      const contextWindow = parseInt(model.specs?.contextWindow?.replace(/[^0-9]/g, '') || '0');
      if (contextWindow > 100) score += 0.2; // 100K+
    }

    // Multimodal tasks
    if (/image|picture|photo|diagram/.test(promptLower)) {
      if (model.specs?.modality === 'Multimodal') score += 0.3;
    }

    return Math.min(score, 1.0);
  }



  async updateProviderHealth(provider: Provider, latency: number, error?: boolean) {
    const current = this.providerHealth.get(provider);
    const avgLatency = current 
      ? current.avgLatency * 0.7 + latency * 0.3  // EWMA
      : latency;

    this.providerHealth.set(provider, {
      status: error ? 'down' : 'up',
      lastChecked: Date.now(),
      avgLatency
    });
  }
}
