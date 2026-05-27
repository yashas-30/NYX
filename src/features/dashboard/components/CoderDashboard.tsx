/**
 * @file src/components/CoderDashboard.tsx
 * @description Claude Desktop-style dashboard with a warm-slate sidebar, Chat/Code tabs,
 *              main chat canvas, and top-level view routing (coder / registry / settings).
 */

import React, { lazy, Suspense, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDashboardState } from '../hooks/useDashboardState';
import { useChatSessions } from '@src/shared/hooks/useChatSessions';
import { CoderPage } from '@src/features/coder/CoderPage';
import { SettingsView } from '@src/features/settings';
import { useCoderLogic } from '@src/features/coder/hooks/useCoderLogic';
import { AVAILABLE_MODELS } from '@src/features/model-registry/config/models';
import { useTheme } from '@src/shared/context/ThemeContext';
import { ErrorBoundary } from '@src/shared/components/ErrorBoundary';
import {
  PanelLeftClose, PanelLeftOpen, Plus, MessageSquare,
  Box, Settings, Trash2, ChevronRight, User, Activity,
  ArrowLeft, ArrowRight, History, Clock, Folder, ChevronDown,
  Library
} from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';

const ModelRegistryView = lazy(() =>
  import('@src/features/model-registry').then(m => ({ default: m.ModelRegistryView }))
);

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full bg-[#0B0E14]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Loading</span>
    </div>
  </div>
);

type ViewMode = 'coder' | 'registry' | 'settings';

