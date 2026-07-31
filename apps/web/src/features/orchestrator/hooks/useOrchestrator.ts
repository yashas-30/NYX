/**
 * @file src/features/orchestrator/hooks/useOrchestrator.ts
 * @description Production orchestrator hook — streams from the real Rust backend via
 *   invoke('run_orchestrator_turn') (agentic tool-calling loop) or
 *   invoke('llm_stream_request') (direct chat), depending on mode.
 *   Replaces all previous mock JS classes.
 */

import { useState, useCallback, useRef } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { detectProvider, getEffectiveApiKey } from '@src/infrastructure/utils/provider';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Artifact {
  id: string;
  type: 'code' | 'markdown' | 'json' | 'diff' | 'image';
  title: string;
  content: string;
  language?: string;
  filePath?: string;
}

export interface Citation {
  id: string;
  source: string;
  quote: string;
  relevance: number;
}

export interface ThinkingStep {
  id: string;
  step: number;
  content: string;
  timestamp: number;
  type: 'reasoning' | 'reflection' | 'verification' | 'planning';
}

export interface OrchestratorToolCall {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error' | 'completed';
  result?: { content: string; error?: string };
  durationMs?: number;
  output?: string | unknown;
}

export interface OrchestratorMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  status: 'streaming' | 'complete' | 'error';

  thinking?: ThinkingStep[];
  artifacts?: Artifact[];
  citations?: Citation[];
  toolCalls?: OrchestratorToolCall[];

  metrics?: {
    modelUsed: string;
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    reasoningSteps: number;
    tokens?: number;
  };

  images?: Array<{
    url?: string;
    mimeType?: string;
    data?: string;
    name?: string;
  }>;
}

export interface OrchestratorState {
  messages: OrchestratorMessage[];
  isProcessing: boolean;
  currentPhase:
    | 'analyzing'
    | 'selecting_model'
    | 'reasoning'
    | 'executing_tools'
    | 'generating'
    | 'complete'
    | 'error';
  abortController: AbortController | null;
}

// Props accepted by this hook — real backend config
export interface UseOrchestratorProps {
  /** API keys map (provider → key). Falls back to Zustand store. */
  apiKeys?: Record<string, string>;
  /** Override the model ID to use. Falls back to Zustand store (cloudModelId/localModelId). */
  modelId?: string;
  /** Override the provider. Auto-detected from modelId if omitted. */
  provider?: string;
  /** System instruction injected into every request. */
  systemInstruction?: string;
  /** Whether to use the agentic orchestrator loop (run_orchestrator_turn) vs direct stream. */
  agenticMode?: boolean;
}

// ── Stream payload from backend ───────────────────────────────────────────────

interface StreamChunkPayload {
  event_type?: string;
  type?: string;
  content?: string;
  reasoning?: string;
  tool_name?: string;
  tool_args?: string;
  result?: string;
  error?: string;
  tool_id?: string;
}

// ── Utility ───────────────────────────────────────────────────────────────────

const generateId = () => crypto.randomUUID();

// ── Main Hook ─────────────────────────────────────────────────────────────────

