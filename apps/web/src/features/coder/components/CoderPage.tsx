// fallow-ignore-file code-duplication
/**
 * @file src/features/coder/CoderPage.tsx
 * @description The standalone Coder feature page — NYX is the sole agent.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Folder,
  Monitor,
  ChevronDown,
  PanelLeftOpen,
  Plus,
  FileText,
  UploadCloud,
  ArrowRight,
  FolderPlus,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';
import { ModelDefinition, Provider } from '@src/infrastructure/types';
import { toast } from '@src/shared/components/ui/sonner';
import { useNyxStore } from '@src/shared/store/useNyxStore';

import { ErrorBoundary } from '@src/shared/components/ErrorBoundary';
import { CoderHeader } from './CoderHeader';
import { MessageList } from './MessageList';
import { PromptInput } from './PromptInput';
import { AgentPlanner } from './AgentPlanner';
import { getCustomModelIcon } from '@src/shared/utils/modelIcons';
import { useCoderLogic } from '../hooks/useCoderLogic';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { CodeEditor } from './CodeEditor';
import { InlineREPL } from './InlineREPL';
import { GitIntegrationPanel } from './GitIntegrationPanel';

interface CoderPageProps {
  allModels: ModelDefinition[];
  apiKeys: Record<string, string>;
  modelSettings: any;
  trackUsage: (provider: string, tokens: number) => void;
  setModelSettings: (settings: any) => void;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  gatewayUrls?: Record<string, string>;
  activeMode?: 'coder' | 'registry' | 'settings' | 'compare';
  setActiveMode?: (mode: 'coder' | 'registry' | 'settings' | 'compare') => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  chatSessions: any;

  // Model Selection
  models: Record<'nyx', string>;
  setModel: (modelId: string) => void;

  // Microsoft Lightning:
  lightningEnabled?: boolean;
  lightningDirectives?: string[];
  logRollout?: any;
  submitReward?: (rolloutId: string, reward: number) => void;
  onOpenLightning?: () => void;
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

  models,
  setModel,
  onOpenLightning,

  // Microsoft Lightning:
  lightningEnabled = true,
  lightningDirectives = [],
  logRollout,
  submitReward,
}) => {
  const {
    activeAgent,
    isLoading,
    history,
    metrics,
    runCoder,
    stopCoder,
    clearHistory,
    forkAndRun,
    editMessage,
    regenerateMessage,
    togglePin,
    agentPersonas,
    suggestedPrompts,
    subagentTasks,
    webSearchEnabled,
    setWebSearchEnabled,
    codebaseKnowledgeEnabled,
    setCodebaseKnowledgeEnabled,
    agentMode,
    agentReasoning,
    pendingToolConfirm,
    criticStatus,
    criticResult,
    missingDebugWarning,
    setMissingDebugWarning,
  } = useCoderLogic();

  const workspacePath = useNyxStore((s) => s.workspacePath);
  const selectWorkspace = useNyxStore((s) => s.selectWorkspace);
  const createWorkspace = useNyxStore((s) => s.createWorkspace);
  const [showRepl, setShowRepl] = useState(false);
  const [showGit, setShowGit] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const [scraplingStatus, setScraplingStatus] = useState<'checking' | 'online' | 'offline'>(
    'checking'
  );

  // Scrapling connectivity — routed through our backend to avoid ERR_CONNECTION_REFUSED
  // spam when the optional Python sidecar isn't running. Uses exponential backoff
  // (10s → 20s → 40s … up to 5 min) when offline.
  useEffect(() => {
    let active = true;
    let intervalMs = 10_000;
    let timerId: ReturnType<typeof setTimeout>;

    const checkScrapling = async () => {
      try {
        const res = await fetch('/api/v1/admin/scrapling-status');
        if (!active) return;
        if (res.ok) {
          const { status } = await res.json();
          setScraplingStatus(status === 'running' ? 'online' : 'offline');
          // Reset backoff when we get a real answer
          intervalMs = 10_000;
        } else {
          setScraplingStatus('offline');
        }
      } catch {
        if (!active) return;
        setScraplingStatus('offline');
        // Back off up to 5 minutes when the backend itself is unreachable
        intervalMs = Math.min(intervalMs * 2, 300_000);
      }
      if (active) {
        timerId = setTimeout(checkScrapling, intervalMs);
      }
    };

    checkScrapling();
    return () => {
      active = false;
      clearTimeout(timerId);
    };
  }, []);

  // Auto-launch VS Code when Coder page is opened with a workspace
  useEffect(() => {
    if (workspacePath) {
      const formattedPath = workspacePath.replace(/\\/g, '/');
      const timer = setTimeout(() => {
        window.location.href = `vscode://file/${formattedPath}`;
        toast.success('Launching VS Code interface...');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [workspacePath]);

  // Project Creation State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [parentPath, setParentPath] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const currentModelId = models['nyx'];

  const mergedModels = useMemo(() => {
    const seenIds = new Set();
    return allModels.filter((m) => {
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

  const filteredHistory = history.filter((msg) =>
    msg.content.toLowerCase().includes(messageSearchQuery.toLowerCase())
  );

  const handleSubmit = useCallback(
    (finalPrompt: string, images?: Array<{ name: string; dataUrl: string; mimeType?: string }>) => {
      if (!finalPrompt.trim() || isLoading) return;
      if (!currentModelId) {
        toast.error('Please select a model first');
        return;
      }
      runCoder(finalPrompt, images);
      setPrompt('');
    },
    [isLoading, currentModelId, runCoder]
  );

  const handleRetry = useCallback(() => {
    if (isLoading) return;
    const lastUserMsg = [...history].reverse().find((m) => m.role === 'user');
    if (lastUserMsg && lastUserMsg.content) {
      runCoder(lastUserMsg.content);
    }
  }, [history, isLoading, runCoder]);

  const handleEditMessage = useCallback(
    (index: number, newContent: string) => {
      if (isLoading) return;
      forkAndRun(index, newContent);
    },
    [isLoading, forkAndRun]
  );

  const copyToClipboard = useCallback(async (text: string, id: string) => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 2000);
      toast.success('Code copied to clipboard');
    } catch (err) {
      // Fallback for large content or blocked clipboard API
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopiedId(id);
        copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 2000);
        toast.success('Code copied to clipboard (fallback)');
      } catch (fallbackErr) {
        toast.error('Failed to copy code to clipboard');
        console.error('Clipboard copy failed:', fallbackErr);
      }
    }
  }, []);

  const handleBrowseParent = useCallback(async () => {
    const ipc = (window as any).nyxIPC;
    if (ipc && typeof ipc.showOpenDirectory === 'function') {
      try {
        const directory = await ipc.showOpenDirectory();
        if (directory) {
          setParentPath(directory);
        }
      } catch (err: any) {
        console.error('[Create Project] Browse parent directory failed:', err);
      }
    } else {
      toast.info('Web mode: please input the parent directory path manually.');
    }
  }, []);

  const handleCreateProjectSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!parentPath.trim()) {
        toast.error('Parent directory path is required');
        return;
      }
      if (!newProjectName.trim()) {
        toast.error('Project name is required');
        return;
      }

      setIsCreatingProject(true);
      try {
        const result = await createWorkspace(parentPath.trim(), newProjectName.trim());
        if (result.success) {
          toast.success(`Project "${newProjectName}" created and opened successfully!`);
          setShowCreateForm(false);
          setNewProjectName('');
        } else {
          toast.error(`Failed to create project: ${result.error}`);
        }
      } catch (error: any) {
        toast.error(`Error: ${error.message}`);
      } finally {
        setIsCreatingProject(false);
      }
    },
    [parentPath, newProjectName, createWorkspace]
  );

  return (
    <motion.div
      key="coder"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="h-full w-full flex flex-col min-h-0 overflow-hidden"
    >
      <ErrorBoundary
        fallback={
          <div className="flex-1 p-6 text-red-400 flex items-center justify-center">
            A critical error occurred in CoderPage. Please refresh the app.
          </div>
        }
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
            mode="code"
            onOpenLightning={onOpenLightning}
            history={history}
            messageSearchQuery={messageSearchQuery}
            onMessageSearchChange={setMessageSearchQuery}
          />
          {subagentTasks && subagentTasks.length > 0 && (
            <div className="px-6 pt-3 shrink-0">
              <AgentPlanner subagentTasks={subagentTasks} isLoading={isLoading} />
            </div>
          )}

          {history.length === 0 && !isLoading ? (
            <div className="flex-1 w-full flex flex-col items-center justify-center p-6 relative overflow-y-auto">
              {!workspacePath ? (
                <div className="w-full max-w-4xl flex flex-col gap-6 animate-fade-in my-8">
                  <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground leading-none">
                      Welcome to NYX Coder
                    </h1>
                    <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                      NYX Coder is a dedicated agent for software engineering. Mount an existing
                      directory, or initialize a new project workspace to begin.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {/* Card 1: Open Directory */}
                    <motion.div
                      whileHover={{ scale: 1.01, borderColor: 'hsl(var(--primary) / 0.2)' }}
                      onClick={selectWorkspace}
                      className="p-6 rounded-md border border-border bg-card hover:bg-muted/40 transition-all cursor-pointer group flex flex-col justify-between h-48 select-none"
                    >
                      <div className="space-y-3">
                        <div className="p-3 w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center text-primary group-hover:scale-105 transition-all">
                          <FolderPlus size={22} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-foreground">
                            Open Existing Codebase
                          </h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            Select an existing folder on your computer to let NYX index, query, and
                            refactor your codebase.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary group-hover:gap-2 transition-all mt-4">
                        <span>Choose Folder</span>
                        <ArrowRight size={12} />
                      </div>
                    </motion.div>

                    {/* Card 2: Create New Project */}
                    <motion.div
                      whileHover={{ scale: 1.01, borderColor: 'hsl(var(--primary) / 0.2)' }}
                      onClick={() => setShowCreateForm((p) => !p)}
                      className="p-6 rounded-md border border-border bg-card hover:bg-muted/40 transition-all cursor-pointer group flex flex-col justify-between min-h-48 select-none"
                    >
                      <div className="space-y-3">
                        <div className="p-3 w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center text-primary group-hover:scale-105 transition-all">
                          <Plus size={22} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-foreground">Create New Project</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            Initialize a clean directory with a default README template and set it
                            as your active workspace.
                          </p>
                        </div>
                      </div>

                      {!showCreateForm && (
                        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary group-hover:gap-2 transition-all mt-4">
                          <span>Configure Project</span>
                          <ArrowRight size={12} />
                        </div>
                      )}

                      <AnimatePresence>
                        {showCreateForm && (
                          <motion.form
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            onSubmit={handleCreateProjectSubmit}
                            className="space-y-3 mt-4 text-left w-full"
                          >
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                Parent Directory
                              </label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={parentPath}
                                  onChange={(e) => setParentPath(e.target.value)}
                                  placeholder="C:\Users\Username\Projects"
                                  className="flex-1 bg-background text-foreground text-xs px-3 py-2 rounded-md border border-border focus:outline-none focus:border-primary/50"
                                />
                                <button
                                  type="button"
                                  onClick={handleBrowseParent}
                                  className="bg-secondary hover:bg-secondary/80 text-secondary-foreground text-[10px] font-bold uppercase px-3 py-2 rounded-md border border-border transition-all cursor-pointer shrink-0"
                                >
                                  Browse
                                </button>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                Project Name
                              </label>
                              <input
                                type="text"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                placeholder="my-cool-app"
                                className="w-full bg-background text-foreground text-xs px-3 py-2 rounded-md border border-border focus:outline-none focus:border-primary/50"
                              />
                            </div>

                            <button
                              type="submit"
                              disabled={isCreatingProject}
                              className="w-full py-2 bg-primary hover:bg-primary/95 disabled:bg-muted text-primary-foreground text-xs font-bold uppercase tracking-wider rounded-md transition-all cursor-pointer mt-1"
                            >
                              {isCreatingProject ? 'Initializing...' : 'Create & Open Project'}
                            </button>
                          </motion.form>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-2xl flex flex-col gap-3.5 mb-12 animate-fade-in">
                  {/* Project Selector & VS Code Launcher */}
                  <div className="flex justify-start pl-1 gap-2">
                    <div
                      onClick={selectWorkspace}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-muted-foreground border border-border bg-card hover:bg-muted/40 transition-all cursor-pointer select-none"
                    >
                      <Folder size={12} className="text-primary fill-primary/10" />
                      <span>{workspacePath.split(/[/\\]/).pop() || 'NYX'}</span>
                      <ChevronDown size={10} className="text-muted-foreground opacity-60" />
                    </div>

                    <div
                      onClick={() => {
                        const formattedPath = workspacePath.replace(/\\/g, '/');
                        window.location.href = `vscode://file/${formattedPath}`;
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/20 bg-primary/10 hover:bg-primary/20 transition-all cursor-pointer select-none"
                      title="Launch Antigravity VS Code Environment"
                    >
                      <Monitor size={12} />
                      <span>Open in VS Code</span>
                    </div>
                  </div>

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
                      mode="code"
                      alignDropdown="bottom"
                      agentMode={agentMode}
                      agentReasoning={agentReasoning}
                    />
                  </div>

                  {/* Critic Status Indicator */}
                  {criticStatus === 'learning' && (
                    <div className="flex justify-start pl-1 mb-2">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-green-500 border border-green-500/20 bg-green-500/10 animate-pulse select-none">
                        <Monitor size={12} className="text-green-500" />
                        <span>Learning from this interaction...</span>
                      </div>
                    </div>
                  )}

                  {/* Local Selector Pill (Laptop Pill) */}
                  <div className="flex justify-start pl-1">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-muted-foreground border border-border bg-card hover:bg-muted/40 transition-all cursor-pointer select-none">
                      <Monitor size={12} className="text-muted-foreground" />
                      <span>Local</span>
                      <ChevronDown size={10} className="text-muted-foreground opacity-60" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : workspacePath ? (
            <div className="flex-1 w-full flex flex-row overflow-hidden bg-background">
              <div className="w-64 flex flex-col border-r border-border bg-card">
                <div className="flex-1 min-h-0 overflow-hidden">
                  <WorkspaceSidebar />
                </div>
                {showGit && (
                  <div className="h-[250px] shrink-0 border-t border-border bg-muted/30">
                    <GitIntegrationPanel />
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col min-w-0 border-r border-border relative">
                <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
                  <button
                    onClick={() => setShowGit(!showGit)}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${showGit ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80 border border-border'}`}
                  >
                    Git
                  </button>
                  <button
                    onClick={() => setShowRepl(!showRepl)}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${showRepl ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80 border border-border'}`}
                  >
                    Terminal REPL
                  </button>
                </div>

                <div className="flex-1 min-h-0 pt-10">
                  <CodeEditor />
                </div>
                {showRepl && (
                  <div className="h-1/3 min-h-[250px] shrink-0 border-t border-border bg-muted/40">
                    <InlineREPL onClose={() => setShowRepl(false)} />
                  </div>
                )}
              </div>
              <div className="w-[400px] shrink-0 flex flex-col h-full bg-card">
                <ErrorBoundary
                  fallback={
                    <div className="flex-1 p-4 text-red-400 text-sm">
                      Failed to render message history.
                    </div>
                  }
                >
                  <MessageList
                    history={filteredHistory}
                    activeAgent={activeAgent}
                    isLoading={isLoading}
                    onCopy={copyToClipboard}
                    copiedId={copiedId}
                    suggestedPrompts={suggestedPrompts}
                    onSuggestedPromptClick={setPrompt}
                    subagentTasks={subagentTasks}
                    submitReward={submitReward}
                    onEditMessage={editMessage}
                    onRegenerate={regenerateMessage}
                    onBranchFromMessage={(idx) => forkAndRun(idx, history[idx]?.content || '')}
                  />
                </ErrorBoundary>
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
                  mode="code"
                  alignDropdown="top"
                  agentMode={agentMode}
                  agentReasoning={agentReasoning}
                />
              </div>
            </div>
          ) : (
            <>
              <ErrorBoundary
                fallback={
                  <div className="flex-1 p-4 text-red-400 text-sm">
                    Failed to render message history.
                  </div>
                }
              >
                <MessageList
                  history={history}
                  activeAgent={activeAgent}
                  isLoading={isLoading}
                  onCopy={copyToClipboard}
                  copiedId={copiedId}
                  suggestedPrompts={suggestedPrompts}
                  onSuggestedPromptClick={setPrompt}
                  subagentTasks={subagentTasks}
                  submitReward={submitReward}
                  onEditMessage={editMessage}
                  onRegenerate={regenerateMessage}
                  onBranchFromMessage={(idx) => forkAndRun(idx, history[idx]?.content || '')}
                />
              </ErrorBoundary>

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
                mode="code"
                alignDropdown="top"
                agentMode={agentMode}
                agentReasoning={agentReasoning}
                missingDebugWarning={missingDebugWarning}
                setMissingDebugWarning={setMissingDebugWarning}
              />
            </>
          )}

          {pendingToolConfirm && (
            <div className="absolute bottom-24 right-4 z-50 bg-popover border border-border rounded-md p-4 shadow-sm border border-border max-w-sm">
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center">
                <AlertTriangle className="w-4 h-4 mr-2 text-yellow-500" />
                Confirmation Required
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                NYX wants to execute <strong>{pendingToolConfirm.toolName}</strong>
              </p>
              <pre className="text-xs text-primary bg-muted p-2 rounded mb-4 overflow-x-auto max-h-32">
                {JSON.stringify(pendingToolConfirm.args, null, 2)}
              </pre>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => pendingToolConfirm.resolve(false)}
                  className="px-3 py-1.5 bg-secondary text-secondary-foreground text-xs rounded hover:bg-secondary/80"
                >
                  Reject
                </button>
                <button
                  onClick={() => pendingToolConfirm.resolve(true)}
                  className="px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded hover:bg-primary/90"
                >
                  Approve
                </button>
              </div>
            </div>
          )}
        </div>
      </ErrorBoundary>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: hsl(var(--foreground) / 0.1); 
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: hsl(var(--primary) / 0.2); }
      `,
        }}
      />
    </motion.div>
  );
};
