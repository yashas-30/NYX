/**
 * @file src/features/coder/CoderPage.tsx
 * @description The standalone Coder feature page — NYX is the sole agent.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Folder, Monitor, ChevronDown, PanelLeftOpen, Plus, FileText, UploadCloud, ArrowRight, FolderPlus, HelpCircle } from 'lucide-react';
import { ModelDefinition, Provider } from '@src/infrastructure/types';
import { toast } from '@src/shared/components/ui/sonner';
import { useNyxStore } from '@src/shared/store/useNyxStore';

import { CoderHeader } from './CoderHeader';
import { MessageList } from './MessageList';
import { PromptInput } from './PromptInput';
import { AgentPlanner } from './AgentPlanner';
import { getCustomModelIcon } from '@src/shared/utils/modelIcons';
import { useCoderLogic } from '../hooks/useCoderLogic';

interface CoderPageProps {
  allModels: any[];
  apiKeys: Record<string, string>;
  modelSettings: any;
  trackUsage: (provider: string, tokens: number) => void;
  setModelSettings: (settings: any) => void;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  gatewayUrls?: Record<string, string>;
  activeMode?: 'coder' | 'registry' | 'settings';
  setActiveMode?: (mode: 'coder' | 'registry' | 'settings') => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  chatSessions: any;

  // Lifted state props:
  activeAgent: 'nyx';
  isLoading: boolean;
  history: any[];
  metrics: any;
  models: Record<'nyx', string>;
  setModel: (modelId: string) => void;
  runCoder: (prompt: string) => void;
  stopCoder: () => void;
  clearHistory: () => void;
  suggestedPrompts: string[];
  subagentTasks: any[];
  webSearchEnabled: boolean;
  setWebSearchEnabled: (val: boolean) => void;
  codebaseKnowledgeEnabled: boolean;
  setCodebaseKnowledgeEnabled: (val: boolean) => void;
  agentMode?: 'chat' | 'coder' | null;
  agentReasoning?: string;
  onOpenLightning?: () => void;
  submitReward?: (id: string, reward: number) => void;

  // Microsoft Lightning:
  lightningEnabled?: boolean;
  lightningDirectives?: string[];
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

  // Destructure lifted props:
  activeAgent,
  isLoading,
  history,
  metrics,
  models,
  setModel,
  runCoder,
  stopCoder,
  clearHistory,
  suggestedPrompts,
  subagentTasks,
  webSearchEnabled,
  setWebSearchEnabled,
  codebaseKnowledgeEnabled,
  setCodebaseKnowledgeEnabled,
  agentMode = null,
  agentReasoning = '',
  onOpenLightning,
  submitReward,

  // Microsoft Lightning:
  lightningEnabled = true,
  lightningDirectives = [],
}) => {

  const workspacePath = useNyxStore(s => s.workspacePath);
  const selectWorkspace = useNyxStore(s => s.selectWorkspace);
  const createWorkspace = useNyxStore(s => s.createWorkspace);
  const [prompt, setPrompt] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [scraplingStatus, setScraplingStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Real-time local Scrapling connectivity check
  useEffect(() => {
    let active = true;
    const checkScrapling = async () => {
      try {
        const res = await fetch('http://localhost:3012/health');
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

  // Project Creation State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [parentPath, setParentPath] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const currentModelId = models['nyx'];
  
  const mergedModels = useMemo(() => {
    const seenIds = new Set();
    return allModels.filter(m => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
  }, [allModels]);

  const currentModel = useMemo(() => {
    if (!currentModelId) return null;
    return mergedModels.find(m => m.id === currentModelId) || null;
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

  const handleBrowseParent = useCallback(async () => {
    const ipc = (window as any).nyxIPC;
    if (ipc && typeof ipc.showOpenDirectory === 'function') {
      try {
        const directory = await ipc.showOpenDirectory();
        if (directory) {
          setParentPath(directory);
        }
      } catch (err) {
        console.error('[Create Project] Browse parent directory failed:', err);
      }
    } else {
      toast.info('Web mode: please input the parent directory path manually.');
    }
  }, []);

  const handleCreateProjectSubmit = useCallback(async (e: React.FormEvent) => {
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
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setIsCreatingProject(false);
    }
  }, [parentPath, newProjectName, createWorkspace]);

  return (
    <motion.div
      key="coder"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="h-full w-full flex flex-col min-h-0 overflow-hidden"
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
                  <h1 className="text-2xl font-bold tracking-tight text-white leading-none">
                    Welcome to NYX Coder
                  </h1>
                  <p className="text-sm text-zinc-400 max-w-lg mx-auto">
                    NYX Coder is a dedicated agent for software engineering. Mount an existing directory, or initialize a new project workspace to begin.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {/* Card 1: Open Directory */}
                  <motion.div
                    whileHover={{ scale: 1.01, borderColor: 'rgba(34,211,238,0.2)' }}
                    onClick={selectWorkspace}
                    className="p-6 rounded-2xl border border-white/[0.04] bg-card hover:bg-white/[0.01] transition-all cursor-pointer group flex flex-col justify-between h-48 select-none"
                  >
                    <div className="space-y-3">
                      <div className="p-3 w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-all">
                        <FolderPlus size={22} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-zinc-200">Open Existing Codebase</h3>
                        <p className="text-xs text-zinc-500 mt-1">Select an existing folder on your computer to let NYX index, query, and refactor your codebase.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400 group-hover:gap-2 transition-all mt-4">
                      <span>Choose Folder</span>
                      <ArrowRight size={12} />
                    </div>
                  </motion.div>

                  {/* Card 2: Create New Project */}
                  <motion.div
                    whileHover={{ scale: 1.01, borderColor: 'rgba(16,185,129,0.2)' }}
                    onClick={() => setShowCreateForm(p => !p)}
                    className="p-6 rounded-2xl border border-white/[0.04] bg-card hover:bg-white/[0.01] transition-all cursor-pointer group flex flex-col justify-between min-h-48 select-none"
                  >
                    <div className="space-y-3">
                      <div className="p-3 w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-all">
                        <Plus size={22} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-zinc-200">Create New Project</h3>
                        <p className="text-xs text-zinc-500 mt-1">Initialize a clean directory with a default README template and set it as your active workspace.</p>
                      </div>
                    </div>
                    
                    {!showCreateForm && (
                      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 group-hover:gap-2 transition-all mt-4">
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
                          onClick={e => e.stopPropagation()}
                          onSubmit={handleCreateProjectSubmit}
                          className="space-y-3 mt-4 text-left w-full"
                        >
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Parent Directory</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={parentPath}
                                onChange={e => setParentPath(e.target.value)}
                                placeholder="C:\Users\Username\Projects"
                                className="flex-1 bg-background text-zinc-300 text-xs px-3 py-2 rounded-lg border border-white/5 focus:outline-none focus:border-cyan-500/50"
                              />
                              <button
                                type="button"
                                onClick={handleBrowseParent}
                                className="bg-white/5 hover:bg-white/10 text-zinc-300 text-[10px] font-bold uppercase px-3 rounded-lg border border-white/5 transition-all cursor-pointer shrink-0"
                              >
                                Browse
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Project Name</label>
                            <input
                              type="text"
                              value={newProjectName}
                              onChange={e => setNewProjectName(e.target.value)}
                              placeholder="my-cool-app"
                              className="w-full bg-background text-zinc-300 text-xs px-3 py-2 rounded-lg border border-white/5 focus:outline-none focus:border-emerald-500/50"
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={isCreatingProject}
                            className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 text-black text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer mt-1"
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
                {/* Project Selector (Folder Pill) */}
                <div className="flex justify-start pl-1">
                  <div
                    onClick={selectWorkspace}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider text-zinc-400 border border-white/[0.04] bg-card hover:bg-white/[0.03] transition-all cursor-pointer select-none"
                  >
                    <Folder size={12} className="text-[#FF3366] fill-cyan-500/10" />
                    <span>{workspacePath.split(/[/\\]/).pop() || 'NYX'}</span>
                    <ChevronDown size={10} className="text-zinc-500 opacity-60" />
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

                {/* Local Selector Pill (Laptop Pill) */}
                <div className="flex justify-start pl-1">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider text-zinc-400 border border-white/[0.04] bg-card hover:bg-white/[0.03] transition-all cursor-pointer select-none">
                    <Monitor size={12} className="text-zinc-500" />
                    <span>Local</span>
                    <ChevronDown size={10} className="text-zinc-500 opacity-60" />
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
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
          </>
        )}
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
