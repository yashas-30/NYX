import { create } from 'zustand';
import { ChatMessage } from '@src/infrastructure/types';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

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
  // Helper to persist sessions to local storage
  const persistSessions = (sessions: ChatSession[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
    } catch (e: any) {
      console.warn('[useChatStore] Failed to save sessions:', e);
    }
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
        const url = agentType
          ? `/api/v1/conversations?agentType=${agentType}`
          : '/api/v1/conversations';
        const res = await fetchWithAuth(url);
        if (res.ok) {
          const serverSessions = await res.json();
          if (Array.isArray(serverSessions)) {
            set((state) => {
              const prevMap = new Map(state.regularSessions.map((s) => [s.id, s]));
              const merged = [...state.regularSessions];
              for (const s of serverSessions) {
                if (!prevMap.has(s.id)) {
                  merged.push(s);
                  prevMap.set(s.id, s);
                }
              }
              const sorted = merged.sort((a, b) => b.updatedAt - a.updatedAt);
              persistSessions(sorted);

              // Auto select if not already set
              let activeSidChat = state.activeSidChat;
              let activeSidCoder = state.activeSidCoder;

              if (agentType === 'coder' || !agentType) {
                if (!activeSidCoder) {
                  const matching = serverSessions.find((s) => matchesAgentType(s.id, 'coder'));
                  if (matching) activeSidCoder = matching.id;
                }
              }
              if (agentType === 'chat' || !agentType) {
                if (!activeSidChat) {
                  const matching = serverSessions.find((s) => matchesAgentType(s.id, 'chat'));
                  if (matching) activeSidChat = matching.id;
                }
              }

              return {
                regularSessions: sorted,
                activeSidChat,
                activeSidCoder,
              };
            });
          }
        }
      } catch (e: any) {
        console.warn('[useChatStore] Backend fetch failed, falling back to localStorage:', e);
      }

      // Load folders
      if (agentType === 'chat' || !agentType) {
        try {
          const res = await fetchWithAuth('/api/v1/conversations/folders');
          if (res.ok) {
            const fetchedFolders = await res.json();
            set({ folders: fetchedFolders });
          }
        } catch (e: any) {
          console.warn('[useChatStore] Folders fetch failed:', e);
        }
      }

      // Local storage fallback
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            set((state) => {
              const prevMap = new Map(state.regularSessions.map((s) => [s.id, s]));
              const merged = [...state.regularSessions];
              for (const s of parsed) {
                if (!prevMap.has(s.id)) {
                  merged.push(s);
                  prevMap.set(s.id, s);
                }
              }
              const sorted = merged.sort((a, b) => b.updatedAt - a.updatedAt);

              let activeSidChat = state.activeSidChat;
              let activeSidCoder = state.activeSidCoder;

              if (!activeSidCoder) {
                const matching = sorted.find((s) => matchesAgentType(s.id, 'coder'));
                if (matching) activeSidCoder = matching.id;
              }
              if (!activeSidChat) {
                const matching = sorted.find((s) => matchesAgentType(s.id, 'chat'));
                if (matching) activeSidChat = matching.id;
              }

              return {
                regularSessions: sorted,
                activeSidChat,
                activeSidCoder,
              };
            });
          }
        }
      } catch (e: any) {
        console.warn('[useChatStore] Fallback load failed:', e);
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
          return {
            regularSessions: updatedSessions,
            activeSidCoder: id,
          };
        } else {
          return {
            regularSessions: updatedSessions,
            activeSidChat: id,
          };
        }
      });

      // Sync to backend
      const url = agentType
        ? `/api/v1/conversations?agentType=${agentType}`
        : '/api/v1/conversations';
      fetchWithAuth(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      }).catch((err) => console.warn('[useChatStore] Failed to sync session creation:', err));

      return id;
    },

    updateSession: (agentType, sid, messages) => {
      const now = Date.now();
      let latestUpdated: ChatSession | null = null;

      set((state) => {
        const updatedSessions = state.regularSessions.map((s) => {
          if (s.id === sid) {
            const updated = {
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
        const currentTimeout = get().syncTimeout;
        if (currentTimeout) clearTimeout(currentTimeout);

        const newTimeout = setTimeout(() => {
          const url = agentType
            ? `/api/v1/conversations?agentType=${agentType}`
            : '/api/v1/conversations';
          fetchWithAuth(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(latestUpdated),
          }).catch((err) => console.warn('[useChatStore] Failed to sync session update:', err));
        }, 1000);

        set({ syncTimeout: newTimeout });
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

      // Sync to backend
      const url = agentType
        ? `/api/v1/conversations/${sid}?agentType=${agentType}`
        : `/api/v1/conversations/${sid}`;
      fetchWithAuth(url, {
        method: 'DELETE',
      }).catch((err) => console.warn('[useChatStore] Failed to sync session deletion:', err));
    },

    switchSession: (agentType, sid) => {
      if (agentType === 'coder') {
        set({ activeSidCoder: sid });
      } else {
        set({ activeSidChat: sid });
      }
    },

    createFolder: async (name) => {
      try {
        const res = await fetchWithAuth('/api/v1/conversations/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (res.ok) {
          const data = await res.json();
          set((state) => ({
            folders: [...state.folders, { id: data.id, name, createdAt: Date.now() }],
          }));
          return data.id;
        }
      } catch (e) {
        console.error('[useChatStore] Failed to create folder:', e);
      }
    },

    deleteFolder: async (id) => {
      try {
        const res = await fetchWithAuth(`/api/v1/conversations/folders/${id}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          set((state) => ({
            folders: state.folders.filter((f) => f.id !== id),
          }));
        }
      } catch (e) {
        console.error('[useChatStore] Failed to delete folder:', e);
      }
    },

    updateSessionMeta: (agentType, sid, meta) => {
      set((state) => {
        const updatedSessions = state.regularSessions.map((s) => {
          if (s.id === sid) {
            const updated = { ...s, ...meta };
            // Sync to backend
            const url = agentType
              ? `/api/v1/conversations?agentType=${agentType}`
              : '/api/v1/conversations';
            fetchWithAuth(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updated),
            }).catch((err) =>
              console.warn('[useChatStore] Failed to sync session meta update:', err)
            );
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
