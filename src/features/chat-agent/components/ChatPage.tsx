/**
 * @file src/features/chat-agent/components/ChatPage.tsx
 * @description The standalone Chat feature page — NYX is the sole agent.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';
import { FREE_OPENCODE_MODELS } from '@src/features/model-registry/config/models';
import { ModelDefinition } from '@src/infrastructure/types';
import { toast } from '@src/shared/components/ui/sonner';

import { ChatHeader } from './ChatHeader';
import { ChatMessageList } from './ChatMessageList';
import { ChatPromptInput } from './ChatPromptInput';
import { getCustomModelIcon } from '@src/features/coder/utils/modelIcons';

interface ChatPageProps {
  allModels: any[];
  apiKeys: Record<string, string>;
  modelSettings: any;
  trackUsage: (provider: string, tokens: number) => void;
  setModelSettings: (settings: any) => void;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  gatewayUrls?: Record<string, string>;
  activeMode?: 'chat' | 'coder' | 'registry' | 'settings';
  setActiveMode?: (mode: 'chat' | 'coder' | 'registry' | 'settings') => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  chatSessions: any;

  // Lifted state props:
  activeAgent: 'nyx';
  isLoading: boolean;
  isSearching: boolean;
  history: any[];
  metrics: any;
  models: Record<'nyx', string>;
  setModel: (modelId: string) => void;
  runChat: (prompt: string, images?: { name: string; mimeType: string; data: string }[]) => void;
  stopChat: () => void;
  clearHistory: () => void;
  suggestedPrompts: string[];
  webSearchEnabled: boolean;
  setWebSearchEnabled: (val: boolean) => void;
  onOpenLightning?: () => void;
  submitReward?: (id: string, reward: number) => void;

  // Microsoft Lightning:
  lightningEnabled?: boolean;
  lightningDirectives?: string[];
}

export const ChatPage: React.FC<ChatPageProps> = ({
  allModels,
  apiKeys,
  modelSettings,
  trackUsage,
  setModelSettings,
  providerStatuses = {},
  gatewayUrls = {},
  activeMode = 'chat',
  setActiveMode,
  sidebarOpen = true,
  onToggleSidebar,
  chatSessions,

  // Destructure lifted props:
  activeAgent,
  isLoading,
  isSearching,
  history,
  metrics,
  models,
  setModel,
  runChat,
  stopChat,
  clearHistory,
  suggestedPrompts,
  webSearchEnabled,
  setWebSearchEnabled,
  onOpenLightning,
  submitReward,

  // Microsoft Lightning:
  lightningEnabled = true,
  lightningDirectives = [],
}) => {
  const [prompt, setPrompt] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [scraplingStatus, setScraplingStatus] = useState<'checking' | 'online' | 'offline'>(
    'checking'
  );

  // Real-time local Scrapling connectivity check
  useEffect(() => {
    let active = true;
    const checkScrapling = async () => {
      try {
        const res = await fetch('http://localhost:3002/health');
        if (!active) return;
        if (res.ok) {
          setScraplingStatus('online');
        } else {
          setScraplingStatus('offline');
        }
      } catch {
        if (!active) return;
        setScraplingStatus('offline');
      }
    };
    checkScrapling();
    const interval = setInterval(checkScrapling, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const currentModelId = models['nyx'];

  const mergedModels = useMemo(() => {
    const seenIds = new Set();
    return [...allModels, ...FREE_OPENCODE_MODELS].filter((m) => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
  }, [allModels]);

  const currentModel = useMemo(() => {
    if (!currentModelId) return null;
    return mergedModels.find((m) => m.id === currentModelId) || null;
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

  const handleSubmit = useCallback(
    (finalPrompt: string, images?: { name: string; mimeType: string; data: string }[]) => {
      if ((!finalPrompt.trim() && (!images || images.length === 0)) || isLoading) return;
      if (!currentModelId) {
        toast.error('Please select a model first');
        return;
      }
      runChat(finalPrompt, images);
      setPrompt('');
    },
    [isLoading, currentModelId, runChat]
  );

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Message copied to clipboard');
  }, []);

  return (
    <motion.div
      key="chat"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="h-full w-full flex flex-col min-h-0 overflow-hidden"
    >
      <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden relative bg-background">
        <ChatHeader
          metrics={metrics}
          isLoading={isLoading}
          isSearching={isSearching}
          webSearchEnabled={webSearchEnabled}
          onClear={clearHistory}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={onToggleSidebar}
          sessionTitle={chatSessions?.activeSession?.title || 'New chat'}
          onOpenLightning={onOpenLightning}
        />

        {history.length === 0 && !isLoading ? (
          <div className="flex-1 w-full flex flex-col items-center justify-center p-6 relative">
            <div className="w-full max-w-2xl flex flex-col gap-3.5 mb-12 animate-fade-in">
              <div className="w-full">
                <ChatPromptInput
                  prompt={prompt}
                  onPromptChange={setPrompt}
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                  isSearching={isSearching}
                  onStop={stopChat}
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
                  alignDropdown="bottom"
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            <ChatMessageList
              history={history}
              activeAgent={activeAgent}
              isLoading={isLoading}
              onCopy={copyToClipboard}
              copiedId={copiedId}
              suggestedPrompts={suggestedPrompts}
              onSuggestedPromptClick={setPrompt}
              submitReward={submitReward}
            />

            <ChatPromptInput
              prompt={prompt}
              onPromptChange={setPrompt}
              onSubmit={handleSubmit}
              isLoading={isLoading}
              isSearching={isSearching}
              onStop={stopChat}
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
              alignDropdown="top"
            />
          </>
        )}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: rgba(255, 255, 255, 0.05); 
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(var(--primary), 0.2); }
      `,
        }}
      />
    </motion.div>
  );
};
