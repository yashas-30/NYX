/**
 * @file src/features/coder/hooks/useCoderLogic.ts
 * @description Feature-specific logic for the Coder agent, using the AIService.
 */

import { useState, useCallback, useRef } from 'react';
import { AIService } from '@/src/core/services/ai.service';
import { ChatMessage, TelemetryMetrics, Provider, AISettings, AgentPersona } from '@/src/core/types';
import { detectProvider, getEffectiveApiKey } from '@/src/core/utils/provider';
import { DEFAULT_AGENTS } from '@/src/config/agents';
import { toast } from 'sonner';

interface CoderLogicProps {
  apiKeys: Record<string, string>;
  lmStudioBaseUrl: string;
  modelSettings: AISettings;
  trackUsage: (provider: string, tokens: number) => void;
  ollamaModels: any[];
  lmStudioModels: any[];
  ollamaBaseUrl: string;
}

export const useCoderLogic = ({
  apiKeys,
  lmStudioBaseUrl,
  modelSettings,
  trackUsage,
  ollamaModels,
  lmStudioModels,
  ollamaBaseUrl
}: CoderLogicProps) => {
  const [activeAgent, setActiveAgent] = useState<'open' | 'claude' | 'nyx'>('open');
  const [isLoading, setIsLoading] = useState(false);
  const [historyMap, setHistoryMap] = useState<Record<'open' | 'claude' | 'nyx', ChatMessage[]>>({ 
    open: [], 
    claude: [],
    nyx: []
  });
  const [metricsMap, setMetricsMap] = useState<Record<'open' | 'claude' | 'nyx', TelemetryMetrics>>({
    open: { latency: 0, tokens: 0, tps: 0 },
    claude: { latency: 0, tokens: 0, tps: 0 },
    nyx: { latency: 0, tokens: 0, tps: 0 }
  });
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [models, setModels] = useState<Record<'open' | 'claude' | 'nyx', string>>({
    open: 'opencode/big-pickle',
    claude: 'anthropic/claude-sonnet-4-20250514',
    nyx: 'anthropic/claude-sonnet-4-20250514'
  });
  const [agentPersonas, setAgentPersonas] = useState<Record<'open' | 'claude' | 'nyx', AgentPersona>>(DEFAULT_AGENTS);
  const [isUpdatingAgents, setIsUpdatingAgents] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);

  const getSuggestions = useCallback((history: ChatMessage[]) => {
    const lastMsg = history[history.length - 1];
    if (!lastMsg || lastMsg.role === 'user') return;

    const content = lastMsg.content.toLowerCase();
    let suggestions = ['Explain this code', 'Add error handling', 'Write unit tests'];

    if (content.includes('react') || content.includes('component')) {
      suggestions = ['Add prop types', 'Convert to Tailwind', 'Add a loading state'];
    } else if (content.includes('api') || content.includes('fetch')) {
      suggestions = ['Add retry logic', 'Document the API', 'Mock this response'];
    }

    setSuggestedPrompts(suggestions);
  }, []);

  const runCoder = useCallback(async (prompt: string) => {
    if (!prompt.trim()) return;

    if (controllerRef.current) controllerRef.current.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const userMsg: ChatMessage = { role: 'user', content: prompt, timestamp: Date.now() };
    setHistoryMap(prev => ({
      ...prev,
      [activeAgent]: [...prev[activeAgent], userMsg]
    }));

    setIsLoading(true);
    setSuggestedPrompts([]);
    setMetricsMap(prev => ({ ...prev, [activeAgent]: { latency: 0, tokens: 0, tps: 0 } }));
    
    try {
      if (activeAgent === 'nyx') {
        const openModelId = models['open'] || 'opencode/big-pickle';
        const openProvider = detectProvider(openModelId, ollamaModels, lmStudioModels);
        const openApiKey = getEffectiveApiKey(openProvider, apiKeys);

        const claudeModelId = models['claude'] || 'anthropic/claude-sonnet-4-20250514';
        const claudeProvider = detectProvider(claudeModelId, ollamaModels, lmStudioModels);
        const claudeApiKey = getEffectiveApiKey(claudeProvider, apiKeys);

        setHistoryMap(prev => ({
          ...prev,
          [activeAgent]: [...prev[activeAgent], { role: 'assistant', content: '', timestamp: Date.now(), status: 'loading' }]
        }));

        const startTime = Date.now();
        const initialText = `[NYX TERMINAL] Initializing dual-agent pipeline...
[NYX TERMINAL] STAGE 1: OpenCode Planning Engine
[NYX TERMINAL] Model: ${openModelId}
[NYX TERMINAL] Status: Planning...

==================================================
OPENCODE PLAN & TO-DO STEPS:
==================================================
`;
        setHistoryMap(prev => {
          const history = [...prev[activeAgent]];
          const last = history[history.length - 1];
          if (last && last.role === 'assistant') {
            last.content = initialText;
          }
          return { ...prev, [activeAgent]: history };
        });

        // Step 1: OpenCode Planner
        let openText = '';
        const openInstruction = `You are OpenCode Zen Planner. Given the user's prompt, create a detailed implementation plan and a list of to-do steps for code explanation and code fix. Start immediately with the plan and to-do list, no greetings, no introductory text, no chat prefix.`;
        
        const openResult = await AIService.execute(
          openModelId,
          openProvider,
          prompt,
          openApiKey,
          openInstruction,
          modelSettings,
          (accumulatedText) => {
            openText = accumulatedText;
            const now = Date.now();
            const latency = now - startTime;
            const tokens = Math.floor((initialText.length + accumulatedText.length) / 4);
            const currentMetrics = {
              latency, tokens,
              tps: latency > 0 ? Number(((tokens / latency) * 1000).toFixed(1)) : 0
            };
            setHistoryMap(prev => {
              const history = [...prev[activeAgent]];
              const last = history[history.length - 1];
              if (last && last.role === 'assistant') {
                last.content = initialText + accumulatedText;
                last.metrics = currentMetrics;
              }
              return { ...prev, [activeAgent]: history };
            });
          },
          controller.signal,
          { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap['nyx'].slice(-10) }
        );

        trackUsage(openProvider, openResult.metrics.tokens);

        const transitionText = `

[NYX TERMINAL] STAGE 2: Claude Code Implementation Engine
[NYX TERMINAL] Model: ${claudeModelId}
[NYX TERMINAL] Status: Executing...

==================================================
CLAUDE CODE ANALYSIS & IMPLEMENTATION:
==================================================
`;
        const baseTextForClaude = initialText + openResult.text + transitionText;

        setHistoryMap(prev => {
          const history = [...prev[activeAgent]];
          const last = history[history.length - 1];
          if (last && last.role === 'assistant') {
            last.content = baseTextForClaude;
          }
          return { ...prev, [activeAgent]: history };
        });

        // Step 2: Claude Analyzer and Code Writer
        const claudePrompt = `User's original prompt: "${prompt}"

OpenCode's generated plan and to-dos:
${openResult.text}

Your tasks:
1. Analyze OpenCode's plan and to-do steps.
2. Check if something is missing. If anything is missing or needs correction, explicitly add it to the plan and to-dos.
3. Based on the combined plan, write the complete code explanation and code fix.
4. Start writing the code and give the final response.`;

        const claudeInstruction = `You are Claude Code (Antigravity), a senior compiler and code execution specialist. Given the planning output from OpenCode and the user's prompt, perform an analysis of the plan, note any additions/changes, and provide the final complete explanation and code implementation.
Output format:
Start with:
### Claude Code Analysis & Extensions
(Detail what was missing or what was added to the plan/steps here)

Then follow with:
### Code Explanation & Implementation
(Explain the code and write the complete code implementation blocks here)

ABSOLUTE RULE:
- Start directly with '### Claude Code Analysis & Extensions'. No preambles, no greetings.`;

        let claudeText = '';
        const claudeResult = await AIService.execute(
          claudeModelId,
          claudeProvider,
          claudePrompt,
          claudeApiKey,
          claudeInstruction,
          modelSettings,
          (accumulatedText) => {
            claudeText = accumulatedText;
            const now = Date.now();
            const latency = now - startTime;
            const totalLength = baseTextForClaude.length + accumulatedText.length;
            const tokens = Math.floor(totalLength / 4);
            const currentMetrics = {
              latency, tokens,
              tps: latency > 0 ? Number(((tokens / latency) * 1000).toFixed(1)) : 0
            };
            setHistoryMap(prev => {
              const history = [...prev[activeAgent]];
              const last = history[history.length - 1];
              if (last && last.role === 'assistant') {
                last.content = baseTextForClaude + accumulatedText;
                last.metrics = currentMetrics;
              }
              return { ...prev, [activeAgent]: history };
            });
          },
          controller.signal,
          { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap['nyx'].slice(-10) }
        );

        trackUsage(claudeProvider, claudeResult.metrics.tokens);

        const finalContent = baseTextForClaude + claudeResult.text;
        const finalLatency = Date.now() - startTime;
        const finalTokens = openResult.metrics.tokens + claudeResult.metrics.tokens;
        const finalMetrics = {
          latency: finalLatency,
          tokens: finalTokens,
          tps: finalLatency > 0 ? Number(((finalTokens / finalLatency) * 1000).toFixed(1)) : 0
        };

        setHistoryMap(prev => {
          const history = [...prev[activeAgent]];
          const last = history[history.length - 1];
          if (last && last.role === 'assistant') {
            last.status = 'success';
            last.content = finalContent;
            last.metrics = finalMetrics;
          }
          getSuggestions(history);
          return { ...prev, [activeAgent]: history };
        });

        setMetricsMap(prev => ({ ...prev, [activeAgent]: finalMetrics }));

      } else {
        const persona = agentPersonas[activeAgent];
        const currentModelId = models[activeAgent];
        const provider = detectProvider(currentModelId, ollamaModels, lmStudioModels);
        const apiKey = getEffectiveApiKey(provider, apiKeys);

        setHistoryMap(prev => ({
          ...prev,
          [activeAgent]: [...prev[activeAgent], { role: 'assistant', content: '', timestamp: Date.now(), status: 'loading' }]
        }));

        const startTime = Date.now();
        const result = await AIService.execute(
          currentModelId,
          provider,
          prompt,
          apiKey,
          persona.systemPrompt,
          modelSettings,
          (accumulatedText) => {
            const now = Date.now();
            const latency = now - startTime;
            const tokens = Math.floor(accumulatedText.length / 4);
            setMetricsMap(prev => ({
              ...prev,
              [activeAgent]: { 
                latency, tokens, 
                tps: latency > 0 ? Number(((tokens / latency) * 1000).toFixed(1)) : 0 
              }
            }));

            const currentMetrics = {
              latency,
              tokens,
              tps: latency > 0 ? Number(((tokens / latency) * 1000).toFixed(1)) : 0
            };

            setHistoryMap(prev => {
              const history = [...prev[activeAgent]];
              const last = history[history.length - 1];
              if (last && last.role === 'assistant') {
                last.content = accumulatedText;
                last.metrics = currentMetrics;
              }
              return { ...prev, [activeAgent]: history };
            });
          },
          controller.signal,
          { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap[activeAgent].slice(-10) }
        );

        trackUsage(provider, result.metrics.tokens);

        setHistoryMap(prev => {
          const history = [...prev[activeAgent]];
          const last = history[history.length - 1];
          if (last && last.role === 'assistant') {
            last.status = 'success';
            last.content = result.text;
            last.metrics = result.metrics;
          }
          getSuggestions(history);
          return { ...prev, [activeAgent]: history };
        });
        
        setMetricsMap(prev => ({ ...prev, [activeAgent]: result.metrics }));
      }

    } catch (error: any) {
      const isAborted = error?.name === 'AbortError' || controller.signal.aborted;
      setHistoryMap(prev => {
        const history = [...prev[activeAgent]];
        const last = history[history.length - 1];
        if (last && last.role === 'assistant') last.status = isAborted ? 'stopped' : 'error';
        return { ...prev, [activeAgent]: history };
      });

      if (!isAborted) {
        toast.error(`Coder failed: ${error.message}`);
      }
    } finally {
      controllerRef.current = null;
      setIsLoading(false);
    }
  }, [activeAgent, models, apiKeys, agentPersonas, modelSettings, lmStudioBaseUrl, detectProvider, trackUsage, historyMap, getSuggestions]);

  const stopCoder = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  const clearHistory = useCallback(() => {
    setHistoryMap(prev => ({ ...prev, [activeAgent]: [] }));
    setMetricsMap(prev => ({ ...prev, [activeAgent]: { latency: 0, tokens: 0, tps: 0 } }));
    setSuggestedPrompts([]);
  }, [activeAgent]);

  const setModel = useCallback((mid: string) => {
    setModels(prev => ({ ...prev, [activeAgent]: mid }));
  }, [activeAgent]);

  return {
    activeAgent, setActiveAgent,
    isLoading,
    history: historyMap[activeAgent],
    metrics: metricsMap[activeAgent],
    models, setModel,
    runCoder, stopCoder, clearHistory,
    agentPersonas, suggestedPrompts
  };
};