export function useOrchestrator(props: UseOrchestratorProps = {}) {
  const {
    apiKeys: propApiKeys,
    modelId: propModelId,
    provider: propProvider,
    systemInstruction,
    agenticMode = true,
  } = props;

  const [state, setState] = useState<OrchestratorState>({
    messages: [],
    isProcessing: false,
    currentPhase: 'complete',
    abortController: null,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Resolve runtime config from props or Zustand store ──────────────────────
  const resolveConfig = useCallback(() => {
    const storeState = useNyxStore.getState();
    const keys = propApiKeys ?? storeState.apiKeys;
    const modelId = propModelId ?? storeState.cloudModelId ?? storeState.localModelId ?? '';
    const provider = propProvider ?? detectProvider(modelId);
    const apiKey = getEffectiveApiKey(provider, keys) ?? '';
    return { keys, modelId, provider, apiKey };
  }, [propApiKeys, propModelId, propProvider]);

  // ── sendMessage ──────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string, images?: Array<{ name: string; mimeType: string; data: string }>) => {
      if (stateRef.current.isProcessing) return;

      const { modelId, provider, apiKey } = resolveConfig();

      if (!modelId) {
        setState((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: generateId(),
              role: 'system',
              content: 'No model selected. Please choose a model in the model registry.',
              timestamp: Date.now(),
              status: 'error',
            },
          ],
          currentPhase: 'error',
        }));
        return;
      }

      const userMsg: OrchestratorMessage = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: Date.now(),
        status: 'complete',
        images: images?.map((img) => ({
          name: img.name,
          mimeType: img.mimeType,
          data: img.data,
        })),
      };

      const abortController = new AbortController();

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMsg],
        isProcessing: true,
        currentPhase: 'analyzing',
        abortController,
      }));

      const assistantId = generateId();
      const assistantMsg: OrchestratorMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        status: 'streaming',
        thinking: [],
        artifacts: [],
        citations: [],
        toolCalls: [],
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMsg],
        currentPhase: 'generating',
      }));

      // Mutable accumulators — we batch setState at throttle intervals
      let fullText = '';
      let fullReasoning = '';
      const thinkingSteps: ThinkingStep[] = [];
      const toolCalls: OrchestratorToolCall[] = [];
      let stepCount = 0;
      let lastUpdateTime = 0;
      const THROTTLE_MS = 50;

      // Build messages for the backend
      const history = stateRef.current.messages;
      const backendMessages = history
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => {
          let msgContent: any = m.content;
          if (m.images && m.images.length > 0) {
            msgContent = [
              { type: 'text', text: m.content },
              ...m.images.map((img) => ({
                type: 'image_url',
                image_url: {
                  url: img.data?.startsWith('data:')
                    ? img.data
                    : `data:${img.mimeType};base64,${img.data}`,
                },
              })),
            ];
          }
          return { role: m.role, content: msgContent };
        });

      // Add the new user message
      let userContent: any = content;
      if (images && images.length > 0) {
        userContent = [
          { type: 'text', text: content },
          ...images.map((img) => ({
            type: 'image_url',
            image_url: {
              url: img.data?.startsWith('data:')
                ? img.data
                : `data:${img.mimeType};base64,${img.data}`,
            },
          })),
        ];
      }
      backendMessages.push({ role: 'user', content: userContent });

      const onAbort = () => {
        // Signal backend to cancel (best-effort)
      };
      abortController.signal.addEventListener('abort', onAbort);

      try {
        const onProgress = new Channel<StreamChunkPayload>();

        onProgress.onmessage = (message) => {
          if (abortController.signal.aborted) return;

          const eventType = message.event_type ?? message.type;
          const now = Date.now();

          if (eventType === 'text') {
            fullText += message.content ?? '';

            if (now - lastUpdateTime > THROTTLE_MS) {
              lastUpdateTime = now;
              setState((prev) => ({
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === assistantId ? { ...m, content: fullText } : m
                ),
              }));
            }
          } else if (eventType === 'thinking') {
            fullReasoning += message.content ?? '';
            stepCount++;
            const step: ThinkingStep = {
              id: generateId(),
              step: stepCount,
              content: message.content ?? '',
              timestamp: Date.now(),
              type: 'reasoning',
            };
            thinkingSteps.push(step);

            if (now - lastUpdateTime > THROTTLE_MS) {
              lastUpdateTime = now;
              setState((prev) => ({
                ...prev,
                currentPhase: 'reasoning',
                messages: prev.messages.map((m) =>
                  m.id === assistantId ? { ...m, thinking: [...thinkingSteps] } : m
                ),
              }));
            }
          } else if (eventType === 'tool_call') {
            const toolCall: OrchestratorToolCall = {
              id: message.tool_id ?? generateId(),
              tool: message.tool_name ?? '',
              input: (() => {
                try {
                  return JSON.parse(message.tool_args ?? '{}');
                } catch {
                  return {};
                }
              })(),
              status: 'running',
            };
            toolCalls.push(toolCall);
            setState((prev) => ({
              ...prev,
              currentPhase: 'executing_tools',
              messages: prev.messages.map((m) =>
                m.id === assistantId ? { ...m, toolCalls: [...toolCalls] } : m
              ),
            }));
          } else if (eventType === 'tool_result') {
            const lastCall = toolCalls[toolCalls.length - 1];
            if (lastCall) {
              lastCall.status = 'success';
              lastCall.result = { content: message.result ?? '' };
              lastCall.output = message.result;
            }
            setState((prev) => ({
              ...prev,
              currentPhase: 'generating',
              messages: prev.messages.map((m) =>
                m.id === assistantId ? { ...m, toolCalls: [...toolCalls] } : m
              ),
            }));
          } else if (eventType === 'done') {
            // Final flush is handled after the await
          } else if (eventType === 'error') {
            setState((prev) => ({
              ...prev,
              currentPhase: 'error',
              messages: prev.messages.map((m) =>
                m.id === assistantId
                  ? { ...m, status: 'error', content: message.error ?? message.content ?? 'An error occurred' }
                  : m
              ),
            }));
          }
        };

        const req = {
          provider,
          model_id: modelId,
          api_key: apiKey,
          messages: backendMessages,
          system_instruction: systemInstruction ?? null,
          temperature: null,
          max_tokens: null,
          top_p: null,
          top_k: null,
          repeat_penalty: null,
          // Removed reasoning_effort per user request
          event_name: null,
          endpoint_override: null,
          tools: null,
          execution_mode: agenticMode ? 'coder' : 'chat',
        };

        if (agenticMode) {
          // Agentic tool-calling loop — registered tools (WebSearch, Memory, CreateFile, etc.)
          await invoke('run_orchestrator_turn', { request: req, onEvent: onProgress });
        } else {
          // Direct streaming without tool loop
          if (req.provider === 'nyx-native') {
            await invoke('llm_local_stream_request', { req, onEvent: onProgress });
          } else {
            await invoke('llm_stream_request', { req, onEvent: onProgress });
          }
        }

        // Final state flush after stream completes
        if (!abortController.signal.aborted) {
          const startTs = userMsg.timestamp;
          setState((prev) => ({
            ...prev,
            isProcessing: false,
            currentPhase: 'complete',
            abortController: null,
            messages: prev.messages.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: fullText,
                    thinking: [...thinkingSteps],
                    toolCalls: [...toolCalls],
                    status: 'complete',
                    metrics: {
                      modelUsed: modelId,
                      tokensIn: Math.ceil(content.length / 4),
                      tokensOut: Math.ceil(fullText.length / 4),
                      latencyMs: Date.now() - startTs,
                      reasoningSteps: stepCount,
                      tokens: Math.ceil((content.length + fullText.length) / 4),
                    },
                  }
                : m
            ),
          }));
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError' && err?.message !== 'Aborted') {
          setState((prev) => ({
            ...prev,
            isProcessing: false,
            currentPhase: 'error',
            abortController: null,
            messages: prev.messages.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    status: 'error',
                    content: err?.message ?? String(err) ?? 'Generation failed',
                  }
                : m
            ),
          }));
        } else {
          // Aborted — mark as complete (partial)
          setState((prev) => ({
            ...prev,
            isProcessing: false,
            currentPhase: 'complete',
            abortController: null,
            messages: prev.messages.map((m) =>
              m.id === assistantId ? { ...m, status: 'complete' } : m
            ),
          }));
        }
      } finally {
        abortController.signal.removeEventListener('abort', onAbort);
      }
    },
    [resolveConfig, systemInstruction, agenticMode]
  );

  // ── stop ────────────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    stateRef.current.abortController?.abort();
    setState((prev) => ({
      ...prev,
      isProcessing: false,
      currentPhase: 'complete',
      abortController: null,
      messages: prev.messages.map((m) =>
        m.status === 'streaming' ? { ...m, status: 'complete' } : m
      ),
    }));
  }, []);

  // ── clear ───────────────────────────────────────────────────────────────────

  const clear = useCallback(() => {
    stateRef.current.abortController?.abort();
    setState({
      messages: [],
      isProcessing: false,
      currentPhase: 'complete',
      abortController: null,
    });
  }, []);

  // ── editMessage ─────────────────────────────────────────────────────────────

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      const msgIndex = stateRef.current.messages.findIndex((m) => m.id === messageId);
      if (msgIndex === -1 || stateRef.current.messages[msgIndex].role !== 'user') return;

      const truncated = stateRef.current.messages.slice(0, msgIndex);
      const updatedMsg: OrchestratorMessage = {
        ...stateRef.current.messages[msgIndex],
        content: newContent,
        timestamp: Date.now(),
      };

      setState((prev) => ({
        ...prev,
        messages: [...truncated, updatedMsg],
      }));

      await sendMessage(newContent);
    },
    [sendMessage]
  );

  // ── regenerate ──────────────────────────────────────────────────────────────

  const regenerate = useCallback(
    async (messageId?: string) => {
      const msgs = stateRef.current.messages;
      const targetId = messageId ?? msgs[msgs.length - 1]?.id;
      const targetIndex = msgs.findIndex((m) => m.id === targetId);

      let userIndex = targetIndex;
      while (userIndex >= 0 && msgs[userIndex]?.role !== 'user') {
        userIndex--;
      }
      if (userIndex < 0) return;

      const userMsg = msgs[userIndex];
      const truncated = msgs.slice(0, userIndex);

      setState((prev) => ({ ...prev, messages: truncated }));
      await sendMessage(userMsg.content);
    },
    [sendMessage]
  );

  return {
    ...state,
    sendMessage,
    stop,
    clear,
    editMessage,
    regenerate,
  };
}
