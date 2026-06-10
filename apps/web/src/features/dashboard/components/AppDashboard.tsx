// @ts-nocheck
/**
 * @file src/components/AppDashboard.tsx
 * @description Claude Desktop-style dashboard with a warm-slate sidebar, Chat/Coder pages,
 *              main chat canvas, and top-level view routing (chat / coder / registry / settings).
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
  Box,
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
    activeMode,
    setActiveMode,
    apiKeys,
    chatSettings,
    setChatSettings,
    coderSettings,
    setCoderSettings,
    trackUsage,
    statuses,
    models,
    setModels,
    setModel,
    modelsState,
    updateApiKey,
    clearApiKeys,
    localLibraryModels,
  } = useDashboardState(onExit);

  const allModels = React.useMemo(() => {
    const seen = new Set();
    const filteredAvailable = AVAILABLE_MODELS.filter((m) => m.provider !== 'ollama');
    const merged = [...localLibraryModels, ...filteredAvailable];
    return merged.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [localLibraryModels]);

  const { theme } = useTheme();

  // Instantiate two completely separate session pools
  const chatSessions = useChatSessions('chat');
  const coderSessions = useChatSessions('coder');

  // Agent Lightning state
  const lightningState = useAgentLightning();

  // Select active sessions list depending on active page mode
  const activeSessions = activeMode === 'coder' ? coderSessions : chatSessions;
  const {
    sessions,
    folders,
    activeSid,
    deleteSession,
    switchSession,
    createSession,
    createFolder,
    deleteFolder,
    updateSessionMeta,
  } = activeSessions;

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sidebarVariants = {
    open: { width: 200, opacity: 1 },
    closed: { width: 0, opacity: 0 },
  };

  return (
    <ErrorBoundary>
      <main
        className={`h-[100dvh] w-screen overflow-hidden flex bg-background text-foreground antialiased selection:bg-primary/20 ${theme === 'dark' ? 'dark' : ''}`}
      >
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

        {/* ── Collapsible Sidebar ────────────────────── */}
        <motion.aside
          variants={sidebarVariants}
          initial="open"
          animate={sidebarOpen ? 'open' : 'closed'}
          transition={{ type: 'spring', stiffness: 380, damping: 35 }}
          className={`h-full overflow-hidden flex flex-col bg-card border-r border-border relative z-30 ${isMobile ? 'fixed inset-y-0 left-0 shadow-sm border border-border w-[200px]' : 'flex-none z-20'}`}
        >
          <div className="flex flex-col h-full min-w-[200px] bg-card">
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
                  if (activeMode !== 'coder' && activeMode !== 'chat') {
                    setActiveMode('coder');
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
                onClick={() => { setActiveMode('coder'); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-all text-left cursor-pointer ${
                  activeMode === 'coder'
                    ? 'text-foreground bg-muted border border-border font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
                }`}
              >
                <Box
                  size={13}
                  className={activeMode === 'coder' ? 'text-primary' : 'text-muted-foreground'}
                />
                <span>NYX Coder</span>
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
                          if (activeMode !== 'coder' && activeMode !== 'chat')
                            setActiveMode('coder');
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
                          if (activeMode !== 'coder' && activeMode !== 'chat') {
                            setActiveMode('coder');
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
            <div className="px-4 py-3.5 border-t border-border mt-auto space-y-1">
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
          {!sidebarOpen && activeMode !== 'coder' && activeMode !== 'chat' && (
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
              coderSettings={coderSettings}
              setCoderSettings={setCoderSettings}
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

/* ── Recent Chat Session Item ──────────────────────────────────────────── */
const SessionItem: React.FC<{
  session: { id: string; title: string; updatedAt: number; folderId?: string | null };
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  folders?: { id: string; name: string }[];
  onMoveToFolder?: (folderId: string | null) => void;
}> = ({ session, isActive, onClick, onDelete, folders, onMoveToFolder }) => {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
      onMouseLeave={() => {
        setHovered(false);
        setMenuOpen(false);
      }}
      className={`group relative flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer transition-all ${
        isActive
          ? 'text-foreground font-semibold bg-muted border border-border'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
      onClick={onClick}
    >
      <span className="flex-1 text-[11px] truncate tracking-normal font-medium">
        {session.title}
      </span>

      <div className="flex items-center gap-2 shrink-0 select-none ml-2 relative">
        {(hovered || menuOpen) && onMoveToFolder && folders && folders.length > 0 && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
              title="Move to Folder"
            >
              <MoreHorizontal size={9} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-popover border border-border rounded-md shadow-md py-1 z-50">
                <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground uppercase">
                  Move to...
                </div>
                {session.folderId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveToFolder(null);
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-foreground hover:bg-muted"
                  >
                    Remove from Folder
                  </button>
                )}
                {folders
                  .filter((f) => f.id !== session.folderId)
                  .map((f) => (
                    <button
                      key={f.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveToFolder(f.id);
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-foreground hover:bg-muted truncate"
                    >
                      {f.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {hovered ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 rounded bg-destructive/10 text-destructive/60 hover:text-destructive hover:bg-destructive/20 transition-all cursor-pointer"
            title="Delete Chat"
          >
            <Trash2 size={9} />
          </button>
        ) : isActive ? (
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        ) : (
          <span className="text-[9px] text-muted-foreground font-mono tracking-tighter">
            {timeAgo(session.updatedAt)}
          </span>
        )}
      </div>
    </motion.div>
  );
};

/* ── Folder Item ──────────────────────────────────────────── */
const FolderItem: React.FC<{
  folder: { id: string; name: string };
  sessions: any[];
  activeSid: string | null;
  onDeleteFolder: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  updateSessionMeta: (id: string, meta: any) => void;
  allFolders: { id: string; name: string }[];
}> = ({
  folder,
  sessions,
  activeSid,
  onDeleteFolder,
  onSelectSession,
  onDeleteSession,
  updateSessionMeta,
  allFolders,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Auto-open if active session is in this folder
  React.useEffect(() => {
    if (sessions.some((s) => s.id === activeSid)) setIsOpen(true);
  }, [activeSid, sessions]);

  return (
    <div className="mb-1">
      <motion.div
        layout
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="group flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <Folder size={12} className={isOpen ? 'text-primary' : 'text-muted-foreground'} />
          <span className="text-[11px] font-semibold">{folder.name}</span>
        </div>
        {hovered && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteFolder();
            }}
            className="p-1 rounded bg-destructive/10 text-destructive/60 hover:text-destructive hover:bg-destructive/20 transition-all cursor-pointer"
            title="Delete Folder"
          >
            <Trash2 size={9} />
          </button>
        )}
      </motion.div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden pl-3 border-l border-border ml-3 mt-0.5 space-y-0.5"
          >
            {sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === activeSid}
                onClick={() => onSelectSession(session.id)}
                onDelete={() => onDeleteSession(session.id)}
                folders={allFolders}
                onMoveToFolder={(folderId) => updateSessionMeta(session.id, { folderId })}
              />
            ))}
            {sessions.length === 0 && (
              <div className="px-3 py-1.5 text-[9px] text-zinc-600">Empty</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
