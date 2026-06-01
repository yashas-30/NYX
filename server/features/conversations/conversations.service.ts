import fs from 'fs';
import path from 'path';
import { db } from '../../db/client.ts';
import logger from '../../lib/logger.ts';
import {
  conversations,
  messages,
  chatConversations,
  chatMessages,
  codeConversations,
  codeMessages,
} from '../../db/schema.ts';
import { eq, desc, sql } from 'drizzle-orm';
import { APP_STATE_DIR } from '../../lib/paths.ts';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string;
  timestamp: number;
  toolCalls?: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  workspacePath?: string;
}

const STORE_PATH = path.join(APP_STATE_DIR, 'conversations.json');

function getTables(agentType: 'chat' | 'code') {
  if (agentType === 'code') {
    return { conversationsTable: codeConversations, messagesTable: codeMessages };
  }
  return { conversationsTable: chatConversations, messagesTable: chatMessages };
}

export const ConversationStore = {
  list(agentType: 'chat' | 'code' = 'chat'): Conversation[] {
    try {
      const { conversationsTable, messagesTable } = getTables(agentType);
      const records = db
        .select()
        .from(conversationsTable)
        .orderBy(desc(conversationsTable.updatedAt))
        .all();
      return records.map((conv) => {
        const msgs = db
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.conversationId, conv.id))
          .orderBy(messagesTable.timestamp)
          .all();
        return {
          id: conv.id,
          title: conv.title,
          model: conv.model,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          workspacePath: (conv as any).workspacePath || undefined,
          messages: msgs.map((m) => ({
            id: m.id,
            role: m.role as any,
            content: m.content,
            model: m.model,
            timestamp: m.timestamp,
            toolCalls: (m as any).toolCalls || undefined,
          })),
        };
      });
    } catch (err: any) {
      logger.error(`[ConversationStore] list failed for ${agentType}:`, err);
      return [];
    }
  },

  get(id: string, agentType: 'chat' | 'code' = 'chat'): Conversation | null {
    try {
      const { conversationsTable, messagesTable } = getTables(agentType);
      const conv = db.select().from(conversationsTable).where(eq(conversationsTable.id, id)).get();
      if (!conv) return null;
      const msgs = db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, id))
        .orderBy(messagesTable.timestamp)
        .all();
      return {
        id: conv.id,
        title: conv.title,
        model: conv.model,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        workspacePath: (conv as any).workspacePath || undefined,
        messages: msgs.map((m) => ({
          id: m.id,
          role: m.role as any,
          content: m.content,
          model: m.model,
          timestamp: m.timestamp,
          toolCalls: (m as any).toolCalls || undefined,
        })),
      };
    } catch (err: any) {
      logger.error(`[ConversationStore] get failed for ${id}:`, err);
      return null;
    }
  },

  upsert(conv: Conversation, agentType: 'chat' | 'code' = 'chat'): void {
    try {
      const { conversationsTable, messagesTable } = getTables(agentType);
      db.transaction((tx) => {
        // Upsert conversation parent
        const values: any = {
          id: conv.id,
          title: conv.title,
          model: conv.model || 'default',
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
        };
        if (agentType === 'code') {
          values.workspacePath = conv.workspacePath || null;
        }

        const setValues: any = {
          title: conv.title,
          model: conv.model || 'default',
          updatedAt: conv.updatedAt,
        };
        if (agentType === 'code') {
          setValues.workspacePath = conv.workspacePath || null;
        }

        tx.insert(conversationsTable)
          .values(values)
          .onConflictDoUpdate({
            target: conversationsTable.id,
            set: setValues,
          })
          .run();

        // Clear existing messages to perform a clean sync
        tx.delete(messagesTable).where(eq(messagesTable.conversationId, conv.id)).run();

        // Batch insert new messages
        if (conv.messages && conv.messages.length > 0) {
          for (const msg of conv.messages) {
            const msgValues: any = {
              id: msg.id || `${conv.id}-${Date.now()}-${Math.random()}`,
              conversationId: conv.id,
              role: msg.role,
              content: msg.content,
              model: msg.model || conv.model || 'default',
              timestamp: msg.timestamp || Date.now(),
            };
            if (agentType === 'code') {
              msgValues.toolCalls = msg.toolCalls || null;
            }

            tx.insert(messagesTable).values(msgValues).run();
          }
        }
      });
    } catch (err: any) {
      logger.error(`[ConversationStore] upsert failed for ${conv.id}:`, err);
    }
  },

  delete(id: string, agentType: 'chat' | 'code' = 'chat'): void {
    try {
      const { conversationsTable } = getTables(agentType);
      db.delete(conversationsTable).where(eq(conversationsTable.id, id)).run();
    } catch (err: any) {
      logger.error(`[ConversationStore] delete failed for ${id}:`, err);
    }
  },

  clear(agentType: 'chat' | 'code' = 'chat'): void {
    try {
      const { conversationsTable } = getTables(agentType);
      db.delete(conversationsTable).run();
    } catch (err: any) {
      logger.error(`[ConversationStore] clear failed for ${agentType}:`, err);
    }
  },
};

