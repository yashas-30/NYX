import fs from 'fs';
import path from 'path';
import { db } from '../db/client.ts';
import { conversations, messages } from '../db/schema.ts';
import { eq, desc } from 'drizzle-orm';
import { APP_STATE_DIR } from './paths.ts';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

const STORE_PATH = path.join(APP_STATE_DIR, 'conversations.json');

export const ConversationStore = {
  list(): Conversation[] {
    try {
      const records = db.select().from(conversations).orderBy(desc(conversations.updatedAt)).all();
      return records.map(conv => {
        const msgs = db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(messages.timestamp).all();
        return {
          id: conv.id,
          title: conv.title,
          model: conv.model,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          messages: msgs.map(m => ({
            id: m.id,
            role: m.role as any,
            content: m.content,
            model: m.model,
            timestamp: m.timestamp,
          })),
        };
      });
    } catch (err) {
      console.error('[ConversationStore] list failed:', err);
      return [];
    }
  },

  get(id: string): Conversation | null {
    try {
      const conv = db.select().from(conversations).where(eq(conversations.id, id)).get();
      if (!conv) return null;
      const msgs = db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.timestamp).all();
      return {
        id: conv.id,
        title: conv.title,
        model: conv.model,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messages: msgs.map(m => ({
          id: m.id,
          role: m.role as any,
          content: m.content,
          model: m.model,
          timestamp: m.timestamp,
        })),
      };
    } catch (err) {
      console.error('[ConversationStore] get failed:', err);
      return null;
    }
  },

  upsert(conv: Conversation): void {
    try {
      db.transaction((tx) => {
        // Upsert conversation parent
        tx.insert(conversations)
          .values({
            id: conv.id,
            title: conv.title,
            model: conv.model,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
          })
          .onConflictDoUpdate({
            target: conversations.id,
            set: {
              title: conv.title,
              model: conv.model,
              updatedAt: conv.updatedAt,
            },
          })
          .run();

        // Clear existing messages to perform a clean sync
        tx.delete(messages).where(eq(messages.conversationId, conv.id)).run();

        // Batch insert new messages
        if (conv.messages && conv.messages.length > 0) {
          for (const msg of conv.messages) {
            tx.insert(messages)
              .values({
                id: msg.id || `${conv.id}-${Date.now()}-${Math.random()}`,
                conversationId: conv.id,
                role: msg.role,
                content: msg.content,
                model: msg.model || conv.model,
                timestamp: msg.timestamp || Date.now(),
              })
              .run();
          }
        }
      });
    } catch (err) {
      console.error('[ConversationStore] upsert failed:', err);
    }
  },

  delete(id: string): void {
    try {
      db.delete(conversations).where(eq(conversations.id, id)).run();
    } catch (err) {
      console.error('[ConversationStore] delete failed:', err);
    }
  },

  clear(): void {
    try {
      db.delete(conversations).run();
    } catch (err) {
      console.error('[ConversationStore] clear failed:', err);
    }
  },
};

/**
 * Automigration helper to port JSON chat logs to SQLite database on startup
 */
export function migrateOldStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      console.log('[DB] Found legacy conversations.json. Initiating automatic migration to SQLite...');
      const storeContent = fs.readFileSync(STORE_PATH, 'utf8');
      const store = JSON.parse(storeContent) as Record<string, Conversation>;

      let count = 0;
      for (const key of Object.keys(store)) {
        const conv = store[key];
        if (conv && conv.id) {
          ConversationStore.upsert(conv);
          count++;
        }
      }

      console.log(`[DB] Successfully migrated ${count} legacy conversations to the SQLite database.`);
      
      const backupPath = `${STORE_PATH}.migrated`;
      fs.renameSync(STORE_PATH, backupPath);
      console.log(`[DB] Backup stored at: ${backupPath}`);
    }
  } catch (err: any) {
    console.error('[DB] Automatic legacy migration failed:', err.message);
  }
}
