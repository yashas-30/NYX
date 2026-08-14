/**
 * @file src/features/chat/hooks/useChatLogic.ts
 * @description Production-grade conversation state management with streaming,
 *   session branching, optimistic updates, and Claude/Kimi-parity features.
 */

import { useState, useRef, useEffect, useCallback, useReducer, useMemo } from 'react';
import { ModelDefinition, ChatMessage, ToolCall, StreamEvent } from '@src/infrastructure/types';
import { useMessageHistory } from '@src/shared/hooks/useMessageHistory';
import { AIService, cancelRequest, cancelAllRequests } from '@src/features/ai/services/ai.service';
import { toast } from '@src/shared/components/ui/sonner';
import { detectProvider, getEffectiveApiKey, getModelCapabilities, isReasoningModel } from '@src/infrastructure/utils/provider';
import { useUsageStore } from '@src/core/stores/useUsageStore';
import { compactHistory, compactHistoryAsync, estimateContextTokens } from '@src/infrastructure/utils/compaction';
import { buildChatPrompts, ChatContext } from '@src/core/prompts/chatPrompts';
import { stripThinkingContent } from '@src/utils/textUtils';
import { PlanPhase } from '@src/types/agent';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { invoke, Channel } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { useAppStore } from '@src/stores/useAppStore';
import { useModelStore } from '@src/core/stores/useModelStore';
import { useChatPipeline } from './useChatPipeline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatSessionsStore {
  activeSid?: string | null;
  activeSession?: {
    title: string;
    messages: ChatMessage[];
  };
  createSession?: (
    messages: ChatMessage[],
    options?: {
      branchOf?: string | null;
      branchAtIndex?: number | null;
      title?: string;
    }
  ) => string;
  updateSession?: (sid: string, messages: ChatMessage[]) => void;
  switchSession?: (sid: string) => void;
}

// eslint-disable-next-line code-duplication
interface ChatLogicProps {
  apiKeys: Record<string, string>;
  modelSettings: any; // We'll type this dynamically if needed, or import AISettings
  trackUsage: (provider: string, tokens: number) => void;
  models?: Record<'nyx', string>;
  setModel?: (modelId: string) => void;
  chatSessions: ChatSessionsStore;
  lightningEnabled?: boolean;
  lightningDirectives?: string[];
  logRollout?: (
    agentType: 'chat' | 'coder',
    task: string,
    response: string,
    spans?: unknown[],
    initialReward?: number | null
  ) => string;
  submitReward?: (rolloutId: string, reward: number) => void;
  maxContextTokens?: number;
  tokenBudget?: number;
  currentProvider?: string;
  gatewayUrl?: string;
}

interface SessionMetadata {
  title: string;
  createdAt: number;
  updatedAt: number;
  modelId: string;
  messageCount: number;
  totalTokens: number;
  branchOf?: string;
  branchAtIndex?: number;
}

interface StreamingState {
  content: string;
  reasoning: string;
  toolCalls: ToolCall[];
  status: 'idle' | 'streaming' | 'tool_calling' | 'finalizing';
}

interface ConversationMetrics {
  latency: number;
  tokens: number;
  tps: number;
  totalMessages: number;
  contextTokens: number;
  contextLimit: number;
  remainingBudget: number;
}

interface ChatLogicReturn {
  activeAgent: 'lucifer';
  isLoading: boolean;
  history: ChatMessage[];
  metrics: ConversationMetrics;
  models: Record<'nyx', string>;
  setModel: (modelId: string) => void;
  runChat: (prompt: string, images?: ChatImage[], options?: { skipUserMessage?: boolean; modelOverride?: string }) => Promise<boolean>;
  stopChat: () => void;
  clearHistory: () => void;
  suggestedPrompts: string[];
  submitReward?: (rolloutId: string, reward: number) => void;
  lightningEnabled: boolean;
  lightningDirectives: string[];

  // Streaming exports
  streaming: StreamingState;
  activeStreamMessage: ChatMessage | null;

  // Message actions
  editMessage: (index: number, newContent: string) => void;
  regenerateMessage: (index: number) => void;
  branchFromMessage: (index: number) => string | null;
  deleteMessage: (index: number) => void;

  // Session features
  sessionTitle: string;
  setSessionTitle: (title: string) => void;
  exportSession: (format: 'markdown' | 'json' | 'txt') => string;

  // Plan Phase
  planPhase: PlanPhase | null;

