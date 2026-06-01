import fs from 'fs';
import path from 'path';
import { sqlite } from '../../db/client.ts';
import { CACHE_DIR } from '../../lib/paths.ts';
import logger from '../../lib/logger.ts';

const RULES_FILE = path.join(CACHE_DIR, 'critic-rules.json');

/** Maximum number of rules to keep in the database before pruning oldest entries. */
const RULES_DB_MAX_ENTRIES = parseInt(process.env.RULES_DB_MAX_ENTRIES || '500', 10);

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
  private static ensureInitialized() {
    if (!fs.existsSync(CACHE_DIR)) {
      try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
      } catch (e: any) {
        logger.error({ err: e }, '[RulesDb] Failed to create cache directory');
      }
    }
    if (!fs.existsSync(RULES_FILE)) {
      try {
        fs.writeFileSync(RULES_FILE, JSON.stringify([], null, 2), 'utf-8');
      } catch (e: any) {
        logger.error({ err: e }, '[RulesDb] Failed to create initial rules file');
      }
    }
  }

  public static getRules(): CriticRule[] {
    try {
      this.ensureInitialized();
      if (!fs.existsSync(RULES_FILE)) return [];
      const raw = fs.readFileSync(RULES_FILE, 'utf-8');
      const rules = JSON.parse(raw);
      if (Array.isArray(rules)) return rules;
      return [];
    } catch (e: any) {
      logger.error({ err: e }, '[RulesDb] Failed to read rules file');
      return [];
    }
  }

  /**
   * Appends a new rule to the database if it doesn't already exist (deduplication).
   * MISSING-8 fix: After appending, prune if count exceeds RULES_DB_MAX_ENTRIES.
   */
  public static addRule(metric: string, critique: string, rule: string): void {
    try {
      this.ensureInitialized();
      const rules = this.getRules();
      const normalizedRule = rule.trim().toLowerCase();
      const duplicateExists = rules.some((r) => r.rule.trim().toLowerCase() === normalizedRule);
      if (duplicateExists) {
        logger.debug('[RulesDb] Rule already exists in database, skipping duplicate.');
        return;
      }
      const newRule: CriticRule = {
        metric: metric.trim(),
        critique: critique.trim(),
        rule: rule.trim(),
        timestamp: Date.now(),
      };
      rules.push(newRule);
      // MISSING-8: Prune oldest entries if limit exceeded
      this.pruneRules(rules);
      fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2), 'utf-8');
      logger.info({ rule }, '[RulesDb] Saved new rule successfully');
    } catch (e: any) {
      logger.error({ err: e }, '[RulesDb] Failed to write rule to file');
    }
  }

  /**
   * MISSING-8 fix: Prune rules array in-place, removing oldest entries when limit exceeded.
   */
  private static pruneRules(rules: CriticRule[]): void {
    if (rules.length > RULES_DB_MAX_ENTRIES) {
      const overflow = rules.length - RULES_DB_MAX_ENTRIES;
      rules.splice(0, overflow); // Remove oldest (front of array)
      logger.info(
        { pruned: overflow, remaining: rules.length },
        '[RulesDb] Pruned oldest rules to stay within limit'
      );
    }
  }

  public static resetRules(): void {
    try {
      this.ensureInitialized();
      fs.writeFileSync(RULES_FILE, JSON.stringify([], null, 2), 'utf-8');
      logger.info('[RulesDb] All critic rules cleared.');
    } catch (e: any) {
      logger.error({ err: e }, '[RulesDb] Failed to reset rules database');
    }
  }
}

// ---------------------------------------------------------------------------
// MISSING-3: Usage cost tracking persistence
// ---------------------------------------------------------------------------
export class UsageTracker {
  /**
   * Persists a usage record to the usage_costs SQLite table.
   * Previously trackUsage received tokens but didn't persist — this fixes that.
   */
  static trackUsage(
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
    sessionId?: string
  ): void {
    try {
      const costPerMillion = COST_PER_MILLION_OUTPUT[provider] ?? 0;
      const estimatedCostUsd = (completionTokens / 1_000_000) * costPerMillion;
      sqlite
        .prepare(
          `
        INSERT INTO usage_costs (provider, model, prompt_tokens, completion_tokens, estimated_cost_usd, session_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        )
        .run(provider, model, promptTokens, completionTokens, estimatedCostUsd, sessionId || null);
    } catch (e: any) {
      logger.error({ err: e }, '[UsageTracker] Failed to persist usage record');
    }
  }

  /**
   * Returns usage summary aggregated by provider and model.
   */
  static getUsageSummary(days = 30): any[] {
    // Clamp to a safe range before binding to prevent injection via template literals
    const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
    try {
      return sqlite
        .prepare(
          `
        SELECT
          provider,
          model,
          SUM(prompt_tokens) as total_prompt_tokens,
          SUM(completion_tokens) as total_completion_tokens,
          SUM(estimated_cost_usd) as total_cost_usd,
          COUNT(*) as request_count,
          DATE(timestamp) as date
        FROM usage_costs
        WHERE timestamp >= DATETIME('now', ? || ' days')
        GROUP BY provider, model, DATE(timestamp)
        ORDER BY date DESC, total_cost_usd DESC
      `
        )
        .all(`-${safeDays}`);
    } catch (e: any) {
      logger.error({ err: e }, '[UsageTracker] Failed to query usage summary');
      return [];
    }
  }

  static getTotalCost(days = 30): number {
    const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
    try {
      const row = sqlite
        .prepare(
          `
        SELECT SUM(estimated_cost_usd) as total
        FROM usage_costs
        WHERE timestamp >= DATETIME('now', ? || ' days')
      `
        )
        .get(`-${safeDays}`) as any;
      return row?.total ?? 0;
    } catch {
      return 0;
    }
  }
}
