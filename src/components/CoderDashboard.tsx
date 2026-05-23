/**
 * @file src/components/CoderDashboard.tsx
 * @description Gemini-style dashboard with a collapsible sidebar, main chat canvas,
 *              and top-level view routing (coder / registry / settings).
 */

import React, { lazy, Suspense, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboardState } from '@/src/hooks/useDashboardState';
import { useChatSessions } from '@/src/hooks/useChatSessions';
import { CoderPage } from '@/src/features/coder/CoderPage';
import { SettingsView } from './dashboard/SettingsView';
import { AVAILABLE_MODELS } from '@/src/config/models';
import { useTheme } from '../context/ThemeContext';
import { ErrorBoundary } from './ErrorBoundary';
import {
  PanelLeftClose, PanelLeftOpen, Plus, Search, MessageSquare,
  Box, Settings, Trash2, ChevronRight, User
} from 'lucide-react';

const ModelRegistryView = lazy(() =>
  import('./dashboard/ModelRegistryView').then(m => ({ default: m.ModelRegistryView }))
);

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Loading</span>
    </div>
  </div>
);

type ViewMode = 'coder' | 'registry' | 'settings';

export const CoderDashboard: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
  const [activeMode, setActiveMode] = useState<ViewMode>('coder');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const {
    apiKeys, updateApiKey, clearApiKeys,
    ollamaModels, ollamaStatus, ollamaError, ollamaBaseUrl, setOllamaBaseUrl, fetchOllamaModels,
    lmStudioModels, lmStudioStatus, lmStudioBaseUrl, setLmStudioBaseUrl, fetchLMStudioModels,
    modelSettings, setModelSettings, trackUsage,
    statuses,
    activeAgent,
    models, setModel,
    localModelsEnabled, setLocalModelsEnabled
  } = useDashboardState(onExit);

  const { theme } = useTheme();
  const chatSessions = useChatSessions();
  const { sessions, activeSid, deleteSession, switchSession } = chatSessions;

  const filteredSessions = sessions.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sidebarVariants = {
    open: { width: 280, opacity: 1 },
    closed: { width: 0, opacity: 0 },
  };

  return (
    <ErrorBoundary>
      <main className={`h-[100dvh] w-screen overflow-hidden flex bg-[#131315] text-foreground antialiased selection:bg-primary/20 ${theme === 'dark' ? 'dark' : ''}`}>

        {/* ── Collapsible Sidebar ─────────────────────────────────────────── */}
        <motion.aside
          variants={sidebarVariants}
          initial="open"
          animate={sidebarOpen ? 'open' : 'closed'}
          transition={{ type: 'spring', stiffness: 300, damping: 35 }}
          className="flex-none h-full overflow-hidden flex flex-col bg-[#1a1a1e] border-r border-white/[0.05] relative z-20"
        >
          <div className="flex flex-col h-full min-w-[280px]">
            {/* Sidebar top controls */}
            <div className="flex items-center justify-between px-3 pt-3 pb-2">
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-white/5 transition-all"
              >
                <PanelLeftClose size={16} />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => {
                  // Signal new chat — reset to coder view with no session
                  switchSession(null);
                  setActiveMode('coder');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/8 border border-white/8 text-[11px] font-semibold text-foreground/70 hover:text-foreground transition-all"
              >
                <Plus size={13} />
                <span>New chat</span>
              </motion.button>
            </div>

            {/* Search bar */}
            <div className="px-3 pb-2">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/8">
                <Search size={11} className="text-muted-foreground/40 shrink-0" />
                <input
                  type="text"
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-[11px] text-foreground/80 placeholder:text-muted-foreground/30 outline-none font-medium"
                />
              </div>
            </div>

            {/* Navigation */}
            <div className="px-2 pb-1 space-y-0.5">
              <SideNavButton
                icon={<MessageSquare size={14} />}
                label="Coder"
                active={activeMode === 'coder'}
                onClick={() => setActiveMode('coder')}
              />
              <SideNavButton
                icon={<Box size={14} />}
                label="Models"
                active={activeMode === 'registry'}
                onClick={() => setActiveMode('registry')}
              />
            </div>

            {/* Divider */}
            <div className="mx-3 my-1.5 h-px bg-white/[0.05]" />

            {/* Recent chats label */}
            <div className="px-3 py-1">
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/30">
                Recent
              </span>
            </div>

            {/* Session list */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 scrollbar-thin scrollbar-thumb-white/5">
              <AnimatePresence>
                {filteredSessions.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-[10px] text-muted-foreground/25">No chats yet</p>
                  </div>
                ) : (
                  filteredSessions.map(session => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      isActive={session.id === activeSid}
                      onClick={() => {
                        switchSession(session.id);
                        setActiveMode('coder');
                      }}
                      onDelete={() => deleteSession(session.id)}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Bottom user badge */}
            <div className="px-3 py-3 border-t border-white/[0.05] mt-auto">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
                  <User size={13} className="text-white" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-bold text-foreground/80 truncate">User</span>
                  <span className="text-[9px] text-muted-foreground/40 font-medium">Pro</span>
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setActiveMode('settings')}
                  className="ml-auto p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-white/5 transition-all"
                >
                  <Settings size={13} />
                </motion.button>
              </div>
            </div>
          </div>
        </motion.aside>

        {/* ── Sidebar toggle (when collapsed) ──────────────────────────── */}
        <AnimatePresence>
          {!sidebarOpen && (
            <motion.button
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              onClick={() => setSidebarOpen(true)}
              className="absolute top-3 left-3 z-30 p-1.5 rounded-lg bg-white/5 hover:bg-white/8 border border-white/8 text-muted-foreground/60 hover:text-foreground transition-all"
            >
              <PanelLeftOpen size={16} />
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Main Content ──────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 h-full relative overflow-hidden">
          <AnimatePresence mode="wait">
            {activeMode === 'coder' ? (
              <motion.div
                key="coder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0"
              >
                <CoderPage
                  allModels={AVAILABLE_MODELS}
                  apiKeys={apiKeys}
                  lmStudioBaseUrl={lmStudioBaseUrl}
                  modelSettings={modelSettings}
                  setModelSettings={setModelSettings}
                  trackUsage={trackUsage}
                  ollamaModels={ollamaModels}
                  lmStudioModels={lmStudioModels}
                  ollamaStatus={ollamaStatus}
                  lmStudioStatus={lmStudioStatus}
                  onRefreshOllama={fetchOllamaModels}
                  onRefreshLMStudio={fetchLMStudioModels}
                  providerStatuses={statuses}
                  ollamaBaseUrl={ollamaBaseUrl}
                  localModelsEnabled={localModelsEnabled}
                  models={models}
                  setModel={setModel}
                  activeMode={activeMode}
                  setActiveMode={setActiveMode}
                  sidebarOpen={sidebarOpen}
                  onToggleSidebar={() => setSidebarOpen(p => !p)}
                  chatSessions={chatSessions}
                />
              </motion.div>
            ) : activeMode === 'registry' ? (
              <motion.div
                key="registry"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0"
              >
                <Suspense fallback={<LoadingFallback />}>
                  <ModelRegistryView
                    models={models}
                    ollamaModels={ollamaModels}
                    ollamaStatus={ollamaStatus}
                    ollamaError={ollamaError}
                    lmStudioModels={lmStudioModels}
                    lmStudioStatus={lmStudioStatus}
                    lmStudioBaseUrl={lmStudioBaseUrl}
                    setLmStudioBaseUrl={setLmStudioBaseUrl}
                    onRefreshOllama={fetchOllamaModels}
                    onRefreshLMStudio={fetchLMStudioModels}
                    selectModel={(mid) => {
                      setModel(mid);
                      setActiveMode('coder');
                    }}
                    apiKeys={apiKeys}
                    providerStatuses={statuses}
                    ollamaBaseUrl={ollamaBaseUrl}
                    setOllamaBaseUrl={setOllamaBaseUrl}
                    activeMode={activeMode}
                    setActiveMode={setActiveMode}
                    localModelsEnabled={localModelsEnabled}
                    setLocalModelsEnabled={setLocalModelsEnabled}
                  />
                </Suspense>
              </motion.div>
            ) : (
              <motion.div
                key="settings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 overflow-auto"
              >
                <SettingsView
                  apiKeys={apiKeys}
                  updateApiKey={updateApiKey}
                  clearApiKeys={clearApiKeys}
                  ollamaBaseUrl={ollamaBaseUrl}
                  setOllamaBaseUrl={setOllamaBaseUrl}
                  lmStudioBaseUrl={lmStudioBaseUrl}
                  setLmStudioBaseUrl={setLmStudioBaseUrl}
                  activeMode={activeMode}
                  setActiveMode={setActiveMode}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </ErrorBoundary>
  );
};

/* ── Sub-components ─────────────────────────────────────────────────────── */

const SideNavButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon, label, active, onClick }) => (
  <motion.button
    whileTap={{ scale: 0.96 }}
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-[12px] font-medium transition-all ${
      active
        ? 'bg-white/8 text-foreground'
        : 'text-muted-foreground/60 hover:text-foreground/80 hover:bg-white/4'
    }`}
  >
    <span className={active ? 'text-foreground' : 'text-muted-foreground/50'}>{icon}</span>
    {label}
    {active && <ChevronRight size={11} className="ml-auto opacity-40" />}
  </motion.button>
);

const SessionItem: React.FC<{
  session: { id: string; title: string; updatedAt: number };
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}> = ({ session, isActive, onClick, onDelete }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-all ${
        isActive ? 'bg-white/8 text-foreground' : 'text-muted-foreground/60 hover:bg-white/4 hover:text-foreground/70'
      }`}
      onClick={onClick}
    >
      <MessageSquare size={12} className="shrink-0 opacity-50" />
      <span className="flex-1 text-[11px] font-medium truncate">{session.title}</span>
      <AnimatePresence>
        {hovered && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-red-400 transition-colors"
          >
            <Trash2 size={11} />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
};