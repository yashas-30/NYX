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

interface AppRouterProps {
  activeMode: 'chat' | 'coder' | 'registry' | 'settings';
  setActiveMode: (mode: 'chat' | 'coder' | 'registry' | 'settings') => void;
  apiKeys: Record<string, string>;
  modelSettings: any;
  trackUsage: (provider: string, tokens: number) => void;
  setModelSettings: (settings: any) => void;
  statuses: Record<string, 'online' | 'offline' | 'no-key'>;
  chatSessions: any;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  models: Record<'nyx', string>;
  setModel: (modelId: string) => void;
  updateApiKey: (provider: string, key: string) => void;
  clearApiKeys: () => void;
  coderState: any;
  chatState: any;
  allModels: any[];
  onOpenLightning?: () => void;
}

export function AppRouter({
  activeMode,
  setActiveMode,
  apiKeys,
  modelSettings,
  trackUsage,
  setModelSettings,
  statuses,
  chatSessions,
  sidebarOpen,
  onToggleSidebar,
  models,
  setModel,
  updateApiKey,
  clearApiKeys,
  coderState,
  chatState,
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
          modelSettings={modelSettings}
          trackUsage={trackUsage}
          setModelSettings={setModelSettings}
          providerStatuses={statuses}
          chatSessions={chatSessions}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={onToggleSidebar}
          activeMode={activeMode}
          setActiveMode={setActiveMode}
          onOpenLightning={onOpenLightning}
          {...chatState}
        />
      );
    default:
      return (
        <CoderPage
          allModels={allModels}
          apiKeys={apiKeys}
          modelSettings={modelSettings}
          trackUsage={trackUsage}
          setModelSettings={setModelSettings}
          providerStatuses={statuses}
          chatSessions={chatSessions}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={onToggleSidebar}
          activeMode={activeMode}
          setActiveMode={setActiveMode}
          onOpenLightning={onOpenLightning}
          {...coderState}
        />
      );
  }
}
