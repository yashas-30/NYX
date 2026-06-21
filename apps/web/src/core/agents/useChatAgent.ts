import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatAgent } from './chatAgent';
import { MemoryStore } from './memoryStore';
import {
  StreamEvent,
  Artifact,
  Citation,
  StreamMetrics,
  ImageAttachment,
} from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';
import { ChatMessage } from '@src/infrastructure/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatMessageUI extends Omit<ChatMessage, 'status'> {
  id: string;
  status: 'streaming' | 'complete' | 'error' | 'stopped';
  artifacts?: Artifact[];
  citations?: Citation[];
  metrics?: StreamMetrics;
  thinkingSteps?: string[];
  pendingApproval?: {
    approvalId: string;
    tool: string;
    input: any;
  } | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function useChatAgent() {
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agentRef = useRef<ChatAgent | null>(null);
  const messagesRef = useRef<ChatMessageUI[]>([]);
  messagesRef.current = messages;
  const abortControllerRef = useRef<AbortController | null>(null);
  // rAF handle used to batch streaming text updates
  const rafRef = useRef<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // ── Auto-scroll ───────────────────────────────────────────────────────────

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    if (!container || !shouldAutoScrollRef.current) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    shouldAutoScrollRef.current = isNearBottom;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ── Send ──────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (
      prompt: string,
      analysis: PromptAnalysis,
      config: ConstructorParameters<typeof ChatAgent>[0],
      images?: ImageAttachment[]
    ) => {
      if (isLoading) return;

      setError(null);
      const userMsg: ChatMessageUI = {
        id: generateId(),
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
        status: 'complete',
      };

      setMessages((prev) => {
        const next = [...prev, userMsg];
        messagesRef.current = next;
        return next;
      });

      setIsLoading(true);
      shouldAutoScrollRef.current = true;

      const assistantId = generateId();
      const assistantMsg: ChatMessageUI = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        status: 'streaming',
        thinkingSteps: [],
        artifacts: [],
        citations: [],
      };

      // Track assistant index once so we avoid O(n) findIndex on every chunk
      let assistantIdx = -1;
      setMessages((prev) => {
        const next = [...prev, assistantMsg];
        assistantIdx = next.length - 1;
        messagesRef.current = next;
        return next;
      });

      const agent = new ChatAgent(config);
      agentRef.current = agent;

      let accumulatedText = '';
      // Pending text to flush on next rAF
      let pendingTextFlush = false;
      const thinkingSteps: string[] = [];
      const artifacts: Artifact[] = [];
      const citations: Citation[] = [];
      let metrics: StreamMetrics | undefined;

      // Flush accumulated text on the next animation frame to batch DOM updates
      const scheduleTextFlush = () => {
        if (pendingTextFlush) return;
        pendingTextFlush = true;
        rafRef.current = requestAnimationFrame(() => {
          pendingTextFlush = false;
          const text = accumulatedText;
          setMessages((prev) => {
            if (assistantIdx === -1 || assistantIdx >= prev.length) return prev;
            const next = [...prev];
            next[assistantIdx] = { ...next[assistantIdx], content: text };
            messagesRef.current = next;
            return next;
          });
        });
      };

      try {
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const stream = await agent.streamResponse(
          prompt,
          analysis,
          controller.signal,
          undefined,
          images as any
        );

        for await (const event of stream) {
          switch (event.type) {
            case 'thinking': {
              thinkingSteps.push(event.content!);
              setMessages((prev) => {
                if (assistantIdx === -1 || assistantIdx >= prev.length) return prev;
                const next = [...prev];
                next[assistantIdx] = { ...next[assistantIdx], thinkingSteps: [...thinkingSteps] };
                messagesRef.current = next;
                return next;
              });
              break;
            }

            case 'text': {
              accumulatedText += event.content!;
              // Batch DOM update to next rAF instead of calling setMessages per-token
              scheduleTextFlush();
              break;
            }

            case 'artifact': {
              artifacts.push(event.metadata as Artifact);
              setMessages((prev) => {
                if (assistantIdx === -1 || assistantIdx >= prev.length) return prev;
                const next = [...prev];
                next[assistantIdx] = { ...next[assistantIdx], artifacts: [...artifacts] };
                messagesRef.current = next;
                return next;
              });
              break;
            }

            case 'citation': {
              citations.push(event.metadata as Citation);
              setMessages((prev) => {
                if (assistantIdx === -1 || assistantIdx >= prev.length) return prev;
                const next = [...prev];
                next[assistantIdx] = { ...next[assistantIdx], citations: [...citations] };
                messagesRef.current = next;
                return next;
              });
              break;
            }

            case 'metrics': {
              metrics = event.metadata as StreamMetrics;
              break;
            }

            case 'error': {
              throw new Error(event.content || 'Stream error');
            }

            case 'tool_approval_required': {
              const approvalPayload = {
                approvalId: (event as any).approvalId || '',
                tool: (event as any).tool || '',
                input: (event as any).input || {},
              };
              setMessages((prev) => {
                if (assistantIdx === -1 || assistantIdx >= prev.length) return prev;
                const next = [...prev];
                next[assistantIdx] = { ...next[assistantIdx], pendingApproval: approvalPayload };
                messagesRef.current = next;
                return next;
              });
              break;
            }

            case 'done': {
              break;
            }
          }
        }

        // Finalize - cancel any pending rAF and do a final synchronous flush
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        setMessages((prev) => {
          if (assistantIdx === -1 || assistantIdx >= prev.length) return prev;
          const next = [...prev];
          next[assistantIdx] = {
            ...next[assistantIdx],
            status: 'complete',
            content: accumulatedText,
            metrics,
            thinkingSteps: [...thinkingSteps],
            artifacts: [...artifacts],
            citations: [...citations],
          };
          messagesRef.current = next;
          // Trigger implicit background memory extraction
          MemoryStore.extractImplicitMemory(next).catch(console.error);
          return next;
        });
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          setError(error.message);
          setMessages((prev) => {
            if (assistantIdx === -1 || assistantIdx >= prev.length) return prev;
            const next = [...prev];
            if (!next[assistantIdx].content) {
              next[assistantIdx] = { ...next[assistantIdx], status: 'error', content: `Error: ${error.message}` };
            }
            messagesRef.current = next;
            return next;
          });
        }
      } finally {
        setIsLoading(false);
        agentRef.current = null;
        abortControllerRef.current = null;
      }
    },
    [isLoading]
  );

  // ── Stop ──────────────────────────────────────────────────────────────────

  const stopGeneration = useCallback(() => {
    // Cancel the HTTP/socket stream via the stored AbortController
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    agentRef.current?.abort();
    setIsLoading(false);
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === 'assistant' && last.status === 'streaming') {
        next[next.length - 1] = { ...last, status: 'stopped' };
      }
      messagesRef.current = next;
      return next;
    });
  }, []);

  // ── Clear ─────────────────────────────────────────────────────────────────

  const clearChat = useCallback(() => {
    agentRef.current?.abort();
    setMessages([]);
    messagesRef.current = [];
    setError(null);
    shouldAutoScrollRef.current = true;
  }, []);

  // ── Edit ──────────────────────────────────────────────────────────────────

  const editMessage = useCallback(
    async (
      messageId: string,
      newContent: string,
      analysis: PromptAnalysis,
      config: ConstructorParameters<typeof ChatAgent>[0]
    ) => {
      const idx = messagesRef.current.findIndex((m) => m.id === messageId);
      if (idx === -1 || messagesRef.current[idx].role !== 'user') return;

      const truncated = messagesRef.current.slice(0, idx);
      const updated: ChatMessageUI = {
        ...messagesRef.current[idx],
        content: newContent,
        timestamp: Date.now(),
      };

      setMessages([...truncated, updated]);
      messagesRef.current = [...truncated, updated];

      await sendMessage(newContent, analysis, config);
    },
    [sendMessage]
  );

  // ── Regenerate ────────────────────────────────────────────────────────────

  const regenerateResponse = useCallback(
    async (
      messageId: string,
      analysis: PromptAnalysis,
      config: ConstructorParameters<typeof ChatAgent>[0]
    ) => {
      const targetIdx = messagesRef.current.findIndex((m) => m.id === messageId);
      let userIdx = targetIdx;
      while (userIdx >= 0 && messagesRef.current[userIdx]?.role !== 'user') userIdx--;
      if (userIdx < 0) return;

      const truncated = messagesRef.current.slice(0, userIdx + 1);
      setMessages(truncated);
      messagesRef.current = truncated;

      await sendMessage(messagesRef.current[userIdx].content, analysis, config);
    },
    [sendMessage]
  );

  const approveTool = useCallback(async (messageId: string, approvalId: string) => {
    try {
      const isTauriEnv = typeof window !== 'undefined' &&
        ('_tauri' in window || '__TAURI__' in window || '__TAURI_INTERNALS__' in window);
      
      if (isTauriEnv) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('approve_tool', { approvalId });
      }
      
      setMessages((prev) => {
        const next = [...prev];
        const idx = next.findIndex((m) => m.id === messageId);
        if (idx !== -1) {
          next[idx] = {
            ...next[idx],
            pendingApproval: null,
          };
        }
        messagesRef.current = next;
        return next;
      });
    } catch (err: any) {
      setError(`Failed to approve tool: ${err.message || String(err)}`);
    }
  }, []);

  const rejectTool = useCallback(async (messageId: string, approvalId: string) => {
    try {
      const isTauriEnv = typeof window !== 'undefined' &&
        ('_tauri' in window || '__TAURI__' in window || '__TAURI_INTERNALS__' in window);
      
      if (isTauriEnv) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('reject_tool', { approvalId });
      }
      
      setMessages((prev) => {
        const next = [...prev];
        const idx = next.findIndex((m) => m.id === messageId);
        if (idx !== -1) {
          next[idx] = {
            ...next[idx],
            pendingApproval: null,
            status: 'stopped',
          };
        }
        messagesRef.current = next;
        return next;
      });
    } catch (err: any) {
      setError(`Failed to reject tool: ${err.message || String(err)}`);
    }
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    stopGeneration,
    clearChat,
    editMessage,
    regenerateResponse,
    scrollContainerRef,
    handleScroll,
    approveTool,
    rejectTool,
  };
}
