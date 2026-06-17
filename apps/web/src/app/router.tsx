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
const WorkspaceCanvas = lazy(() => import('@src/components/workspace/Canvas').then(m => ({ default: m.InfiniteCanvas })));
const ModelComparisonView = lazy(() => import('@src/views/ModelComparisonView'));

// New Feature Views
const PluginsView = lazy(() => import('@src/features/plugins/PluginsView'));
const ProjectsView = lazy(() => import('@src/features/projects/ProjectsView'));
const SwarmView = lazy(() => import('@src/features/autonomous/SwarmView'));
const GitView = lazy(() => import('@src/features/git/GitView'));
const DocumentsView = lazy(() => import('@src/features/documents/DocumentsView'));
const ImagesView = lazy(() => import('@src/features/multimodal/ImagesView'));
const McpView = lazy(() => import('@src/features/plugins/McpView'));
const TasksView = lazy(() => import('@src/features/automation/TasksView'));
const IdeView = lazy(() => import('@src/features/ide/IdeView'));
const MemoryView = lazy(() => import('@src/features/memory/MemoryView'));

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
  activeMode: 'chat' | 'registry' | 'settings' | 'compare' | 'workspace' | 'plugins' | 'projects' | 'swarm' | 'git' | 'documents' | 'images' | 'mcp' | 'tasks' | 'ide' | 'memory';
  setActiveMode: (mode: 'chat' | 'registry' | 'settings' | 'compare' | 'workspace' | 'plugins' | 'projects' | 'swarm' | 'git' | 'documents' | 'images' | 'mcp' | 'tasks' | 'ide' | 'memory') => void;
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
        path="/workspace"
        element={
          <LazyRoute name="WorkspaceCanvas">
            <WorkspaceCanvas />
          </LazyRoute>
        }
      />
      <Route
        path="/compare"
        element={
          <LazyRoute name="ModelComparisonView">
            <ModelComparisonView
              sidebarOpen={sidebarOpen}
              activeMode="compare"
              setActiveMode={setActiveMode as any}
            />
          </LazyRoute>
        }
      />
      <Route path="/plugins" element={<LazyRoute name="PluginsView"><PluginsView /></LazyRoute>} />
      <Route path="/projects" element={<LazyRoute name="ProjectsView"><ProjectsView /></LazyRoute>} />
      <Route path="/swarm" element={<LazyRoute name="SwarmView"><SwarmView /></LazyRoute>} />
      <Route path="/git" element={<LazyRoute name="GitView"><GitView /></LazyRoute>} />
      <Route path="/documents" element={<LazyRoute name="DocumentsView"><DocumentsView /></LazyRoute>} />
      <Route path="/images" element={<LazyRoute name="ImagesView"><ImagesView /></LazyRoute>} />
      <Route path="/mcp" element={<LazyRoute name="McpView"><McpView /></LazyRoute>} />
      <Route path="/tasks" element={<LazyRoute name="TasksView"><TasksView /></LazyRoute>} />
      <Route path="/ide" element={<LazyRoute name="IdeView"><IdeView /></LazyRoute>} />
      <Route path="/memory" element={<LazyRoute name="MemoryView"><MemoryView /></LazyRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
