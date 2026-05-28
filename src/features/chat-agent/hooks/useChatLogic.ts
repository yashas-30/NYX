/**
 * @file src/features/chat-agent/hooks/useChatLogic.ts
 * @description State management and orchestration logic for conversational Chat Agent feature.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage } from '@src/infrastructure/types';
import { useMessageHistory } from '@src/features/coder/hooks/useMessageHistory';
import { useChatPipeline } from './useChatPipeline';
import { cancelCurrentRequest } from '@src/core/services/ai.service';

interface ChatLogicProps {
  apiKeys: Record<string, string>;
  modelSettings: any;
  trackUsage: (provider: string, tokens: number) => void;
  models?: Record<'nyx', string>;
  setModel?: (modelId: string) => void;
  chatSessions: any;
  lightningEnabled?: boolean;
  lightningDirectives?: string[];
  logRollout?: (
    agentType: 'chat' | 'coder',
    task: string,
    response: string,
    spans?: any[],
    initialReward?: number | null
  ) => string;
  submitReward?: (rolloutId: string, reward: number) => void;
}

export const useChatLogic = ({
  apiKeys,
  modelSettings,
  trackUsage,
  models: propModels,
  setModel: propSetModel,
  chatSessions,
  lightningEnabled,
  lightningDirectives,
  logRollout,
  submitReward,
}: ChatLogicProps) => {
  const [localModels, setLocalModels] = useState<Record<'nyx', string>>({
    nyx: '',
  });
  const models = propModels ?? localModels;
  const setModel = useCallback(
    (mid: string) => {
      if (propSetModel) {
        propSetModel(mid);
      } else {
        setLocalModels({ nyx: mid });
      }
    },
    [propSetModel]
  );

  const {
    metrics,
    suggestedPrompts,
    setSuggestedPrompts,
    updateMetrics,
    clearMetrics,
    getSuggestions,
  } = useMessageHistory();

  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);

  // Sync ref to protect session ID synchronously
  const activeSidRef = useRef<string | null>(chatSessions?.activeSid || null);
  const createdSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeSidRef.current = chatSessions?.activeSid || null;
    return () => {
      cancelCurrentRequest();
    };
  }, [chatSessions?.activeSid]);

  // Sync localMessages when activeSession changes
  const activeSessionMessages = chatSessions?.activeSession?.messages;
  const activeSid = chatSessions?.activeSid;
  const lastActiveSidRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeSid && activeSid === createdSessionIdRef.current) {
      lastActiveSidRef.current = activeSid;
      createdSessionIdRef.current = null;
      return;
    }
    if (activeSid !== lastActiveSidRef.current) {
      lastActiveSidRef.current = activeSid || null;
      const msgs = activeSessionMessages || [];
      messagesRef.current = msgs;
      setLocalMessages(msgs);
      clearMetrics();
    } else if (activeSessionMessages && activeSessionMessages !== messagesRef.current) {
      messagesRef.current = activeSessionMessages;
      setLocalMessages(activeSessionMessages);
    }
  }, [activeSid, activeSessionMessages, clearMetrics]);

  // Unified history update callback
  const updateHistory = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      const updated = updater(messagesRef.current);
      const cloned = updated.map((msg) => ({ ...msg }));
      messagesRef.current = cloned;
      setLocalMessages(cloned);

      let sid = activeSidRef.current;
      if (!sid) {
        sid = chatSessions?.createSession?.(cloned) || null;
        activeSidRef.current = sid;
        createdSessionIdRef.current = sid;
      } else {
        chatSessions?.updateSession?.(sid, cloned);
      }
    },
    [chatSessions]
  );

  const clearHistory = useCallback(() => {
    messagesRef.current = [];
    setLocalMessages([]);
    if (activeSidRef.current) {
      chatSessions?.updateSession?.(activeSidRef.current, []);
    }
    clearMetrics();
  }, [chatSessions, clearMetrics]);

  const [webSearchEnabled, setWebSearchEnabled] = useState(true);

  const { isLoading, isSearching, runChat, stopChat } = useChatPipeline({
    models,
    apiKeys,
    modelSettings,
    trackUsage,
    history: localMessages,
    updateHistory,
    updateMetrics,
    getSuggestions,
    setSuggestedPrompts,
    lightningEnabled,
    lightningDirectives,
    logRollout,
    webSearchEnabled,
  });

  return {
    activeAgent: 'nyx' as const,
    isLoading,
    isSearching,
    history: localMessages,
    metrics,
    models,
    setModel,
    runChat,
    stopChat,
    clearHistory,
    suggestedPrompts,
    submitReward,
    webSearchEnabled,
    setWebSearchEnabled,
    lightningEnabled,
    lightningDirectives,
  };
};
