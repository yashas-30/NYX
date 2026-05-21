/**
 * @file src/features/coder/hooks/useAgentPipeline.ts
 * @description Core AI execution pipeline for single-agent and multi-agent (NYX) flows.
 *
 * NYX multi-agent pipeline:
 *   Stage 1 (Architect)  → internal only, shown as a compact progress banner
 *   Stage 2 (Coder)      → internal only, shown as a compact progress banner
 *   Stage 3 (Optimizer)  → final output streamed directly to the user
 */

import { useState, useCallback, useRef } from 'react';
import { AIService } from '@/src/core/services/ai.service';
import { ChatMessage, TelemetryMetrics, AISettings, AgentPersona } from '@/src/core/types';
import { detectProvider, getEffectiveApiKey, requiresApiKey } from '@/src/core/utils/provider';
import { toast } from 'sonner';

type AgentKey = 'open' | 'claude' | 'nyx';

interface PipelineProps {
  activeAgent: AgentKey;
  models: Record<AgentKey, string>;
  apiKeys: Record<string, string>;
  agentPersonas: Record<AgentKey, AgentPersona>;
  modelSettings: AISettings;
  lmStudioBaseUrl: string;
  ollamaBaseUrl: string;
  ollamaModels: any[];
  lmStudioModels: any[];
  trackUsage: (provider: string, tokens: number) => void;
  historyMap: Record<AgentKey, ChatMessage[]>;
  updateHistory: (agent: AgentKey, updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  updateMetrics: (agent: AgentKey, metrics: TelemetryMetrics) => void;
  getSuggestions: (history: ChatMessage[]) => void;
  setSuggestedPrompts: (prompts: string[]) => void;
}

// Status banners shown during internal stages 1 & 2 (not shown in final output)
const STAGE1_BANNER = `> ⚙️ **Architect Agent** — analysing the problem and designing the system blueprint...`;
const STAGE2_BANNER = `\n> 💻 **Coder Agent** — writing the complete implementation from the blueprint...`;
const STAGE3_BANNER = `\n> ⚡ **Optimizer Agent** — finalising and delivering your answer...\n\n`;

export const useAgentPipeline = ({
  activeAgent,
  models,
  apiKeys,
  agentPersonas,
  modelSettings,
  lmStudioBaseUrl,
  ollamaBaseUrl,
  ollamaModels,
  lmStudioModels,
  trackUsage,
  historyMap,
  updateHistory,
  updateMetrics,
  getSuggestions,
  setSuggestedPrompts
}: PipelineProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const runCoder = useCallback(async (prompt: string) => {
    if (!prompt.trim() || !models[activeAgent]) return;

    if (controllerRef.current) controllerRef.current.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const userMsg: ChatMessage = { role: 'user', content: prompt, timestamp: Date.now() };
    updateHistory(activeAgent, prev => [...prev, userMsg]);

    setIsLoading(true);
    setSuggestedPrompts([]);
    updateMetrics(activeAgent, { latency: 0, tokens: 0, tps: 0 });

    try {
      if (activeAgent === 'nyx') {
        await runMultiAgentPipeline(prompt, controller, controllerRef);
      } else {
        await runSingleAgentPipeline(prompt, controller, controllerRef);
      }
    } catch (error: any) {
      const isAborted = error?.name === 'AbortError' || controller.signal.aborted;
      updateHistory(activeAgent, prev => {
        const history = [...prev];
        const last = history[history.length - 1];
        if (last && last.role === 'assistant') last.status = isAborted ? 'stopped' : 'error';
        return history;
      });

      if (!isAborted) {
        toast.error(`Coder failed: ${error.message}`);
      }
    } finally {
      controllerRef.current = null;
      setIsLoading(false);
    }
  }, [activeAgent, models, apiKeys, agentPersonas, modelSettings, lmStudioBaseUrl, ollamaBaseUrl, ollamaModels, lmStudioModels, trackUsage, historyMap]);

  const runMultiAgentPipeline = async (prompt: string, controller: AbortController, controllerRef: React.MutableRefObject<AbortController | null>) => {
    // ── Resolve Models ─────────────────────────────────────────────────────
    const initialOpenModelId = models['open'] || models['nyx'];
    if (!initialOpenModelId) {
      toast.error('Please select a model for the planning engine');
      throw new Error('No model selected for OpenCode planner');
    }
    const initialOpenProvider = detectProvider(initialOpenModelId, ollamaModels, lmStudioModels);
    const initialOpenApiKey = getEffectiveApiKey(initialOpenProvider, apiKeys);
    const hasPlanningKey = !requiresApiKey(initialOpenProvider) || !!initialOpenApiKey;

    const architectModelId = hasPlanningKey ? initialOpenModelId : models['nyx'];
    const architectProvider = hasPlanningKey ? initialOpenProvider : detectProvider(architectModelId, ollamaModels, lmStudioModels);
    const architectApiKey = hasPlanningKey ? initialOpenApiKey : getEffectiveApiKey(architectProvider, apiKeys);

    const initialClaudeModelId = models['claude'] || models['nyx'];
    if (!initialClaudeModelId) {
      toast.error('Please select a model for the execution engine');
      throw new Error('No model selected for Coder executor');
    }
    const initialClaudeProvider = detectProvider(initialClaudeModelId, ollamaModels, lmStudioModels);
    const initialClaudeApiKey = getEffectiveApiKey(initialClaudeProvider, apiKeys);
    const hasClaudeKey = !requiresApiKey(initialClaudeProvider) || !!initialClaudeApiKey;

    const coderModelId = hasClaudeKey ? initialClaudeModelId : models['nyx'];
    const coderProvider = hasClaudeKey ? initialClaudeProvider : detectProvider(coderModelId, ollamaModels, lmStudioModels);
    const coderApiKey = hasClaudeKey ? initialClaudeApiKey : getEffectiveApiKey(coderProvider, apiKeys);

    const optimizerModelId = models['nyx'];
    if (!optimizerModelId) {
      toast.error('Please select a model for the optimization engine');
      throw new Error('No model selected for Optimizer');
    }
    const optimizerProvider = detectProvider(optimizerModelId, ollamaModels, lmStudioModels);
    const optimizerApiKey = getEffectiveApiKey(optimizerProvider, apiKeys);

    // ── Seed the assistant message with stage-1 banner ─────────────────────
    updateHistory(activeAgent, prev => [
      ...prev,
      { role: 'assistant', content: STAGE1_BANNER, timestamp: Date.now(), status: 'loading' }
    ]);

    const startTime = Date.now();

    // ── System Instructions ────────────────────────────────────────────────
    const architectInstruction = `You are the Principal Software Architect Agent. Given the user's prompt, formulate a highly detailed architectural plan and system design blueprint.
Focus on:
- System design patterns & components
- Core data structures & algorithms
- Critical performance considerations & bottlenecks
- Edge cases, error handling, and security considerations

Output a structured blueprint. Do NOT include greetings or extra conversation.`;

    const coderInstruction = `You are the Senior Coder Agent. Your job is to implement the complete system codebase based on the Architect's blueprint.
RULES:
- Output ONLY complete, production-ready code.
- Never use comments like "// todo", "// implement later", or placeholders.
- Strictly handle all security, error boundaries, and edge cases described in the blueprint.
- Keep the code well-organized, highly readable, and modular.`;

    const optimizerInstruction = `You are the High-Performance Optimizer & Lead Delivery Agent. Your job is to:
1. Audit and fully optimize the draft code for speed, memory, accessibility (WCAG 2.2 AA), and clean architecture.
2. Deliver the COMPLETE, FINAL, production-ready code to the user.

STRICT OUTPUT FORMAT:
- Output the COMPLETE optimized code in properly labeled code blocks (e.g. \`\`\`html, \`\`\`typescript, etc.)
- Do NOT reference stages, agents, or internal pipeline steps.
- Do NOT use placeholders, TODOs, or partial snippets — every file must be 100% complete.
- After all code blocks, add a "## How to Use" section with clear, concise implementation steps.
- Keep the tone direct and professional.`;

    // ── Stage 1: Architect (internal — user sees banner only) ──────────────
    let architectText = '';

    const architectResult = await AIService.execute(
      architectModelId, architectProvider, prompt, architectApiKey, architectInstruction, modelSettings,
      (_accumulatedText) => {
        // Stage 1 output is internal — keep the banner visible but don't expose raw architect text
        const elapsed = Date.now() - startTime;
        updateMetrics(activeAgent, { latency: elapsed, tokens: Math.floor(_accumulatedText.length / 4), tps: 0 });
      },
      controller.signal,
      { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap['nyx'].slice(-10) }
    );

    architectText = architectResult.text;
    trackUsage(architectProvider, architectResult.metrics.tokens);

    // Show stage-2 banner
    updateHistory(activeAgent, prev => {
      const history = [...prev];
      const last = history[history.length - 1];
      if (last && last.role === 'assistant') {
        last.content = STAGE1_BANNER + STAGE2_BANNER;
      }
      return history;
    });

    // ── Stage 2: Coder (internal — user sees banner only) ─────────────────
    let coderText = '';

    const coderPrompt = `USER PROMPT: ${prompt}

ARCHITECT'S BLUEPRINT:
${architectText}

Implement the complete system codebase. Cover all files, functions, and edge cases specified by the architect. Output complete and functional code only.`;

    const coderResult = await AIService.execute(
      coderModelId, coderProvider, coderPrompt, coderApiKey, coderInstruction, modelSettings,
      (_accumulatedText) => {
        // Stage 2 output is internal — keep the banner visible but don't expose raw coder text
        const elapsed = Date.now() - startTime;
        const totalTokens = architectResult.metrics.tokens + Math.floor(_accumulatedText.length / 4);
        updateMetrics(activeAgent, { latency: elapsed, tokens: totalTokens, tps: 0 });
      },
      controller.signal,
      { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap['nyx'].slice(-10) }
    );

    coderText = coderResult.text;
    trackUsage(coderProvider, coderResult.metrics.tokens);

    // Show stage-3 banner (brief, then replaced by streaming optimizer output)
    updateHistory(activeAgent, prev => {
      const history = [...prev];
      const last = history[history.length - 1];
      if (last && last.role === 'assistant') {
        last.content = STAGE1_BANNER + STAGE2_BANNER + STAGE3_BANNER;
      }
      return history;
    });

    // ── Stage 3: Optimizer (streamed directly to the user as the final answer)
    let optimizerText = '';

    const optimizerPrompt = `USER PROMPT: ${prompt}

ARCHITECT'S BLUEPRINT:
${architectText}

INITIAL DRAFT CODE:
${coderText}

Audit this implementation. Apply maximum optimizations for speed, memory efficiency, accessibility, and clean architecture.
Deliver the final complete code to the user — no placeholders, no partial snippets, 100% complete files only.
End your response with a "## How to Use" section with clear implementation steps.`;

    const optimizerResult = await AIService.execute(
      optimizerModelId, optimizerProvider, optimizerPrompt, optimizerApiKey, optimizerInstruction, modelSettings,
      (accumulatedText) => {
        optimizerText = accumulatedText;
        const elapsed = Date.now() - startTime;
        const totalTokens = architectResult.metrics.tokens + coderResult.metrics.tokens + Math.floor(optimizerText.length / 4);
        const tps = elapsed > 0 ? Math.round(totalTokens / (elapsed / 1000)) : 0;
        const currentMetrics = { latency: elapsed, tokens: totalTokens, tps };

        // Replace the entire message content with the optimizer's streaming output
        updateHistory(activeAgent, prev => {
          const history = [...prev];
          const last = history[history.length - 1];
          if (last && last.role === 'assistant') {
            last.content = optimizerText;
            last.metrics = currentMetrics;
          }
          return history;
        });

        updateMetrics(activeAgent, currentMetrics);
      },
      controller.signal,
      { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap['nyx'].slice(-10) }
    );

    optimizerText = optimizerResult.text;
    trackUsage(optimizerProvider, optimizerResult.metrics.tokens);

    const finalElapsed = Date.now() - startTime;
    const finalTokens = architectResult.metrics.tokens + coderResult.metrics.tokens + optimizerResult.metrics.tokens;
    const finalTps = finalElapsed > 0 ? Math.round(finalTokens / (finalElapsed / 1000)) : 0;
    const finalMetrics = { latency: finalElapsed, tokens: finalTokens, tps: finalTps };

    // Commit the final clean output
    updateHistory(activeAgent, prev => {
      const history = [...prev];
      const last = history[history.length - 1];
      if (last && last.role === 'assistant') {
        last.status = 'success';
        last.content = optimizerText;
        last.metrics = finalMetrics;
      }
      getSuggestions(history);
      return history;
    });

    updateMetrics(activeAgent, finalMetrics);
  };

  const runSingleAgentPipeline = async (prompt: string, controller: AbortController, controllerRef: React.MutableRefObject<AbortController | null>) => {
    const persona = agentPersonas[activeAgent];
    const currentModelId = models[activeAgent];
    const provider = detectProvider(currentModelId, ollamaModels, lmStudioModels);
    const apiKey = getEffectiveApiKey(provider, apiKeys);

    updateHistory(activeAgent, prev => [...prev, { role: 'assistant', content: '', timestamp: Date.now(), status: 'loading' }]);

    const startTime = Date.now();
    const result = await AIService.execute(
      currentModelId, provider, prompt, apiKey, persona.systemPrompt, modelSettings,
      (accumulatedText) => {
        const elapsed = Date.now() - startTime;
        const tokens = Math.floor(accumulatedText.length / 4);
        const tps = elapsed > 0 ? Math.round(tokens / (elapsed / 1000)) : 0;
        updateMetrics(activeAgent, { latency: elapsed, tokens, tps });

        updateHistory(activeAgent, prev => {
          const history = [...prev];
          const last = history[history.length - 1];
          if (last && last.role === 'assistant') {
            last.content = accumulatedText;
            last.metrics = { latency: elapsed, tokens, tps };
          }
          return history;
        });
      },
      controller.signal,
      { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap[activeAgent].slice(-10) }
    );

    trackUsage(provider, result.metrics.tokens);

    updateHistory(activeAgent, prev => {
      const history = [...prev];
      const last = history[history.length - 1];
      if (last && last.role === 'assistant') {
        last.status = 'success';
        last.content = result.text;
        last.metrics = result.metrics;
      }
      getSuggestions(history);
      return history;
    });

    updateMetrics(activeAgent, result.metrics);
  };

  const stopCoder = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  return { isLoading, runCoder, stopCoder };
};
