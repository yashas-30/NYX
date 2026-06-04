import { db, isPg, schema } from '../db/client.js';
import { eq, desc } from 'drizzle-orm';

export interface ChatSession {
  id: string;
  name: string;
  modelId: string;
  provider: string;
  createdAt: Date;
  updatedAt: Date;
}

export class SessionRepository {
  private static get table() {
    return isPg ? schema.pgDbSessions : schema.dbSessions;
  }

  public static async getById(id: string): Promise<ChatSession | null> {
    const records = await db
      .select()
      .from(this.table)
      .where(eq(this.table.id, id))
      .limit(1);
    if (!records.length) return null;
    return records[0] as ChatSession;
  }

  public static async list(): Promise<ChatSession[]> {
    return (await db
      .select()
      .from(this.table)
      .orderBy(desc(this.table.updatedAt))) as ChatSession[];
  }

  public static async create(session: {
    id: string;
    name: string;
    modelId: string;
    provider: string;
  }): Promise<void> {
    await db.insert(this.table).values({
      id: session.id,
      name: session.name,
      modelId: session.modelId,
      provider: session.provider,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  public static async update(
    id: string,
    updates: Partial<{ name: string; modelId: string; provider: string }>
  ): Promise<void> {
    await db
      .update(this.table)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(this.table.id, id));
  }

  public static async delete(id: string): Promise<void> {
    await db.delete(this.table).where(eq(this.table.id, id));
  }
}
