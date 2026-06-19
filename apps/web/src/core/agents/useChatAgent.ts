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
  // Fix 3: store the AbortController so stopGeneration() can actually cancel the stream
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {}, 150);
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

      setMessages((prev) => {
        const next = [...prev, assistantMsg];
        messagesRef.current = next;
        return next;
      });

      const agent = new ChatAgent(config);
      agentRef.current = agent;

      let accumulatedText = '';
      const thinkingSteps: string[] = [];
      const artifacts: Artifact[] = [];
      const citations: Citation[] = [];
      let metrics: StreamMetrics | undefined;

      try {
        // Create a controller we can actually cancel via stopGeneration()
        const controller = new AbortController();
        abortControllerRef.current = controller;

        let enrichedPrompt = prompt;
        const stream = await agent.streamResponse(
          enrichedPrompt,
          analysis,
          controller.signal,
          undefined,
          images as any
        );

        for await (const event of stream) {
          switch (event.type) {
            case 'thinking': {
              // fallow-ignore-next-line code-duplication
              thinkingSteps.push(event.content!);
              setMessages((prev) => {
                const next = [...prev];
                const idx = next.findIndex((m) => m.id === assistantId);
                if (idx !== -1) next[idx] = { ...next[idx], thinkingSteps: [...thinkingSteps] };
                messagesRef.current = next;
                return next;
              });
              break;
            }

            case 'text': {
              // fallow-ignore-next-line code-duplication
              accumulatedText += event.content!;
              setMessages((prev) => {
                const next = [...prev];
                const idx = next.findIndex((m) => m.id === assistantId);
                if (idx !== -1) next[idx] = { ...next[idx], content: accumulatedText };
                messagesRef.current = next;
                return next;
              });
              break;
            }

            case 'artifact': {
              // fallow-ignore-next-line code-duplication
              artifacts.push(event.metadata as Artifact);
              setMessages((prev) => {
                const next = [...prev];
                const idx = next.findIndex((m) => m.id === assistantId);
                if (idx !== -1) next[idx] = { ...next[idx], artifacts: [...artifacts] };
                messagesRef.current = next;
                return next;
              });
              break;
            }

            case 'citation': {
              // fallow-ignore-next-line code-duplication
              citations.push(event.metadata as Citation);
              setMessages((prev) => {
                const next = [...prev];
                const idx = next.findIndex((m) => m.id === assistantId);
                if (idx !== -1) next[idx] = { ...next[idx], citations: [...citations] };
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
                const next = [...prev];
                const idx = next.findIndex((m) => m.id === assistantId);
                if (idx !== -1) {
                  next[idx] = {
                    ...next[idx],
                    pendingApproval: approvalPayload,
                  };
                }
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

        // Finalize
        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((m) => m.id === assistantId);
          if (idx !== -1) {
            next[idx] = {
              ...next[idx],
              status: 'complete',
              content: accumulatedText,
              metrics,
              thinkingSteps: [...thinkingSteps],
              artifacts: [...artifacts],
              citations: [...citations],
            };
          }
          messagesRef.current = next;
          
          // Trigger implicit background memory extraction
          MemoryStore.extractImplicitMemory(next).catch(console.error);
          
          return next;
        });
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          setError(error.message);
          setMessages((prev) => {
            const next = [...prev];
            const idx = next.findIndex((m) => m.id === assistantId);
            if (idx !== -1 && !next[idx].content) {
              next[idx] = { ...next[idx], status: 'error', content: `Error: ${error.message}` };
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
