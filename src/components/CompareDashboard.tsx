/**
 * @file src/components/CompareDashboard.tsx
 * @description Main dashboard entry point, bridged to the new modular CoderPage.
 */

import React, { lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDashboardState } from '@/src/hooks/useDashboardState';
import { Sidebar } from './dashboard/Sidebar';
import { DashboardGrid } from './dashboard/DashboardGrid';
import { DashboardFooter } from './dashboard/DashboardFooter';

// Lazy load non-critical views to reduce initial DOM size and improve LCP
const AnalysisView = lazy(() => import('./dashboard/AnalysisView').then(m => ({ default: m.AnalysisView })));
const HistoryView = lazy(() => import('./dashboard/HistoryView').then(m => ({ default: m.HistoryView })));
import { SettingsView } from './dashboard/SettingsView';
const ModelRegistryView = lazy(() => import('./dashboard/ModelRegistryView').then(m => ({ default: m.ModelRegistryView })));

// Modular Feature Pages
import { CoderPage } from '@/src/features/coder/CoderPage';

import { AVAILABLE_MODELS } from '@/src/config/models';
import { useTheme } from '../context/ThemeContext';
import { ErrorBoundary } from './ErrorBoundary';

// Loading fallback for lazy components
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

export const CompareDashboard: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
  const {
    columns, globalPrompt, setGlobalPrompt, isGlobalLoading,
    activeMode, setActiveMode,
    analysisOutput, isAnalyzing,
    history, setHistory,
    apiKeys, updateApiKey,
    ollamaModels, ollamaStatus, ollamaError, ollamaBaseUrl, fetchOllamaModels,
    lmStudioModels, lmStudioStatus, lmStudioBaseUrl, setLmStudioBaseUrl, fetchLMStudioModels,
    addColumn, removeColumn, updateModel, updateOutput, runComparison, restoreHistory, clearAll, runAnalysis, toggleSelection,
    analysisModel, setAnalysisModel,
    analysisTab, setAnalysisTab,
    codeAnalysisOutput, isCodeAnalyzing, isCodeSession,
    modelSettings, setModelSettings, trackUsage,
    clearApiKeys,
    statuses, refreshStatuses,
    setOllamaBaseUrl,
    localModelsEnabled, setLocalModelsEnabled
  } = useDashboardState(onExit);

  const { theme } = useTheme();

  const hasOutput = React.useMemo(() => columns.some(c => c.status === 'success' || (c.status === 'loading' && c.output)), [columns]);
  const hasHistory = React.useMemo(() => history.length > 0, [history]);

  return (
    <ErrorBoundary>
      <main className={`h-[100dvh] w-screen overflow-hidden flex bg-background text-foreground antialiased selection:bg-primary/20 ${theme === 'dark' ? 'dark' : ''}`}>
        <Sidebar
          activeMode={activeMode}
          setActiveMode={setActiveMode}
          onExit={onExit}
          hasOutput={hasOutput}
          hasHistory={hasHistory}
        />

        {/* Main content — full width on mobile, flex-1 on desktop */}
        <div className="flex-1 flex flex-col w-full h-full min-w-0 bg-background relative overflow-hidden pb-[60px] md:pb-0 dashboard-main-container">
          <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
              <AnimatePresence mode="wait">
                {activeMode === 'grid' ? (
                  <DashboardGrid 
                    key="grid"
                    columns={columns} 
                    ollamaModels={ollamaModels} 
                    lmStudioModels={lmStudioModels}
                    apiKeys={apiKeys}
                    onOpenForge={() => setActiveMode('registry')} 
                    updateOutput={updateOutput} 
                    updateModel={updateModel} 
                    onToggleSelection={toggleSelection}
                    onRemoveColumn={removeColumn}
                    providerStatuses={statuses}
                    ollamaBaseUrl={ollamaBaseUrl}
                    lmStudioBaseUrl={lmStudioBaseUrl}
                    localModelsEnabled={localModelsEnabled}
                    setLocalModelsEnabled={setLocalModelsEnabled}
                  />
                ) : activeMode === 'analysis' ? (
                  <Suspense fallback={<LoadingFallback />}>
                    <AnalysisView 
                      key="analysis"
                      columns={columns}
                      isAnalyzing={isAnalyzing} 
                      analysisOutput={analysisOutput} 
                      setActiveMode={setActiveMode} 
                      runAnalysis={runAnalysis}
                      allModels={AVAILABLE_MODELS}
                      ollamaModels={ollamaModels}
                      lmStudioModels={lmStudioModels}
                      analysisTab={analysisTab}
                      setAnalysisTab={setAnalysisTab}
                      codeAnalysisOutput={codeAnalysisOutput}
                      isCodeAnalyzing={isCodeAnalyzing}
                      isCodeSession={isCodeSession}
                      providerStatuses={statuses}
                      ollamaBaseUrl={ollamaBaseUrl}
                      lmStudioBaseUrl={lmStudioBaseUrl}
                      globalPrompt={globalPrompt}
                      localModelsEnabled={localModelsEnabled}
                      setLocalModelsEnabled={setLocalModelsEnabled}
                      analysisModel={analysisModel}
                      setAnalysisModel={setAnalysisModel}
                    />
                  </Suspense>
                ) : activeMode === 'history' ? (
                  <Suspense fallback={<LoadingFallback />}>
                    <HistoryView 
                      key="history"
                      history={history} 
                      restoreHistory={restoreHistory} 
                    />
                  </Suspense>
                ) : activeMode === 'registry' ? (
                  <Suspense fallback={<LoadingFallback />}>
                    <ModelRegistryView
                      key="registry"
                      columns={columns}
                      ollamaModels={ollamaModels}
                      ollamaStatus={ollamaStatus}
                      ollamaError={ollamaError}
                      lmStudioModels={lmStudioModels}
                      lmStudioStatus={lmStudioStatus}
                      lmStudioBaseUrl={lmStudioBaseUrl}
                      setLmStudioBaseUrl={setLmStudioBaseUrl}
                      onRefreshOllama={fetchOllamaModels}
                      onRefreshLMStudio={fetchLMStudioModels}
                      addColumn={(mid) => {
                        if (addColumn(mid)) setActiveMode('grid');
                      }}
                      apiKeys={apiKeys}
                      providerStatuses={statuses}
                      ollamaBaseUrl={ollamaBaseUrl}
                      setOllamaBaseUrl={setOllamaBaseUrl}
                    />
                  </Suspense>
                ) : activeMode === 'coder' ? (
                  <Suspense fallback={<LoadingFallback />}>
                    <CoderPage
                      key="coder"
                      allModels={AVAILABLE_MODELS}
                      apiKeys={apiKeys}
                      lmStudioBaseUrl={lmStudioBaseUrl}
                      modelSettings={modelSettings}
                      setModelSettings={setModelSettings}
                      trackUsage={trackUsage}
                      ollamaModels={ollamaModels}
                      lmStudioModels={lmStudioModels}
                      ollamaStatus={ollamaStatus}
                      lmStudioStatus={lmStudioStatus}
                      onRefreshOllama={fetchOllamaModels}
                      onRefreshLMStudio={fetchLMStudioModels}
                      providerStatuses={statuses}
                      ollamaBaseUrl={ollamaBaseUrl}
                      localModelsEnabled={localModelsEnabled}
                    />
                  </Suspense>
                ) : (
                  <>
                    <SettingsView 
                      key="settings"
                      apiKeys={apiKeys} 
                      updateApiKey={updateApiKey} 
                      clearApiKeys={clearApiKeys}
                      ollamaBaseUrl={ollamaBaseUrl}
                      setOllamaBaseUrl={setOllamaBaseUrl}
                      lmStudioBaseUrl={lmStudioBaseUrl}
                      setLmStudioBaseUrl={setLmStudioBaseUrl}
                    />
                  </>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {activeMode === 'grid' && columns.length > 0 && (
                <motion.div
                  initial={{ y: 100, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 100, opacity: 0 }}
                  className="shrink-0"
                >
                  <DashboardFooter 
                    globalPrompt={globalPrompt} 
                    setGlobalPrompt={setGlobalPrompt} 
                    runComparison={runComparison} 
                    isGlobalLoading={isGlobalLoading} 
                    onOpenForge={() => setActiveMode('registry')} 
                    columnsCount={columns.length} 
                  />
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </main>
    </ErrorBoundary>
  );
};
