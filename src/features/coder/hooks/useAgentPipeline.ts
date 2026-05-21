/**
 * @file src/features/coder/hooks/useAgentPipeline.ts
 * @description Core AI execution pipeline for single-agent and dual-agent (NYX) flows.
 */

import { useState, useCallback, useRef } from 'react';
import { AIService } from '@/src/core/services/ai.service';
import { ChatMessage, TelemetryMetrics, AISettings, AgentPersona } from '@/src/core/types';
import { detectProvider, getEffectiveApiKey } from '@/src/core/utils/provider';
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
        await runDualAgentPipeline(prompt, controller, controllerRef);
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

  const runDualAgentPipeline = async (prompt: string, controller: AbortController, controllerRef: React.MutableRefObject<AbortController | null>) => {
    const openModelId = models['open'] || models['nyx'];
    if (!openModelId) {
      toast.error('Please select a model for the planning engine');
      throw new Error('No model selected for OpenCode planner');
    }
    const openProvider = detectProvider(openModelId, ollamaModels, lmStudioModels);
    const openApiKey = getEffectiveApiKey(openProvider, apiKeys);

    const claudeModelId = models['nyx'] || models['open'];
    if (!claudeModelId) {
      toast.error('Please select a model for the execution engine');
      throw new Error('No model selected for Claude Code executor');
    }
    const claudeProvider = detectProvider(claudeModelId, ollamaModels, lmStudioModels);
    const claudeApiKey = getEffectiveApiKey(claudeProvider, apiKeys);

    updateHistory(activeAgent, prev => [...prev, { role: 'assistant', content: '', timestamp: Date.now(), status: 'loading' }]);

    const startTime = Date.now();

    // Detect if same model is used for both steps
    const isSameModel = openModelId === claudeModelId;

    if (isSameModel) {
      // Single model: skip planning entirely, go straight to code generation
      const directInstruction = `You are a code generator. Output ONLY code. No explanations, no plans, no bullet points, no descriptions.

RULES:
- Start immediately with a code block
- Write COMPLETE, WORKING code
- No placeholders like "add your code here"
- No "step 1, step 2" outlines
- No "here's how to implement" text
- Just the code, nothing else

If the user asks for a webpage, write the full HTML file with embedded CSS and JS.
If the user asks for a script, write the complete script.
If the user asks for multiple files, write each one in its own code block.`;

      const directPrompt = `Write the complete code for this: ${prompt}

Output ONLY the code. Start with the code block immediately. No text before the code.`;

      const directResult = await AIService.execute(
        claudeModelId, claudeProvider, directPrompt, claudeApiKey, directInstruction, modelSettings,
        (accumulatedText) => {
          const latency = Date.now() - startTime;
          const tokens = Math.floor(accumulatedText.length / 4);
          const currentMetrics = { latency, tokens, tps: latency > 0 ? Number(((tokens / latency) * 1000).toFixed(1)) : 0 };
          updateHistory(activeAgent, prev => {
            const history = [...prev];
            const last = history[history.length - 1];
            if (last && last.role === 'assistant') {
              last.content = accumulatedText;
              last.metrics = currentMetrics;
            }
            return history;
          });
        },
        controller.signal,
        { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap['nyx'].slice(-10) }
      );

      trackUsage(claudeProvider, directResult.metrics.tokens);

      updateHistory(activeAgent, prev => {
        const history = [...prev];
        const last = history[history.length - 1];
        if (last && last.role === 'assistant') {
          last.status = 'success';
          last.content = directResult.text;
          last.metrics = directResult.metrics;
        }
        getSuggestions(history);
        return history;
      });

      updateMetrics(activeAgent, directResult.metrics);
      return;
    }

    // Different models: use full dual-agent pipeline
    // Step 1: OpenCode Planner (silent - no UI output)
    const openInstruction = `You are an expert software architect and planning specialist. Given the user's prompt, create a detailed implementation plan with clear, actionable steps. Focus on:
- Understanding the core problem
- Breaking down the solution into logical steps
- Identifying potential edge cases
- Providing code structure recommendations

Output a clean, well-organized plan. No greetings or filler text.`;

    const openResult = await AIService.execute(
      openModelId, openProvider, prompt, openApiKey, openInstruction, modelSettings,
      () => {}, // Silent - no streaming to UI
      controller.signal,
      { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap['nyx'].slice(-10) }
    );

    trackUsage(openProvider, openResult.metrics.tokens);

    // Step 2: Claude Code - Full response with plan integrated
    const claudePrompt = `CODE REQUEST: ${prompt}

Here is the implementation plan:
${openResult.text}

Write the COMPLETE CODE now. Output ONLY code blocks. No descriptions of the plan, no step-by-step outlines, no "here's what I'll do" text. Start immediately with the code.`;

    const claudeInstruction = `You are a code generator. Given a planning outline, write the COMPLETE, WORKING CODE.

RULES:
- Start immediately with a code block
- Write ALL code - no placeholders, no "add your code here"
- No bullet points, no outlines, no "step 1, step 2"
- No "here's the implementation" or similar preamble
- After code blocks, you may add brief explanations
- The code must be copy-paste ready and functional`;

    const claudeResult = await AIService.execute(
      claudeModelId, claudeProvider, claudePrompt, claudeApiKey, claudeInstruction, modelSettings,
      (accumulatedText) => {
        const latency = Date.now() - startTime;
        const tokens = Math.floor(accumulatedText.length / 4);
        const currentMetrics = { latency, tokens, tps: latency > 0 ? Number(((tokens / latency) * 1000).toFixed(1)) : 0 };
        updateHistory(activeAgent, prev => {
          const history = [...prev];
          const last = history[history.length - 1];
          if (last && last.role === 'assistant') {
            last.content = accumulatedText;
            last.metrics = currentMetrics;
          }
          return history;
        });
      },
      controller.signal,
      { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap['nyx'].slice(-10) }
    );

    trackUsage(claudeProvider, claudeResult.metrics.tokens);

    const finalLatency = Date.now() - startTime;
    const finalTokens = openResult.metrics.tokens + claudeResult.metrics.tokens;
    const finalMetrics = {
      latency: finalLatency,
      tokens: finalTokens,
      tps: finalLatency > 0 ? Number(((finalTokens / finalLatency) * 1000).toFixed(1)) : 0
    };

    updateHistory(activeAgent, prev => {
      const history = [...prev];
      const last = history[history.length - 1];
      if (last && last.role === 'assistant') {
        last.status = 'success';
        last.content = claudeResult.text;
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
        const latency = Date.now() - startTime;
        const tokens = Math.floor(accumulatedText.length / 4);
        updateMetrics(activeAgent, {
          latency, tokens,
          tps: latency > 0 ? Number(((tokens / latency) * 1000).toFixed(1)) : 0
        });

        updateHistory(activeAgent, prev => {
          const history = [...prev];
          const last = history[history.length - 1];
          if (last && last.role === 'assistant') {
            last.content = accumulatedText;
            last.metrics = { latency, tokens, tps: latency > 0 ? Number(((tokens / latency) * 1000).toFixed(1)) : 0 };
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
