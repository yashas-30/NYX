import localforage from 'localforage';
import { getEncoding } from 'js-tiktoken';

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export const PRICING_MATRIX: Record<string, ModelPricing> = {
  'gemini/gemini-3.5-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
  'gemini/gemini-3-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
  'gemini/gemini-3.1-pro': { inputPer1M: 3.5, outputPer1M: 10.5 },
  'gemini/gemini-2.5-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
  'gemini/gemma-4-31b-it': { inputPer1M: 0.1, outputPer1M: 0.2 },
  'gemini/gemma-4-27b-it': { inputPer1M: 0.1, outputPer1M: 0.2 },
  'nyx-native/nyx-gemma-4-e2b-it': { inputPer1M: 0, outputPer1M: 0 },
  'nyx-native/qwen2.5-coder-1.5b-native': { inputPer1M: 0, outputPer1M: 0 },
  'nyx-native/qwen2.5-coder-3b-native': { inputPer1M: 0, outputPer1M: 0 },
  'nyx-native/llama-3.2-3b-native': { inputPer1M: 0, outputPer1M: 0 },
};

export interface UsageRecord {
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: number;
}

const usageStore = localforage.createInstance({
  name: 'NYX',
  storeName: 'api_usage',
});

export class CostTrackerService {
  private static encoding = getEncoding('cl100k_base');

  static estimateTokens(text: string): number {
    return this.encoding.encode(text).length;
  }

  static estimateCost(model: string, inputTokens: number, outputTokens: number = 0): number {
    const pricing = PRICING_MATRIX[model];
    if (!pricing) return 0;
    const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
    return inputCost + outputCost;
  }

  static async recordUsage(
    model: string,
    provider: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    const cost = this.estimateCost(model, inputTokens, outputTokens);
    const record: UsageRecord = {
      model,
      provider,
      inputTokens,
      outputTokens,
      cost,
      timestamp: Date.now(),
    };
    const key = `usage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await usageStore.setItem(key, record);
  }

  static async getMonthlySpend(): Promise<number> {
    let total = 0;
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    await usageStore.iterate((value: UsageRecord) => {
      if (value.timestamp >= thirtyDaysAgo) {
        total += value.cost;
      }
    });
    return total;
  }
}
