import { create } from 'zustand';
import { ChatMessage } from '@src/infrastructure/types';
import { invoke } from '@tauri-apps/api/core';

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  folderId?: string | null;
  tags?: string | null;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

const STORAGE_KEY = 'nyx-chat-sessions';
const MAX_SESSIONS = 50;

// Detect Tauri context reliably
function isTauri(): boolean {
  return typeof window !== 'undefined' &&
    ('__TAURI__' in window || '__TAURI_INTERNALS__' in window || '_tauri' in window);
}

function generateId(agentType?: 'chat' | 'coder'): string {
  const prefix = agentType ? `${agentType}-session` : 'session';
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function deriveTitleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New Chat';
  const words = firstUser.content.trim().split(/\s+/).slice(0, 6).join(' ');
  return words.length > 0 ? words : 'New Chat';
}

function matchesAgentType(sid: string, agentType?: 'chat' | 'coder'): boolean {
  if (agentType === 'coder') {
    return sid.startsWith('coder-session-');
  } else if (agentType === 'chat') {
    return (
      sid.startsWith('chat-session-') ||
      (!sid.startsWith('coder-session-') && !sid.startsWith('chat-session-'))
    );
  }
  return true;
}

// Map Rust ChatSessionPayload -> frontend ChatSession
function mapRustSession(s: any): ChatSession {
  return {
    id: s.id,
    title: s.title,
    messages: (s.messages || []).map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      model: m.model,
      isPinned: m.is_pinned ?? m.isPinned ?? false,
      metrics: m.metrics ?? null,
      attachments: m.attachments ?? null,
    })),
    createdAt: s.created_at ?? s.createdAt ?? Date.now(),
    updatedAt: s.updated_at ?? s.updatedAt ?? Date.now(),
    folderId: s.folder_id ?? s.folderId ?? null,
    tags: s.tags ?? null,
  };
}

// Map frontend ChatSession -> Rust ChatSessionPayload
function toRustPayload(session: ChatSession): any {
  return {
    id: session.id,
    title: session.title,
    messages: session.messages.map((m: any) => ({
      id: m.id ?? null,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp ?? null,
      is_pinned: m.isPinned ?? false,
      metrics: m.metrics ?? null,
      attachments: m.attachments ?? null,
      model: m.model ?? null,
      reasoning: m.reasoning ?? null,
    })),
    folder_id: session.folderId ?? null,
    tags: session.tags ?? null,
    share_id: null,
    created_at: session.createdAt ?? null,
    updated_at: session.updatedAt ?? null,
    model: null,
  };
}

interface ChatStoreState {
  regularSessions: ChatSession[];
  activeSidChat: string | null;
  activeSidCoder: string | null;
  folders: Folder[];
  isLoading: boolean;
  syncTimeout: NodeJS.Timeout | null;

  // Actions
  loadSessions: (agentType?: 'chat' | 'coder') => Promise<void>;
  createSession: (agentType?: 'chat' | 'coder', initialMessages?: ChatMessage[]) => string;
  updateSession: (agentType: 'chat' | 'coder' | undefined, sid: string, messages: ChatMessage[]) => void;
  deleteSession: (agentType: 'chat' | 'coder' | undefined, sid: string) => void;
  switchSession: (agentType: 'chat' | 'coder' | undefined, sid: string | null) => void;
  createFolder: (name: string) => Promise<string | undefined>;
  deleteFolder: (id: string) => Promise<void>;
  updateSessionMeta: (
    agentType: 'chat' | 'coder' | undefined,
    sid: string,
    meta: { folderId?: string | null; tags?: string | null }
  ) => void;

  // Getters (computed properties)
  getSessions: (agentType?: 'chat' | 'coder') => ChatSession[];
  getActiveSid: (agentType?: 'chat' | 'coder') => string | null;
  getActiveSession: (agentType?: 'chat' | 'coder') => ChatSession | null;
}

