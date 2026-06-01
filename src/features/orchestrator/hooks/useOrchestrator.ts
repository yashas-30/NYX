import { useState, useCallback, useRef, useEffect } from 'react';
import {
  PromptAnalysis,
  CodeAnalysis,
  ComplexityLevel,
  IntentType,
  CapabilityKey,
  ReasoningStrategy,
  ModelSelection,
  StreamEvent,
  OrchestratorOptions,
  LocalModelConfig,
  HardwareProfile,
} from '@src/infrastructure/types';
import { LocalTool, ToolResult } from '@src/types/inference';

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

export interface ToolCall {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error' | 'completed';
  result?: ToolResult;
  durationMs?: number;
  output?: string | unknown;
}

export interface OrchestratorMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  status: 'streaming' | 'complete' | 'error';

  // Claude/Kimi-style features
  thinking?: ThinkingStep[];
  artifacts?: Artifact[];
  citations?: Citation[];
  toolCalls?: ToolCall[];

  // Metrics
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
  selectedModel?: ModelSelection;
  analysis?: PromptAnalysis | CodeAnalysis;
  abortController: AbortController | null;
}

// ── Mock Services (replace with your actual implementations) ───────────────────

class PromptAnalyzer {
  async analyze(prompt: string, history: OrchestratorMessage[]): Promise<PromptAnalysis> {
    const complexity: ComplexityLevel = prompt.length > 500 ? 'complex' : 'moderate';
    const intent: IntentType =
      prompt.includes('code') || prompt.includes('function') ? 'code_generation' : 'chat';

    return {
      complexity: { level: complexity, score: complexity === 'complex' ? 0.8 : 0.5 },
      intent,
      subIntents: [],
      requiresTools: intent === 'code_generation',
      requiredTools: intent === 'code_generation' ? ['file_read', 'linter'] : [],
      requiredCapabilities: intent === 'code_generation' ? ['coding', 'reasoning'] : ['chat'],
      estimatedOutputTokens: 2000,
      estimatedTokens: prompt.length + 1000,
      detectedLanguage: 'en',
      requiresVision: false,
      reasoning: `Detected ${intent} intent with ${complexity} complexity`,
      confidence: 0.9,
      safety: { type: 'none', severity: 'low', recommendation: 'proceed' },
      isMultiIntent: false,
      intentScores: [{ intent, confidence: 0.9 }],
      languageConfidence: 0.95,
    };
  }
}

class ModelSelector {
  private models: LocalModelConfig[];
  private hardware: HardwareProfile;

  constructor(models: LocalModelConfig[], hardware: HardwareProfile) {
    this.models = models;
    this.hardware = hardware;
  }

