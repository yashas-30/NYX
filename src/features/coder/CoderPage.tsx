/**
 * @file src/features/coder/CoderPage.tsx
 * @description The standalone Coder feature page — NYX is the sole agent.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FREE_OPENCODE_MODELS } from '@/src/config/models';
import { ModelDefinition, Provider } from '@/src/core/types';
import { toast } from 'sonner';

import { MessageList, PromptInput } from './components';
import { getCustomModelIcon } from './utils/modelIcons';
import { useCoderLogic } from './hooks/useCoderLogic';

interface CoderPageProps {
  allModels: any[];
  apiKeys: Record<string, string>;
  lmStudioBaseUrl: string;
  modelSettings: any;
  trackUsage: (provider: string, tokens: number) => void;
  ollamaModels: any[];
  lmStudioModels: any[];
  ollamaStatus: string;
  lmStudioStatus: string;
  onRefreshOllama: () => void;
  onRefreshLMStudio: () => void;
  setModelSettings: (settings: any) => void;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  ollamaBaseUrl: string;
  gatewayUrls?: Record<string, string>;
  localModelsEnabled?: boolean;
  setLocalModelsEnabled?: (enabled: boolean) => void;
  models?: Record<'nyx', string>;
  setModel?: (modelId: string) => void;
  activeMode?: 'coder' | 'registry' | 'settings';
  setActiveMode?: (mode: 'coder' | 'registry' | 'settings') => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  chatSessions: any;
}

export const CoderPage: React.FC<CoderPageProps> = ({
  allModels,
  apiKeys,
  lmStudioBaseUrl,
  modelSettings,
  trackUsage,
  ollamaModels,
  lmStudioModels,
  ollamaStatus,
  lmStudioStatus,
  onRefreshOllama,
  onRefreshLMStudio,
  setModelSettings,
  providerStatuses = {},
  ollamaBaseUrl,
  gatewayUrls = {},
  localModelsEnabled = false,
  setLocalModelsEnabled = () => {},
  models: propModels,
  setModel: propSetModel,
  activeMode = 'coder',
  setActiveMode,
  sidebarOpen = true,
  onToggleSidebar,
  chatSessions,
}) => {
  const {
    activeAgent,
    isLoading,
    history,
    metrics,
    models, setModel,
    runCoder, stopCoder, clearHistory,
    agentPersonas, suggestedPrompts,
    webSearchEnabled, setWebSearchEnabled,
    codebaseKnowledgeEnabled, setCodebaseKnowledgeEnabled
  } = useCoderLogic({
    apiKeys,
    lmStudioBaseUrl,
    modelSettings,
    trackUsage,
    ollamaModels,
    lmStudioModels,
    ollamaBaseUrl,
    models: propModels,
    setModel: propSetModel,
    chatSessions
  });

  const [prompt, setPrompt] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const currentModelId = models['nyx'];
  
  const mergedModels = useMemo(() => {
    const localOllama: ModelDefinition[] = (ollamaModels || []).map(m => ({
      id: m.name,
      name: m.name,
      provider: 'ollama' as Provider,
      isLocal: true,
      description: m.size ? `Local Ollama (${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB)` : 'Local Ollama model',
      specs: { contextWindow: 'Dynamic', maxOutput: 'Dynamic', modality: 'Text' }
    }));
    
    const localLMStudio: ModelDefinition[] = (lmStudioModels || []).map(m => ({
      id: m.id || m.name,
      name: m.name,
      provider: 'lmstudio' as Provider,
      isLocal: true,
      description: 'Local LM Studio model',
      specs: { contextWindow: 'Dynamic', maxOutput: 'Dynamic', modality: 'Text' }
    }));

    const seenIds = new Set();
    return [...allModels, ...localOllama, ...localLMStudio, ...FREE_OPENCODE_MODELS].filter(m => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
  }, [allModels, ollamaModels, lmStudioModels]);

  const currentModel = useMemo(() => {
    if (!currentModelId) return null;
    return mergedModels.find(m => m.id === currentModelId) || null;
  }, [currentModelId, mergedModels]);

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
      <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden relative">
        <MessageList
          history={history}
          activeAgent={activeAgent}
          isLoading={isLoading}
          onCopy={copyToClipboard}
          copiedId={copiedId}
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
          ollamaModels={ollamaModels}
          lmStudioModels={lmStudioModels}
          providerStatuses={providerStatuses}
          ollamaBaseUrl={ollamaBaseUrl}
          lmStudioBaseUrl={lmStudioBaseUrl}
          gatewayUrls={gatewayUrls}
          localModelsEnabled={localModelsEnabled}
          onSetLocalModelsEnabled={setLocalModelsEnabled}
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
        />
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
