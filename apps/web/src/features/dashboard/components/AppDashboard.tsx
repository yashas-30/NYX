// @ts-nocheck
/**
 * @file src/components/AppDashboard.tsx
 * @description Claude Desktop-style dashboard with a warm-slate sidebar, Chat page,
 *              main chat canvas, and top-level view routing (chat / registry / settings).
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboardState } from '../hooks/useDashboardState';
import { useChatSessions } from '@src/shared/hooks/useChatSessions';
import { AppRouter } from '@src/app/router';
import { AVAILABLE_MODELS } from '@shared/config/models';
import { useTheme } from '@src/shared/context/ThemeContext';
import { ErrorBoundary } from '@src/shared/components/ErrorBoundary';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  MessageSquare,
  Settings,
  Trash2,
  ChevronRight,
  User,
  Activity,
  ArrowLeft,
  ArrowRight,
  Library,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Layers,
} from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';
import { CommandPalette } from '@src/shared/components/CommandPalette';
import { useAgentLightning } from '@src/shared/hooks/useAgentLightning';
import { AgentLightningPanel } from '@src/shared/components/AgentLightningPanel';
import { LocalProviderStatus } from '@src/components/LocalProviderStatus';

export const AppDashboard: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const {
    activeMode,
    setActiveMode,
    chatSettings,
    setChatSettings,
    apiKeys,
    updateApiKey,
    clearApiKeys,
    statuses,
    models,
    setModel,
    modelsState,
    setModels,
    localModelsEnabled,
    setLocalModelsEnabled,
    localLibraryModels,
    trackUsage,
  } = useDashboardState(onExit);

  const { theme } = useTheme();

  // Load standard Chat sessions
  const chatSessions = useChatSessions('chat');

  // We only have one session list now
  const activeSessions = chatSessions;

  const {
    sessions,
    activeSid,
    createSession: createNewSession,
    switchSession,
    deleteSession,
    updateSessionMeta,
    createFolder,
    deleteFolder,
    folders,
  } = activeSessions;

  // Global search filtering
  const filteredSessions = sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.messages &&
        s.messages.some((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  const createSession = (msgs: any[]) => {
    const newId = createNewSession();
    switchSession(newId);
  };

  const allModels = [...AVAILABLE_MODELS, ...localLibraryModels];
  const lightningState = useAgentLightning();

  return (
    <ErrorBoundary name="AppDashboard">
      <main className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground font-sans relative selection:bg-primary/20">
        
        {lightningState.isLightningOpen && (
          <AgentLightningPanel
            onClose={lightningState.toggleLightning}
            agentMode={activeMode === 'chat' ? 'chat' : 'coder'}
            directives={lightningState.apoDirectives[activeMode === 'chat' ? 'chat' : 'coder']}
            onSaveDirectives={(dirs) =>
              lightningState.setApoDirectives({
                ...lightningState.apoDirectives,
                [activeMode === 'chat' ? 'chat' : 'coder']: dirs,
              })
            }
            logRollout={lightningState.logRollout}
          />
        )}

        {/* ── Desktop/Tablet Sidebar ──────────────────────────────────────── */}
        <motion.aside
          initial={false}
          animate={{
            width: sidebarOpen ? 260 : 0,
            opacity: sidebarOpen ? 1 : 0,
          }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={`flex-shrink-0 flex border-r border-border h-full bg-card overflow-hidden z-20 ${
            isMobile && sidebarOpen ? 'absolute left-0 top-0 bottom-0 shadow-2xl' : 'relative'
          }`}
        >
          <div className="flex flex-col h-full min-w-full bg-card">
            {/* Sidebar Top Header */}
            <div className="h-10 px-4 flex items-center select-none border-b border-border shrink-0">
              {/* Toolbar: Sidebar Toggle + Back/Forward Arrows */}
              <div className="flex items-center gap-3 text-muted-foreground">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                  title="Collapse Sidebar"
                >
                  <PanelLeftClose size={13} />
                </motion.button>
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    className="p-0.5 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <ArrowLeft size={12} />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    className="p-0.5 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <ArrowRight size={12} />
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Top Primary Actions */}
            <div className="px-3 pt-3 pb-2 space-y-1">
              <motion.button
                whileHover={{ backgroundColor: 'var(--muted)' }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  createSession([]);
                  if (activeMode !== 'chat') {
                    setActiveMode('chat');
                  }
                }}
                className="w-full flex items-center justify-start gap-2 px-3 py-2 rounded-md text-xs font-medium tracking-wide transition-all duration-200 cursor-pointer border border-border text-foreground bg-background mb-1 hover:bg-muted"
              >
                <Plus size={13} strokeWidth={1.8} className="text-primary" />
                <span>New Conversation</span>
              </motion.button>

              <button
                onClick={() => { setActiveMode('chat'); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-all text-left cursor-pointer ${
                  activeMode === 'chat'
                    ? 'text-foreground bg-muted border border-border font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
                }`}
              >
                <MessageSquare
                  size={13}
                  className={activeMode === 'chat' ? 'text-primary' : 'text-muted-foreground'}
                />
                <span>NYX</span>
              </button>

              <button
                onClick={() => { setActiveMode('workspace'); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-all text-left cursor-pointer ${
                  activeMode === 'workspace'
                    ? 'text-foreground bg-muted border border-border font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
                }`}
              >
                <Layers
                  size={13}
                  className={activeMode === 'workspace' ? 'text-primary' : 'text-muted-foreground'}
                />
                <span>Infinite Canvas</span>
              </button>
            </div>

            {/* Folders and Chat Session List */}
            <div className="flex-1 overflow-y-auto px-2 space-y-1.5 scrollbar-none pt-3">
              <div className="flex items-center justify-between px-2.5 pb-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Chats
                </span>
                <button
                  onClick={() => {
                    const name = prompt('New Folder Name:');
                    if (name) createFolder(name);
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1"
                  title="New Folder"
                >
                  <FolderPlus size={13} />
                </button>
              </div>

              <div className="space-y-0.5">
                <AnimatePresence>
                  {folders?.map((folder) => {
                    const folderSessions = filteredSessions.filter((s) => s.folderId === folder.id);
                    return (
                      <FolderItem
                        key={folder.id}
                        folder={folder}
                        sessions={folderSessions}
                        activeSid={activeSid}
                        onDeleteFolder={() => deleteFolder(folder.id)}
                        onSelectSession={(id) => {
                          switchSession(id);
                          if (activeMode !== 'chat')
                            setActiveMode('chat');
                        }}
                        onDeleteSession={deleteSession}
                        updateSessionMeta={updateSessionMeta}
                        allFolders={folders}
                      />
                    );
                  })}

                  {filteredSessions
                    .filter((s) => !s.folderId)
                    .map((session) => (
                      <SessionItem
                        key={session.id}
                        session={session}
                        isActive={session.id === activeSid}
                        onClick={() => {
                          switchSession(session.id);
                          if (activeMode !== 'chat') {
                            setActiveMode('chat');
                          }
                        }}
                        onDelete={() => deleteSession(session.id)}
                        folders={folders}
                        onMoveToFolder={(folderId) => updateSessionMeta(session.id, { folderId })}
                      />
                    ))}

                  {filteredSessions.length === 0 && folders?.length === 0 && (
                    <div className="text-left py-4 pl-4">
                      <p className="text-[9px] text-muted-foreground/60 font-semibold uppercase tracking-wider">
                        No conversations
                      </p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Bottom Section (Model Library & Settings) */}
            <div className="px-4 py-3.5 border-t border-border mt-auto space-y-2">
              <LocalProviderStatus />
              <button
                onClick={() => { setActiveMode('registry'); }}
                className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md transition-all text-left cursor-pointer text-xs font-medium ${
                  activeMode === 'registry'
                    ? 'text-foreground bg-muted border border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Library
                  size={13}
                  className={activeMode === 'registry' ? 'text-primary' : 'text-muted-foreground'}
                />
                <span>Model Library</span>
              </button>

              <button
                onClick={() => { setActiveMode('compare'); }}
                className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md transition-all text-left cursor-pointer text-xs font-medium ${
                  activeMode === 'compare'
                    ? 'text-foreground bg-muted border border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Activity
                  size={13}
                  className={activeMode === 'compare' ? 'text-primary' : 'text-muted-foreground'}
                />
                <span>Model Comparison</span>
              </button>

              <button
                onClick={() => { setActiveMode('settings'); }}
                className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md transition-all text-left cursor-pointer text-xs font-medium ${
                  activeMode === 'settings'
                    ? 'text-foreground bg-muted border border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Settings
                  size={13}
                  className={activeMode === 'settings' ? 'text-primary' : 'text-muted-foreground'}
                />
                <span>Settings</span>
              </button>
            </div>
          </div>
        </motion.aside>

        {/* ── Collapsed Sidebar Toggle (Floating trigger) ───────────────── */}
        <AnimatePresence>
          {!sidebarOpen && activeMode !== 'chat' && (
            <motion.button
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              whileHover={{ scale: 1.05, backgroundColor: 'var(--muted)' }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSidebarOpen(true)}
              className="absolute top-[7px] left-3.5 z-30 p-1.5 rounded-md bg-secondary hover:bg-muted border border-border text-muted-foreground hover:text-foreground transition-all shadow-sm cursor-pointer"
            >
              <PanelLeftOpen size={14} />
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Main Content Canvas ────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 h-full relative overflow-hidden bg-background">
          <AnimatePresence mode="wait">
            <AppRouter
              activeMode={activeMode}
              setActiveMode={setActiveMode}
              apiKeys={apiKeys}
              chatSettings={chatSettings}
              setChatSettings={setChatSettings}
              trackUsage={trackUsage}
              statuses={statuses}
              chatSessions={activeSessions}
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen((p) => !p)}
              models={models}
              setModel={setModel}
              updateApiKey={updateApiKey}
              clearApiKeys={clearApiKeys}
              modelsState={modelsState}
              setModelsState={setModels}
              lightningState={lightningState}
              allModels={allModels}
            />
          </AnimatePresence>
        </div>

        {/* Command Palette */}
        <CommandPalette
          activeMode={activeMode}
          setActiveMode={setActiveMode}
          createSession={createSession}
          clearHistory={() => {}} // CommandPalette might need refactoring to clear history without accessing state directly
          models={models}
          setModel={setModel}
          allModels={allModels}
        />
      </main>
    </ErrorBoundary>
  );
};

/* ── Sidebar Nav Button ─────────────────────── */
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
    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium tracking-wide transition-all duration-200 cursor-pointer ${
      active
        ? 'bg-muted text-foreground border border-border font-semibold'
        : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
    }`}
  >
    <span
      className={`transition-all duration-200 ${active ? 'scale-105 text-primary' : 'text-muted-foreground'}`}
    >
      {icon}
    </span>
    <span>{label}</span>
  </motion.button>
);

/* ── Sub-components for Sidebar ──────────────── */

const FolderItem = ({ folder, sessions, activeSid, onDeleteFolder, onSelectSession, onDeleteSession, updateSessionMeta, allFolders }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="mb-1">
      <div 
        className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer group transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <ChevronRight size={12} className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          <Folder size={12} className="text-muted-foreground flex-shrink-0" />
          <span className="text-[11px] font-medium truncate opacity-80">{folder.name}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteFolder(); }}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-red-400 transition-all"
        >
          <Trash2 size={10} />
        </button>
      </div>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="pl-4 mt-0.5 space-y-0.5 border-l border-border/40 ml-2.5 overflow-hidden"
          >
            {sessions.length > 0 ? sessions.map((session: any) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === activeSid}
                onClick={() => onSelectSession(session.id)}
                onDelete={() => onDeleteSession(session.id)}
                folders={allFolders}
                onMoveToFolder={(folderId: string) => updateSessionMeta(session.id, { folderId })}
                isNested
              />
            )) : (
              <div className="py-1 px-2 text-[10px] text-muted-foreground/50 italic">Empty folder</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SessionItem = ({ session, isActive, onClick, onDelete, folders, onMoveToFolder, isNested = false }: any) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="relative group"
      onMouseLeave={() => setShowMenu(false)}
    >
      <button
        onClick={onClick}
        className={`w-full flex items-center justify-between ${isNested ? 'px-2 py-1.5' : 'px-2.5 py-1.5'} rounded-md text-[11px] transition-all cursor-pointer ${
          isActive
            ? 'bg-muted/80 text-foreground font-medium shadow-sm border border-border/50'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent'
        }`}
      >
        <span className="truncate pr-2 opacity-90">{session.title || 'New Chat'}</span>
      </button>

      {/* Action buttons appear on hover */}
      <div className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? 'opacity-100' : ''}`}>
        <div className="relative">
          <button 
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className={`p-1 rounded text-muted-foreground hover:text-foreground hover:bg-background shadow-sm transition-colors ${isActive ? 'bg-background/50' : ''}`}
          >
            <MoreHorizontal size={11} />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-32 py-1 bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden">
              <div className="px-2 py-1 text-[9px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/30">Move to</div>
              <button 
                onClick={(e) => { e.stopPropagation(); onMoveToFolder(null); setShowMenu(false); }}
                className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-muted transition-colors"
              >
                No Folder
              </button>
              {folders?.map((f: any) => (
                <button 
                  key={f.id}
                  onClick={(e) => { e.stopPropagation(); onMoveToFolder(f.id); setShowMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-muted transition-colors truncate"
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </div>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={`p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors ${isActive ? 'bg-background/50' : ''}`}
          title="Delete Conversation"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </motion.div>
  );
};