  select(analysis: PromptAnalysis): ModelSelection {
    const requiredCaps = analysis.requiredCapabilities || [];
    const complexity =
      typeof analysis.complexity === 'string' ? analysis.complexity : analysis.complexity?.level;

    const scored = this.models.map((model) => {
      let score = 0;

      const capMatch = requiredCaps.filter((c) => model.capabilities.includes(c)).length;
      score += capMatch * 10;

      if (complexity === 'very_complex' && model.contextSize > 128000) score += 20;
      else if (complexity === 'complex' && model.contextSize > 32000) score += 15;

      if (model.taskAffinity === 'code' && analysis.intent === 'code_generation') score += 10;
      if (model.taskAffinity === 'reasoning' && analysis.requiresTools) score += 10;

      const canFitFull = model.vramRequiredGB <= (this.hardware.primaryGPU?.vramFreeGB || 0);
      if (canFitFull) score += 15;

      return { model, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    const vramFree = (this.hardware.primaryGPU?.vramFreeGB || 8) * 1024;
    const canFitFull = best.model.vramRequiredGB * 1024 <= vramFree;

    return {
      model: best.model,
      gpuLayers: canFitFull
        ? best.model.totalLayers || 33
        : Math.floor((best.model.totalLayers || 33) * 0.7),
      cpuSpillLayers: canFitFull ? 0 : Math.floor((best.model.totalLayers || 33) * 0.3),
      isPureGpu: canFitFull,
      estimatedVramMB: best.model.vramRequiredGB * 1024,
      threads: this.hardware.cpuThreads,
      reason: `Selected ${best.model.name} for ${analysis.intent} (score: ${best.score})`,
    };
  }
}

class LocalLLMService {
  async *stream(
    model: LocalModelConfig,
    prompt: string,
    history: OrchestratorMessage[],
    signal: AbortSignal,
    options?: { reasoning?: ReasoningStrategy }
  ): AsyncGenerator<StreamEvent> {
    if (options?.reasoning?.showThinking) {
      yield { type: 'thinking', content: 'Analyzing the problem structure...' };
      await delay(300);
      yield { type: 'thinking', content: 'Identifying required tools and approach...' };
      await delay(300);
    }

    yield { type: 'text', content: "I'll help you with that. " };
    await delay(200);

    if (options?.reasoning?.type === 'react') {
      yield { type: 'tool_use', tool: 'file_read', input: { path: './src/main.ts' } };
      await delay(500);
      yield { type: 'tool_result', tool: 'file_read', result: { content: '// file content' } };
      await delay(200);
    }

    yield {
      type: 'text',
      content:
        'Here\'s the solution:\n\n```typescript\nfunction example() {\n  return "hello";\n}\n```',
    };

    yield {
      type: 'artifact',
      artifactType: 'code',
      title: 'example.ts',
      content: 'function example() {\n  return "hello";\n}',
    };

    yield { type: 'citation', source: 'docs', quote: 'Reference from documentation' };

    yield { type: 'complete' };
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// ── Main Hook ─────────────────────────────────────────────────────────────────

export function useOrchestrator(
  models: LocalModelConfig[],
  hardware: HardwareProfile,
  tools: LocalTool[],
  options: Partial<OrchestratorOptions> = {}
) {
  const [state, setState] = useState<OrchestratorState>({
    messages: [],
    isProcessing: false,
    currentPhase: 'complete',
    abortController: null,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const analyzer = useRef(new PromptAnalyzer());
  const selector = useRef(new ModelSelector(models, hardware));

  const sendMessage = useCallback(
    async (content: string) => {
      if (stateRef.current.isProcessing) return;

      const userMsg: OrchestratorMessage = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: Date.now(),
        status: 'complete',
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMsg],
        isProcessing: true,
        currentPhase: 'analyzing',
        abortController: new AbortController(),
      }));

      try {
        const analysis = await analyzer.current.analyze(content, stateRef.current.messages);

        setState((prev) => ({ ...prev, currentPhase: 'selecting_model', analysis }));

        const modelSelection = selector.current.select(analysis);

        setState((prev) => ({ ...prev, currentPhase: 'reasoning', selectedModel: modelSelection }));

        const complexityLevel =
          typeof analysis.complexity === 'string'
            ? analysis.complexity
            : analysis.complexity?.level;

        const reasoning: ReasoningStrategy = {
          type: analysis.requiresTools ? 'react' : complexityLevel === 'complex' ? 'cot' : 'direct',
          showThinking: complexityLevel !== 'simple',
          maxSteps: analysis.requiresTools ? 5 : 1,
          reflectionEnabled: complexityLevel === 'complex' || complexityLevel === 'very_complex',
          verificationEnabled:
            analysis.intent === 'code_generation' || analysis.intent === 'testing',
          explorationEnabled: complexityLevel === 'very_complex',
        };

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
          currentPhase: analysis.requiresTools ? 'executing_tools' : 'generating',
        }));

        const llm = new LocalLLMService();
        const stream = llm.stream(
          modelSelection.model,
          content,
          stateRef.current.messages,
          stateRef.current.abortController!.signal,
          { reasoning }
        );

        let fullText = '';
        const thinkingSteps: ThinkingStep[] = [];
        const artifacts: Artifact[] = [];
        const citations: Citation[] = [];
        const toolCalls: ToolCall[] = [];
        let stepCount = 0;

        for await (const event of stream) {
          if (stateRef.current.abortController?.signal.aborted) break;

          switch (event.type) {
            case 'thinking': {
              stepCount++;
              const step: ThinkingStep = {
                id: generateId(),
                step: stepCount,
                content: event.content as string,
                timestamp: Date.now(),
                type: 'reasoning',
              };
              thinkingSteps.push(step);

              setState((prev) => {
                const msgs = [...prev.messages];
                const lastIdx = msgs.findIndex((m) => m.id === assistantId);
                if (lastIdx !== -1) {
                  msgs[lastIdx] = {
                    ...msgs[lastIdx],
                    thinking: [...thinkingSteps],
                  };
                }
                return { ...prev, messages: msgs };
              });
              break;
            }

            case 'text': {
              fullText += event.content as string;
              setState((prev) => {
                const msgs = [...prev.messages];
                const lastIdx = msgs.findIndex((m) => m.id === assistantId);
                if (lastIdx !== -1) {
                  msgs[lastIdx] = { ...msgs[lastIdx], content: fullText };
                }
                return { ...prev, messages: msgs };
              });
              break;
            }

            case 'tool_use': {
              const toolCall: ToolCall = {
                id: generateId(),
                tool: event.tool as string,
                input: event.input as Record<string, unknown>,
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

              const tool = tools.find((t) => t.name === event.tool);
              if (tool) {
                const startTime = Date.now();
                try {
                  const result = await tool.execute(
                    event.input as Record<string, unknown>,
                    stateRef.current.abortController?.signal
                  );
                  toolCall.status = 'success';
                  toolCall.result = result;
                  toolCall.output = result.content || result.error || result;
                  toolCall.durationMs = Date.now() - startTime;
                } catch (err: any) {
                  toolCall.status = 'error';
                  toolCall.result = { content: '', error: (err as Error).message };
                  toolCall.output = (err as Error).message;
                }

                setState((prev) => ({
                  ...prev,
                  messages: prev.messages.map((m) =>
                    m.id === assistantId ? { ...m, toolCalls: [...toolCalls] } : m
                  ),
                }));
              }
              break;
            }

            case 'artifact': {
              const artifact: Artifact = {
                id: generateId(),
                type: event.artifactType as Artifact['type'],
                title: event.title as string,
                content: event.content as string,
                language: event.language as string,
              };
              artifacts.push(artifact);

              setState((prev) => {
                const msgs = [...prev.messages];
                const lastIdx = msgs.findIndex((m) => m.id === assistantId);
                if (lastIdx !== -1) {
                  msgs[lastIdx] = { ...msgs[lastIdx], artifacts: [...artifacts] };
                }
                return { ...prev, messages: msgs };
              });
              break;
            }

            case 'citation': {
              const citation: Citation = {
                id: generateId(),
                source: event.source as string,
                quote: event.quote as string,
                relevance: (event.relevance as number) || 1,
              };
              citations.push(citation);

              setState((prev) => {
                const msgs = [...prev.messages];
                const lastIdx = msgs.findIndex((m) => m.id === assistantId);
                if (lastIdx !== -1) {
                  msgs[lastIdx] = { ...msgs[lastIdx], citations: [...citations] };
                }
                return { ...prev, messages: msgs };
              });
              break;
            }

            case 'error': {
              setState((prev) => ({
                ...prev,
                currentPhase: 'error',
                messages: prev.messages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        status: 'error',
                        content: (event.content as string) || 'An error occurred',
                      }
                    : m
                ),
              }));
              return;
            }

            case 'complete': {
              break;
            }
          }
        }

        setState((prev) => ({
          ...prev,
          isProcessing: false,
          currentPhase: 'complete',
          messages: prev.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  status: 'complete',
                  metrics: {
                    modelUsed: modelSelection.model.name,
                    tokensIn: content.length,
                    tokensOut: fullText.length,
                    latencyMs: Date.now() - userMsg.timestamp,
                    reasoningSteps: stepCount,
                    tokens: content.length + fullText.length,
                  },
                }
              : m
          ),
          abortController: null,
        }));
      } catch (err: any) {
        if ((err as Error).name !== 'AbortError') {
          setState((prev) => ({
            ...prev,
            isProcessing: false,
            currentPhase: 'error',
            messages: [
              ...prev.messages,
              {
                id: generateId(),
                role: 'system',
                content: `Error: ${(err as Error).message}`,
                timestamp: Date.now(),
                status: 'error',
              },
            ],
            abortController: null,
          }));
        }
      }
    },
    [models, hardware, tools, options]
  );

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

  const clear = useCallback(() => {
    stateRef.current.abortController?.abort();
    setState({
      messages: [],
      isProcessing: false,
      currentPhase: 'complete',
      selectedModel: undefined,
      analysis: undefined,
      abortController: null,
    });
  }, []);

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

  const regenerate = useCallback(
    async (messageId?: string) => {
      const targetId =
        messageId || stateRef.current.messages[stateRef.current.messages.length - 1]?.id;
      const targetIndex = stateRef.current.messages.findIndex((m) => m.id === targetId);

      let userIndex = targetIndex;
      while (userIndex >= 0 && stateRef.current.messages[userIndex]?.role !== 'user') {
        userIndex--;
      }
      if (userIndex < 0) return;

      const userMsg = stateRef.current.messages[userIndex];
      const truncated = stateRef.current.messages.slice(0, userIndex + 1);

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
