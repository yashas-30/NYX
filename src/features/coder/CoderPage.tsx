/**
 * @file src/features/coder/CoderPage.tsx
 * @description The standalone Coder feature page — NYX is the sole agent.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { Folder, Monitor, ChevronDown, PanelLeftOpen } from 'lucide-react';
import { FREE_OPENCODE_MODELS } from '@src/config/models';
import { ModelDefinition, Provider } from '@src/infrastructure/types';
import { toast } from '@src/shared/components/ui/sonner';

import { CoderHeader, MessageList, PromptInput } from './components';
import { AgentPlanner } from './components/AgentPlanner';
import { getCustomModelIcon } from './utils/modelIcons';
import { useCoderLogic } from './hooks/useCoderLogic';

interface CoderPageProps {
  allModels: any[];
  apiKeys: Record<string, string>;
  modelSettings: any;
  trackUsage: (provider: string, tokens: number) => void;
  setModelSettings: (settings: any) => void;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  gatewayUrls?: Record<string, string>;
  activeMode?: 'coder' | 'registry' | 'settings';
  setActiveMode?: (mode: 'coder' | 'registry' | 'settings') => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  chatSessions: any;

  // Lifted state props:
  activeAgent: 'nyx';
  isLoading: boolean;
  history: any[];
  metrics: any;
  models: Record<'nyx', string>;
  setModel: (modelId: string) => void;
  runCoder: (prompt: string) => void;
  stopCoder: () => void;
  clearHistory: () => void;
  suggestedPrompts: string[];
  subagentTasks: any[];
  webSearchEnabled: boolean;
  setWebSearchEnabled: (val: boolean) => void;
  codebaseKnowledgeEnabled: boolean;
  setCodebaseKnowledgeEnabled: (val: boolean) => void;
  mode: 'chat' | 'code';
}

export const CoderPage: React.FC<CoderPageProps> = ({
  allModels,
  apiKeys,
  modelSettings,
  trackUsage,
  setModelSettings,
  providerStatuses = {},
  gatewayUrls = {},
  activeMode = 'coder',
  setActiveMode,
  sidebarOpen = true,
  onToggleSidebar,
  chatSessions,

  // Destructure lifted props:
  activeAgent,
  isLoading,
  history,
  metrics,
  models,
  setModel,
  runCoder,
  stopCoder,
  clearHistory,
  suggestedPrompts,
  subagentTasks,
  webSearchEnabled,
  setWebSearchEnabled,
  codebaseKnowledgeEnabled,
  setCodebaseKnowledgeEnabled,
  mode,
}) => {

  const [prompt, setPrompt] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const currentModelId = models['nyx'];
  
  const mergedModels = useMemo(() => {
    const seenIds = new Set();
    return [...allModels, ...FREE_OPENCODE_MODELS].filter(m => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
  }, [allModels]);

  const currentModel = useMemo(() => {
    if (!currentModelId) return null;
    return mergedModels.find(m => m.id === currentModelId) || null;
  }, [currentModelId, mergedModels]);

  const badgeStatus = useMemo(() => {
    if (isLoading) return 'loading';
    if (!currentModel) return 'no_key';
    const provider = currentModel.provider;
    const status = providerStatuses[provider];
    if (status === 'online') return 'success';
    if (status === 'offline') return 'offline';
    if (status === 'no-key') return 'no_key';
    return 'success';
  }, [isLoading, currentModel, providerStatuses]);

  const handleSubmit = useCallback((finalPrompt: string) => {
    if (!finalPrompt.trim() || isLoading) return;
    if (!currentModelId) {
      toast.error('Please select a model first');
      return;
    }
    runCoder(finalPrompt);
    setPrompt('');
  }, [isLoading, currentModelId, runCoder]);

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Code copied to clipboard');
  }, []);

  return (
    <motion.div
      key="coder"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="h-full w-full flex flex-col min-h-0 overflow-hidden"
    >
      <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden relative bg-background">
        <CoderHeader
          activeMode={activeMode}
          onModeChange={setActiveMode}
          metrics={metrics}
          isLoading={isLoading}
          badgeStatus={badgeStatus}
          onClear={clearHistory}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={onToggleSidebar}
          sessionTitle={chatSessions?.activeSession?.title || 'New chat'}
        />
        {mode === 'code' && subagentTasks && subagentTasks.length > 0 && (
          <div className="px-6 pt-3 shrink-0">
            <AgentPlanner subagentTasks={subagentTasks} isLoading={isLoading} />
          </div>
        )}

        {history.length === 0 && !isLoading ? (
          <div className="flex-1 w-full flex flex-col items-center justify-center p-6 relative">
            {/* Main centered box */}
            <div className="w-full max-w-2xl flex flex-col gap-3.5 mb-12 animate-fade-in">
              {/* Project Selector (Folder Pill) */}
              {mode === 'code' && (
                <div className="flex justify-start pl-1">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider text-zinc-400 border border-white/[0.04] bg-card hover:bg-white/[0.03] transition-all cursor-pointer select-none">
                    <Folder size={12} className="text-zinc-500 fill-zinc-500/10" />
                    <span>NYX</span>
                    <ChevronDown size={10} className="text-zinc-500 opacity-60" />
                  </div>
                </div>
              )}

              {/* Prompt Input Box */}
              <div className="w-full">
                <PromptInput
                  prompt={prompt}
                  onPromptChange={setPrompt}
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                  onStop={stopCoder}
                  currentModelId={currentModelId}
                  currentModel={currentModel}
                  allModels={allModels}
                  providerStatuses={providerStatuses}
                  gatewayUrls={gatewayUrls}
                  onModelSelect={setModel}
                  onClearHistory={clearHistory}
                  onModelSettingsChange={setModelSettings}
                  modelSettings={modelSettings}
                  suggestedPrompts={suggestedPrompts}
                  getCustomModelIcon={getCustomModelIcon}
                  webSearchEnabled={webSearchEnabled}
                  onWebSearchToggle={setWebSearchEnabled}
                  codebaseKnowledgeEnabled={codebaseKnowledgeEnabled}
                  onCodebaseKnowledgeToggle={setCodebaseKnowledgeEnabled}
                  mode={mode}
                  alignDropdown="bottom"
                />
              </div>

              {/* Local Selector Pill (Laptop Pill) */}
              {mode === 'code' && (
                <div className="flex justify-start pl-1">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider text-zinc-400 border border-white/[0.04] bg-card hover:bg-white/[0.03] transition-all cursor-pointer select-none">
                    <Monitor size={12} className="text-zinc-500" />
                    <span>Local</span>
                    <ChevronDown size={10} className="text-zinc-500 opacity-60" />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <MessageList
              history={history}
              activeAgent={activeAgent}
              isLoading={isLoading}
              onCopy={copyToClipboard}
              copiedId={copiedId}
              suggestedPrompts={suggestedPrompts}
              onSuggestedPromptClick={setPrompt}
              subagentTasks={subagentTasks}
            />

            <PromptInput
              prompt={prompt}
              onPromptChange={setPrompt}
              onSubmit={handleSubmit}
              isLoading={isLoading}
              onStop={stopCoder}
              currentModelId={currentModelId}
              currentModel={currentModel}
              allModels={allModels}
              providerStatuses={providerStatuses}
              gatewayUrls={gatewayUrls}
              onModelSelect={setModel}
              onClearHistory={clearHistory}
              onModelSettingsChange={setModelSettings}
              modelSettings={modelSettings}
              suggestedPrompts={suggestedPrompts}
              getCustomModelIcon={getCustomModelIcon}
              webSearchEnabled={webSearchEnabled}
              onWebSearchToggle={setWebSearchEnabled}
              codebaseKnowledgeEnabled={codebaseKnowledgeEnabled}
              onCodebaseKnowledgeToggle={setCodebaseKnowledgeEnabled}
              mode={mode}
              alignDropdown="top"
            />
          </>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: rgba(255, 255, 255, 0.05); 
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(var(--primary), 0.2); }
      `}} />
    </motion.div>
  );
};
