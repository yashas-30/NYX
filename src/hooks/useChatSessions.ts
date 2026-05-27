/**
 * @file src/hooks/useChatSessions.ts
 * @description Manages persistent chat sessions stored in localStorage.
 */

import { useState, useEffect, useCallback } from 'react';
import { ChatMessage } from '@src/infrastructure/types';

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'nyx-chat-sessions';
const MAX_SESSIONS = 50;

function generateId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function deriveTitleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return 'New Chat';
  const words = firstUser.content.trim().split(/\s+/).slice(0, 6).join(' ');
  return words.length > 0 ? words : 'New Chat';
}

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSid, setActiveSid] = useState<string | null>(null);

  // Load sessions from API or fallback to localStorage on mount
  useEffect(() => {
    let activeToken = true;

    async function loadSessions() {
      try {
        const res = await fetch('/api/conversations');
        if (res.ok) {
          const serverSessions = await res.json();
          if (Array.isArray(serverSessions) && activeToken) {
            setSessions(serverSessions);
            if (serverSessions.length > 0) {
              setActiveSid(serverSessions[0].id);
            }
            return;
          }
        }
      } catch (e) {
        console.warn('[useChatSessions] Backend fetch failed, falling back to localStorage:', e);
      }

      // Fallback
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw && activeToken) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setSessions(parsed);
            if (parsed.length > 0) {
              setActiveSid(parsed[0].id);
            }
          }
        }
      } catch (e) {
        console.warn('[useChatSessions] Fallback load failed:', e);
      }
    }

    loadSessions();

    return () => {
      activeToken = false;
    };
  }, []);

  // Persist sessions on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
    } catch (e) {
      console.warn('[useChatSessions] Failed to save sessions:', e);
    }
  }, [sessions]);

  const createSession = useCallback((initialMessages: ChatMessage[] = []): string => {
    const id = generateId();
    const now = Date.now();
    const session: ChatSession = {
      id,
      title: deriveTitleFromMessages(initialMessages),
      messages: initialMessages,
      createdAt: now,
      updatedAt: now,
    };
    setSessions(prev => [session, ...prev]);
    setActiveSid(id);

    // Sync to backend
    fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session)
    }).catch(err => console.warn('[useChatSessions] Failed to sync session creation:', err));

    return id;
  }, []);

  const updateSession = useCallback((sid: string, messages: ChatMessage[]) => {
    const now = Date.now();
    setSessions(prev =>
      prev.map(s => {
        if (s.id === sid) {
          const updated = {
            ...s,
            messages,
            title: deriveTitleFromMessages(messages),
            updatedAt: now,
          };
          // Sync to backend
          fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
          }).catch(err => console.warn('[useChatSessions] Failed to sync session update:', err));
          return updated;
        }
        return s;
      })
    );
  }, []);

  const deleteSession = useCallback((sid: string) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== sid);
      return next;
    });
    setActiveSid(prev => {
      if (prev === sid) return null;
      return prev;
    });

    // Sync to backend
    fetch(`/api/conversations/${sid}`, {
      method: 'DELETE'
    }).catch(err => console.warn('[useChatSessions] Failed to sync session deletion:', err));
  }, []);

  const switchSession = useCallback((sid: string | null) => {
    setActiveSid(sid);
  }, []);

  const activeSession = sessions.find(s => s.id === activeSid) ?? null;

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
