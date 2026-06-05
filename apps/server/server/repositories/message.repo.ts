import { db, isPg, schema } from '../db/client.js';
import { eq, asc } from 'drizzle-orm';

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status: 'loading' | 'success' | 'error' | 'stopped' | null;
  latencyMs: number | null;
  tokens: number | null;
  tps: number | null;
  timestamp: Date;
}

export class MessageRepository {
  private static get table() {
    return isPg ? schema.pgDbMessages : schema.dbMessages;
  }

  public static async getBySessionId(sessionId: string): Promise<ChatMessage[]> {
    return (await db
      .select()
      .from(this.table)
      .where(eq(this.table.sessionId, sessionId))
      .orderBy(asc(this.table.timestamp))) as ChatMessage[];
  }

  public static async create(message: {
    id: string;
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    status?: 'loading' | 'success' | 'error' | 'stopped';
    latencyMs?: number;
    tokens?: number;
    tps?: number;
    timestamp?: Date;
  }): Promise<void> {
    await db.insert(this.table).values({
      id: message.id,
      sessionId: message.sessionId,
      role: message.role,
      content: message.content,
      status: message.status || 'success',
      latencyMs: message.latencyMs || null,
      tokens: message.tokens || null,
      tps: message.tps || null,
      timestamp: message.timestamp || new Date(),
    });
  }

  public static async update(
    id: string,
    updates: Partial<{
      content: string;
      status: 'loading' | 'success' | 'error' | 'stopped';
      latencyMs: number;
      tokens: number;
      tps: number;
    }>
  ): Promise<void> {
    await db
      .update(this.table)
      .set(updates)
      .where(eq(this.table.id, id));
  }

  public static async deleteBySessionId(sessionId: string): Promise<void> {
    await db.delete(this.table).where(eq(this.table.sessionId, sessionId));
  }
}
