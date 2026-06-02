/**
 * @file src/app/router.tsx
 * @description Plain switch statement routing for NYX features.
 */

import { lazy, Suspense } from 'react';
import { CoderPage } from '@src/features/coder';
import { ChatPage } from '@src/features/chat';
import { SettingsPage } from '@src/features/settings';

const ModelRegistryView = lazy(() =>
  import('@src/features/model-registry').then((m) => ({ default: m.ModelRegistryView }))
);

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full bg-[#0B0E14]">
    <div className="w-6 h-6 border-2 border-[#FF3366] border-t-transparent rounded-full animate-spin" />
  </div>
);

export interface ModelSettings {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  [key: string]: any;
}

export interface ChatSessionHookResult {
  sessions: any[];
  activeSessionId: string | null;
  createNewSession: () => string;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
  clearAllSessions: () => void;
  saveMessage: (sessionId: string, message: any) => void;
  saveSessionMetadata: (sessionId: string, changes: any) => void;
  isLoading: boolean;
}

interface AppRouterProps {
  activeMode: 'chat' | 'coder' | 'registry' | 'settings';
  setActiveMode: (mode: 'chat' | 'coder' | 'registry' | 'settings') => void;
  apiKeys: Record<string, string>;
  chatSettings: ModelSettings;
  setChatSettings: (settings: ModelSettings) => void;
  coderSettings: ModelSettings;
  setCoderSettings: (settings: ModelSettings) => void;
  trackUsage: (provider: string, tokens: number) => void;
  statuses: Record<string, 'online' | 'offline' | 'no-key'>;
  chatSessions: ChatSessionHookResult;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  models: Record<'nyx', string>;
  setModel: (modelId: string) => void;
  updateApiKey: (provider: string, key: string) => void;
  clearApiKeys: () => void;
  modelsState: { chat: string; coder: string };
  setModelsState: React.Dispatch<React.SetStateAction<{ chat: string; coder: string }>>;
  lightningState: any;
  allModels: any[];
  onOpenLightning?: () => void;
}

export function AppRouter({
  activeMode,
  setActiveMode,
  apiKeys,
  chatSettings,
  setChatSettings,
  coderSettings,
  setCoderSettings,
  trackUsage,
  statuses,
  chatSessions,
  sidebarOpen,
  onToggleSidebar,
  models,
  setModel,
  updateApiKey,
  clearApiKeys,
  modelsState,
  setModelsState,
  lightningState,
  allModels,
  onOpenLightning,
}: AppRouterProps) {
  switch (activeMode) {
    case 'settings':
      return (
        <SettingsPage
          apiKeys={apiKeys}
          updateApiKey={updateApiKey}
          clearApiKeys={clearApiKeys}
          activeMode={activeMode}
          setActiveMode={setActiveMode}
          sidebarOpen={sidebarOpen}
        />
      );
    case 'registry':
      return (
        <Suspense fallback={<LoadingFallback />}>
          <ModelRegistryView
            models={models}
            selectModel={setModel}
            apiKeys={apiKeys}
            providerStatuses={statuses}
            activeMode={activeMode}
            setActiveMode={setActiveMode}
            sidebarOpen={sidebarOpen}
          />
        </Suspense>
      );
    case 'chat':
      return (
        <ChatPage
          allModels={allModels}
          apiKeys={apiKeys}
          modelSettings={chatSettings}
          trackUsage={trackUsage}
          setModelSettings={setChatSettings}
          providerStatuses={statuses}
          chatSessions={chatSessions}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={onToggleSidebar}
          activeMode={activeMode}
          setActiveMode={setActiveMode}
          onOpenLightning={onOpenLightning}
          models={{ nyx: modelsState.chat }}
          setModel={(mid) => setModelsState((prev: any) => ({ ...prev, chat: mid }))}
          lightningEnabled={lightningState.lightningEnabledChat}
          lightningDirectives={lightningState.apoDirectives.chat}
          logRollout={lightningState.logRollout}
          submitReward={lightningState.submitReward}
        />
      );
    default:
      return (
        <CoderPage
          allModels={allModels}
          apiKeys={apiKeys}
          modelSettings={coderSettings}
          trackUsage={trackUsage}
          setModelSettings={setCoderSettings}
          providerStatuses={statuses}
          chatSessions={chatSessions}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={onToggleSidebar}
          activeMode={activeMode}
          setActiveMode={setActiveMode}
          onOpenLightning={onOpenLightning}
          models={{ nyx: modelsState.coder }}
          setModel={(mid) => setModelsState((prev: any) => ({ ...prev, coder: mid }))}
          lightningEnabled={lightningState.lightningEnabledCoder}
          lightningDirectives={lightningState.apoDirectives.coder}
          logRollout={lightningState.logRollout}
          submitReward={lightningState.submitReward}
        />
      );
  }
}
