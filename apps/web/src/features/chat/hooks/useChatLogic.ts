/**
 * @file src/features/chat/hooks/useChatLogic.ts
 * @description Production-grade conversation state management with streaming,
 *   session branching, optimistic updates, and Claude/Kimi-parity features.
 */

import { useState, useRef, useEffect, useCallback, useReducer, useMemo } from 'react';
import { NYX_PERSONA } from '@src/core/agents/nyxPersona';
import { ModelDefinition, ChatMessage, ToolCall, StreamEvent } from '@src/infrastructure/types';
import { useMessageHistory } from '@src/shared/hooks/useMessageHistory';
import { AIService, cancelRequest, cancelAllRequests } from '@src/features/ai/services/ai.service';
import { toast } from '@src/shared/components/ui/sonner';
import { detectProvider, getEffectiveApiKey, getModelCapabilities } from '@src/infrastructure/utils/provider';
import { useUsageStore } from '@src/core/stores/useUsageStore';
import { compactHistory, compactHistoryAsync, estimateContextTokens } from '@src/infrastructure/utils/compaction';
import { buildChatPrompts, ChatContext } from '@src/core/prompts/chatPrompts';
import { stripThinkingContent } from '@src/utils/textUtils';
import { PlanPhase } from '@src/types/agent';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { invoke, Channel } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { useAppStore } from '@src/stores/useAppStore';

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

  // --- Web search ---
  const webSearchEnabled = useAppStore((state) => state.webSearchEnabled);

  // --- Abort controller for current generation ---
  const abortCtrlRef = useRef<AbortController | null>(null);

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

  const [isSupervising, setIsSupervising] = useState(false);
  const isLoading = isSupervising || !!abortCtrlRef.current;
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
    
    abortCtrlRef.current?.abort();
    cancelRequest('chat-stream');
  }, []);

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

  // -------------------------------------------------------------------------
  // Public runChat wrapper with budget check
  // -------------------------------------------------------------------------

  const lastRunRef = useRef<number>(0);
  const runChat = useCallback(
    async (prompt: string, images?: ChatImage[], options?: { skipUserMessage?: boolean; modelOverride?: string }): Promise<void> => {
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

      // For local models, use the actual configured context size rather than the cloud 128k default.
      // This ensures compaction fires before the local server hits its context limit.
      const { cloudModelId: _earlyCloudId } = useNyxStore.getState();
      const resolvedProviderEarly = currentProvider || (_earlyCloudId != null ? 'gemini' : 'nyx-native');
      const isLocalModel = resolvedProviderEarly === 'nyx-native';
      const effectiveMaxCtx = maxContextTokens;
      let llmHistory = historyRef.current;
      if (projectedTotal > effectiveMaxCtx) {
        toast.info('Compacting context to fit token limit...');
        llmHistory = await compactHistoryAsync(historyRef.current, effectiveMaxCtx - estimatedInput - 4096, AIService, modelSettings);
      }

      if (tokensUsed + estimatedInput > tokenBudget) {
        toast.error('Token budget exhausted');
        return;
      }

      abortCtrlRef.current = new AbortController();

      const { cloudModelId, localModelId, executionMode } = useNyxStore.getState();
      const modelToUse = options?.modelOverride || ((cloudModelId || localModelId) as string);

      let finalPrompt = prompt;
      const skipUserMessage = options?.skipUserMessage;

      if (!skipUserMessage) {
        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: prompt, // display the clean prompt without search context XML
          timestamp: Date.now(),
          images: images?.map((img) => ({
            name: img.name,
            mimeType: img.mimeType || 'image/jpeg',
            data: img.data || '',
          })).filter((img) => !!img.data),
        };
        dispatch({ type: 'APPEND', message: userMsg });
        historyRef.current = [...historyRef.current, userMsg];
        persistHistory(historyRef.current);
        llmHistory = [...llmHistory, userMsg];
      }

      // Add a temporary "streaming" assistant message so the UI shows it's thinking immediately
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        status: 'loading',
        model: modelToUse,
      };

      if (prompt.startsWith('/deep')) {
        // Deep research has its own assistant message
      } else {
        dispatch({ type: 'APPEND', message: assistantMsg });
        historyRef.current = [...historyRef.current, assistantMsg];
      }

      // Yield to React renderer so the messages appear instantly
      await new Promise(resolve => setTimeout(resolve, 0));

      let searchResult: string | undefined;

      if (webSearchEnabled && !prompt.startsWith('/deep')) {
        // Resolve configuration
        const { searchProvider, apiKeys, executionMode } = useNyxStore.getState();
        const apiKey = searchProvider === 'tavily' ? getEffectiveApiKey('tavily', apiKeys) : undefined;
        try {
          const lastIdx = historyRef.current.length - 1;
          const searchingHistory = [...historyRef.current];
          searchingHistory[lastIdx] = {
            ...searchingHistory[lastIdx],
            reasoning: '> Searching the web for relevant information...\n'
          };
          dispatch({ type: 'SET', messages: searchingHistory });
          historyRef.current = searchingHistory;

          toast.info(`Searching web via ${searchProvider}...`);
          searchResult = await Promise.race([
            invoke<string>('search_web_command', {
              query: prompt,
              num_results: 5,
              provider: searchProvider,
              api_key: apiKey
            }),
            new Promise<never>((_, reject) => {
              const signal = abortCtrlRef.current?.signal;
              if (signal?.aborted) reject(new DOMException('Aborted', 'AbortError'));
              signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
            })
          ]);

          if (abortCtrlRef.current?.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }

          const processingHistory = [...historyRef.current];
          processingHistory[lastIdx] = {
            ...processingHistory[lastIdx],
            reasoning: processingHistory[lastIdx].reasoning + '> Processing search results and sending to model...\n'
          };
          dispatch({ type: 'SET', messages: processingHistory });
          historyRef.current = processingHistory;

          if (searchResult) {
            finalPrompt = `[RESEARCH]\n${searchResult}\n[/RESEARCH]\n\n${prompt}`;
          }
        } catch (e: any) {
          if (e.name === 'AbortError' || e.message === 'Aborted') {
            throw e; // Re-throw to outer catch block to stop generation
          }
          const msg = e?.message || String(e);
          console.error('[web search] failed:', e);
          toast.error(`Web search failed: ${msg}`);
        }
      }

      if (abortCtrlRef.current?.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      try {
        const modelToUse = options?.modelOverride || (cloudModelId || localModelId) as string;

        if (!modelToUse) {
          toast.error('Please select at least one model (Cloud or Local).');
          return;
        }



        if (prompt.startsWith('/deep')) {
          const queryText = prompt.replace('/deep', '').trim();
          
          const assistantMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            status: 'loading',
            reasoning: '🔬 Initializing Deep Research...\n',
            model: modelToUse,
          };
          dispatch({ type: 'APPEND', message: assistantMsg });
          historyRef.current = [...historyRef.current, assistantMsg];
          
          let currentContent = '';
          let reasoningContent = '🔬 Initializing Deep Research...\n';
          
          const onProgress = new Channel<any>();
          onProgress.onmessage = (message) => {
            const updatedHistory = [...historyRef.current];
            const lastIdx = updatedHistory.length - 1;
            
            if (message.type === 'progress') {
                reasoningContent += `> ${message.message}\n`;
                updatedHistory[lastIdx] = {
                    ...updatedHistory[lastIdx],
                    reasoning: reasoningContent,
                };
            } else if (message.type === 'result_chunk') {
                currentContent += message.content;
                updatedHistory[lastIdx] = {
                    ...updatedHistory[lastIdx],
                    content: currentContent,
                };
            } else if (message.type === 'error') {
                toast.error(message.message);
            }
            dispatch({ type: 'SET', messages: updatedHistory });
            historyRef.current = updatedHistory;
          };
          
          try {
            setIsSupervising(true);
            const result = await Promise.race([
              invoke<{ source: string; data: string; sources: Array<{ url: string; title: string; snippet: string }> }>('start_deep_research', { 
                  query: { 
                      prompt: queryText, 
                      depth_limit: 3, 
                      provider: detectProvider(modelToUse), 
                      model_id: modelToUse, 
                      api_key: getEffectiveApiKey(detectProvider(modelToUse), apiKeys) || '' 
                  }, 
                  onProgress
              }),
              new Promise<never>((_, reject) => {
                const signal = abortCtrlRef.current?.signal;
                if (signal?.aborted) reject(new DOMException('Aborted', 'AbortError'));
                signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
              })
            ]);
            const finalHistory = [...historyRef.current];
            const lastIdx = finalHistory.length - 1;
            // Build citation objects from returned sources
            const citations = (result.sources || []).map((src, i) => ({
              id: String(i + 1),
              index: i + 1,
              title: src.title,
              url: src.url,
              snippet: src.snippet,
            }));
            finalHistory[lastIdx] = {
              ...finalHistory[lastIdx],
              status: 'success',
              citations,
            };
            dispatch({ type: 'SET', messages: finalHistory });
            historyRef.current = finalHistory;
            persistHistory(finalHistory);

          } catch (e: any) {
            toast.error(e.toString());
            const finalHistory = [...historyRef.current];
            const lastIdx = finalHistory.length - 1;
            finalHistory[lastIdx].status = 'error';
            finalHistory[lastIdx].content += `\n\n**Deep Research Error**: ${e}`;
            dispatch({ type: 'SET', messages: finalHistory });
            historyRef.current = finalHistory;
            persistHistory(finalHistory);
          } finally {
            setIsSupervising(false);
          }
          return;
        }

        const eventName = `dag_update_${Date.now()}`;
        
        const reasoningEffortStr = modelSettings?.thinkingEnabled === false ? 'none' : (modelSettings?.reasoningEffort || 'medium');
        
        const chatContext: ChatContext = {
          conversationTone: 'casual',
          detectedLanguage: 'English',
          previousMessages: historyRef.current.length,
          enableReasoning: modelSettings?.thinkingEnabled !== false,
          reasoningEffort: reasoningEffortStr,
        };
        
        // Let chatPrompts.ts handle the searchResult injection using its [RESEARCH] tags
        const promptResult = buildChatPrompts(modelToUse, chatContext, prompt, llmHistory, searchResult);



        let currentContent = '';
        let currentReasoning = historyRef.current[historyRef.current.length - 1]?.reasoning || '';
        let thinkStartIdx = -1;
        let thinkTagLen = 0;
        let thinkEndIdx = -1;
        let thinkEndTagLen = 0;
        let lastUpdateTime = 0;
        const THROTTLE_MS = 50;
        
        setIsSupervising(true);
        const onProgress = new Channel<any>();
        onProgress.onmessage = (message) => {
          if (message) {
            const eventType = message.event_type || message.type;
            const now = Date.now();

            if (eventType === 'text') {
              currentContent += message.content || '';
              
              if (thinkStartIdx === -1) {
                const match = currentContent.match(/<(?:think|thought|thinking)>/i);
                if (match) {
                  thinkStartIdx = match.index!;
                  thinkTagLen = match[0].length;
                }
              }
              
              if (thinkStartIdx !== -1 && thinkEndIdx === -1) {
                const searchArea = currentContent.substring(thinkStartIdx + thinkTagLen);
                const match = searchArea.match(/<\/(?:think|thought|thinking)>/i);
                if (match) {
                  thinkEndIdx = thinkStartIdx + thinkTagLen + match.index!;
                  thinkEndTagLen = match[0].length;
                }
              }

              let displayContent = currentContent;
              let extractedReasoning = '';

              if (thinkStartIdx !== -1) {
                if (thinkEndIdx !== -1) {
                  extractedReasoning = currentContent.substring(thinkStartIdx + thinkTagLen, thinkEndIdx).trim();
                  displayContent = currentContent.substring(0, thinkStartIdx) + currentContent.substring(thinkEndIdx + thinkEndTagLen);
                } else {
                  extractedReasoning = currentContent.substring(thinkStartIdx + thinkTagLen).trim();
                  displayContent = currentContent.substring(0, thinkStartIdx);
                }
              }

              if (now - lastUpdateTime > THROTTLE_MS) {
                lastUpdateTime = now;
                const lastIdx = historyRef.current.length - 1;
                if (lastIdx >= 0 && historyRef.current[lastIdx].role === 'assistant') {
                  const combinedReasoning = currentReasoning + (extractedReasoning ? (currentReasoning ? '\n' : '') + extractedReasoning : '');
                  dispatch({
                    type: 'UPDATE',
                    index: lastIdx,
                    updater: (msg) => ({
                      ...msg,
                      content: displayContent.trim(),
                      reasoning: combinedReasoning || undefined,
                    }),
                  });
                  // Keep historyRef in sync for synchronous reads in the same tick
                  historyRef.current = historyRef.current.map((m, i) =>
                    i === lastIdx
                      ? { ...m, content: displayContent.trim(), reasoning: combinedReasoning || undefined }
                      : m
                  );
                }
              }
            } else if (eventType === 'tool_call') {
              const lastIdx = historyRef.current.length - 1;
              if (lastIdx >= 0 && historyRef.current[lastIdx].role === 'assistant') {
                const newCall = {
                  id: crypto.randomUUID(),
                  type: 'function' as const,
                  function: { name: message.tool_name, arguments: message.tool_args },
                  status: 'running' as const,
                };
                dispatch({
                  type: 'UPDATE',
                  index: lastIdx,
                  updater: (msg) => ({
                    ...msg,
                    toolCalls: [...(msg.toolCalls || []), newCall],
                  }),
                });
                historyRef.current = historyRef.current.map((m, i) =>
                  i === lastIdx ? { ...m, toolCalls: [...(m.toolCalls || []), newCall] } : m
                );
              }
            } else if (eventType === 'tool_result') {
              const lastIdx = historyRef.current.length - 1;
              if (lastIdx >= 0 && historyRef.current[lastIdx]?.role === 'assistant') {
                dispatch({
                  type: 'UPDATE',
                  index: lastIdx,
                  updater: (msg) => {
                    if (!msg.toolCalls || msg.toolCalls.length === 0) return msg;
                    const calls = [...msg.toolCalls];
                    const lastCallIdx = calls.length - 1;
                    if (calls[lastCallIdx].function.name === message.tool_name) {
                      calls[lastCallIdx] = { ...calls[lastCallIdx], status: 'success' as const, result: message.result };
                    }
                    return { ...msg, toolCalls: calls };
                  },
                });
              }
            } else if (eventType === 'thinking') {
              currentReasoning += message.content || '';
              
              if (now - lastUpdateTime > THROTTLE_MS) {
                lastUpdateTime = now;
                const lastIdx = historyRef.current.length - 1;
                if (lastIdx >= 0 && historyRef.current[lastIdx]?.role === 'assistant') {
                  dispatch({
                    type: 'UPDATE',
                    index: lastIdx,
                    updater: (msg) => ({ ...msg, reasoning: currentReasoning || undefined }),
                  });
                  historyRef.current = historyRef.current.map((m, i) =>
                    i === lastIdx ? { ...m, reasoning: currentReasoning || undefined } : m
                  );
                }
              }
            } else if (eventType === 'done') {
              // Ensure final content is written out
              const finalHistory = [...historyRef.current];
              const lastIdx = finalHistory.length - 1;
              if (lastIdx >= 0 && finalHistory[lastIdx]?.role === 'assistant') {
                  let displayContent = currentContent;
                  let extractedReasoning = '';

                  if (thinkStartIdx !== -1) {
                    if (thinkEndIdx !== -1) {
                      extractedReasoning = currentContent.substring(thinkStartIdx + thinkTagLen, thinkEndIdx).trim();
                      displayContent = currentContent.substring(0, thinkStartIdx) + currentContent.substring(thinkEndIdx + thinkEndTagLen);
                    } else {
                      extractedReasoning = currentContent.substring(thinkStartIdx + thinkTagLen).trim();
                      displayContent = currentContent.substring(0, thinkStartIdx);
                    }
                  }

                  const combinedReasoning = currentReasoning + (extractedReasoning ? (currentReasoning ? '\n' : '') + extractedReasoning : '');

                  finalHistory[lastIdx] = {
                    ...finalHistory[lastIdx],
                    content: displayContent.trim(),
                    reasoning: combinedReasoning || undefined,
                    status: 'success',
                  };
              }
              dispatch({ type: 'SET', messages: finalHistory });
              historyRef.current = finalHistory;
            } else if (eventType === 'error') {
              toast.error(message.error || message.content || 'Generation error');
              const finalHistory = [...historyRef.current];
              const lastIdx = finalHistory.length - 1;
              if (lastIdx >= 0 && finalHistory[lastIdx]?.role === 'assistant') {
                finalHistory[lastIdx] = {
                  ...finalHistory[lastIdx],
                  status: 'error',
                };
              }
              dispatch({ type: 'SET', messages: finalHistory });
              historyRef.current = finalHistory;
            }
          }
        };

        const onAbort = () => {
          emit(`cancel_${eventName}`);
        };
        const currentSignal = abortCtrlRef.current?.signal;
        currentSignal?.addEventListener('abort', onAbort);

        try {
          // Build messages — use finalPrompt for the last user message so web search
          // context reaches the model, but the chat display shows only the clean prompt.
          const backendMessages = llmHistory.map((m, i) => {
            const textContent = (i === llmHistory.length - 1 && m.role === 'user')
              ? finalPrompt  // inject search context only for the model
              : m.content;
              
            let content: any = textContent;
            
            // If the message has attached images and vision is not explicitly disabled
            if (m.images && m.images.length > 0 && modelSettings?.visionEnabled !== false) {
              content = [
                { type: 'text', text: textContent },
                ...m.images.map(img => ({
                  type: 'image_url',
                  image_url: {
                    url: img.data?.startsWith('data:') ? img.data : `data:${img.mimeType};base64,${img.data}`
                  }
                }))
              ];
            }

            return {
              role: m.role,
              content
            };
          });

          const capabilities = getModelCapabilities(modelToUse);
          const reasoningEffortStr = modelSettings?.thinkingEnabled === false ? 'none' : (modelSettings?.reasoningEffort || 'medium');
          
          let finalSystemInstruction = promptResult.systemPrompt;
          if (capabilities.supportsReasoning && modelSettings?.thinkingEnabled === false) {
             finalSystemInstruction = (finalSystemInstruction || '') + '\n\nIMPORTANT: Do NOT output any reasoning or <think> tags. Provide your final answer directly without showing your thought process.';
          }

          const resolvedProvider = currentProvider || detectProvider(modelToUse);

          if (abortCtrlRef.current?.signal.aborted) {
            throw new Error('Aborted');
          }

          // Calculate exact input tokens to dynamically maximize context window
          let finalTotalInputTokens = Math.ceil((finalSystemInstruction || '').length / 4);
          for (const m of backendMessages) {
             if (typeof m.content === 'string') {
                finalTotalInputTokens += Math.ceil(m.content.length / 4);
             } else if (Array.isArray(m.content)) {
                for (const part of m.content) {
                   if (part.type === 'text') {
                     finalTotalInputTokens += Math.ceil(part.text.length / 4);
                   }
                   if (part.type === 'image_url') {
                     finalTotalInputTokens += 512;
                   }
                }
             }
          }
          
          let dynamicMaxTokens = maxContextTokens - finalTotalInputTokens - 500; // 500 token safety buffer
          if (dynamicMaxTokens < 512) {
             dynamicMaxTokens = 512; // Ensure at least a minimum output capability
          }
          
          const userMaxTokens = modelSettings?.maxTokens && modelSettings.maxTokens > 0 ? modelSettings.maxTokens : undefined;
          const finalMaxTokens = userMaxTokens ?? dynamicMaxTokens;

          await invoke('llm_stream_request', {
            req: {
              provider: resolvedProvider,
              model_id: modelToUse,
              api_key: getEffectiveApiKey(resolvedProvider, apiKeys) || '',
              messages: backendMessages,
              temperature: modelSettings?.temperature ?? 0.7,
              top_p: modelSettings?.topP ?? 0.95,
              top_k: modelSettings?.topK ?? 40,
              repeat_penalty: modelSettings?.repeatPenalty ?? 1.1,
              system_instruction: finalSystemInstruction,
              event_name: eventName,
              reasoning_effort: reasoningEffortStr,
              endpoint_override: gatewayUrl,
              max_tokens: finalMaxTokens,
              execution_mode: executionMode,
            },
            onEvent: onProgress
          });
        } finally {
          currentSignal?.removeEventListener('abort', onAbort);
        }

        const finalCleanStreamed = stripThinkingContent(currentContent);
        
        const isAborted = abortCtrlRef.current?.signal.aborted;
        const finalHistory = [...historyRef.current];
        const lastIdx = finalHistory.length - 1;
        if (lastIdx >= 0 && finalHistory[lastIdx]?.role === 'assistant') {
            finalHistory[lastIdx] = {
                ...finalHistory[lastIdx],
                content: finalCleanStreamed.trim(),
                status: isAborted ? 'stopped' : 'success',
            };
        }
        dispatch({ type: 'SET', messages: finalHistory });
        historyRef.current = finalHistory;
        persistHistory(finalHistory);

        // Update token usage (estimation)
        setTokensUsed((prev) => prev + estimatedInput);
      } catch (error: any) {
        if (error.name !== 'AbortError' && error.message !== 'Aborted') {
          const errorMessage = error?.message || (typeof error === 'string' ? error : '') || 'Generation failed';
          
          if (errorMessage.includes('429')) {
             toast.error('Rate limit reached (429). Please wait or switch models.');
             const provider = detectProvider(modelToUse);
             const apiKey = getEffectiveApiKey(provider, apiKeys) || '';
             useUsageStore.getState().resetLimitForModel(modelToUse, apiKey);
          } else {
             toast.error(errorMessage);
          }
          
          // Mark the last message as error
          const finalHistory = [...historyRef.current];
          const lastIdx = finalHistory.length - 1;
          if (lastIdx >= 0 && finalHistory[lastIdx]?.role === 'assistant') {
              finalHistory[lastIdx] = {
                  ...finalHistory[lastIdx],

                  status: 'error',
                  content: errorMessage,
              };
          }
          dispatch({ type: 'SET', messages: finalHistory });
          historyRef.current = finalHistory;
          persistHistory(finalHistory);
        } else {
          // Handle AbortError specifically to mark status as stopped
          const finalHistory = [...historyRef.current];
          const lastIdx = finalHistory.length - 1;
          if (lastIdx >= 0 && finalHistory[lastIdx]?.role === 'assistant') {
              finalHistory[lastIdx] = {
                  ...finalHistory[lastIdx],
                  status: 'stopped',
                  content: stripThinkingContent(finalHistory[lastIdx].content || '').trim(),
              };
          }
          dispatch({ type: 'SET', messages: finalHistory });
          historyRef.current = finalHistory;
          persistHistory(finalHistory);
        }
      } finally {
        setIsSupervising(false);
        abortCtrlRef.current = null;
      }
    },
    [maxContextTokens, tokenBudget, tokensUsed, models.nyx, apiKeys, modelSettings, currentProvider, gatewayUrl, webSearchEnabled]
  );

  // Store ref for message actions to call
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
