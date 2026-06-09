import fs from 'fs';
import path from 'path';
import { db } from '../../db/client.js';
import logger from '../../lib/logger.js';
import {
  chatConversations,
  chatMessages,
  codeConversations,
  codeMessages,
  chatFolders,
} from '../../db/schema.js';
import { eq, desc, sql } from 'drizzle-orm';
import { APP_STATE_DIR } from '../../lib/paths.js';

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
  folderId?: string | null;
  tags?: string | null;
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
      return records.map((conv: any) => {
        const msgs = db
          .select()
          .from(messagesTable)
          // fallow-ignore-next-line code-duplication
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
          folderId: (conv as any).folderId || null,
          tags: (conv as any).tags || null,
          messages: msgs.map((m: any) => ({
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
        // fallow-ignore-next-line code-duplication
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
        folderId: (conv as any).folderId || null,
        tags: (conv as any).tags || null,
        messages: msgs.map((m: any) => ({
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

  getByShareId(shareId: string): Conversation | null {
    try {
      const conv = db
        .select()
        .from(chatConversations)
        .where(eq(chatConversations.shareId, shareId))
        .get();
      if (!conv) return null;
      const msgs = db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, conv.id))
        .orderBy(chatMessages.timestamp)
        .all();
      return {
        id: conv.id,
        title: conv.title,
        model: conv.model,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messages: msgs.map((m: any) => ({
          id: m.id,
          role: m.role as any,
          content: m.content,
          model: m.model,
          timestamp: m.timestamp,
        })),
      };
    } catch (err: any) {
      logger.error(`[ConversationStore] getByShareId failed for ${shareId}:`, err);
      return null;
    }
  },

  generateShareId(id: string, agentType: 'chat' | 'code' = 'chat'): string {
    if (agentType === 'code') {
      throw new Error('Sharing code conversations is not currently supported.');
    }

    // Check if it already has one
    const existing = db.select().from(chatConversations).where(eq(chatConversations.id, id)).get();
    if (existing && existing.shareId) {
      return existing.shareId;
    }

    const shareId = `share_${Math.random().toString(36).substring(2, 15)}`;
    db.update(chatConversations).set({ shareId }).where(eq(chatConversations.id, id)).run();

    return shareId;
  },

  upsert(conv: Conversation, agentType: 'chat' | 'code' = 'chat'): void {
    try {
      const { conversationsTable, messagesTable } = getTables(agentType);
      db.transaction((tx: any) => {
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
        } else {
          values.folderId = conv.folderId || null;
          values.tags = conv.tags || null;
        }

        const setValues: any = {
          title: conv.title,
          model: conv.model || 'default',
          updatedAt: conv.updatedAt,
        };
        if (agentType === 'code') {
          setValues.workspacePath = conv.workspacePath || null;
        } else {
          setValues.folderId = conv.folderId || null;
          setValues.tags = conv.tags || null;
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

export const FolderStore = {
  list() {
    try {
      return db.select().from(chatFolders).orderBy(desc(chatFolders.createdAt)).all();
    } catch (err: any) {
      logger.error('[FolderStore] list failed:', err);
      return [];
    }
  },

  create(name: string) {
    try {
      const id = `folder_${Math.random().toString(36).substring(2, 15)}`;
      db.insert(chatFolders)
        .values({
          id,
          name,
          createdAt: Date.now(),
        })
        .run();
      return id;
    } catch (err: any) {
      logger.error('[FolderStore] create failed:', err);
      return null;
    }
  },

  update(id: string, name: string) {
    try {
      db.update(chatFolders).set({ name }).where(eq(chatFolders.id, id)).run();
      return true;
    } catch (err: any) {
      logger.error(`[FolderStore] update failed for ${id}:`, err);
      return false;
    }
  },

  delete(id: string) {
    try {
      db.delete(chatFolders).where(eq(chatFolders.id, id)).run();
      return true;
    } catch (err: any) {
      logger.error(`[FolderStore] delete failed for ${id}:`, err);
      return false;
    }
  },
};

