import { useState, useEffect, useCallback, useRef } from 'react';
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
  branchOf?: string | null;
  branchAtIndex?: number | null;
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
  return `${prefix}-${crypto.randomUUID()}`;
}

function deriveTitleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New Chat';
  const words = firstUser.content.trim().split(/\s+/).slice(0, 6).join(' ');
  return words.length > 0 ? words : 'New Chat';
}

const isTauriEnv =
  typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

export function useChatSessions(agentType?: 'chat' | 'coder') {
  const [regularSessions, setRegularSessions] = useState<ChatSession[]>([]);
  const [activeSid, setActiveSid] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const regularSessionsRef = useRef<ChatSession[]>(regularSessions);

  useEffect(() => {
    regularSessionsRef.current = regularSessions;
  }, [regularSessions]);

  // Helper to check if session matches the agentType
  const matchesAgentType = useCallback(
    (sid: string) => {
      if (agentType === 'coder') {
        return sid.startsWith('coder-session-');
      } else if (agentType === 'chat') {
        return (
          sid.startsWith('chat-session-') ||
          (!sid.startsWith('coder-session-') && !sid.startsWith('chat-session-'))
        );
      }
      return true;
    },
    [agentType]
  );

  // Computed sessions list
  const sessions = regularSessions.filter((s) => matchesAgentType(s.id));

  // Load sessions from API on mount; fallback to localStorage only if API fails
  useEffect(() => {
    let activeToken = true;

    async function loadSessions() {
      try {
        let serverSessions: any[] = [];
        serverSessions = await invoke('db_get_all_chat_sessions');

        if (Array.isArray(serverSessions) && activeToken) {
          setRegularSessions(
            serverSessions.sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
          );
          if (serverSessions.length > 0) {
            setActiveSid((prevSid) => {
              if (prevSid) return prevSid;
              const matching = serverSessions.find((s) => matchesAgentType(s.id));
              return matching ? matching.id : prevSid;
            });
          }
        }
      } catch (e: any) {
        console.warn('[useChatSessions] Backend fetch failed, falling back to localStorage:', e);
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw && activeToken) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              setRegularSessions(parsed);
              if (parsed.length > 0) {
                const matching = parsed.find((s: any) => matchesAgentType(s.id));
                if (matching) {
                  setActiveSid((prevSid) => prevSid || matching.id);
                }
              }
            }
          }
        } catch (fallbackErr) {
          console.warn('[useChatSessions] Fallback load failed:', fallbackErr);
        }
      }

      // Load folders
      try {
        if (agentType === 'chat') {
          const fetchedFolders = await invoke<any[]>('db_get_folders');
          if (activeToken && Array.isArray(fetchedFolders)) setFolders(fetchedFolders);
        }
      } catch (e: any) {
        console.warn('[useChatSessions] Folders fetch failed:', e);
      }
    }

    loadSessions();

    return () => {
      activeToken = false;
    };
  }, [agentType, matchesAgentType]);

  // Debounced backup persistence to localStorage (only lightweight metadata without heavy SVG blobs)
  useEffect(() => {
    if (regularSessions.length === 0) return;
    const timeout = setTimeout(() => {
      try {
        const lightweight = regularSessions.slice(0, 20).map((s) => ({
          ...s,
          messages: (s.messages || []).slice(-10).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content?.slice(0, 1000),
            timestamp: m.timestamp,
            model: m.model,
          })),
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
      } catch (e) {
        // Ignore localStorage quota errors
      }
    }, 2000);

    return () => clearTimeout(timeout);
  }, [regularSessions]);

  // Manage initial session selection when switching modes
  useEffect(() => {
    // If we already have a valid active session in regular mode, do nothing
    const hasMatchingActiveSid = activeSid && matchesAgentType(activeSid);
    if (hasMatchingActiveSid) {
      return;
    }
    const matchingRegular = regularSessions.find((s) => matchesAgentType(s.id));
    if (matchingRegular) {
      setActiveSid(matchingRegular.id);
    }
  }, [agentType, matchesAgentType, regularSessions, activeSid]);

  const createSession = useCallback(
    (
      initialMessages: ChatMessage[] = [],
      options?: {
        branchOf?: string | null;
        branchAtIndex?: number | null;
        title?: string;
      }
    ): string => {
      const id = generateId(agentType);
      const now = Date.now();
      const session: ChatSession = {
        id,
        title: options?.title || deriveTitleFromMessages(initialMessages),
        messages: initialMessages,
        createdAt: now,
        updatedAt: now,
        branchOf: options?.branchOf,
        branchAtIndex: options?.branchAtIndex,
      };

      setRegularSessions((prev) => [session, ...prev]);
      setActiveSid(id);

      // Sync to backend

      invoke('db_save_chat_session', { session }).catch((err: any) =>
        console.warn('[useChatSessions] Failed to sync session creation:', err)
      );

      return id;
    },
    [agentType]
  );

  const updateSession = useCallback(
    (sid: string, messages: ChatMessage[]) => {
      const now = Date.now();
      let session = regularSessionsRef.current.find((s) => s.id === sid);
      if (!session) {
        session = {
          id: sid,
          title: deriveTitleFromMessages(messages),
          messages,
          createdAt: now,
          updatedAt: now,
        };
      } else {
        session = {
          ...session,
          messages,
          title:
            session.title && session.title !== 'New Chat'
              ? session.title
              : deriveTitleFromMessages(messages),
          updatedAt: now,
        };
      }

      const updated = session;
      setRegularSessions((prev) => {
        const exists = prev.some((s) => s.id === sid);
        if (exists) {
          return prev.map((s) => (s.id === sid ? updated : s));
        }
        return [updated, ...prev];
      });

      // Direct persistent sync to SQLite backend
      invoke('db_save_chat_session', { session: updated }).catch((err: any) =>
        console.warn('[useChatSessions] Failed to sync session update:', err)
      );
    },
    [agentType]
  );

  const deleteSession = useCallback(
    (sid: string) => {
      setRegularSessions((prev) => prev.filter((s) => s.id !== sid));
      setActiveSid((prev) => (prev === sid ? null : prev));

      // Sync to backend

      invoke('db_delete_chat_session', { id: sid }).catch((err: any) =>
        console.warn('[useChatSessions] Failed to sync session deletion:', err)
      );
    },
    [agentType]
  );

  const switchSession = useCallback((sid: string | null) => {
    setActiveSid(sid);
  }, []);

  const createFolder = useCallback(async (name: string) => {
    try {
      const id = `folder-${Date.now()}`;
      await invoke('db_create_folder', { id, name });
      setFolders((prev) => [...prev, { id, name, createdAt: Date.now() }]);
      return id;
    } catch (e) {
      console.error('[useChatSessions] Failed to create folder:', e);
    }
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    try {
      await invoke('db_delete_folder', { id });
      setFolders((prev) => prev.filter((f) => f.id !== id));
    } catch (e) {
      console.error('[useChatSessions] Failed to delete folder:', e);
    }
  }, []);

  const updateSessionMeta = useCallback(
    (sid: string, meta: { folderId?: string | null; tags?: string | null }) => {
      setRegularSessions((prev) =>
        prev.map((s) => {
          if (s.id === sid) {
            const updated = { ...s, ...meta };
            // Sync to backend

            invoke('db_update_chat_session_meta', {
              id: sid,
              folderId: meta.folderId || null,
              tags: meta.tags || null,
            }).catch((err: any) =>
              console.warn('[useChatSessions] Failed to sync session meta update:', err)
            );

            return updated;
          }
          return s;
        })
      );
    },
    [agentType]
  );

  const activeSession = sessions.find((s) => s.id === activeSid) ?? null;

  return {
    sessions,
    folders,
    activeSid,
    activeSession,
    createSession,
    updateSession,
    deleteSession,
    switchSession,
    createFolder,
    deleteFolder,
    updateSessionMeta,
  };
}
