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

function generateId(): string {
  return `session-${crypto.randomUUID()}`;
}

function deriveTitleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser || !firstUser.content.trim()) return 'New Chat';

  let text = firstUser.content.trim();

  // Strip commands and greetings
  text = text.replace(/^(?:\/web|\/search|\/deep|search:|google:|lookup:|web:|research:)\s*/i, '');
  text = text.replace(/^(?:hello|hi|hey|greetings|good\s+(?:morning|afternoon|evening)|yo|sup)\b[\s,!.:\-]*/i, '');
  text = text.replace(/^(?:can\s+you\s+)?(?:please\s+)?(?:search\s+(?:the\s+web\s+for|for|online\s+for)?|tell\s+me\s+about|find\s+(?:out\s+)?|look\s+up|explain|describe|research)\s*/i, '');

  text = text.trim();
  if (!text) return 'New Chat';

  // Capitalize first letter
  text = text.charAt(0).toUpperCase() + text.slice(1);

  // Truncate to ~45 chars at word boundary
  if (text.length > 45) {
    const spaceIdx = text.lastIndexOf(' ', 45);
    text = (spaceIdx > 15 ? text.slice(0, spaceIdx) : text.slice(0, 45)) + '...';
  }

  return text;
}

function detectTopicCategory(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'General';

  const text = firstUser.content.toLowerCase();
  if (/\b(?:search|web|deep|research|news|price|prices|paper|arxiv|github|lookup|find|google)\b/i.test(text)) {
    return 'Research';
  }
  if (/\b(?:code|function|class|bug|error|refactor|debug|rust|python|typescript|react|api|sql|component)\b/i.test(text)) {
    return 'Code & Dev';
  }
  return 'General';
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
      reasoning: m.reasoning ?? null,
      toolCalls: m.tool_calls ?? m.toolCalls ?? null,
      citations: m.citations ?? null,
      images: m.images ?? null,
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
    messages: session.messages
      .filter((m: any) => m.status !== 'error')
      .map((m: any) => ({
      id: m.id ?? null,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp ?? null,
      is_pinned: m.isPinned ?? false,
      metrics: m.metrics ?? null,
      attachments: m.attachments ?? null,
      model: m.model ?? null,
      reasoning: m.reasoning ?? null,
      tool_calls: m.toolCalls ?? null,
      citations: m.citations ?? null,
      // Store images as lightweight descriptors (url + name) — base64 data is excluded
      // to avoid bloating the SQLite database; proxied data can be re-fetched on load.
      images: m.images
        ? (m.images as any[]).map((img: any) => ({
            url: img.url ?? null,
            name: img.name ?? null,
            aspectRatio: img.aspectRatio ?? null,
            engine: img.engine ?? null,
          }))
        : null,
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
  activeSid: string | null;
  folders: Folder[];
  isLoading: boolean;
  syncTimeout: NodeJS.Timeout | null;

  // Actions
  loadSessions: () => Promise<void>;
  createSession: (initialMessages?: ChatMessage[]) => string;
  updateSession: (sid: string, messages: ChatMessage[]) => void;
  deleteSession: (sid: string) => void;
  switchSession: (sid: string | null) => void;
  createFolder: (name: string) => Promise<string | undefined>;
  deleteFolder: (id: string) => Promise<void>;
  updateSessionMeta: (
    sid: string,
    meta: { folderId?: string | null; tags?: string | null }
  ) => void;

  // Getters (computed properties)
  getSessions: () => ChatSession[];
  getActiveSid: () => string | null;
  getActiveSession: () => ChatSession | null;
}

export const useChatStore = create<ChatStoreState>((set, get) => {
  const persistSessions = (sessions: ChatSession[]) => {
    try {
      const filteredSessions = sessions.map(s => ({
        ...s,
        messages: s.messages.filter(m => m.status !== 'error')
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredSessions.slice(0, MAX_SESSIONS)));
    } catch (e: any) {
      console.warn('[useChatStore] Failed to save sessions to localStorage:', e);
    }
  };

  const sessionSyncTimeouts = new Map<string, NodeJS.Timeout>();

  const debouncedSyncToDb = (session: ChatSession) => {
    const existing = sessionSyncTimeouts.get(session.id);
    if (existing) clearTimeout(existing);

    const newTimeout = setTimeout(() => {
      sessionSyncTimeouts.delete(session.id);
      if (isTauri()) {
        invoke('db_save_chat_session', { session: toRustPayload(session) }).catch((err) =>
          console.warn('[useChatStore] Failed to sync session to SQLite:', err)
        );
      }
    }, 1000);

    sessionSyncTimeouts.set(session.id, newTimeout);
  };

  return {
    regularSessions: [],
    activeSid: null,
    folders: [],
    isLoading: false,
    syncTimeout: null,

    getSessions: () => {
      return get().regularSessions;
    },

    getActiveSid: () => {
      return get().activeSid;
    },

    getActiveSession: () => {
      const activeSid = get().activeSid;
      if (!activeSid) return null;
      return get().regularSessions.find((s) => s.id === activeSid) ?? null;
    },

    loadSessions: async () => {
      set({ isLoading: true });

      try {
        if (isTauri()) {
          // ── Primary path: load from SQLite via Tauri IPC ──
          const [rawSessions, rawFolders] = await Promise.all([
            invoke<any[]>('db_get_all_chat_sessions').catch(() => []),
            invoke<any[]>('db_get_folders').catch(() => []),
          ]);

          const serverSessions: ChatSession[] = rawSessions.map(mapRustSession);
          const filtered = serverSessions;

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

            let activeSid = state.activeSid;
            if (!activeSid && sorted.length > 0) activeSid = sorted[0].id;
            return { regularSessions: sorted, activeSid, folders };
          });
        } else {
          // ── Fallback: localStorage (web-only / dev mode without Tauri) ──
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed: ChatSession[] = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              set((state) => {
                const sorted = parsed.sort((a, b) => b.updatedAt - a.updatedAt);
                let activeSid = state.activeSid;
                if (!activeSid && sorted.length > 0) activeSid = sorted[0].id;
                return { regularSessions: sorted, activeSid };
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

    createSession: (initialMessages = []) => {
      const id = generateId();
      const now = Date.now();

      const session: ChatSession = {
        id,
        title: deriveTitleFromMessages(initialMessages),
        messages: initialMessages,
        createdAt: now,
        updatedAt: now,
        folderId: null,
      };

      set((state) => {
        const updatedSessions = [session, ...state.regularSessions];
        persistSessions(updatedSessions);
        return { regularSessions: updatedSessions, activeSid: id };
      });

      // Asynchronously assign folder if initial messages exist
      if (initialMessages.length > 0) {
        const dateStr = new Date().toISOString().slice(0, 7);
        const category = detectTopicCategory(initialMessages);
        const folderName = `${dateStr} — ${category}`;
        const currentFolders = get().folders;
        const existing = currentFolders.find((f) => f.name === folderName);

        if (existing) {
          session.folderId = existing.id;
          get().updateSessionMeta(id, { folderId: existing.id });
        } else {
          get().createFolder(folderName).then((fId) => {
            if (fId) {
              session.folderId = fId;
              get().updateSessionMeta(id, { folderId: fId });
            }
          });
        }
      }

      // Persist to SQLite
      if (isTauri()) {
        invoke('db_save_chat_session', { session: toRustPayload(session) }).catch((err) =>
          console.warn('[useChatStore] Failed to save new session to SQLite:', err)
        );
      }

      return id;
    },

    updateSession: (sid, messages) => {
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

            // Auto-assign folder if session currently has no folder assigned
            if (!updated.folderId && messages.length > 0) {
              const dateStr = new Date(updated.createdAt).toISOString().slice(0, 7);
              const category = detectTopicCategory(messages);
              const folderName = `${dateStr} — ${category}`;
              const existing = state.folders.find((f) => f.name === folderName);
              if (existing) {
                updated.folderId = existing.id;
              }
            }

            latestUpdated = updated;
            return updated;
          }
          return s;
        });
        persistSessions(updatedSessions);
        return { regularSessions: updatedSessions };
      });

      // If auto-folder needs creation asynchronously
      if (latestUpdated && !(latestUpdated as ChatSession).folderId && messages.length > 0) {
        const dateStr = new Date((latestUpdated as ChatSession).createdAt).toISOString().slice(0, 7);
        const category = detectTopicCategory(messages);
        const folderName = `${dateStr} — ${category}`;
        get().createFolder(folderName).then((fId) => {
          if (fId) {
            get().updateSessionMeta(sid, { folderId: fId });
          }
        });
      }

      if (latestUpdated) {
        debouncedSyncToDb(latestUpdated);
      }
    },

    deleteSession: (sid) => {
      set((state) => {
        const updatedSessions = state.regularSessions.filter((s) => s.id !== sid);
        persistSessions(updatedSessions);
        return {
          regularSessions: updatedSessions,
          activeSid: state.activeSid === sid ? null : state.activeSid,
        };
      });

      if (isTauri()) {
        invoke('db_delete_chat_session', { id: sid }).catch((err) =>
          console.warn('[useChatStore] Failed to delete session from SQLite:', err)
        );
      }
    },

    switchSession: (sid) => {
      set({ activeSid: sid });
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

    updateSessionMeta: (sid, meta) => {
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
