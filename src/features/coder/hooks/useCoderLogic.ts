/**
 * @file src/features/coder/hooks/useCoderLogic.ts
 * @description Composed hook that orchestrates NYX agent state, message history, and AI pipeline execution.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAgentState } from './useAgentState';
import { useMessageHistory } from '@src/shared/hooks/useMessageHistory';
import { useAgentPipeline } from './useAgentPipeline';
import { ChatMessage } from '@src/infrastructure/types';
import { cancelCurrentRequest } from '@src/core/services/ai.service';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { WorkspaceIntelligence } from '@src/infrastructure/services/workspaceIntelligence';

function areMessagesEqual(a: ChatMessage[], b: ChatMessage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].role !== b[i].role) return false;
    if (a[i].content !== b[i].content) return false;
    if (a[i].status !== b[i].status) return false;
  }
  return true;
}

interface CoderLogicProps {
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

export const useCoderLogic = ({
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
}: CoderLogicProps) => {
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [codebaseKnowledgeEnabled, setCodebaseKnowledgeEnabled] = useState(true);

  const { activeAgent, models, setModel, agentPersonas, setAgentPersonas } = useAgentState({
    models: propModels,
    setModel: propSetModel,
  });

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

  const workspacePath = useNyxStore((state) => state.workspacePath);

  useEffect(() => {
    WorkspaceIntelligence.clearCache();
    WorkspaceIntelligence.getProfile(true).catch(() => {});
  }, [workspacePath]);

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
    } else if (activeSessionMessages && activeSessionMessages.length >= messagesRef.current.length && !areMessagesEqual(activeSessionMessages, messagesRef.current)) {
      messagesRef.current = activeSessionMessages;
      setLocalMessages(activeSessionMessages);
    }
  }, [activeSid, activeSessionMessages, clearMetrics]);

  // Unified history update callback
  const updateHistory = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      const updated = updater(messagesRef.current);
      // Clone array and all message objects to guarantee React and React.memo notice mutations
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

  const { isLoading, runCoder, stopCoder, subagentTasks, agentMode, agentReasoning } =
    useAgentPipeline({
      models,
      apiKeys,
      agentPersonas,
      modelSettings,
      trackUsage,
      history: localMessages,
      updateHistory,
      updateMetrics,
      getSuggestions,
      setSuggestedPrompts,
      webSearchEnabled,
      codebaseKnowledgeEnabled,
      lightningEnabled,
      lightningDirectives,
      logRollout,
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
    setCodebaseKnowledgeEnabled,
    subagentTasks,
    agentMode,
    agentReasoning,
    submitReward,
    lightningEnabled,
    lightningDirectives,
  };
};
