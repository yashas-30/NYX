import { db, isPg, schema } from '../db/client.js';
import { sql, and, gte, desc } from 'drizzle-orm';

export interface UsageRecord {
  id: string;
  provider: string;
  modelId: string;
  tokens: number;
  latencyMs: number;
  timestamp: Date;
}

export class UsageRepository {
  private static get table() {
    return isPg ? schema.pgDbUsage : schema.dbUsage;
  }

  public static async record(record: {
    id: string;
    provider: string;
    modelId: string;
    tokens: number;
    latencyMs: number;
  }): Promise<void> {
    await db.insert(this.table).values({
      id: record.id,
      provider: record.provider,
      modelId: record.modelId,
      tokens: record.tokens,
      latencyMs: record.latencyMs,
      timestamp: new Date(),
    });
  }

  public static async getSummary(days: number = 30): Promise<any[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    if (isPg) {
      return await db
        .select({
          provider: schema.pgDbUsage.provider,
          modelId: schema.pgDbUsage.modelId,
          totalTokens: sql<number>`sum(${schema.pgDbUsage.tokens})`,
          avgLatencyMs: sql<number>`avg(${schema.pgDbUsage.latencyMs})`,
          requestCount: sql<number>`count(*)`,
        })
        .from(schema.pgDbUsage)
        .where(gte(schema.pgDbUsage.timestamp, cutoff))
        .groupBy(schema.pgDbUsage.provider, schema.pgDbUsage.modelId);
    } else {
      return await db
        .select({
          provider: schema.dbUsage.provider,
          modelId: schema.dbUsage.modelId,
          totalTokens: sql<number>`sum(${schema.dbUsage.tokens})`,
          avgLatencyMs: sql<number>`avg(${schema.dbUsage.latencyMs})`,
          requestCount: sql<number>`count(*)`,
        })
        .from(schema.dbUsage)
        .where(gte(schema.dbUsage.timestamp, cutoff))
        .groupBy(schema.dbUsage.provider, schema.dbUsage.modelId);
    }
  }

  public static async getTotalTokens(days: number = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const queryTable = this.table;
    const res = await db
      .select({
        total: sql<number>`sum(${queryTable.tokens})`,
      })
      .from(queryTable)
      .where(gte(queryTable.timestamp, cutoff));

    return res[0]?.total || 0;
  }
}
