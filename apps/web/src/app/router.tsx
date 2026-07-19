/**
 * @file src/app/router.tsx
 * @description Standard React Router configuration for NYX features using lazy loading.
 */

import React, { lazy, Suspense, useState, useEffect } from 'react';
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
  activeMode: string;
  setActiveMode: (mode: string) => void;
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

function KeepAlive({ active, children }: { active: boolean; children: React.ReactNode }) {
  const [hasMounted, setHasMounted] = useState(active);
  
  if (active && !hasMounted) {
    setHasMounted(true);
  }
  
  if (!hasMounted && !active) return null;
  
  return (
    <div className={active ? 'h-full w-full flex flex-col flex-1 overflow-hidden relative' : 'hidden'}>
      {children}
    </div>
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
    <>
      <KeepAlive active={activeMode === 'chat'}>
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
      </KeepAlive>
      
      <KeepAlive active={activeMode === 'registry'}>
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
      </KeepAlive>
      
      <KeepAlive active={activeMode === 'settings'}>
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
      </KeepAlive>

      <KeepAlive active={activeMode === 'memory'}>
        <LazyRoute name="MemoryView">
          <MemoryView />
        </LazyRoute>
      </KeepAlive>
      
      <KeepAlive active={activeMode === 'observability'}>
        <LazyRoute name="ObservabilityView">
          <ObservabilityView />
        </LazyRoute>
      </KeepAlive>
      
      <Routes>
        <Route path="*" element={
          !['chat', 'registry', 'settings', 'memory', 'observability'].includes(activeMode) ? 
          <Navigate to="/" replace /> : null
        } />
      </Routes>
    </>
  );
}
