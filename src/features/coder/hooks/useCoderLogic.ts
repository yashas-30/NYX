/**
 * @file src/features/coder/hooks/useCoderLogic.ts
 * @description Feature-specific logic for the Coder agent, using the AIService.
 */

import { useState, useCallback, useRef } from 'react';
import { AIService } from '@/src/core/services/ai.service';
import { ChatMessage, TelemetryMetrics, Provider, AISettings, AgentPersona } from '@/src/core/types';
import { detectProvider } from '@/src/core/utils/provider';
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
  const [activeAgent, setActiveAgent] = useState<'open' | 'claude'>('open');
  const [isLoading, setIsLoading] = useState(false);
  const [historyMap, setHistoryMap] = useState<Record<'open' | 'claude', ChatMessage[]>>({ 
    open: [], 
    claude: [] 
  });
  const [metricsMap, setMetricsMap] = useState<Record<'open' | 'claude', TelemetryMetrics>>({
    open: { latency: 0, tokens: 0, tps: 0 },
    claude: { latency: 0, tokens: 0, tps: 0 }
  });
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [models, setModels] = useState<Record<'open' | 'claude', string>>({
    open: 'opencode/elephant-free',
    claude: 'gemini-3.1-pro-preview'
  });
  const [agentPersonas, setAgentPersonas] = useState<Record<'open' | 'claude', AgentPersona>>(DEFAULT_AGENTS);
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
      const persona = agentPersonas[activeAgent];
      const currentModelId = models[activeAgent];
      const provider = detectProvider(currentModelId, ollamaModels, lmStudioModels);
      const apiKey = apiKeys[provider];

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
