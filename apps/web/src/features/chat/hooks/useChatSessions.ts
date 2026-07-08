import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
      const data = await invoke<{ sessions: ChatSession[] }>('db_get_all_chat_sessions');
      setSessions(data.sessions || []);
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
      const session = await invoke<{ session: ChatSession }>('db_save_chat_session', { name, messages, modelId });
      if (session?.session) {
        setSessions((prev) => [session.session, ...prev]);
        setActiveSid(session.session.id);
        return session.session.id;
      }
    } catch (error) {
      console.error('Failed to create session:', error);
    }
    return null;
  }, []);

  const updateSession = useCallback(async (sessionId: string, messages: ChatMessage[]) => {
    try {
      await invoke('db_save_chat_session', { sessionId, messages });
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, updatedAt: new Date().toISOString() } : s))
      );
    } catch (error) {
      console.error('Failed to update session:', error);
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await invoke('db_delete_chat_session', { sessionId });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSid === sessionId) {
        setActiveSid(null);
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