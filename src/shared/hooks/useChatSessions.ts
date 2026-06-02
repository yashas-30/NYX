import { useState, useEffect, useCallback } from 'react';
import { ChatMessage } from '@src/infrastructure/types';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
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

export function useChatSessions(agentType?: 'chat' | 'coder') {
  const [regularSessions, setRegularSessions] = useState<ChatSession[]>([]);
  const [activeSid, setActiveSid] = useState<string | null>(null);

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
        const url = agentType
          ? `/api/v1/conversations?agentType=${agentType}`
          : '/api/v1/conversations';
        const res = await fetchWithAuth(url);
        if (res.ok) {
          const serverSessions = await res.json();
          if (Array.isArray(serverSessions) && activeToken) {
            setRegularSessions((prev) => {
              const prevMap = new Map(prev.map((s) => [s.id, s]));
              const merged = [...prev];
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
            return;
          }
        }
      } catch (e: any) {
        console.warn('[useChatSessions] Backend fetch failed, falling back to localStorage:', e);
      }

      // Fallback
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw && activeToken) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setRegularSessions((prev) => {
              const prevMap = new Map(prev.map((s) => [s.id, s]));
              const merged = [...prev];
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
    (initialMessages: ChatMessage[] = []): string => {
      const id = generateId(agentType);
      const now = Date.now();
      const session: ChatSession = {
        id,
        title: deriveTitleFromMessages(initialMessages),
        messages: initialMessages,
        createdAt: now,
        updatedAt: now,
      };

      setRegularSessions((prev) => [session, ...prev]);
      setActiveSid(id);

      // Sync to backend
      const url = agentType
        ? `/api/v1/conversations?agentType=${agentType}`
        : '/api/v1/conversations';
      fetchWithAuth(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      }).catch((err) => console.warn('[useChatSessions] Failed to sync session creation:', err));

      return id;
    },
    [agentType]
  );

  const updateSession = useCallback(
    (sid: string, messages: ChatMessage[]) => {
      const now = Date.now();

      setRegularSessions((prev) =>
        prev.map((s) => {
          if (s.id === sid) {
            const updated = {
              ...s,
              messages,
              title: deriveTitleFromMessages(messages),
              updatedAt: now,
            };
            // Sync to backend
            const url = agentType
              ? `/api/v1/conversations?agentType=${agentType}`
              : '/api/v1/conversations';
            fetchWithAuth(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updated),
            }).catch((err) =>
              console.warn('[useChatSessions] Failed to sync session update:', err)
            );
            return updated;
          }
          return s;
        })
      );
    },
    [agentType]
  );

  const deleteSession = useCallback(
    (sid: string) => {
      setRegularSessions((prev) => prev.filter((s) => s.id !== sid));
      setActiveSid((prev) => (prev === sid ? null : prev));

      // Sync to backend
      const url = agentType
        ? `/api/v1/conversations/${sid}?agentType=${agentType}`
        : `/api/v1/conversations/${sid}`;
      fetchWithAuth(url, {
        method: 'DELETE',
      }).catch((err) => console.warn('[useChatSessions] Failed to sync session deletion:', err));
    },
    [agentType]
  );

  const switchSession = useCallback((sid: string | null) => {
    setActiveSid(sid);
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSid) ?? null;

  return {
    sessions,
    activeSid,
    activeSession,
    createSession,
    updateSession,
    deleteSession,
    switchSession,
  };
}
