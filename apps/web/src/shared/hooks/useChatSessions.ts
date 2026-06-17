import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessage } from '@src/infrastructure/types';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
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
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function deriveTitleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New Chat';
  const words = firstUser.content.trim().split(/\s+/).slice(0, 6).join(' ');
  return words.length > 0 ? words : 'New Chat';
}

const isTauriEnv = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

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

  // Load sessions from API or fallback to localStorage on mount
  useEffect(() => {
    let activeToken = true;

    async function loadSessions() {
      try {
        let serverSessions: any[] = [];
        if (isTauriEnv) {
          serverSessions = await invoke('db_get_all_chat_sessions');
        } else {
          const url = agentType ? `/api/v1/conversations?agentType=${agentType}` : '/api/v1/conversations';
          const res = await fetchWithAuth(url);
          if (res.ok) serverSessions = await res.json();
        }
        // fallow-ignore-next-line code-duplication
        if (Array.isArray(serverSessions) && activeToken) {
            setRegularSessions((prev) => {
              const prevMap = new Map(prev.map((s) => [s.id, s]));
              const merged = [...prev];
              // fallow-ignore-next-line code-duplication
              for (const s of serverSessions) {
                if (!prevMap.has(s.id)) {
                  merged.push(s);
                  prevMap.set(s.id, s);
                }
              }
              return merged.sort((a, b) => b.updatedAt - a.updatedAt);
            });
            if (serverSessions.length > 0) {
              // Only auto-switch if we don't already have an active session for this agent
              setActiveSid((prevSid) => {
                if (prevSid) return prevSid; // Keep existing selection
                const matching = serverSessions.find((s) => matchesAgentType(s.id));
                return matching ? matching.id : prevSid;
              });
            }
          }
      } catch (e: any) {
        console.warn('[useChatSessions] Backend fetch failed, falling back to localStorage:', e);
      }

      // Load folders
      try {
        if (agentType === 'chat') {
          let fetchedFolders: any[] = [];
          if (isTauriEnv) {
            fetchedFolders = await invoke('db_get_folders');
          } else {
            const res = await fetchWithAuth('/api/v1/conversations/folders');
            if (res.ok) fetchedFolders = await res.json();
          }
          if (activeToken) setFolders(fetchedFolders);
        }
      } catch (e: any) {
        console.warn('[useChatSessions] Folders fetch failed:', e);
      }

      // Fallback
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw && activeToken) {
          const parsed = JSON.parse(raw);
          // fallow-ignore-next-line code-duplication
          if (Array.isArray(parsed)) {
            setRegularSessions((prev) => {
              const prevMap = new Map(prev.map((s) => [s.id, s]));
              const merged = [...prev];
              // fallow-ignore-next-line code-duplication
              for (const s of parsed) {
                if (!prevMap.has(s.id)) {
                  merged.push(s);
                  prevMap.set(s.id, s);
                }
              }
              return merged.sort((a, b) => b.updatedAt - a.updatedAt);
            });
            if (parsed.length > 0) {
              const matching = parsed.find((s) => matchesAgentType(s.id));
              if (matching) {
                setActiveSid((prevSid) => prevSid || matching.id);
              }
            }
          }
        }
      } catch (e: any) {
        console.warn('[useChatSessions] Fallback load failed:', e);
      }
    }

    loadSessions();

    return () => {
      activeToken = false;
    };
  }, [agentType, matchesAgentType]);

  // Persist sessions on every change (regular sessions only!)
  useEffect(() => {
    if (regularSessions.length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(regularSessions.slice(0, MAX_SESSIONS)));
    } catch (e: any) {
      console.warn('[useChatSessions] Failed to save sessions:', e);
    }
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
      if (isTauriEnv) {
        invoke('db_save_chat_session', { session }).catch((err: any) => 
          console.warn('[useChatSessions] Failed to sync session creation:', err)
        );
      } else {
        const url = agentType ? `/api/v1/conversations?agentType=${agentType}` : '/api/v1/conversations';
        fetchWithAuth(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(session),
        }).catch((err: any) => console.warn('[useChatSessions] Failed to sync session creation:', err));
      }

      return id;
    },
    [agentType]
  );

  const updateSession = useCallback(
    (sid: string, messages: ChatMessage[]) => {
      const now = Date.now();
      const session = regularSessionsRef.current.find((s) => s.id === sid);
      if (!session) return;

      const updated = {
        ...session,
        messages,
        title: deriveTitleFromMessages(messages),
        updatedAt: now,
      };

      setRegularSessions((prev) => prev.map((s) => (s.id === sid ? updated : s)));

      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

      syncTimeoutRef.current = setTimeout(() => {
        if (isTauriEnv) {
          invoke('db_save_chat_session', { session: updated }).catch((err: any) => 
            console.warn('[useChatSessions] Failed to sync session update:', err)
          );
        } else {
          const url = agentType ? `/api/v1/conversations?agentType=${agentType}` : '/api/v1/conversations';
          fetchWithAuth(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated),
          }).catch((err: any) => console.warn('[useChatSessions] Failed to sync session update:', err));
        }
      }, 1000);
    },
    [agentType]
  );

  const deleteSession = useCallback(
    (sid: string) => {
      setRegularSessions((prev) => prev.filter((s) => s.id !== sid));
      setActiveSid((prev) => (prev === sid ? null : prev));

      // Sync to backend
      if (isTauriEnv) {
        invoke('db_delete_chat_session', { id: sid }).catch((err: any) => 
          console.warn('[useChatSessions] Failed to sync session deletion:', err)
        );
      } else {
        const url = agentType ? `/api/v1/conversations/${sid}?agentType=${agentType}` : `/api/v1/conversations/${sid}`;
        fetchWithAuth(url, { method: 'DELETE' }).catch((err: any) => 
          console.warn('[useChatSessions] Failed to sync session deletion:', err)
        );
      }
    },
    [agentType]
  );

  const switchSession = useCallback((sid: string | null) => {
    setActiveSid(sid);
  }, []);

  const createFolder = useCallback(async (name: string) => {
    try {
      if (isTauriEnv) {
        const id = `folder-${Date.now()}`;
        await invoke('db_create_folder', { id, name });
        setFolders((prev) => [...prev, { id, name, createdAt: Date.now() }]);
        return id;
      } else {
        const res = await fetchWithAuth('/api/v1/conversations/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (res.ok) {
          const data = await res.json();
          setFolders((prev) => [...prev, { id: data.id, name, createdAt: Date.now() }]);
          return data.id;
        }
      }
    } catch (e) {
      console.error('[useChatSessions] Failed to create folder:', e);
    }
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    try {
      if (isTauriEnv) {
        await invoke('db_delete_folder', { id });
        setFolders((prev) => prev.filter((f) => f.id !== id));
      } else {
        const res = await fetchWithAuth(`/api/v1/conversations/folders/${id}`, { method: 'DELETE' });
        if (res.ok) {
          setFolders((prev) => prev.filter((f) => f.id !== id));
        }
      }
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
            if (isTauriEnv) {
              invoke('db_update_chat_session_meta', {
                id: sid,
                folderId: meta.folderId || null,
                tags: meta.tags || null,
              }).catch((err: any) =>
                console.warn('[useChatSessions] Failed to sync session meta update:', err)
              );
            } else {
              const url = agentType ? `/api/v1/conversations?agentType=${agentType}` : '/api/v1/conversations';
              fetchWithAuth(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated),
              }).catch((err: any) =>
                console.warn('[useChatSessions] Failed to sync session meta update:', err)
              );
            }
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