export const CoderDashboard: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'code'>('chat');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const {
    activeMode, setActiveMode,
    apiKeys,
    modelSettings, setModelSettings, trackUsage,
    statuses,
    models, setModel,
    updateApiKey,
    clearApiKeys,
  } = useDashboardState(onExit);

  const { theme } = useTheme();
  const chatSessions = useChatSessions();

  const coderState = useCoderLogic({
    apiKeys,
    modelSettings,
    trackUsage,
    models,
    setModel,
    chatSessions,
    mode: sidebarTab
  });
  const { sessions, activeSid, deleteSession, switchSession, createSession } = chatSessions;

  const filteredSessions = sessions.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sidebarVariants = {
    open: { width: 260, opacity: 1 },
    closed: { width: 0, opacity: 0 },
  };

  return (
    <ErrorBoundary>
      <main className={`h-[100dvh] w-screen overflow-hidden flex bg-background text-foreground antialiased selection:bg-primary/20 ${theme === 'dark' ? 'dark' : ''}`}>

        {/* Backdrop for mobile */}
        <AnimatePresence>
          {isMobile && sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-25"
            />
          )}
        </AnimatePresence>

        {/* ── Collapsible Sidebar (Claude Warm Slate) ────────────────────── */}
        <motion.aside
          variants={sidebarVariants}
          initial="open"
          animate={sidebarOpen ? 'open' : 'closed'}
          transition={{ type: 'spring', stiffness: 380, damping: 35 }}
          className={`h-full overflow-hidden flex flex-col bg-secondary border-r border-white/[0.04] relative z-30 ${isMobile ? 'fixed inset-y-0 left-0 shadow-2xl w-[260px]' : 'flex-none z-20'}`}
        >
          <div className="flex flex-col h-full min-w-[260px] bg-background">
            {/* Sidebar Top Header (Stitch Design Flat) */}
            <div className="px-4.5 pt-3.5 pb-2 select-none border-b border-white/[0.03]">
              
              {/* Toolbar: Sidebar Toggle + Back/Forward Arrows */}
              <div className="flex items-center gap-3 text-zinc-500">
                <motion.button
                  whileHover={{ scale: 1.05, color: '#f5f5f5' }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 rounded hover:bg-white/5 text-zinc-400 transition-all cursor-pointer"
                  title="Collapse Sidebar"
                >
                  <PanelLeftClose size={13} />
                </motion.button>
                <div className="flex items-center gap-2 text-zinc-600">
                  <motion.button
                    whileHover={{ scale: 1.05, color: '#f5f5f5' }}
                    className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    <ArrowLeft size={12} />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05, color: '#f5f5f5' }}
                    className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    <ArrowRight size={12} />
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Top Primary Actions (Stitch design tabs) */}
            <div className="px-3.5 pt-3 pb-2 space-y-1">
              <motion.button
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  createSession([]);
                  setActiveMode('coder');
                }}
                className="w-full flex items-center justify-start gap-2 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer border border-white/[0.04] text-zinc-300 bg-white/[0.02] mb-1"
              >
                <Plus size={13} strokeWidth={1.8} className="text-zinc-400" />
                <span>New Conversation</span>
              </motion.button>

              <button
                onClick={() => {
                  setSidebarTab('chat');
                  setActiveMode('coder');
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left cursor-pointer ${
                  sidebarTab === 'chat'
                    ? 'text-white bg-white/[0.06] border border-white/[0.08] font-bold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                <MessageSquare size={13} className={sidebarTab === 'chat' ? 'text-zinc-200' : 'text-zinc-500'} />
                <span>Chat Agent</span>
              </button>

              <button
                onClick={() => {
                  setSidebarTab('code');
                  setActiveMode('coder');
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left cursor-pointer ${
                  sidebarTab === 'code'
                    ? 'text-white bg-white/[0.06] border border-white/[0.08] font-bold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                <Box size={13} className={sidebarTab === 'code' ? 'text-zinc-200' : 'text-zinc-500'} />
                <span>Coder Agent</span>
              </button>
            </div>

            {/* Chat Session List */}
            <div className="flex-1 overflow-y-auto px-2 space-y-1.5 scrollbar-none pt-3">
              <div className="space-y-0.5">
                <AnimatePresence>
                  {filteredSessions.length === 0 ? (
                    <div className="text-left py-4 pl-4.5">
                      <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider">No conversations</p>
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
            </div>

            {/* Bottom Section (Model Library & Settings) */}
            <div className="px-4.5 py-3.5 border-t border-white/[0.03] mt-auto space-y-3">
              <button
                onClick={() => {
                  setActiveMode('registry');
                }}
                className={`w-full flex items-center gap-2.5 transition-all text-left cursor-pointer text-xs font-semibold ${
                  activeMode === 'registry' ? 'text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Library size={13} className={activeMode === 'registry' ? 'text-[#22D3EE]' : 'text-zinc-500'} />
                <span>Model Library</span>
              </button>

              <button
                onClick={() => {
                  setActiveMode('settings');
                }}
                className={`w-full flex items-center gap-2.5 transition-all text-left cursor-pointer text-xs font-semibold ${
                  activeMode === 'settings' ? 'text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Settings size={13} className={activeMode === 'settings' ? 'text-white' : 'text-zinc-500'} />
                <span>Settings</span>
              </button>
            </div>
          </div>
        </motion.aside>

        {/* ── Collapsed Sidebar Toggle (Floating trigger) ───────────────── */}
        <AnimatePresence>
          {!sidebarOpen && activeMode !== 'coder' && (
            <motion.button
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.05)' }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSidebarOpen(true)}
              className="absolute top-3.5 left-3.5 z-30 p-2 rounded-xl bg-secondary hover:bg-secondary/80 border border-white/[0.04] text-zinc-500 hover:text-white transition-all shadow-md cursor-pointer"
            >
              <PanelLeftOpen size={14} />
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Main Content Canvas ────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 h-full relative overflow-hidden bg-background">
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
                <ErrorBoundary name="CoderPage">
                  <CoderPage
                    allModels={AVAILABLE_MODELS}
                    apiKeys={apiKeys}
                    modelSettings={modelSettings}
                    setModelSettings={setModelSettings}
                    trackUsage={trackUsage}
                    providerStatuses={statuses}
                    activeMode={activeMode}
                    setActiveMode={setActiveMode}
                    sidebarOpen={sidebarOpen}
                    onToggleSidebar={() => setSidebarOpen(p => !p)}
                    chatSessions={chatSessions}
                    mode={sidebarTab}

                    // Pass down lifted state props
                    activeAgent={coderState.activeAgent}
                    isLoading={coderState.isLoading}
                    history={coderState.history}
                    metrics={coderState.metrics}
                    models={coderState.models}
                    setModel={coderState.setModel}
                    runCoder={coderState.runCoder}
                    stopCoder={coderState.stopCoder}
                    clearHistory={coderState.clearHistory}
                    suggestedPrompts={coderState.suggestedPrompts}
                    subagentTasks={coderState.subagentTasks}
                    webSearchEnabled={coderState.webSearchEnabled}
                    setWebSearchEnabled={coderState.setWebSearchEnabled}
                    codebaseKnowledgeEnabled={coderState.codebaseKnowledgeEnabled}
                    setCodebaseKnowledgeEnabled={coderState.setCodebaseKnowledgeEnabled}
                  />
                </ErrorBoundary>
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
                  <ErrorBoundary name="ModelRegistry">
                    <ModelRegistryView
                      selectModel={(mid) => {
                        setModel(mid);
                        setActiveMode('coder');
                      }}
                      apiKeys={apiKeys}
                      providerStatuses={statuses}
                      activeMode={activeMode}
                      setActiveMode={setActiveMode}
                      sidebarOpen={sidebarOpen}
                    />
                  </ErrorBoundary>
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
                <ErrorBoundary name="Settings">
                  <SettingsView
                    apiKeys={apiKeys}
                    updateApiKey={updateApiKey}
                    clearApiKeys={clearApiKeys}
                    activeMode={activeMode}
                    setActiveMode={setActiveMode}
                    sidebarOpen={sidebarOpen}
                  />
                </ErrorBoundary>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </ErrorBoundary>
  );
};

/* ── Sidebar Nav Button (Tactile editorial design) ─────────────────────── */
const SideNavButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon, label, active, onClick }) => (
  <motion.button
    whileHover={{ scale: 1.01 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer ${
      active
        ? 'bg-white/[0.08] text-white border border-white/10 shadow-sm font-bold'
        : 'text-zinc-400 hover:text-white hover:bg-white/[0.03] border border-transparent'
    }`}
  >
    <span className={`transition-all duration-200 ${active ? 'scale-105 text-[#22D3EE]' : 'opacity-70 text-zinc-400'}`}>{icon}</span>
    <span className="translate-y-[-0.5px]">{label}</span>
  </motion.button>
);

/* ── Recent Chat Session Item ──────────────────────────────────────────── */
const SessionItem: React.FC<{
  session: { id: string; title: string; updatedAt: number };
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}> = ({ session, isActive, onClick, onDelete }) => {
  const [hovered, setHovered] = useState(false);

  const timeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative flex items-center justify-between px-3.5 py-1.5 rounded-md cursor-pointer transition-all ${
        isActive
          ? 'text-zinc-200 font-semibold bg-white/[0.03]'
          : 'text-zinc-400 hover:bg-white/[0.02] hover:text-zinc-200'
      }`}
      onClick={onClick}
    >
      <span className="flex-1 text-[11px] truncate tracking-normal font-medium">{session.title}</span>
      
      <div className="flex items-center gap-2 shrink-0 select-none ml-2">
        {hovered ? (
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded bg-red-500/10 text-red-400/60 hover:text-red-400 hover:bg-red-500/20 transition-all cursor-pointer"
            title="Delete Chat"
          >
            <Trash2 size={9} />
          </button>
        ) : isActive ? (
          <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3] shadow-[0_0_6px_#0071E3]" />
        ) : (
          <span className="text-[9px] text-zinc-500 font-mono tracking-tighter">{timeAgo(session.updatedAt)}</span>
        )}
      </div>
    </motion.div>
  );
};