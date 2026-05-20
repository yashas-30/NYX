/**
 * @file src/components/CoderDashboard.tsx
 * @description Simplified dashboard showing CoderPage by default with top bar navigation.
 */

import React, { lazy, Suspense, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboardState } from '@/src/hooks/useDashboardState';
import { CoderPage } from '@/src/features/coder/CoderPage';
import { SettingsView } from './dashboard/SettingsView';
import { AVAILABLE_MODELS } from '@/src/config/models';
import { useTheme } from '../context/ThemeContext';
import { ErrorBoundary } from './ErrorBoundary';

const ModelRegistryView = lazy(() => import('./dashboard/ModelRegistryView').then(m => ({ default: m.ModelRegistryView })));

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Loading</span>
    </div>
  </div>
);

type ViewMode = 'coder' | 'registry' | 'settings';

export const CoderDashboard: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
  const [activeMode, setActiveMode] = useState<ViewMode>('coder');
  
  const [localModelsEnabled, setLocalModelsEnabled] = useState(true);

  const {
    apiKeys, updateApiKey, clearApiKeys,
    ollamaModels, ollamaStatus, ollamaError, ollamaBaseUrl, setOllamaBaseUrl, fetchOllamaModels,
    lmStudioModels, lmStudioStatus, lmStudioBaseUrl, setLmStudioBaseUrl, fetchLMStudioModels,
    modelSettings, setModelSettings, trackUsage,
    statuses,
    activeAgent, setActiveAgent,
    models, setModel
  } = useDashboardState(onExit);

  const { theme } = useTheme();

  return (
    <ErrorBoundary>
      <main className={`h-[100dvh] w-screen overflow-hidden flex flex-col bg-gradient-to-br from-[#FAF7F2] via-[#F3EFE3] to-[#EDE8DE] dark:from-[#131315] dark:via-[#161618] dark:to-[#1A1A1E] text-foreground antialiased selection:bg-primary/20 ${theme === 'dark' ? 'dark' : ''}`}>
        
        {/* Main Content */}
        <div className="flex-1 relative overflow-hidden">
          <AnimatePresence mode="wait">
            {activeMode === 'coder' ? (
              <motion.div
                key="coder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
              >
                <CoderPage
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
                  activeAgent={activeAgent}
                  setActiveAgent={setActiveAgent}
                  models={models}
                  setModel={setModel}
                  activeMode={activeMode}
                  setActiveMode={setActiveMode}
                />
              </motion.div>
            ) : activeMode === 'registry' ? (
              <motion.div
                key="registry"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
              >
                <Suspense fallback={<LoadingFallback />}>
                  <ModelRegistryView
                    models={models}
                    ollamaModels={ollamaModels}
                    ollamaStatus={ollamaStatus}
                    ollamaError={ollamaError}
                    lmStudioModels={lmStudioModels}
                    lmStudioStatus={lmStudioStatus}
                    lmStudioBaseUrl={lmStudioBaseUrl}
                    setLmStudioBaseUrl={setLmStudioBaseUrl}
                    onRefreshOllama={fetchOllamaModels}
                    onRefreshLMStudio={fetchLMStudioModels}
                    selectModel={(mid) => {
                      setModel(mid);
                      setActiveMode('coder');
                    }}
                    apiKeys={apiKeys}
                    providerStatuses={statuses}
                    ollamaBaseUrl={ollamaBaseUrl}
                    setOllamaBaseUrl={setOllamaBaseUrl}
                    activeMode={activeMode}
                    setActiveMode={setActiveMode}
                  />
                </Suspense>
              </motion.div>
            ) : (
              <motion.div
                key="settings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 overflow-auto"
              >
                <SettingsView 
                  apiKeys={apiKeys} 
                  updateApiKey={updateApiKey} 
                  clearApiKeys={clearApiKeys}
                  ollamaBaseUrl={ollamaBaseUrl}
                  setOllamaBaseUrl={setOllamaBaseUrl}
                  lmStudioBaseUrl={lmStudioBaseUrl}
                  setLmStudioBaseUrl={setLmStudioBaseUrl}
                  activeMode={activeMode}
                  setActiveMode={setActiveMode}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </ErrorBoundary>
  );
};

// Top Bar Button Component
const TopBarButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`
      flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium
      transition-all duration-200
      ${active 
        ? 'bg-primary/10 text-primary' 
        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}
    `}
  >
    <span className="w-4 h-4">{icon}</span>
    <span>{label}</span>
  </button>
);

// Icons
const CoderIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const RegistryIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);