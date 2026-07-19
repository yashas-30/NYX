import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChatMessage } from '@nyx/shared/types';
export type ChatSession = any;

interface UseChatSessionsReturn {
  sessions: ChatSession[];
  activeSid: string | null;
  activeSession: ChatSession | null;
  isLoading: boolean;
  setActiveSid: (id: string | null) => void;
  createSession: (messages: ChatMessage[], options?: { title?: string, modelId?: string }) => string;
  updateSession: (sessionId: string, messages: ChatMessage[]) => void;
  deleteSession: (sessionId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useChatSessions(): UseChatSessionsReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSid, setActiveSid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Keep a ref of sessions for callbacks to avoid dependency cycles
  const sessionsRef = useRef<ChatSession[]>([]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

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

  const createSession = useCallback((messages: ChatMessage[], options?: { title?: string, modelId?: string }) => {
    const sessionId = crypto.randomUUID();
    const title = options?.title || messages[0]?.content?.slice(0, 50) || 'New Chat';
    
    const newSession = {
      id: sessionId,
      title,
      messages,
      model: options?.modelId || 'default',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000)
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSid(sessionId);

    invoke('db_save_chat_session', { session: newSession }).catch(err => {
      console.error('Failed to save new session to db:', err);
    });

    return sessionId;
  }, []);

  const updateSession = useCallback((sessionId: string, messages: ChatMessage[]) => {
    const existing = sessionsRef.current.find(s => s.id === sessionId);
    if (!existing) return;

    const updatedSession = {
      ...existing,
      messages,
      updated_at: Math.floor(Date.now() / 1000)
    };

    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? updatedSession : s))
    );

    invoke('db_save_chat_session', { session: updatedSession }).catch(err => {
      console.error('Failed to update session in db:', err);
    });
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await invoke('db_delete_chat_session', { id: sessionId });
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