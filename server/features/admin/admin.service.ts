import fs from 'fs';
import path from 'path';

import { CACHE_DIR } from '../../lib/paths.ts';
const RULES_FILE = path.join(CACHE_DIR, 'critic-rules.json');

export interface CriticRule {
  metric: string;
  critique: string;
  rule: string;
  timestamp: number;
}

export class RulesDb {
  private static ensureInitialized() {
    if (!fs.existsSync(CACHE_DIR)) {
      try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
      } catch (e) {
        console.error('[RulesDb] Failed to create cache directory:', e);
      }
    }

    if (!fs.existsSync(RULES_FILE)) {
      try {
        fs.writeFileSync(RULES_FILE, JSON.stringify([], null, 2), 'utf-8');
      } catch (e) {
        console.error('[RulesDb] Failed to create initial rules file:', e);
      }
    }
  }

  /**
   * Fetches all accumulated critic rules
   */
  public static getRules(): CriticRule[] {
    try {
      this.ensureInitialized();
      if (!fs.existsSync(RULES_FILE)) return [];
      
      const raw = fs.readFileSync(RULES_FILE, 'utf-8');
      const rules = JSON.parse(raw);
      if (Array.isArray(rules)) {
        return rules;
      }
      return [];
    } catch (e) {
      console.error('[RulesDb] Failed to read rules file:', e);
      return [];
    }
  }

  /**
   * Appends a new rule to the database if it doesn't already exist (deduplication)
   */
  public static addRule(metric: string, critique: string, rule: string): void {
    try {
      this.ensureInitialized();
      const rules = this.getRules();
      
      // Clean and normalize strings to check for duplicates
      const normalizedRule = rule.trim().toLowerCase();
      const duplicateExists = rules.some(r => r.rule.trim().toLowerCase() === normalizedRule);
      
      if (duplicateExists) {
        console.log(`[RulesDb] Rule already exists in database, skipping duplicate.`);
        return;
      }

      const newRule: CriticRule = {
        metric: metric.trim(),
        critique: critique.trim(),
        rule: rule.trim(),
        timestamp: Date.now()
      };

      rules.push(newRule);
      fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2), 'utf-8');
      console.log(`[RulesDb] Saved new rule successfully: "${rule}"`);
    } catch (e) {
      console.error('[RulesDb] Failed to write rule to file:', e);
    }
  }

  /**
   * Clears all stored rules from the database
   */
  public static resetRules(): void {
    try {
      this.ensureInitialized();
      fs.writeFileSync(RULES_FILE, JSON.stringify([], null, 2), 'utf-8');
      console.log('[RulesDb] All critic rules cleared.');
    } catch (e) {
      console.error('[RulesDb] Failed to reset rules database:', e);
    }
  }
}