/**
 * Split migration helper: Copies existing records from legacy conversations/messages tables
 * to separated chat_conversations/chat_messages and code_conversations/code_messages tables.
 */
export function migrateSqliteStore() {
  try {
    // Check if new tables already contain records to avoid duplicate migration
    const chatCount = db
      .select({ count: sql`count(*)` })
      .from(chatConversations)
      .get() as { count: number };
    const codeCount = db
      .select({ count: sql`count(*)` })
      .from(codeConversations)
      .get() as { count: number };
    if ((chatCount && chatCount.count > 0) || (codeCount && codeCount.count > 0)) {
      logger.info('[DB] Separated chat/code tables already initialized. Skipping migration.');
      return;
    }

    // Read legacy records
    const legacyConvs = db.select().from(conversations).all();
    if (legacyConvs.length === 0) {
      logger.info('[DB] No legacy database records to migrate.');
      return;
    }

    logger.info(
      `[DB] Found ${legacyConvs.length} legacy database records. Splitting into separated tables...`
    );
    let chatCountMigrated = 0;
    let codeCountMigrated = 0;

    for (const conv of legacyConvs) {
      const msgs = db.select().from(messages).where(eq(messages.conversationId, conv.id)).all();
      // Check if conversation ID starts with 'coder-' or messages contain code blocks or '=== FILE:'
      const isCode =
        conv.id.startsWith('coder-') ||
        msgs.some(
          (m) =>
            m.content.includes('=== FILE:') ||
            (m.content.includes('```') && m.content.split('```').length > 3)
        );

      if (isCode) {
        db.insert(codeConversations)
          .values({
            id: conv.id,
            title: conv.title,
            model: conv.model,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
            workspacePath: null,
          })
          .run();

        for (const m of msgs) {
          db.insert(codeMessages)
            .values({
              id: m.id,
              conversationId: conv.id,
              role: m.role,
              content: m.content,
              model: m.model,
              timestamp: m.timestamp,
              toolCalls: null,
            })
            .run();
        }
        codeCountMigrated++;
      } else {
        db.insert(chatConversations)
          .values({
            id: conv.id,
            title: conv.title,
            model: conv.model,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
          })
          .run();

        for (const m of msgs) {
          db.insert(chatMessages)
            .values({
              id: m.id,
              conversationId: conv.id,
              role: m.role,
              content: m.content,
              model: m.model,
              timestamp: m.timestamp,
            })
            .run();
        }
        chatMigratedCount(conv.id);
        chatCountMigrated++;
      }
    }
    logger.info(
      `[DB] Successfully migrated ${chatCountMigrated} chat and ${codeCountMigrated} code sessions to separate stores.`
    );
  } catch (error: any) {
    logger.error({ error }, '[DB] Failed to migrate split database tables');
  }
}

// Helper to keep function scope clean
function chatMigratedCount(_id: string) {}

/**
 * Automigration helper to port JSON chat logs to SQLite database on startup
 */
export function migrateOldStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      logger.info(
        '[DB] Found legacy conversations.json. Initiating automatic migration to SQLite...'
      );
      const storeContent = fs.readFileSync(STORE_PATH, 'utf8');
      const store = JSON.parse(storeContent) as Record<string, Conversation>;

      let count = 0;
      for (const key of Object.keys(store)) {
        const conv = store[key];
        if (conv && conv.id) {
          // Defaults to chat table for conversations.json migrations
          ConversationStore.upsert(conv, 'chat');
          count++;
        }
      }

      logger.info(
        `[DB] Successfully migrated ${count} legacy conversations to the SQLite database.`
      );

      const backupPath = `${STORE_PATH}.migrated`;
      fs.renameSync(STORE_PATH, backupPath);
      logger.info(`[DB] Backup stored at: ${backupPath}`);
    }
  } catch (error: any) {
    logger.error({ error }, '[DB] Automatic legacy migration failed');
  }
}
