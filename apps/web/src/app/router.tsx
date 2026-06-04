/**
 * @file src/app/router.tsx
 * @description Standard React Router configuration for NYX features using lazy loading.
 */

import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from '@src/shared/components/ErrorBoundary';

const CoderView = lazy(() => import('@src/views/CoderView'));
const ChatView = lazy(() => import('@src/views/ChatView'));
const ModelRegistryView = lazy(() => import('@src/views/ModelRegistryView'));
const SettingsView = lazy(() => import('@src/views/SettingsView'));
const ModelComparisonView = lazy(() => import('@src/views/ModelComparisonView'));

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
  activeMode: 'chat' | 'coder' | 'registry' | 'settings' | 'compare';
  setActiveMode: (mode: 'chat' | 'coder' | 'registry' | 'settings' | 'compare') => void;
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
  return (
    <Routes>
      <Route
        path="/"
        element={
          <LazyRoute name="CoderPage">
            <CoderView
              allModels={allModels}
              apiKeys={apiKeys}
              modelSettings={coderSettings}
              trackUsage={trackUsage}
              setModelSettings={setCoderSettings}
              providerStatuses={statuses}
              chatSessions={chatSessions}
              sidebarOpen={sidebarOpen}
              onToggleSidebar={onToggleSidebar}
              activeMode="coder"
              setActiveMode={setActiveMode as any}
              onOpenLightning={onOpenLightning}
              models={{ nyx: modelsState.coder }}
              setModel={(mid) => setModelsState((prev: any) => ({ ...prev, coder: mid }))}
              lightningEnabled={lightningState.lightningEnabledCoder}
              lightningDirectives={lightningState.apoDirectives.coder}
              logRollout={lightningState.logRollout}
              submitReward={lightningState.submitReward}
            />
          </LazyRoute>
        }
      />
      <Route
        path="/chat"
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
              setActiveMode={setActiveMode as any}
              onOpenLightning={onOpenLightning}
              models={{ nyx: modelsState.chat }}
              setModel={(mid) => setModelsState((prev: any) => ({ ...prev, chat: mid }))}
              lightningEnabled={lightningState.lightningEnabledChat}
              lightningDirectives={lightningState.apoDirectives.chat}
              logRollout={lightningState.logRollout}
              submitReward={lightningState.submitReward}
            />
          </LazyRoute>
        }
      />
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
              setActiveMode={setActiveMode as any}
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
              setActiveMode={setActiveMode as any}
              sidebarOpen={sidebarOpen}
            />
          </LazyRoute>
        }
      />
      <Route
        path="/compare"
        element={
          <LazyRoute name="ModelComparisonView">
            <ModelComparisonView />
          </LazyRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
