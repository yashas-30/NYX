/**
 * @file src/features/chat/hooks/useChatLogic.ts
 * @description Production-grade conversation state management with streaming,
 *   session branching, optimistic updates, and Claude/Kimi-parity features.
 */

import { useState, useRef, useEffect, useCallback, useReducer, useMemo } from 'react';
import { ChatMessage, ToolCall, StreamEvent } from '@src/infrastructure/types';
import { useMessageHistory } from '@src/shared/hooks/useMessageHistory';
import { useChatPipeline } from './useChatPipeline';
import { AIService, cancelRequest, cancelAllRequests } from '@src/features/ai/services/ai.service';
import { toast } from '@src/shared/components/ui/sonner';
import { getSessionToken } from '@src/infrastructure/api/authFetch';
import { detectProvider, getEffectiveApiKey } from '@src/infrastructure/utils/provider';
import { useUsageStore } from '@src/core/stores/useUsageStore';
import { compactHistory, compactHistoryAsync, estimateContextTokens } from '@src/infrastructure/utils/compaction';
import { PlanPhase } from '@src/types/agent';
import { PromptAnalysisService } from '@src/features/ai/services/promptAnalysis.service';
import { useNyxStore } from '@src/shared/store/useNyxStore';

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
  activeAgent: 'nyx';
  isLoading: boolean;
  history: ChatMessage[];
  metrics: ConversationMetrics;
  models: Record<'nyx', string>;
  setModel: (modelId: string) => void;
  runChat: (prompt: string, images?: ChatImage[]) => Promise<void>;
  stopChat: () => void;
  clearHistory: () => void;
  suggestedPrompts: string[];
  submitReward?: (rolloutId: string, reward: number) => void;
  lightningEnabled: boolean;
  lightningDirectives: string[];

  // Streaming exports
  streaming: StreamingState;

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
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
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
}: ChatLogicProps): ChatLogicReturn => {
  // --- Model state ---
  // eslint-disable-next-line code-duplication
  const [localModels, setLocalModels] = useState<Record<'nyx', string>>({ nyx: '' });
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

  // --- History with reducer for atomic updates ---
  const [history, dispatch] = useReducer(historyReducer, []);
  const historyRef = useRef<ChatMessage[]>([]);

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

  // --- Web search (disabled by default to prevent Scrapling timeout) ---
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);

  // --- Abort controller for current generation ---
  const abortCtrlRef = useRef<AbortController | null>(null);

  // --- Plan Phase State ---
  const [planPhase, setPlanPhase] = useState<PlanPhase | null>(null);

  // Prompt Analysis Service
  const promptAnalyzer = useMemo(() => new PromptAnalysisService(), []);

  // --- WebSocket Real-time Collaboration ---
  useEffect(() => {
    if (!chatSessions?.activeSid) return;

    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;
    let tokenPollTimeout: NodeJS.Timeout;

    const connect = () => {
      const token = getSessionToken();

      // Don't connect with an empty token — the server will reject it.
      // Poll every 500ms until a valid token is available.
      if (!token) {
        tokenPollTimeout = setTimeout(connect, 500);
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/session-sync?sessionId=${chatSessions.activeSid}&token=${token}`;

      ws = new WebSocket(wsUrl);

      let reconnectAttempts = 0;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'history_update' && data.messages) {
            if (!areMessagesEqual(data.messages, historyRef.current)) {
              dispatch({ type: 'SET', messages: data.messages });
            }
          }
        } catch (e) {
          console.debug('[ChatLogic] WebSocket message parse error:', e);
        }
      };

      ws.onopen = () => {
        reconnectAttempts = 0;
      };

      ws.onclose = () => {
        reconnectAttempts++;
        const delay = Math.min(3000 * Math.pow(1.5, reconnectAttempts - 1), 30000);
        reconnectTimeout = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // Suppress native error logging is impossible, but we avoid adding our own spam
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      clearTimeout(tokenPollTimeout);
      ws?.close();
    };
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

      if (!sid || options?.newSession) {
        if (isCreatingSessionRef.current) return;
        isCreatingSessionRef.current = true;

        const title = options?.title || generateTitle(messages);
        try {
          const newSid = chatSessions.createSession?.(messages, { title });
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

      chatSessions.updateSession?.(sid, messages);
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

  // -------------------------------------------------------------------------
  // Derived Streaming state from active message history
  // -------------------------------------------------------------------------

  // Note: Since useChatPipeline streams directly into the last message in history,
  // we can reactively derive the streaming state directly from history!
  const streaming: StreamingState = useMemo(() => {
    const lastMsg = history[history.length - 1];
    const isAssistant = lastMsg?.role === 'assistant';
    const isStreaming =
      isAssistant && (lastMsg.status === 'loading' || lastMsg.status === undefined);

    if (isStreaming) {
      const isToolCalling = lastMsg.toolCalls && lastMsg.toolCalls.length > 0;
      return {
        content: lastMsg.content || '',
        reasoning: lastMsg.reasoning || '',
        toolCalls: lastMsg.toolCalls || [],
        status: isToolCalling ? 'tool_calling' : 'streaming',
      };
    }

    return {
      content: '',
      reasoning: '',
      toolCalls: [],
      status: 'idle',
    };
  }, [history]);

  // -------------------------------------------------------------------------
  // Chat pipeline integration
  // -------------------------------------------------------------------------

  const updateHistoryFromPipeline = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      const nextHistory = updater(historyRef.current);
      dispatch({ type: 'SET', messages: nextHistory });
      historyRef.current = nextHistory;
      persistHistory(nextHistory);
    },
    [persistHistory]
  );

  const chatPipeline = useChatPipeline({
    models,
    apiKeys,
    modelSettings,
    trackUsage,
    history,
    updateHistory: updateHistoryFromPipeline,
    updateMetrics,
    getSuggestions,
    setSuggestedPrompts,
    lightningEnabled,
    lightningDirectives,
    logRollout,
  });

  const isLoading = chatPipeline.isLoading;
  const isSearching = chatPipeline.isSearching;
  const pipelineRunChat = chatPipeline.runChat;
  const pipelineStopChat = chatPipeline.stopChat;

  // -------------------------------------------------------------------------
  // Stop generation (moved before useEffect that references it)
  // -------------------------------------------------------------------------

  const stopChat = useCallback(() => {
    abortCtrlRef.current?.abort();
    pipelineStopChat();
    cancelRequest('chat-stream');
  }, [pipelineStopChat]);

  useEffect(() => {
    if (activeSid !== lastActiveSidRef.current) {
      const isOurNewSession = activeSid && activeSid === newlyCreatedSidRef.current;
      lastActiveSidRef.current = activeSid || null;
      activeSidRef.current = activeSid || null;

      if (!isOurNewSession) {
        if (isLoading) {
          stopChat();
        }
        const msgs = activeSessionMessages || [];
        dispatch({ type: 'SET', messages: msgs });
        clearMetrics();
        setSessionTitleState(chatSessions?.activeSession?.title || generateTitle(msgs));
      }
    } else if (
      !isLoading &&
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
    isLoading,
    stopChat,
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

  // Store ref for message actions to call
  const runChatRef = useRef(pipelineRunChat);
  useEffect(() => {
    runChatRef.current = pipelineRunChat;
  }, [pipelineRunChat]);

  // -------------------------------------------------------------------------
  // Public runChat wrapper with budget check
  // -------------------------------------------------------------------------

  const lastRunRef = useRef<number>(0);
  const runChat = useCallback(
    async (prompt: string, images?: ChatImage[]): Promise<void> => {
      const now = Date.now();
      if (now - lastRunRef.current < 300) {
        return; // Debounce 300ms
      }
      lastRunRef.current = now;

      if (!prompt.trim() && (!images || images.length === 0)) return;

      if (prompt.length > 50000) {
        toast.error('Message exceeds maximum length of 50,000 characters.');
        return;
      }

      const estimatedInput = Math.ceil(prompt.length / 4) + (images?.length || 0) * 512;
      const contextTokens = estimateContextTokens(historyRef.current);
      const projectedTotal = contextTokens + estimatedInput + 4096; // Assume 4k output

      if (projectedTotal > maxContextTokens) {
        toast.info('Compacting context to fit token limit...');
        const compacted = await compactHistoryAsync(historyRef.current, maxContextTokens - estimatedInput - 4096, AIService, modelSettings);
        dispatch({ type: 'SET', messages: compacted });
        historyRef.current = compacted;
        persistHistory(compacted);
      }

      if (tokensUsed + estimatedInput > tokenBudget) {
        toast.error('Token budget exhausted');
        return;
      }

      abortCtrlRef.current = new AbortController();

      try {
        setPlanPhase({ status: 'planning', steps: ['Analyzing prompt intent...'], completedSteps: [] });
        
        const analysis = await promptAnalyzer.analyze(prompt, {
          useEmbedding: true,
          history: historyRef.current.map(m => m.content).slice(-5)
        });

        const expertisePrompt = analysis.userExpertise === 'beginner' 
          ? 'Explain concepts simply. Use analogies. Avoid jargon.'
          : analysis.userExpertise === 'expert'
            ? 'Provide highly technical, concise answers. Skip basics.'
            : '';

        const modelToUse = models?.nyx === 'nyx-auto'
          ? (analysis.suggestedModel === 'reasoning' ? 'deepseek-reasoner' :
             analysis.suggestedModel === 'fast' ? 'gemini-3.1-flash-lite' :
             'gemini-3.5-flash')
          : (models?.nyx || 'gemini-3.5-flash');
                           
        let systemPromptAddon = expertisePrompt;
        
        // --- Project Context Injection ---
        const activeProjectId = useNyxStore.getState().activeProjectId;
        if (activeProjectId) {
          try {
            const saved = localStorage.getItem('nyx_projects');
            if (saved) {
              const projects = JSON.parse(saved);
              const project = projects.find((p: any) => p.id === activeProjectId);
              if (project) {
                let projectContext = `\nYou are chatting in Project: "${project.name}".\n`;
                projectContext += `Project Description: ${project.description}\n`;
                if (project.instructions) {
                  projectContext += `Project Custom System Instructions: ${project.instructions}\n`;
                }
                
                if (project.files && project.files.length > 0) {
                  projectContext += `\nHere are the workspace files in this project context:\n`;
                  const appendFiles = (filesList: any[]) => {
                    filesList.forEach((file: any) => {
                      if (file.type === 'file' && file.content) {
                        projectContext += `\n--- FILE: ${file.name} ---\n${file.content}\n`;
                      } else if (file.type === 'folder' && file.children) {
                        appendFiles(file.children);
                      }
                    });
                  };
                  appendFiles(project.files);
                }
                systemPromptAddon += `\n${projectContext}\n`;
              }
            }
          } catch (err) {
            console.warn('[useChatLogic] Failed to load project context:', err);
          }
        }
        
        // --- Plan Mode Parity ---
        if ((analysis.estimatedComplexity || 1) >= 2 && !lightningEnabled) {
          setPlanPhase({ 
            status: 'planning', 
            steps: ['Generating execution plan...'], 
            completedSteps: ['Analyzing prompt intent...'] 
          });
          
          try {
            const planResponse = await AIService.execute(
              'gemini-3.1-flash-lite',
              detectProvider('gemini-3.1-flash-lite'),
              `Task: ${prompt}\n\nPlease generate a very brief, high-level implementation plan for this task in a few bullet points. Do not execute the task yet.`,
              getEffectiveApiKey(detectProvider('gemini-3.1-flash-lite'), apiKeys),
              'You are an AI planner.',
              { ...modelSettings, temperature: 0.2 }
            );
            const planContent = planResponse.text;
            setPlanPhase({ 
              status: 'executing', 
              plan: planContent, 
              steps: ['Executing plan...'], 
              completedSteps: ['Analyzing prompt intent...', 'Generating execution plan...'] 
            });
            systemPromptAddon += `\n\nExecution Plan to follow:\n${planContent}`;
          } catch (e) {
            console.warn('[Plan Mode] Failed to generate plan, skipping...', e);
            setPlanPhase(null);
          }
        } else {
          setPlanPhase(null);
        }

        await pipelineRunChat(prompt, images, {
          modelOverride: modelToUse,
          systemPromptAddon: systemPromptAddon,
          enableTools: analysis.needsToolUse,
          expectedComplexity: analysis.estimatedComplexity,
        });

        // Update token usage
        setTokensUsed((prev) => prev + estimatedInput);
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          if (error.message && error.message.includes('429')) {
             toast.error('Rate limit reached (429). Please wait or switch models.');
             const provider = detectProvider(models.nyx);
             const apiKey = getEffectiveApiKey(provider, apiKeys) || '';
             useUsageStore.getState().resetLimitForModel(models.nyx, apiKey);
          } else {
             toast.error(error.message || 'Generation failed');
          }
        }
      } finally {
        abortCtrlRef.current = null;
      }
    },
    [pipelineRunChat, maxContextTokens, tokenBudget, tokensUsed]
  );

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

      runChatRef.current?.(userMsg.content, mappedImages, { skipUserMessage: true });
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
      abortCtrlRef.current?.abort();
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
        const { invoke } = await import('@tauri-apps/api/core');
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
        const { invoke } = await import('@tauri-apps/api/core');
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
    activeAgent: 'nyx',
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
