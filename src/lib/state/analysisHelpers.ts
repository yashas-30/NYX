import { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import { AVAILABLE_MODELS } from '@/src/config/models';
import { callAI, isCodePrompt } from '@/src/lib/api/inferenceClient';
import {
  AnalysisJudgement,
  CodeAnalysisResult,
  ComparisonColumn,
  ComparisonHistoryItem,
  OllamaModel,
} from '@/src/types';
import { 
  resolveModelConfig, 
  runStandardAnalysis, 
  runCodeAnalysis,
  getAvailableAnalysisModels,
  AnalysisModelConfig
} from '@/src/lib/analysis/analysisService';
import { BugCollector } from '@/src/lib/analysis/bugCollector';

const AVAILABLE_MODEL_IDS = new Set(AVAILABLE_MODELS.map(m => m.id));

export interface RunComparisonOptions {
  columns: ComparisonColumn[];
  globalPrompt: string;
  apiKeys: Record<string, string>;
  ollamaModels: OllamaModel[];
  lmStudioModels: any[];
  lmStudioBaseUrl: string;
  modelSettings: { temperature: number; maxTokens: number; topP: number; topK: number };
  isGlobalLoading: boolean;
  setColumns: Dispatch<SetStateAction<ComparisonColumn[]>>;
  setIsGlobalLoading: Dispatch<SetStateAction<boolean>>;
  setGlobalPrompt: Dispatch<SetStateAction<string>>;
  setHistory: Dispatch<SetStateAction<ComparisonHistoryItem[]>>;
  abortGeneration: (columnId: string) => void;
  activeControllers: MutableRefObject<Record<string, AbortController>>;
  runAnalysis: (columnsToAnalyze?: ComparisonColumn[], globalPromptOverride?: string) => Promise<void>;
  updateUsage: (provider: string, tokens: number) => void;
  ollamaBaseUrl: string;
}

export const runComparison = async ({
  columns,
  globalPrompt,
  apiKeys,
  ollamaModels,
  lmStudioModels,
  modelSettings,
  isGlobalLoading,
  setColumns,
  setIsGlobalLoading,
  setGlobalPrompt,
  setHistory,
  abortGeneration,
  activeControllers,
  runAnalysis,
  lmStudioBaseUrl,
  ollamaBaseUrl,
  updateUsage,
}: RunComparisonOptions) => {
  if (isGlobalLoading) return;
  if (!globalPrompt.trim() && columns.every((c) => !c.localPrompt?.trim() && !c.output.trim())) {
    toast.warning('Please enter a prompt or paste content into nodes.');
    return;
  }

  // Pre-compute lookup sets for O(1) model checks
  const ollamaModelNames = new Set(ollamaModels.map(m => m.name));
  const lmStudioModelIds = new Set(lmStudioModels.map(m => m.id));
  const availableModelIds = new Set(AVAILABLE_MODELS.map(m => m.id));

  const capturedPrompt = globalPrompt;
  const selectedCount = columns.filter((c) => c.isSelected).length;
  const targetNodes = selectedCount > 0 ? columns.filter((c) => c.isSelected) : columns;

  setIsGlobalLoading(true);
  setGlobalPrompt('');

  targetNodes.forEach((node) => abortGeneration(node.id));

  setColumns((prev) =>
    prev.map((c) => {
      const isTarget = targetNodes.some((tn) => tn.id === c.id);
      if (isTarget && c.modelId) {
        return { ...c, status: 'loading', output: '', error: undefined };
      }
      return c;
    })
  );

  let lastUpdate = Date.now();

  const promises = targetNodes.map(async (column) => {
    if (!column.modelId) {
      setColumns((prev) => prev.map((c) => (c.id === column.id ? { ...c, status: 'idle' } : c)));
      return;
    }

    if (column.output.trim() && !column.localPrompt?.trim() && !globalPrompt.trim() && !capturedPrompt.trim()) return;

    try {
      const isOllama = ollamaModelNames.has(column.modelId);
      const isLMStudio = lmStudioModelIds.has(column.modelId);
      const model = availableModelIds.has(column.modelId) 
        ? AVAILABLE_MODELS.find(m => m.id === column.modelId)
        : undefined;
      const provider = isOllama ? 'ollama' : isLMStudio ? 'lmstudio' : model?.provider || 'gemini';
      const finalKey = apiKeys[provider]?.trim();
      const activePrompt = column.localPrompt || capturedPrompt;

      if (provider === 'terminal') {
        await fetch('/api/terminal/prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodeId: column.id, prompt: activePrompt }),
        });
        return;
      }

      if (!activePrompt.trim()) {
        setColumns((prev) => prev.map((c) => (c.id === column.id ? { ...c, status: 'idle' } : c)));
        return;
      }

          const controller = new AbortController();
      activeControllers.current[column.id] = controller;

      let lastLength = 0;
      // Rough estimate of input tokens
      updateUsage(provider, Math.ceil(activePrompt.length / 4));

      const result = await callAI(
        column.modelId,
        provider,
        activePrompt,
        finalKey,
        "You are a helpful AI assistant. Provide a clear, natural language response.",
        modelSettings,
        (partialText) => {
          const now = Date.now();
          
          // Incremental token tracking
          const diff = partialText.length - lastLength;
          if (diff > 0) {
            updateUsage(provider, Math.ceil(diff / 4));
            lastLength = partialText.length;
          }

          if (now - lastUpdate > 30) {
            setColumns((prev) => prev.map((c) => (c.id === column.id ? { ...c, output: partialText } : c)));
            lastUpdate = now;
          }
        },
        0,
        controller.signal,
        column.id,
        { lmStudioBaseUrl, ollamaBaseUrl }
      );
      delete activeControllers.current[column.id];

      const roughTokenCount = Math.floor(result.text.length / 4);
      const tps = result.latency > 0 ? Number(((roughTokenCount / result.latency) * 1000).toFixed(1)) : 0;

      setColumns((prev) =>
        prev.map((c) =>
          c.id === column.id
            ? {
                ...c,
                status: 'success',
                output: result.text,
                metadata: {
                  latency: result.latency,
                  tokens: roughTokenCount,
                  tokensPerSecond: tps,
                },
              }
            : c
        )
      );
    } catch (err: any) {
      setColumns((prev) =>
        prev.map((c) =>
          c.id === column.id
            ? { 
                ...c, 
                status: 'error', 
                error: typeof err === 'string' ? err : (err?.message || (typeof err === 'object' ? JSON.stringify(err) : 'Unknown error occurred'))
              }
            : c
        )
      );
    }
  });

  await Promise.all(promises);
  setIsGlobalLoading(false);

  setColumns((prev) => {
    const successfulCols = prev.filter((c) => c.status === 'success');
    if (successfulCols.length > 0) {
      const historyItem: ComparisonHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        globalPrompt: capturedPrompt || 'Manual Analysis Session',
        timestamp: Date.now(),
        columns: prev.map((c) => ({ modelId: c.modelId, output: c.output, status: c.status as any })),
      };
      setHistory((hPrev) => [historyItem, ...hPrev].slice(0, 50));
      runAnalysis(prev, capturedPrompt);
    }
    return prev;
  });
};

