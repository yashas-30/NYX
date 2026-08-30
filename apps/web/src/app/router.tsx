/**
 * @file src/app/router.tsx
 * @description Instant view router for NYX with pre-loaded routes and sub-50ms KeepAlive tab switching.
 */

import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from '@src/shared/components/ErrorBoundary';

import ChatView from '@src/views/ChatView';
import ModelRegistryView from '@src/views/ModelRegistryView';
import SettingsView from '@src/views/SettingsView';

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
  activeMode: string;
  setActiveMode: (mode: string) => void;
  apiKeys: Record<string, string>;
  trackUsage: (provider: string, tokens: number) => void;
  statuses: Record<string, 'online' | 'offline' | 'no-key'>;
  chatSessions: ChatSessionHookResult;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  models: Record<'nyx', string>;
  setModel: (modelId: string) => void;
  updateApiKey: (provider: string, key: string) => void;
  clearApiKeys: () => void;
  modelsState: { chat: string };
  setModelsState: React.Dispatch<React.SetStateAction<{ chat: string }>>;
  allModels: any[];
  onOpenLightning?: () => void;
}

function KeepAlive({
  active,
  name,
  children,
}: {
  active: boolean;
  name: string;
  children: React.ReactNode;
}) {
  const [hasMounted, setHasMounted] = useState(active);

  if (active && !hasMounted) {
    setHasMounted(true);
  }

  if (!hasMounted && !active) return null;

  return (
    <div
      className={active ? 'h-full w-full flex flex-col flex-1 overflow-hidden relative' : 'hidden'}
    >
      <ErrorBoundary name={name}>{children}</ErrorBoundary>
    </div>
  );
}

export function AppRouter({
  activeMode,
  setActiveMode,
  apiKeys,
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
  allModels,
  onOpenLightning,
}: AppRouterProps) {
  return (
    <>
      <KeepAlive active={activeMode === 'chat'} name="ChatPage">
        <ChatView
          allModels={allModels}
          apiKeys={apiKeys}
          trackUsage={trackUsage}
          providerStatuses={statuses}
          chatSessions={chatSessions}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={onToggleSidebar}
          activeMode="chat"
          setActiveMode={(mode: string) => setActiveMode(mode as any)}
          onOpenLightning={onOpenLightning}
          models={{ nyx: modelsState.chat }}
          setModel={(mid) => setModelsState((prev: any) => ({ ...prev, chat: mid }))}
        />
      </KeepAlive>

      <KeepAlive active={activeMode === 'registry'} name="ModelRegistryView">
        <ModelRegistryView
          models={models}
          selectModel={setModel}
          apiKeys={apiKeys}
          providerStatuses={statuses}
          activeMode="registry"
          setActiveMode={(mode: string) => setActiveMode(mode as any)}
          sidebarOpen={sidebarOpen}
        />
      </KeepAlive>

      <KeepAlive active={activeMode === 'settings'} name="SettingsPage">
        <SettingsView
          apiKeys={apiKeys}
          updateApiKey={updateApiKey}
          clearApiKeys={clearApiKeys}
          activeMode="settings"
          setActiveMode={(mode: string) => setActiveMode(mode as any)}
          sidebarOpen={sidebarOpen}
        />
      </KeepAlive>

      <Routes>
        <Route
          path="*"
          element={
            !['chat', 'registry', 'settings'].includes(activeMode) ? (
              <Navigate to="/" replace />
            ) : null
          }
        />
      </Routes>
    </>
  );
}
