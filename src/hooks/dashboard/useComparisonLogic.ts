import { useState, useCallback, useRef } from 'react';
import { ComparisonColumn, ComparisonHistoryItem, AnalysisJudgement, CodeAnalysisResult } from '@/src/types';
import { 
  addColumn as addColumnHelper,
  removeColumn as removeColumnHelper,
  toggleSelection as toggleSelectionHelper,
  updateModel as updateModelHelper,
  updateOutput as updateOutputHelper,
  unloadLocalIfNeeded
} from '@/src/lib/state/columnHelpers';
import {
  runAnalysis as runAnalysisHelper,
  runComparison as runComparisonHelper,
  clearAll as clearAllHelper,
  restoreHistory as restoreHistoryHelper
} from '@/src/lib/state/analysisHelpers';
import { abortGeneration } from '@/src/lib/state/abortHelpers';

export const useComparisonLogic = (
  apiKeys: Record<string, string>,
  ollamaModels: any[],
  lmStudioModels: any[],
  modelSettings: any,
  trackUsage: (p: string, t: number) => void,
  lmStudioBaseUrl: string,
  ollamaBaseUrl: string
) => {
  const [columns, setColumns] = useState<ComparisonColumn[]>([]);
  const [globalPrompt, setGlobalPrompt] = useState('');
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [analysisOutput, setAnalysisOutput] = useState<AnalysisJudgement | null>(null);
  const [codeAnalysisOutput, setCodeAnalysisOutput] = useState<CodeAnalysisResult | null>(null);
  const [analysisTab, setAnalysisTab] = useState<'standard' | 'code'>('standard');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCodeAnalyzing, setIsCodeAnalyzing] = useState(false);
  const [analysisModel, setAnalysisModel] = useState('gemini-3.1-pro-preview');
  const [isCodeSession, setIsCodeSession] = useState(false);
  const [history, setHistory] = useState<ComparisonHistoryItem[]>([]);
  const [shakingColumnId, setShakingColumnId] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState('');

  const activeControllers = useRef<Record<string, AbortController>>({});

  const abortGenerationLocal = useCallback((columnId: string) => {
    abortGeneration(activeControllers, columnId);
  }, []);

  const addColumn = useCallback((modelId?: string) => {
    return addColumnHelper(setColumns, setShakingColumnId, modelId);
  }, []);

  const removeColumn = useCallback((id: string) => {
    removeColumnHelper(setColumns, abortGenerationLocal, unloadLocalIfNeeded, id);
  }, [abortGenerationLocal]);

  const toggleSelection = useCallback((id: string) => {
    toggleSelectionHelper(setColumns, id);
  }, []);

  const updateModel = useCallback((id: string, modelId: string) => {
    updateModelHelper(setColumns, abortGenerationLocal, setShakingColumnId, id, modelId, unloadLocalIfNeeded);
  }, [abortGenerationLocal]);

  const updateOutput = useCallback((id: string, updates: Partial<ComparisonColumn>) => {
    updateOutputHelper(setColumns, id, updates);
  }, []);

  const runAnalysis = useCallback(async (columnsToAnalyze?: ComparisonColumn[], globalPromptOverride?: string) => {
    const activeCols = Array.isArray(columnsToAnalyze) ? columnsToAnalyze : columns;
    if (activeCols.filter((c) => c.status === 'success').length < 1) return;

    const effectivePrompt = globalPromptOverride || globalPrompt || lastPrompt;
    if (globalPromptOverride) {
      setLastPrompt(globalPromptOverride);
    }

    await runAnalysisHelper({
      columns: activeCols,
      globalPrompt: effectivePrompt,
      apiKeys,
      analysisModel,
      ollamaModels,
      lmStudioModels,
      currentTab: analysisTab,
      setIsCodeSession,
      setAnalysisTab,
      setAnalysisOutput,
      setIsCodeAnalyzing,
      setCodeAnalysisOutput,
      setIsAnalyzing,
      shouldWarnOnMissingKey: !columnsToAnalyze,
      lmStudioBaseUrl,
      ollamaBaseUrl,
      updateUsage: trackUsage,
    });
  }, [columns, globalPrompt, lastPrompt, apiKeys, analysisModel, ollamaModels, lmStudioModels, analysisTab, trackUsage, lmStudioBaseUrl, ollamaBaseUrl]);

  const runComparison = useCallback(async () => {
    await runComparisonHelper({
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
      abortGeneration: abortGenerationLocal,
      activeControllers,
      runAnalysis,
      lmStudioBaseUrl,
      ollamaBaseUrl,
      updateUsage: trackUsage,
    });
  }, [columns, globalPrompt, apiKeys, ollamaModels, lmStudioModels, modelSettings, isGlobalLoading, abortGenerationLocal, runAnalysis, lmStudioBaseUrl, ollamaBaseUrl, trackUsage]);

  const restoreHistory = useCallback((item: ComparisonHistoryItem, setActiveMode: (m: any) => void) => {
    restoreHistoryHelper(item, setGlobalPrompt, setColumns, setActiveMode);
  }, []);

  const clearAll = useCallback(() => {
    clearAllHelper(columns, setColumns, setGlobalPrompt, setAnalysisOutput);
  }, [columns]);

  return {
    columns, setColumns,
    globalPrompt, setGlobalPrompt,
    isGlobalLoading, setIsGlobalLoading,
    analysisOutput, setAnalysisOutput,
    codeAnalysisOutput, setCodeAnalysisOutput,
    analysisTab, setAnalysisTab,
    isAnalyzing, setIsAnalyzing,
    isCodeAnalyzing, setIsCodeAnalyzing,
    analysisModel, setAnalysisModel,
    isCodeSession, setIsCodeSession,
    history, setHistory,
    shakingColumnId, setShakingColumnId,
    lmStudioBaseUrl, ollamaBaseUrl,
    addColumn, removeColumn, toggleSelection, updateModel, updateOutput, runAnalysis, runComparison, restoreHistory, clearAll
  };
};