export interface RunAnalysisOptions {
  columns: ComparisonColumn[];
  globalPrompt: string;
  apiKeys: Record<string, string>;
  analysisModel: string;
  ollamaModels: OllamaModel[];
  lmStudioModels: any[];
  currentTab: 'standard' | 'code';
  setIsCodeSession: Dispatch<SetStateAction<boolean>>;
  setAnalysisTab: Dispatch<SetStateAction<'standard' | 'code'>>;
  setAnalysisOutput: Dispatch<SetStateAction<AnalysisJudgement | null>>;
  setIsCodeAnalyzing: Dispatch<SetStateAction<boolean>>;
  setCodeAnalysisOutput: Dispatch<SetStateAction<CodeAnalysisResult | null>>;
  setIsAnalyzing: Dispatch<SetStateAction<boolean>>;
  shouldWarnOnMissingKey?: boolean;
  lmStudioBaseUrl: string;
  ollamaBaseUrl: string;
  updateUsage: (provider: string, tokens: number) => void;
}

export const runAnalysis = async ({
  columns,
  globalPrompt,
  apiKeys,
  analysisModel,
  ollamaModels = [],
  lmStudioModels = [],
  currentTab,
  setIsCodeSession,
  setAnalysisTab,
  setAnalysisOutput,
  setIsCodeAnalyzing,
  setCodeAnalysisOutput,
  setIsAnalyzing,
  shouldWarnOnMissingKey = true,
  lmStudioBaseUrl,
  ollamaBaseUrl,
  updateUsage,
}: RunAnalysisOptions) => {
  BugCollector.logEntry('analysisHelpers', 'runAnalysis', { analysisModel, columns: columns.length });
  
  const successCols = columns.filter((c) => c.status === 'success');
  if (successCols.length < 1) {
    if (shouldWarnOnMissingKey) {
      toast.warning('Add model outputs first. Run comparisons to generate model responses.');
    }
    BugCollector.logExit('analysisHelpers', 'runAnalysis', 'no successful columns');
    return;
  }

  // Use the new structured model resolution - pass local models for proper detection
  const modelConfig = resolveModelConfig(analysisModel, apiKeys, ollamaModels, lmStudioModels, lmStudioBaseUrl, ollamaBaseUrl);
  
  if (!modelConfig) {
    // Try to find an alternative model
    const availableModels = getAvailableAnalysisModels(apiKeys);
    if (availableModels.length > 0) {
      const altConfig = availableModels[0];
      BugCollector.report('analysisHelpers', 'Using fallback model', { original: analysisModel, fallback: altConfig.modelId }, 'medium');
      toast.info(`Using ${altConfig.label} for analysis (${analysisModel} not available)`);
      var finalConfig = altConfig;
    } else {
      if (shouldWarnOnMissingKey) {
        const availableProviders = Object.keys(apiKeys).filter(k => apiKeys[k]?.trim());
        toast.warning(`No API keys available for analysis. Add keys for: ${availableProviders.join(', ') || 'gemini, openrouter, nvidia'}`);
      }
      BugCollector.logExit('analysisHelpers', 'runAnalysis', 'no API keys');
      return;
    }
  } else {
    var finalConfig = modelConfig;
  }

  const activePrompt = globalPrompt;
  const responses = successCols.map((c) => ({ modelId: c.modelId!, output: c.output, localPrompt: c.localPrompt }));
  
  // Strict code detection: requires either a code prompt OR actual code blocks in outputs
  const hasCodeBlocks = successCols.some((c) => /```[\w]*\n/.test(c.output));
  const isCode = isCodePrompt(activePrompt) || hasCodeBlocks;

  setIsCodeSession(isCode);

  // Track input tokens for analysis using the resolved config
  updateUsage(finalConfig.provider, Math.ceil(activePrompt.length / 4));

  // If it's a text prompt but we are on the code tab, switch back
  if (!isCode && currentTab === 'code') {
    setAnalysisTab('standard');
    return runAnalysis({ 
      columns, globalPrompt, apiKeys, analysisModel, ollamaModels, lmStudioModels,
      currentTab: 'standard', setIsCodeSession, setAnalysisTab, setAnalysisOutput,
      setIsCodeAnalyzing, setCodeAnalysisOutput, setIsAnalyzing,
      shouldWarnOnMissingKey, lmStudioBaseUrl, ollamaBaseUrl, updateUsage
    });
  }

  // Determine which analysis to run
  // Only auto-switch to code if it's a high-confidence code prompt
  const shouldRunCodeAnalysis = isCode && (currentTab === 'code' || isCodePrompt(activePrompt));

  if (shouldRunCodeAnalysis) {
    if (currentTab !== 'code') setAnalysisTab('code');
    setAnalysisOutput(null);
    setIsCodeAnalyzing(true);
    setCodeAnalysisOutput(null);
    
    try {
      const result = await runCodeAnalysis(activePrompt, responses, finalConfig);
      
      if (result.success && result.data) {
        setCodeAnalysisOutput(result.data as any);
        BugCollector.logExit('analysisHelpers', 'runAnalysis code', 'success');
      } else {
        BugCollector.report('analysisHelpers', 'Code analysis failed', { error: result.error, debug: result.debugInfo }, 'high');
        setCodeAnalysisOutput(null);
        toast.error(`Code Analysis: ${result.error || 'Analysis failed. Please try again.'}`);
        
        // Fallback to standard if code analysis fails
        setIsCodeAnalyzing(false);
        return runAnalysis({ 
          columns, globalPrompt, apiKeys, analysisModel, ollamaModels, lmStudioModels, 
          currentTab: 'standard', setIsCodeSession, setAnalysisTab, setAnalysisOutput, 
          setIsCodeAnalyzing, setCodeAnalysisOutput, setIsAnalyzing, 
          shouldWarnOnMissingKey: false, lmStudioBaseUrl, ollamaBaseUrl, updateUsage 
        });
      }
    } catch (err: any) {
      BugCollector.logError('analysisHelpers', 'runAnalysis code', err);
      setCodeAnalysisOutput(null);
      toast.error(`Code Analysis: ${err.message || 'Unknown error'}`);
    } finally {
      setIsCodeAnalyzing(false);
    }
    return;
  }

  setAnalysisTab('standard');
  setCodeAnalysisOutput(null);
  setIsAnalyzing(true);
  setAnalysisOutput(null);
  
  try {
    const result = await runStandardAnalysis(activePrompt, responses, finalConfig);
    
    if (result.success && result.data) {
      const parsedResult: AnalysisJudgement = {
        bestResponseId: result.data.bestResponseId,
        consensus: result.data.consensus?.replace(/\{"error"[^}]+\}/g, '[API error]'),
        methodology: result.data.methodology,
        differences: result.data.differences,
        critique: result.data.critique
      };
      setAnalysisOutput(parsedResult);
      BugCollector.logExit('analysisHelpers', 'runAnalysis standard', 'success');
    } else {
      BugCollector.report('analysisHelpers', 'Standard analysis failed', { error: result.error, debug: result.debugInfo }, 'high');
      const displayMsg = `**Analysis failed:** ${result.error || 'Unknown error'}`;
      setAnalysisOutput({ consensus: displayMsg, differences: [], critique: {} });
    }
  } catch (err: any) {
    BugCollector.logError('analysisHelpers', 'runAnalysis standard', err);
    const displayMsg = `**Analysis failed:** ${err.message || 'Unknown error'}`;
    setAnalysisOutput({ consensus: displayMsg, differences: [], critique: {} });
  } finally {
    setIsAnalyzing(false);
  }
};

export const restoreHistory = (
  item: ComparisonHistoryItem,
  setGlobalPrompt: Dispatch<SetStateAction<string>>,
  setColumns: Dispatch<SetStateAction<ComparisonColumn[]>>,
  setActiveMode: Dispatch<SetStateAction<'grid' | 'analysis' | 'history' | 'settings' | 'registry' | 'coder'>>
) => {
  setGlobalPrompt(item.globalPrompt);
  setColumns(
    item.columns.map((c, i) => ({
      id: (i + 1).toString(),
      modelId: c.modelId,
      status: c.status,
      output: c.output,
    }))
  );
  setActiveMode('grid');
  toast.info('Session restored from deep storage.');
};

export const deleteHistoryItem = (
  id: string,
  setHistory: Dispatch<SetStateAction<ComparisonHistoryItem[]>>
) => {
  setHistory((prev) => prev.filter((item) => item.id !== id));
};

export const clearAll = (
  columns: ComparisonColumn[],
  setColumns: Dispatch<SetStateAction<ComparisonColumn[]>>,
  setGlobalPrompt: Dispatch<SetStateAction<string>>,
  setAnalysisOutput: Dispatch<SetStateAction<AnalysisJudgement | null>>
) => {
  // Unload all local models from VRAM immediately
  const localModelIds = columns
    .map((c) => c.modelId)
    .filter((id): id is string => !!id && !AVAILABLE_MODEL_IDS.has(id));
  if (localModelIds.length > 0) {
    import('@/src/lib/api/ollamaClient').then(({ unloadAll }) => unloadAll(localModelIds));
    import('@/src/lib/api/lmStudioClient').then(({ forceUnloadLMStudio }) => {
      localModelIds.forEach((id) => forceUnloadLMStudio(id));
    });
  }

  setGlobalPrompt('');
  setAnalysisOutput(null);
  setColumns(columns.map((c) => ({ ...c, status: 'idle', output: '', error: undefined })));
};
