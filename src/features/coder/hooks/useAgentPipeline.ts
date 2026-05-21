/**
 * @file src/features/coder/hooks/useAgentPipeline.ts
 * @description Core AI execution pipeline for single-agent and dual-agent (NYX) flows.
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
    // 1. Resolve Architect Model (defaults to OpenCode)
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

    // 2. Resolve Coder Model (defaults to Claude Code)
    const initialClaudeModelId = models['claude'] || models['nyx'];
    if (!initialClaudeModelId) {
      toast.error('Please select a model for the execution engine');
      throw new Error('No model selected for Claude Code executor');
    }
    const initialClaudeProvider = detectProvider(initialClaudeModelId, ollamaModels, lmStudioModels);
    const initialClaudeApiKey = getEffectiveApiKey(initialClaudeProvider, apiKeys);
    const hasClaudeKey = !requiresApiKey(initialClaudeProvider) || !!initialClaudeApiKey;

    const coderModelId = hasClaudeKey ? initialClaudeModelId : models['nyx'];
    const coderProvider = hasClaudeKey ? initialClaudeProvider : detectProvider(coderModelId, ollamaModels, lmStudioModels);
    const coderApiKey = hasClaudeKey ? initialClaudeApiKey : getEffectiveApiKey(coderProvider, apiKeys);

    // 3. Resolve Optimizer Model (uses the main NYX agent model directly)
    const optimizerModelId = models['nyx'];
    if (!optimizerModelId) {
      toast.error('Please select a model for the optimization engine');
      throw new Error('No model selected for Optimizer');
    }
    const optimizerProvider = detectProvider(optimizerModelId, ollamaModels, lmStudioModels);
    const optimizerApiKey = getEffectiveApiKey(optimizerProvider, apiKeys);

    updateHistory(activeAgent, prev => [...prev, { role: 'assistant', content: '', timestamp: Date.now(), status: 'loading' }]);

    const startTime = Date.now();

    // Prompts and instructions
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

    const optimizerInstruction = `You are the High-Performance Optimizer & Security Auditor Agent. Your job is to audit the initial code implementation and refactor it into an elite, highly optimized, production-grade output.
Optimize for:
- Execution speed & CPU efficiency
- Minimal memory footprint and resource leaks
- Modern, idiomatic language constructs
- Web accessibility (WCAG 2.2 AA) and robust error safety

RULES:
- Output the final complete, optimized codebase.
- Do NOT use placeholders.
- Start immediately with the optimized code blocks.
- After the code blocks, provide a brief summary of the optimizations applied.`;

    // Stage 1: Architecting
    let architectText = "";
    const stage1Header = `### 🏗️ Stage 1: System Architecture Blueprint (Architect Agent)\n\n`;

    const architectResult = await AIService.execute(
      architectModelId, architectProvider, prompt, architectApiKey, architectInstruction, modelSettings,
      (accumulatedText) => {
        architectText = accumulatedText;
        const latency = 0;
        const tokens = Math.floor(architectText.length / 4);
        const currentMetrics = { latency, tokens, tps: 0 };
        updateHistory(activeAgent, prev => {
          const history = [...prev];
          const last = history[history.length - 1];
          if (last && last.role === 'assistant') {
            last.content = stage1Header + architectText;
            last.metrics = currentMetrics;
          }
          return history;
        });
      },
      controller.signal,
      { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap['nyx'].slice(-10) }
    );

    architectText = architectResult.text;
    trackUsage(architectProvider, architectResult.metrics.tokens);

    // Stage 2: Implementing
    let coderText = "";
    const stage2Header = `\n\n---\n\n### 💻 Stage 2: Initial Implementation (Coder Agent)\n\n`;

    const coderPrompt = `USER PROMPT: ${prompt}

ARCHITECT'S BLUEPRINT:
${architectText}

Implement the complete system codebase. Cover all files, functions, and edge cases specified by the architect. Output complete and functional code only.`;

    const coderResult = await AIService.execute(
      coderModelId, coderProvider, coderPrompt, coderApiKey, coderInstruction, modelSettings,
      (accumulatedText) => {
        coderText = accumulatedText;
        const latency = 0;
        const totalTokens = architectResult.metrics.tokens + Math.floor(coderText.length / 4);
        const currentMetrics = { latency, tokens: totalTokens, tps: 0 };
        updateHistory(activeAgent, prev => {
          const history = [...prev];
          const last = history[history.length - 1];
          if (last && last.role === 'assistant') {
            last.content = stage1Header + architectText + stage2Header + coderText;
            last.metrics = currentMetrics;
          }
          return history;
        });
      },
      controller.signal,
      { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap['nyx'].slice(-10) }
    );

    coderText = coderResult.text;
    trackUsage(coderProvider, coderResult.metrics.tokens);

    // Stage 3: Optimizing
    let optimizerText = "";
    const stage3Header = `\n\n---\n\n### ⚡ Stage 3: High-Performance Optimization (Optimizer Agent)\n\n`;

    const optimizerPrompt = `USER PROMPT: ${prompt}

ARCHITECT'S BLUEPRINT:
${architectText}

INITIAL DRAFT CODE:
${coderText}

Audit this implementation. Apply maximum optimizations for speed, memory efficiency, accessibility, and clean architecture. Produce the finalized, fully functional, premium optimized code.`;

    const optimizerResult = await AIService.execute(
      optimizerModelId, optimizerProvider, optimizerPrompt, optimizerApiKey, optimizerInstruction, modelSettings,
      (accumulatedText) => {
        optimizerText = accumulatedText;
        const latency = 0;
        const totalTokens = architectResult.metrics.tokens + coderResult.metrics.tokens + Math.floor(optimizerText.length / 4);
        const currentMetrics = { latency, tokens: totalTokens, tps: 0 };
        updateHistory(activeAgent, prev => {
          const history = [...prev];
          const last = history[history.length - 1];
          if (last && last.role === 'assistant') {
            last.content = stage1Header + architectText + stage2Header + coderText + stage3Header + optimizerText;
            last.metrics = currentMetrics;
          }
          return history;
        });
      },
      controller.signal,
      { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap['nyx'].slice(-10) }
    );

    optimizerText = optimizerResult.text;
    trackUsage(optimizerProvider, optimizerResult.metrics.tokens);

    const finalLatency = 0;
    const finalTokens = architectResult.metrics.tokens + coderResult.metrics.tokens + optimizerResult.metrics.tokens;
    const finalMetrics = {
      latency: finalLatency,
      tokens: finalTokens,
      tps: 0
    };

    updateHistory(activeAgent, prev => {
      const history = [...prev];
      const last = history[history.length - 1];
      if (last && last.role === 'assistant') {
        last.status = 'success';
        last.content = stage1Header + architectText + stage2Header + coderText + stage3Header + optimizerText;
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
        const latency = 0;
        const tokens = Math.floor(accumulatedText.length / 4);
        updateMetrics(activeAgent, {
          latency, tokens,
          tps: 0
        });

        updateHistory(activeAgent, prev => {
          const history = [...prev];
          const last = history[history.length - 1];
          if (last && last.role === 'assistant') {
            last.content = accumulatedText;
            last.metrics = { latency: 0, tokens, tps: 0 };
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
