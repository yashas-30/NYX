import { db, isPg, schema } from '../db/client.js';
import { eq, lt, sql, and, asc } from 'drizzle-orm';

export interface CacheEntry {
  key: string;
  provider: string;
  model: string;
  data: string;
  createdAt: Date;
  expiresAt: Date | null;
  hitCount: number;
}

export class CacheRepository {
  private static get table(): any {
    return isPg ? schema.pgDbCache : schema.dbCache;
  }

  public static async get(key: string): Promise<CacheEntry | null> {
    const records = await db
      .select()
      .from(this.table)
      .where(eq(this.table.key, key))
      .limit(1);
    if (!records.length) return null;

    const entry = records[0] as CacheEntry;
    if (entry.expiresAt && new Date() > entry.expiresAt) {
      await this.delete(key);
      return null;
    }

    // Increment hit count
    await db
      .update(this.table)
      .set({ hitCount: (entry.hitCount || 0) + 1 })
      .where(eq(this.table.key, key));

    return entry;
  }

  public static async set(
    key: string,
    data: string,
    provider: string,
    model: string,
    ttlMs: number = 0
  ): Promise<void> {
    const expiresAt = ttlMs > 0 ? new Date(Date.now() + ttlMs) : null;
    const existing = await db
      .select()
      .from(this.table)
      .where(eq(this.table.key, key))
      .limit(1);

    if (existing.length) {
      await db
        .update(this.table)
        .set({
          data,
          provider,
          model,
          expiresAt,
          createdAt: new Date(),
        })
        .where(eq(this.table.key, key));
    } else {
      await db.insert(this.table).values({
        key,
        data,
        provider,
        model,
        expiresAt,
        createdAt: new Date(),
        hitCount: 0,
      });
    }
  }

  public static async evictOldestIfNeeded(maxItems: number): Promise<void> {
    const queryTable = this.table;
    // Evict expired entries first
    await db.delete(queryTable).where(lt(queryTable.expiresAt, new Date()));

    const all = await db
      .select({ key: queryTable.key })
      .from(queryTable)
      .orderBy(asc(queryTable.createdAt));

    if (all.length > maxItems) {
      const overflow = all.length - maxItems;
      const keysToDelete = all.slice(0, overflow).map((r: any) => r.key);
      for (const key of keysToDelete) {
        await db.delete(queryTable).where(eq(queryTable.key, key));
      }
    }
  }

  public static async delete(key: string): Promise<void> {
    await db.delete(this.table).where(eq(this.table.key, key));
  }

  public static async getStats(): Promise<{
    itemCount: number;
    totalSizeBytes: number;
    items: any[];
  }> {
    const records = await db.select().from(this.table);
    let size = 0;
    const items = records.map((r: any) => {
      const serialized = JSON.stringify(r);
      size += serialized.length;
      return {
        provider: r.provider,
        model: r.model,
        promptHash: r.key,
        createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
        size: serialized.length,
      };
    });

    return {
      itemCount: records.length,
      totalSizeBytes: size,
      items: items.sort((a: any, b: any) => b.createdAt - a.createdAt).slice(0, 50),
    };
  }

  public static async clear(): Promise<{ success: boolean; clearedCount: number }> {
    const queryTable = this.table;
    const records = await db.select({ key: queryTable.key }).from(queryTable);
    await db.delete(queryTable);
    return { success: true, clearedCount: records.length };
  }
}
