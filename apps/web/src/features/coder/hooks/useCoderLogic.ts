import { useCallback, useEffect, useRef } from 'react';
import { useAgentState } from './useAgentState';
import { useAgentPipeline } from './useAgentPipeline';
import { ChatMessage } from '@src/infrastructure/types';
import { cancelCurrentRequest } from '@src/core/services/ai.service';
import { WorkspaceIntelligence } from '@src/infrastructure/services/workspaceIntelligence';
import { useCoderStore } from '@src/stores/useCoderStore';
import { useNyxStore } from '@src/shared/store/useNyxStore';

function areMessagesEqual(a: ChatMessage[], b: ChatMessage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].role !== b[i].role) return false;
    if (a[i].content !== b[i].content) return false;
    if (a[i].status !== b[i].status) return false;
  }
  return true;
}

export const useCoderLogic = () => {
  const {
    selectedModel,
    apiKeys,
    settings,
    webSearchEnabled,
    codebaseKnowledgeEnabled,
    messages,
    isLoading,
    metrics,
    suggestedPrompts,
    activeCoderSessionId,
    setActiveCoderSessionId,
    addMessage,
    updateLastMessage,
    setLoading,
    setMetrics,
    setSuggestedPrompts,
    clearChat,
  } = useCoderStore();

  const { activeAgent, models, setModel, agentPersonas, setAgentPersonas } = useAgentState({
    models: { nyx: selectedModel?.id || 'nyx-native' },
    setModel: (modelId: string) => {
      const model = models.nyx;
      if (model) {
        useCoderStore.getState().setSelectedModel({ id: modelId } as any);
      }
    },
  });

  const workspacePath = useNyxStore((state) => state.workspacePath);

  useEffect(() => {
    WorkspaceIntelligence.clearCache();
    WorkspaceIntelligence.getProfile(true).catch(() => {});
  }, [workspacePath]);

  const activeSidRef = useRef<string | null>(activeCoderSessionId);
  const lastActiveSidRef = useRef<string | null>(null);

  useEffect(() => {
    activeSidRef.current = activeCoderSessionId;
    return () => {
      cancelCurrentRequest();
    };
  }, [activeCoderSessionId]);

  const updateHistory = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      const updated = updater(messages);
      setLoading(false);
      return updated;
    },
    [messages, setLoading]
  );

  const clearHistory = useCallback(() => {
    clearChat();
  }, [clearChat]);

  const togglePin = useCallback(
    (index: number) => {
      updateHistory((prev) => {
        const newHistory = [...prev];
        if (newHistory[index]) {
          newHistory[index].isPinned = !newHistory[index].isPinned;
        }
        return newHistory;
      });
    },
    [updateHistory]
  );

  const {
    runCoder,
    stopCoder,
    subagentTasks,
    agentMode,
    agentReasoning,
    pendingToolConfirm,
  } = useAgentPipeline({
    models: { nyx: selectedModel?.id || 'nyx-native' },
    apiKeys,
    agentPersonas,
    modelSettings: settings,
    trackUsage: () => {}, // TODO: implement usage tracking
    history: messages,
    updateHistory,
    updateMetrics: setMetrics,
    getSuggestions: () => {}, // TODO: implement
    setSuggestedPrompts,
    webSearchEnabled,
  });

  const editMessage = useCallback(
    (index: number, newContent: string) => {
      updateHistory((prev) => {
        const newHistory = [...prev];
        if (newHistory[index]) {
          newHistory[index] = { ...newHistory[index], content: newContent };
        }
        return newHistory;
      });
    },
    [updateHistory]
  );

  const regenerateMessage = useCallback(
    (index: number) => {
      const msgs = messages;
      let targetUserIndex = -1;
      for (let i = index; i >= 0; i--) {
        if (msgs[i].role === 'user') {
          targetUserIndex = i;
          break;
        }
      }
      if (targetUserIndex !== -1) {
        const newPrompt = msgs[targetUserIndex].content;
        const newHistory = msgs.slice(0, targetUserIndex);

        const sessionId = useCoderStore.getState().activeCoderSessionId;
        if (!sessionId && useCoderStore.getState().messages.length > 0) {
          // Create new session if needed
        }

        setLoading(true);
        setTimeout(() => {
          runCoder?.(newPrompt);
        }, 0);
      }
    },
    [messages, runCoder, setLoading]
  );

  const forkAndRun = useCallback(
    (index: number, newPrompt: string) => {
      const newHistory = messages.slice(0, index);
      setLoading(true);
      setTimeout(() => {
        runCoder(newPrompt);
      }, 0);
    },
    [messages, runCoder, setLoading]
  );

  return {
    activeAgent,
    isLoading,
    history: messages,
    metrics,
    models,
    setModel,
    runCoder,
    stopCoder,
    clearHistory,
    forkAndRun,
    editMessage,
    regenerateMessage,
    togglePin,
    agentPersonas,
    suggestedPrompts,
    webSearchEnabled,
    setWebSearchEnabled: useCoderStore.getState().toggleWebSearch,
    codebaseKnowledgeEnabled,
    setCodebaseKnowledgeEnabled: useCoderStore.getState().toggleCodebaseKnowledge,
    subagentTasks,
    agentMode,
    agentReasoning,
    pendingToolConfirm,
    selectedModel,
  };
};