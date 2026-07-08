/**
 * @file src/app/router.tsx
 * @description Standard React Router configuration for NYX features using lazy loading.
 */

import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from '@src/shared/components/ErrorBoundary';

const ChatView = lazy(() => import('@src/views/ChatView'));
const ModelRegistryView = lazy(() => import('@src/views/ModelRegistryView'));
const SettingsView = lazy(() => import('@src/views/SettingsView'));

const MemoryView = lazy(() => import('@src/features/memory/MemoryView'));
const ObservabilityView = lazy(() => import('@src/features/observability/ObservabilityView'));

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full bg-background">
    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-md animate-spin" />
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
  activeMode: 'chat' | 'registry' | 'settings' | 'memory';
  setActiveMode: (mode: 'chat' | 'registry' | 'settings' | 'memory') => void;
  apiKeys: Record<string, string>;
  chatSettings: ModelSettings;
  setChatSettings: (settings: ModelSettings) => void;
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

function LazyRoute({ children, name }: { children: React.ReactNode; name: string }) {
  return (
    <ErrorBoundary name={name}>
      <Suspense fallback={<LoadingFallback />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

export function AppRouter({
  activeMode,
  setActiveMode,
  apiKeys,
  chatSettings,
  setChatSettings,
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
    <Routes>
      <Route
        path="/"
        element={
          <LazyRoute name="ChatPage">
            <ChatView
              allModels={allModels}
              apiKeys={apiKeys}
              modelSettings={chatSettings}
              trackUsage={trackUsage}
              setModelSettings={setChatSettings}
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
          </LazyRoute>
        }
      />
      <Route path="/chat" element={<Navigate to="/" replace />} />
      <Route
        path="/models"
        element={
          <LazyRoute name="ModelRegistryView">
            <ModelRegistryView
              models={models}
              selectModel={setModel}
              apiKeys={apiKeys}
              providerStatuses={statuses}
              activeMode="registry"
              setActiveMode={(mode: string) => setActiveMode(mode as any)}
              sidebarOpen={sidebarOpen}
            />
          </LazyRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <LazyRoute name="SettingsPage">
            <SettingsView
              apiKeys={apiKeys}
              updateApiKey={updateApiKey}
              clearApiKeys={clearApiKeys}
              activeMode="settings"
              setActiveMode={(mode: string) => setActiveMode(mode as any)}
              sidebarOpen={sidebarOpen}
            />
          </LazyRoute>
        }
      />

      <Route path="/memory" element={<LazyRoute name="MemoryView"><MemoryView /></LazyRoute>} />
      <Route path="/observability" element={<LazyRoute name="ObservabilityView"><ObservabilityView /></LazyRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
