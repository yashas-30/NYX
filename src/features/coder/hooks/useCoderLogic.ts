/**
 * @file src/features/coder/hooks/useCoderLogic.ts
 * @description Composed hook that orchestrates NYX agent state, message history, and AI pipeline execution.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAgentState } from './useAgentState';
import { useMessageHistory } from './useMessageHistory';
import { useAgentPipeline } from './useAgentPipeline';
import { ChatMessage } from '@/src/core/types';

interface CoderLogicProps {
  apiKeys: Record<string, string>;
  lmStudioBaseUrl: string;
  modelSettings: any;
  trackUsage: (provider: string, tokens: number) => void;
  ollamaModels: any[];
  lmStudioModels: any[];
  ollamaBaseUrl: string;
  models?: Record<'nyx', string>;
  setModel?: (modelId: string) => void;
  chatSessions: any;
}

export const useCoderLogic = ({
  apiKeys,
  lmStudioBaseUrl,
  modelSettings,
  trackUsage,
  ollamaModels,
  lmStudioModels,
  ollamaBaseUrl,
  models: propModels,
  setModel: propSetModel,
  chatSessions
}: CoderLogicProps) => {
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [codebaseKnowledgeEnabled, setCodebaseKnowledgeEnabled] = useState(true);
  
  const {
    activeAgent,
    models,
    setModel,
    agentPersonas,
    setAgentPersonas
  } = useAgentState({
    models: propModels,
    setModel: propSetModel
  });

  const {
    metrics,
    suggestedPrompts,
    setSuggestedPrompts,
    updateMetrics,
    clearMetrics,
    getSuggestions
  } = useMessageHistory();

  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);

  // Sync ref to protect session ID synchronously
  const activeSidRef = useRef<string | null>(chatSessions?.activeSid || null);
  const createdSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeSidRef.current = chatSessions?.activeSid || null;
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
    } else if (activeSessionMessages && activeSessionMessages !== messagesRef.current) {
      messagesRef.current = activeSessionMessages;
      setLocalMessages(activeSessionMessages);
    }
  }, [activeSid, activeSessionMessages]);

  // Unified history update callback
  const updateHistory = useCallback((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    const updated = updater(messagesRef.current);
    messagesRef.current = updated;
    setLocalMessages(updated);

    let sid = activeSidRef.current;
    if (!sid) {
      sid = chatSessions?.createSession?.(updated) || null;
      activeSidRef.current = sid;
      createdSessionIdRef.current = sid;
    } else {
      chatSessions?.updateSession?.(sid, updated);
    }
  }, [chatSessions]);

  const clearHistory = useCallback(() => {
    messagesRef.current = [];
    setLocalMessages([]);
    if (activeSidRef.current) {
      chatSessions?.updateSession?.(activeSidRef.current, []);
    }
    clearMetrics();
  }, [chatSessions, clearMetrics]);

  const { isLoading, runCoder, stopCoder } = useAgentPipeline({
    models,
    apiKeys,
    agentPersonas,
    modelSettings,
    lmStudioBaseUrl,
    ollamaBaseUrl,
    ollamaModels,
    lmStudioModels,
    trackUsage,
    history: localMessages,
    updateHistory,
    updateMetrics,
    getSuggestions,
    setSuggestedPrompts,
    webSearchEnabled,
    codebaseKnowledgeEnabled
  });

  return {
    activeAgent,
    isLoading,
    history: localMessages,
    metrics,
    models,
    setModel,
    runCoder,
    stopCoder,
    clearHistory,
    agentPersonas,
    suggestedPrompts,
    webSearchEnabled,
    setWebSearchEnabled,
    codebaseKnowledgeEnabled,
    setCodebaseKnowledgeEnabled
  };
};
