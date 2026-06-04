import { db, isPg, schema } from '../db/client.js';
import { eq, desc, asc, sql } from 'drizzle-orm';

export interface CriticRuleRecord {
  id: string;
  metric: string;
  critique: string;
  rule: string;
  timestamp: Date;
}

export class RuleRepository {
  private static get table(): any {
    return isPg ? schema.pgDbRules : schema.dbRules;
  }

  public static async getRules(): Promise<CriticRuleRecord[]> {
    return (await db
      .select()
      .from(this.table)
      .orderBy(asc(this.table.timestamp))) as CriticRuleRecord[];
  }

  public static async addRule(metric: string, critique: string, rule: string): Promise<void> {
    const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
    await db.insert(this.table).values({
      id,
      metric,
      critique,
      rule,
      timestamp: new Date(),
    });
  }

  public static async pruneRules(maxEntries: number): Promise<void> {
    const queryTable = this.table;
    const all = await db
      .select({ id: queryTable.id })
      .from(queryTable)
      .orderBy(asc(queryTable.timestamp));

    if (all.length > maxEntries) {
      const overflow = all.length - maxEntries;
      const idsToDelete = all.slice(0, overflow).map((r: any) => r.id);
      for (const id of idsToDelete) {
        await db.delete(queryTable).where(eq(queryTable.id, id));
      }
    }
  }

  public static async clear(): Promise<void> {
    await db.delete(this.table);
  }
}
