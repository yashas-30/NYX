import { useState, useEffect, useCallback } from 'react';
import { ChatMessage } from '@nyx/shared/types';
export type ChatSession = any;

interface UseChatSessionsReturn {
  sessions: ChatSession[];
  activeSid: string | null;
  activeSession: ChatSession | null;
  isLoading: boolean;
  setActiveSid: (id: string | null) => void;
  createSession: (messages: ChatMessage[], modelId?: string) => Promise<string | null>;
  updateSession: (sessionId: string, messages: ChatMessage[]) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useChatSessions(): UseChatSessionsReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSid, setActiveSid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const createSession = useCallback(async (messages: ChatMessage[], modelId?: string) => {
    const name = messages[0]?.content.slice(0, 50) || 'New Chat';
    try {
      const res = await fetch('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, messages, modelId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          setSessions((prev) => [data.session, ...prev]);
          setActiveSid(data.session.id);
          return data.session.id;
        }
      }
    } catch (error) {
      console.error('Failed to create session:', error);
    }
    return null;
  }, []);

  const updateSession = useCallback(async (sessionId: string, messages: ChatMessage[]) => {
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
      if (res.ok) {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, updatedAt: new Date().toISOString() } : s))
        );
      }
    } catch (error) {
      console.error('Failed to update session:', error);
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSid === sessionId) {
          setActiveSid(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }, [activeSid]);

  const activeSession = sessions.find((s) => s.id === activeSid) || null;

  return {
    sessions,
    activeSid,
    activeSession,
    isLoading,
    setActiveSid,
    createSession,
    updateSession,
    deleteSession,
    refresh: fetchSessions,
  };
}