export const useChatStore = create<ChatStoreState>((set, get) => {
  const persistSessions = (sessions: ChatSession[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
    } catch (e: any) {
      console.warn('[useChatStore] Failed to save sessions to localStorage:', e);
    }
  };

  const debouncedSyncToDb = (session: ChatSession) => {
    const currentTimeout = get().syncTimeout;
    if (currentTimeout) clearTimeout(currentTimeout);

    const newTimeout = setTimeout(() => {
      if (isTauri()) {
        invoke('db_save_chat_session', { session: toRustPayload(session) }).catch((err) =>
          console.warn('[useChatStore] Failed to sync session to SQLite:', err)
        );
      }
    }, 1000);

    set({ syncTimeout: newTimeout });
  };

  return {
    regularSessions: [],
    activeSidChat: null,
    activeSidCoder: null,
    folders: [],
    isLoading: false,
    syncTimeout: null,

    getSessions: (agentType) => {
      return get().regularSessions.filter((s) => matchesAgentType(s.id, agentType));
    },

    getActiveSid: (agentType) => {
      return agentType === 'coder' ? get().activeSidCoder : get().activeSidChat;
    },

    getActiveSession: (agentType) => {
      const activeSid = agentType === 'coder' ? get().activeSidCoder : get().activeSidChat;
      if (!activeSid) return null;
      return get().regularSessions.find((s) => s.id === activeSid) ?? null;
    },

    loadSessions: async (agentType) => {
      set({ isLoading: true });

      try {
        if (isTauri()) {
          // ── Primary path: load from SQLite via Tauri IPC ──
          const [rawSessions, rawFolders] = await Promise.all([
            invoke<any[]>('db_get_all_chat_sessions').catch(() => []),
            invoke<any[]>('db_get_folders').catch(() => []),
          ]);

          const serverSessions: ChatSession[] = rawSessions.map(mapRustSession);
          const filtered = agentType
            ? serverSessions.filter((s) => matchesAgentType(s.id, agentType))
            : serverSessions;

          const folders: Folder[] = (rawFolders || []).map((f: any) => ({
            id: f.id,
            name: f.name,
            createdAt: f.created_at ?? Date.now(),
          }));

          set((state) => {
            // Merge server sessions with any local-only sessions
            const prevMap = new Map(state.regularSessions.map((s) => [s.id, s]));
            const merged = [...state.regularSessions];
            for (const s of filtered) {
              if (!prevMap.has(s.id)) {
                merged.push(s);
                prevMap.set(s.id, s);
              } else {
                // Server is source of truth: update if server version is newer
                const existing = prevMap.get(s.id)!;
                if (s.updatedAt > existing.updatedAt) {
                  const idx = merged.findIndex((x) => x.id === s.id);
                  if (idx !== -1) merged[idx] = s;
                }
              }
            }
            const sorted = merged.sort((a, b) => b.updatedAt - a.updatedAt);
            persistSessions(sorted);

            let activeSidChat = state.activeSidChat;
            let activeSidCoder = state.activeSidCoder;

            if ((agentType === 'coder' || !agentType) && !activeSidCoder) {
              const match = sorted.find((s) => matchesAgentType(s.id, 'coder'));
              if (match) activeSidCoder = match.id;
            }
            if ((agentType === 'chat' || !agentType) && !activeSidChat) {
              const match = sorted.find((s) => matchesAgentType(s.id, 'chat'));
              if (match) activeSidChat = match.id;
            }

            return { regularSessions: sorted, activeSidChat, activeSidCoder, folders };
          });
        } else {
          // ── Fallback: localStorage (web-only / dev mode without Tauri) ──
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed: ChatSession[] = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              set((state) => {
                const sorted = parsed.sort((a, b) => b.updatedAt - a.updatedAt);
                let activeSidChat = state.activeSidChat;
                let activeSidCoder = state.activeSidCoder;
                if (!activeSidCoder) {
                  const m = sorted.find((s) => matchesAgentType(s.id, 'coder'));
                  if (m) activeSidCoder = m.id;
                }
                if (!activeSidChat) {
                  const m = sorted.find((s) => matchesAgentType(s.id, 'chat'));
                  if (m) activeSidChat = m.id;
                }
                return { regularSessions: sorted, activeSidChat, activeSidCoder };
              });
            }
          }
        }
      } catch (e: any) {
        console.warn('[useChatStore] loadSessions failed:', e);
        // Final fallback: localStorage
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed: ChatSession[] = JSON.parse(raw);
            if (Array.isArray(parsed)) set({ regularSessions: parsed });
          }
        } catch { /* ignore */ }
      } finally {
        set({ isLoading: false });
      }
    },

    createSession: (agentType, initialMessages = []) => {
      const id = generateId(agentType);
      const now = Date.now();
      const session: ChatSession = {
        id,
        title: deriveTitleFromMessages(initialMessages),
        messages: initialMessages,
        createdAt: now,
        updatedAt: now,
      };

      set((state) => {
        const updatedSessions = [session, ...state.regularSessions];
        persistSessions(updatedSessions);
        if (agentType === 'coder') {
          return { regularSessions: updatedSessions, activeSidCoder: id };
        } else {
          return { regularSessions: updatedSessions, activeSidChat: id };
        }
      });

      // Persist to SQLite
      if (isTauri()) {
        invoke('db_save_chat_session', { session: toRustPayload(session) }).catch((err) =>
          console.warn('[useChatStore] Failed to save new session to SQLite:', err)
        );
      }

      return id;
    },

    updateSession: (agentType, sid, messages) => {
      const now = Date.now();
      let latestUpdated: ChatSession | null = null;

      set((state) => {
        const updatedSessions = state.regularSessions.map((s) => {
          if (s.id === sid) {
            const updated: ChatSession = {
              ...s,
              messages,
              title: deriveTitleFromMessages(messages),
              updatedAt: now,
            };
            latestUpdated = updated;
            return updated;
          }
          return s;
        });
        persistSessions(updatedSessions);
        return { regularSessions: updatedSessions };
      });

      if (latestUpdated) {
        debouncedSyncToDb(latestUpdated);
      }
    },

    deleteSession: (agentType, sid) => {
      set((state) => {
        const updatedSessions = state.regularSessions.filter((s) => s.id !== sid);
        persistSessions(updatedSessions);
        return {
          regularSessions: updatedSessions,
          activeSidChat: state.activeSidChat === sid ? null : state.activeSidChat,
          activeSidCoder: state.activeSidCoder === sid ? null : state.activeSidCoder,
        };
      });

      if (isTauri()) {
        invoke('db_delete_chat_session', { id: sid }).catch((err) =>
          console.warn('[useChatStore] Failed to delete session from SQLite:', err)
        );
      }
    },

    switchSession: (agentType, sid) => {
      if (agentType === 'coder') {
        set({ activeSidCoder: sid });
      } else {
        set({ activeSidChat: sid });
      }
    },

    createFolder: async (name) => {
      const id = crypto.randomUUID();
      try {
        if (isTauri()) {
          await invoke('db_create_folder', { id, name });
        }
        set((state) => ({
          folders: [...state.folders, { id, name, createdAt: Date.now() }],
        }));
        return id;
      } catch (e) {
        console.error('[useChatStore] Failed to create folder:', e);
      }
    },

    deleteFolder: async (id) => {
      try {
        if (isTauri()) {
          await invoke('db_delete_folder', { id });
        }
        set((state) => ({
          folders: state.folders.filter((f) => f.id !== id),
        }));
      } catch (e) {
        console.error('[useChatStore] Failed to delete folder:', e);
      }
    },

    updateSessionMeta: (agentType, sid, meta) => {
      set((state) => {
        const updatedSessions = state.regularSessions.map((s) => {
          if (s.id === sid) {
            const updated = { ...s, ...meta };
            if (isTauri()) {
              invoke('db_update_chat_session_meta', {
                id: sid,
                folder_id: meta.folderId ?? null,
                tags: meta.tags ?? null,
              }).catch((err) =>
                console.warn('[useChatStore] Failed to sync session meta update:', err)
              );
            }
            return updated;
          }
          return s;
        });
        persistSessions(updatedSessions);
        return { regularSessions: updatedSessions };
      });
    },
  };
});