  // Budget/features
  tokenBudget: number;
  tokensUsed: number;
  approveTool: (index: number, approvalId: string) => Promise<void>;
  rejectTool: (index: number, approvalId: string) => Promise<void>;
}

interface ChatImage {
  name: string;
  mimeType: string;
  data: string;
}

// ---------------------------------------------------------------------------
// Reducer for atomic history updates
// ---------------------------------------------------------------------------

type HistoryAction =
  | { type: 'SET'; messages: ChatMessage[] }
  | { type: 'APPEND'; message: ChatMessage }
  | { type: 'UPDATE'; index: number; updater: (msg: ChatMessage) => ChatMessage }
  | { type: 'INSERT_AT'; index: number; message: ChatMessage }
  | { type: 'TRUNCATE'; index: number }
  | { type: 'CLEAR' };

function historyReducer(state: ChatMessage[], action: HistoryAction): ChatMessage[] {
  switch (action.type) {
    case 'SET':
      return action.messages.map((m) => ({ ...m }));
    case 'APPEND':
      return [...state, { ...action.message }];
    case 'UPDATE': {
      if (action.index < 0 || action.index >= state.length) return state;
      const next = [...state];
      next[action.index] = action.updater({ ...next[action.index] });
      return next;
    }
    case 'INSERT_AT': {
      const next = [...state];
      next.splice(action.index, 0, { ...action.message });
      return next;
    }
    case 'TRUNCATE':
      return state.slice(0, action.index);
    case 'CLEAR':
      return [];
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helper: Generate title from first user message
// ---------------------------------------------------------------------------

function generateTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New chat';
  const text = firstUser.content.slice(0, 50).replace(/\n/g, ' ');
  return text.length > 47 ? text + '...' : text || 'New chat';
}

// ---------------------------------------------------------------------------
// Helper: Estimate context tokens
// ---------------------------------------------------------------------------

// Compaction moved to @src/infrastructure/utils/compaction

// ---------------------------------------------------------------------------
// Helper: Check if two message lists have the same content
// ---------------------------------------------------------------------------

// eslint-disable-next-line code-duplication
function areMessagesEqual(a: ChatMessage[], b: ChatMessage[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = a.length - 1; i >= 0; i--) {
    if (a[i] === b[i]) continue;
    if (a[i].role !== b[i].role) return false;
    if (a[i].content !== b[i].content) return false;
    if (a[i].status !== b[i].status) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main Hook
// ---------------------------------------------------------------------------

export const useChatLogic = ({
  apiKeys,
  modelSettings,
  trackUsage,
  models: propModels,
  setModel: propSetModel,
  chatSessions,
  lightningEnabled = true,
  lightningDirectives = [],
  logRollout,
  submitReward,
  maxContextTokens = 128000,
  tokenBudget = Infinity,
  currentProvider,
  gatewayUrl,
}: ChatLogicProps): ChatLogicReturn => {
  // --- Model state ---
  // eslint-disable-next-line code-duplication
  const [localModels, setLocalModels] = useState<Record<'nyx', string>>({ nyx: '' });
  const models = propModels ?? localModels;
  const modelSystemPrompts = useNyxStore((s) => s.modelSystemPrompts);


  // --- History with reducer for atomic updates ---
  const [history, dispatch] = useReducer(historyReducer, []);
  const historyRef = useRef<ChatMessage[]>([]);
  
  // --- Active Stream State (2026 Standard) ---
  const [activeStreamMessage, setActiveStreamMessage] = useState<ChatMessage | null>(null);
  // Keep a ref to the active stream so we can safely commit it when done
  const activeStreamRef = useRef<ChatMessage | null>(null);

  // Keep ref in sync for synchronous reads
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // Reset usage limit when the model changes to prevent stale rate limits from locking the model selector
  useEffect(() => {
    if (models?.nyx) {
      const provider = detectProvider(models.nyx);
      const apiKey = getEffectiveApiKey(provider, apiKeys) || '';
      useUsageStore.getState().resetLimitForModel(models.nyx, apiKey);
    }
  }, [models?.nyx, apiKeys]);

  // --- Session tracking ---
  const activeSidRef = useRef<string | null>(null);
  const newlyCreatedSidRef = useRef<string | null>(null);
  const isCreatingSessionRef = useRef(false);
  const streamJustEndedRef = useRef(false);
  const [sessionTitle, setSessionTitleState] = useState('New chat');

  const setSessionTitle = useCallback(
    (title: string) => {
      setSessionTitleState(title);
      if (activeSidRef.current) {
        chatSessions.updateSession?.(activeSidRef.current, historyRef.current);
      }
    },
    [chatSessions]
  );

  // --- Message history hook ---
  const {
    metrics: baseMetrics,
    suggestedPrompts,
    setSuggestedPrompts,
    updateMetrics,
    clearMetrics,
    getSuggestions,
  } = useMessageHistory();

  // --- Token budget tracking ---
  const [tokensUsed, setTokensUsed] = useState(0);

  // --- Web search ---
  const webSearchEnabled = useAppStore((state) => state.webSearchEnabled);

  // --- Plan Phase State ---
  const [planPhase, setPlanPhase] = useState<PlanPhase | null>(null);

  // NOTE: PromptAnalysisService (cloud Gemini call) removed from hot path.
  // Intent classification is handled by the Rust backend's classify_intent_local()
  // via orchestrate_supervisor. We mirror that logic here in JS to set is_fast_intent
  // without any network round-trip.

  // --- WebSocket Real-time Collaboration ---
  // NOTE: WebSocket sync is disabled — no auth token is available in the
  // standalone Tauri app. The effect previously entered an infinite 500ms
  // poll loop on every session switch, leaking CPU and memory.
  // Re-enable this block only when a real /ws/session-sync endpoint exists.
  useEffect(() => {
    // No-op: no WS endpoint configured.
    return;
  }, [chatSessions?.activeSid]);


  // -------------------------------------------------------------------------
  // Session synchronization
  // -------------------------------------------------------------------------

  const activeSid = chatSessions?.activeSid;
  const activeSessionMessages = chatSessions?.activeSession?.messages;
  const lastActiveSidRef = useRef<string | null>(null);

  // Persist history changes to session storage
  const persistHistory = useCallback(
    (messages: ChatMessage[], options?: { newSession?: boolean; title?: string }) => {
      const sid = activeSidRef.current;
      const validMessages = messages.filter(m => m.status !== 'error');

      if (!sid || options?.newSession) {
        if (isCreatingSessionRef.current) return;
        isCreatingSessionRef.current = true;

        const title = options?.title || generateTitle(validMessages);
        try {
          const newSid = chatSessions.createSession?.(validMessages, { title });
          if (newSid) {
            activeSidRef.current = newSid;
            newlyCreatedSidRef.current = newSid;
            setSessionTitleState(title);
          }
        } finally {
          isCreatingSessionRef.current = false;
        }
        return;
      }

      chatSessions.updateSession?.(sid, validMessages);
    },
    [chatSessions, sessionTitle]
  );

  // -------------------------------------------------------------------------
  // History actions
  // -------------------------------------------------------------------------

  const clearHistory = useCallback(() => {
    dispatch({ type: 'CLEAR' });
    historyRef.current = [];
    activeSidRef.current = null;
    clearMetrics();
    setTokensUsed(0);
    setSessionTitleState('New chat');
  }, [clearMetrics]);

  const setModel = useCallback(
    (mid: string) => {
      if (propSetModel) {
        propSetModel(mid);
      } else {
        setLocalModels({ nyx: mid });
      }
      clearHistory();
    },
    [propSetModel, clearHistory]
  );

  // -------------------------------------------------------------------------
  // Derived Streaming state from active message history
  // -------------------------------------------------------------------------

  // Note: Since useChatPipeline streams directly into the last message in history,
  // we can reactively derive the streaming state directly from history!
  const streaming: StreamingState = useMemo(() => {
    const isStreaming = activeStreamMessage !== null;

    if (isStreaming) {
      const isToolCalling = activeStreamMessage.toolCalls && activeStreamMessage.toolCalls.length > 0;
      return {
        content: activeStreamMessage.content || '',
        reasoning: activeStreamMessage.reasoning || '',
        toolCalls: activeStreamMessage.toolCalls || [],
        status: isToolCalling ? 'tool_calling' : 'streaming',
      };
    }

    return {
      content: '',
      reasoning: '',
      toolCalls: [],
      status: 'idle',
    };
  }, [activeStreamMessage]);

  // -------------------------------------------------------------------------
  // Chat pipeline integration
  // -------------------------------------------------------------------------

  const { runChat, isSupervising, cancelPipeline } = useChatPipeline({
    historyRef,
    activeStreamRef,
    dispatch,
    setActiveStreamMessage,
    persistHistory,
    setTokensUsed,
    maxContextTokens,
    tokenBudget,
    tokensUsed,
    currentProvider,
    gatewayUrl,
    webSearchEnabled,
  });

  const isLoading = isSupervising;
  const isSearching = false; // Add state if needed, or rely on tool_call events in history

  // -------------------------------------------------------------------------
  // Stop generation (moved before useEffect that references it)
  // -------------------------------------------------------------------------

  const stopChat = useCallback(() => {
    // Tell Tauri backend to explicitly stop any running agent/LLM loops
    const isTauriEnv = typeof window !== 'undefined' &&
      ('_tauri' in window || '__TAURI__' in window || '__TAURI_INTERNALS__' in window);
    if (isTauriEnv) {
      // import('@tauri-apps/api/core').then(m => m.invoke('cancel_agent_loop')).catch(console.error);
    }
    
    cancelPipeline();
    cancelRequest('chat-stream');
  }, [cancelPipeline]);

  // Stable refs for loading/stopChat so the session sync effect doesn't re-run on every render
  const loadingRef = useRef(isLoading);
  useEffect(() => { loadingRef.current = isLoading; }, [isLoading]);
  const stopChatRef = useRef(stopChat);
  useEffect(() => { stopChatRef.current = stopChat; }, [stopChat]);

  useEffect(() => {
    if (activeSid !== lastActiveSidRef.current) {
      const isOurNewSession = activeSid && activeSid === newlyCreatedSidRef.current;
      lastActiveSidRef.current = activeSid || null;
      activeSidRef.current = activeSid || null;

      if (!isOurNewSession) {
        if (loadingRef.current) {
          stopChatRef.current();
        }
        const msgs = activeSessionMessages || [];
        dispatch({ type: 'SET', messages: msgs });
        setActiveStreamMessage(null);
        activeStreamRef.current = null;
        clearMetrics();
        setSessionTitleState(chatSessions?.activeSession?.title || generateTitle(msgs));
      }
    } else if (
      !loadingRef.current &&
      !streamJustEndedRef.current &&
      activeSessionMessages &&
      activeSessionMessages.length >= historyRef.current.length &&
      !areMessagesEqual(activeSessionMessages, historyRef.current)
    ) {
      dispatch({ type: 'SET', messages: activeSessionMessages });
    }
  }, [
    activeSid,
    activeSessionMessages,
    clearMetrics,
    chatSessions?.activeSession?.title,
  ]);

  useEffect(() => {
    if (!isLoading) {
      newlyCreatedSidRef.current = null;
      streamJustEndedRef.current = true;
      const timer = setTimeout(() => {
        streamJustEndedRef.current = false;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  const runChatRef = useRef<any>(null);
  useEffect(() => {
    runChatRef.current = runChat;
  }, [runChat]);

  // -------------------------------------------------------------------------
  // Message actions (Claude/Kimi parity)
  // -------------------------------------------------------------------------

  const editMessage = useCallback(
    (index: number, newContent: string) => {
      const messages = historyRef.current;
      if (index < 0 || index >= messages.length || messages[index].role !== 'user') return;

      // Truncate after this message and update content
      const truncated = messages.slice(0, index + 1);
      truncated[index] = { ...truncated[index], content: newContent };

      dispatch({ type: 'SET', messages: truncated });
      historyRef.current = truncated;
      persistHistory(truncated);

      // eslint-disable-next-line code-duplication
      const mappedImages = truncated[index].images
        ?.map((img) => ({
          name: img.name,
          mimeType: img.mimeType || 'image/jpeg',
          data: img.data || '',
        }))
        .filter((img) => !!img.data);

      // Auto-regenerate assistant response
      runChatRef.current?.(newContent, mappedImages, { skipUserMessage: true });
    },
    [persistHistory]
  );

  const regenerateMessage = useCallback(
    (index: number) => {
      const messages = historyRef.current;
      if (index < 0 || index >= messages.length || messages[index].role !== 'assistant') return;

      // Find preceding user message
      let userIndex = index - 1;
      while (userIndex >= 0 && messages[userIndex].role !== 'user') userIndex--;
      if (userIndex < 0) return;

      const truncated = messages.slice(0, userIndex + 1);
      dispatch({ type: 'SET', messages: truncated });
      historyRef.current = truncated;
      persistHistory(truncated);

      const userMsg = truncated[userIndex];
      // eslint-disable-next-line code-duplication
      const mappedImages = userMsg.images
        ?.map((img) => ({
          name: img.name,
          mimeType: img.mimeType || 'image/jpeg',
          data: img.data || '',
        }))
        .filter((img) => !!img.data);

      const { cloudModelId, localModelId } = useNyxStore.getState();
      const modelToUse = (cloudModelId || localModelId) as string;

      if (!modelToUse) {
        toast.error('Please select at least one model (Cloud or Local).');
        return;
      }

      runChatRef.current?.(userMsg.content, mappedImages, { skipUserMessage: true, modelOverride: modelToUse });
    },
    [persistHistory]
  );

  const branchFromMessage = useCallback(
    (index: number): string | null => {
      const branchedHistory = historyRef.current.slice(0, index + 1).map((msg) => ({ ...msg }));
      const newSid = chatSessions.createSession?.(branchedHistory, { branchOf: activeSid, branchAtIndex: index });
      if (newSid) {
        chatSessions.switchSession?.(newSid);
        toast.success('Branched conversation from this message');
        return newSid;
      }
      return null;
    },
    [chatSessions, activeSid]
  );

  const deleteMessage = useCallback(
    (index: number) => {
      const messages = historyRef.current.filter((_, i) => i !== index);
      dispatch({ type: 'SET', messages });
      historyRef.current = messages;
      persistHistory(messages);
    },
    [persistHistory]
  );

  // -------------------------------------------------------------------------
  // Export session
  // -------------------------------------------------------------------------

  const exportSession = useCallback(
    (format: 'markdown' | 'json' | 'txt'): string => {
      const messages = historyRef.current;
      switch (format) {
        case 'markdown':
          return messages
            .map((m) => `## ${m.role === 'user' ? 'User' : 'Assistant'}\n\n${m.content}`)
            .join('\n\n---\n\n');
        case 'json':
          return JSON.stringify(
            { title: sessionTitle, messages, exportedAt: new Date().toISOString() },
            null,
            2
          );
        case 'txt':
          return messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
      }
    },
    [sessionTitle]
  );

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      cancelPipeline();
      cancelAllRequests();
    };
  }, []);

  // -------------------------------------------------------------------------
  // Derived metrics
  // -------------------------------------------------------------------------

  const metrics: ConversationMetrics = useMemo(
    () => ({
      latency: baseMetrics?.latency || 0,
      tokens: baseMetrics?.tokens || 0,
      tps: baseMetrics?.tps || 0,
      totalMessages: history.length,
      contextTokens: estimateContextTokens(history),
      contextLimit: maxContextTokens,
      remainingBudget: tokenBudget === Infinity ? Infinity : Math.max(0, tokenBudget - tokensUsed),
    }),
    [baseMetrics, history, maxContextTokens, tokenBudget, tokensUsed]
  );

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  const approveTool = useCallback(async (index: number, approvalId: string) => {
    try {
      const isTauriEnv = typeof window !== 'undefined' &&
        ('_tauri' in window || '__TAURI__' in window || '__TAURI_INTERNALS__' in window);
      
      if (isTauriEnv) {
        await invoke('approve_tool', { approvalId });
      }
      
      dispatch({
        type: 'UPDATE',
        index,
        updater: (msg) => ({ ...msg, pendingApproval: null })
      });
    } catch (err: any) {
      toast.error(`Failed to approve tool: ${err.message || String(err)}`);
    }
  }, []);

  const rejectTool = useCallback(async (index: number, approvalId: string) => {
    try {
      const isTauriEnv = typeof window !== 'undefined' &&
        ('_tauri' in window || '__TAURI__' in window || '__TAURI_INTERNALS__' in window);
      
      if (isTauriEnv) {
        await invoke('reject_tool', { approvalId });
      }
      
      dispatch({
        type: 'UPDATE',
        index,
        updater: (msg) => ({ ...msg, pendingApproval: null, status: 'stopped' })
      });
    } catch (err: any) {
      toast.error(`Failed to reject tool: ${err.message || String(err)}`);
    }
  }, []);

  return {
    activeAgent: 'lucifer',
    isLoading,
    history,
    metrics,
    models,
    setModel,
    runChat,
    stopChat,
    clearHistory,
    suggestedPrompts,
    submitReward,
    lightningEnabled,
    lightningDirectives,

    // Streaming
    streaming,
    activeStreamMessage,

    // Message actions
    editMessage,
    regenerateMessage,
    branchFromMessage,
    deleteMessage,

    // Session
    sessionTitle,
    setSessionTitle,
    exportSession,

    // Plan Phase
    planPhase,

    // Budget
    tokenBudget,
    tokensUsed,
    approveTool,
    rejectTool,
  };
};
