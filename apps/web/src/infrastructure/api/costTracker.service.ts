import localforage from 'localforage';
import { countTokens } from '@src/features/ai/services/ai.service';

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export const PRICING_MATRIX: Record<string, ModelPricing> = {
  'gemini/gemini-3.5-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
  'gemini/gemini-3-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },

  'gemini/gemini-2.5-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
  'gemini/gemma-4-31b-it': { inputPer1M: 0.1, outputPer1M: 0.2 },
  'gemini/gemma-4-26b-a4b-it': { inputPer1M: 0.1, outputPer1M: 0.2 },

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
  static estimateTokens(text: string): number {
    return countTokens(text);
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
    const key = `usage_${crypto.randomUUID()}`;
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
