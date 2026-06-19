import { sqlite } from '../../db/client.js';
import logger from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { RuleRepository } from '../../repositories/rule.repo.js';
import { UsageRepository } from '../../repositories/usage.repo.js';

/** Maximum number of rules to keep in the database before pruning oldest entries. */
const RULES_DB_MAX_ENTRIES = env.RULES_DB_MAX_ENTRIES;

export interface CriticRule {
  metric: string;
  critique: string;
  rule: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------

/** Simple per-provider cost estimates in USD per 1M tokens (output) */
const COST_PER_MILLION_OUTPUT: Record<string, number> = {
  gemini: 0.375,
  'nyx-native': 0,
};

// ---------------------------------------------------------------------------
// RulesDb
// ---------------------------------------------------------------------------
export class RulesDb {
  public static async getRules(): Promise<CriticRule[]> {
    try {
      const records = await RuleRepository.getRules();
      return records.map((r) => ({
        metric: r.metric,
        critique: r.critique,
        rule: r.rule,
        timestamp: r.timestamp ? new Date(r.timestamp).getTime() : Date.now(),
      }));
    } catch (e: any) {
      logger.error({ err: e }, '[RulesDb] Failed to read rules from database');
      return [];
    }
  }

  /**
   * Appends a new rule to the database if it doesn't already exist (deduplication).
   */
  public static async addRule(metric: string, critique: string, rule: string): Promise<void> {
    try {
      const rules = await this.getRules();
      const normalizedRule = rule.trim().toLowerCase();
      const duplicateExists = rules.some((r) => r.rule.trim().toLowerCase() === normalizedRule);
      if (duplicateExists) {
        logger.debug('[RulesDb] Rule already exists in database, skipping duplicate.');
        return;
      }

      await RuleRepository.addRule(metric.trim(), critique.trim(), rule.trim());
      await RuleRepository.pruneRules(RULES_DB_MAX_ENTRIES);
      logger.info({ rule }, '[RulesDb] Saved new rule successfully');
    } catch (e: any) {
      logger.error({ err: e }, '[RulesDb] Failed to write rule to database');
    }
  }

  public static async resetRules(): Promise<void> {
    try {
      await RuleRepository.clear();
      logger.info('[RulesDb] All critic rules cleared.');
    } catch (e: any) {
      logger.error({ err: e }, '[RulesDb] Failed to reset rules database');
    }
  }
}

// ---------------------------------------------------------------------------
// UsageTracker
// ---------------------------------------------------------------------------
export class UsageTracker {
  /**
   * Persists a usage record to the database usage tables.
   */
  static async trackUsage(
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
    sessionId?: string
  ): Promise<void> {
    try {
      const totalTokens = promptTokens + completionTokens;
      const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
      await UsageRepository.record({
        id,
        provider,
        modelId: model,
        tokens: totalTokens,
        latencyMs: 0, // latency unknown in trackUsage call signature
      });
    } catch (e: any) {
      logger.error({ err: e }, '[UsageTracker] Failed to persist usage record');
    }
  }

  /**
   * Returns usage summary aggregated by provider and model.
   */
  static async getUsageSummary(days = 30): Promise<any[]> {
    try {
      const summary = await UsageRepository.getSummary(days);
      return summary.map((s) => ({
        provider: s.provider,
        model: s.modelId,
        total_prompt_tokens: Math.floor(s.totalTokens / 2), // estimate prompt
        total_completion_tokens: Math.floor(s.totalTokens / 2), // estimate completion
        total_cost_usd: (s.totalTokens / 1_000_000) * (COST_PER_MILLION_OUTPUT[s.provider] ?? 0),
        request_count: s.requestCount,
        date: new Date().toISOString().split('T')[0], // general daily label
      }));
    } catch (e: any) {
      logger.error({ err: e }, '[UsageTracker] Failed to query usage summary');
      return [];
    }
  }

  static async getTotalCost(days = 30): Promise<number> {
    try {
      const summary = await UsageRepository.getSummary(days);
      return summary.reduce((acc, s) => {
        const costPerMillion = COST_PER_MILLION_OUTPUT[s.provider] ?? 0;
        return acc + (s.totalTokens / 1_000_000) * costPerMillion;
      }, 0);
    } catch {
      return 0;
    }
  }
}
