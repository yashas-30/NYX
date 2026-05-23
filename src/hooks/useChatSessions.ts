/**
 * @file src/hooks/useChatSessions.ts
 * @description Manages persistent chat sessions stored in localStorage.
 */

import { useState, useEffect, useCallback } from 'react';
import { ChatMessage } from '@/src/core/types';

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

  // Load sessions from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setSessions(parsed);
          if (parsed.length > 0) {
            setActiveSid(parsed[0].id);
          }
        } else {
          // If the data is corrupted or not an array, initialize with empty sessions
          setSessions([]);
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (e) {
      console.warn('[useChatSessions] Failed to load sessions:', e);
      setSessions([]);
    }
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
    return id;
  }, []);

  const updateSession = useCallback((sid: string, messages: ChatMessage[]) => {
    setSessions(prev =>
      prev.map(s =>
        s.id === sid
          ? {
              ...s,
              messages,
              title: deriveTitleFromMessages(messages),
              updatedAt: Date.now(),
            }
          : s
      )
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
