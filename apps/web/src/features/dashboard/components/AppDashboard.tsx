// @ts-nocheck
import { AnimatedIcon } from '@shared/components/ui/animated-icon';
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
import { SettingsIcon as Settings, Trash2Icon as Trash2, ChevronRightIcon as ChevronRight, UserIcon as User, ActivityIcon as Activity, FolderIcon, LayersIcon as Layers } from '@animateicons/react/lucide';
import { Plus, PanelLeftOpen, MessageSquare, Library, FolderPlus, MoreHorizontal, Folder, Users, GitBranch, FileText, Image, Plug, Calendar, Code2, Brain } from 'lucide-react';
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

        {/* Mobile Sidebar Backdrop Overlay */}
        <AnimatePresence>
          {isMobile && sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-10 cursor-pointer"
            />
          )}
        </AnimatePresence>

        {/* ── Desktop/Tablet Sidebar ──────────────────────────────────────── */}
        <motion.aside
          initial={false}
          animate={{
            width: sidebarOpen ? 256 : 0, // w-64 is 256px
            opacity: sidebarOpen ? 1 : 0,
          }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={`flex-shrink-0 flex flex-col justify-between border-r border-outline-variant/30 bg-surface-container-low py-6 px-4 z-20 ${
            isMobile && sidebarOpen ? 'absolute left-0 top-0 bottom-0 shadow-2xl' : 'relative'
          } overflow-hidden`}
        >
          <div className="flex flex-col gap-6 h-full min-w-[224px]">
            {/* Header/Brand */}
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-tertiary flex items-center justify-center text-on-primary font-bold shadow-sm">
                N
              </div>
              <span className="font-semibold text-lg tracking-tight text-on-surface">NYX</span>
            </div>

            {/* Main Navigation */}
            <nav className="flex flex-col gap-1 mt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  createSession([]);
                  if (activeMode !== 'chat') setActiveMode('chat');
                }}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-high text-on-surface hover:bg-surface-container-highest cursor-pointer transition-all active:scale-[0.98] mb-3"
              >
                <Plus className="w-5 h-5 text-primary" />
                <span className="font-medium">New Chat</span>
              </button>
              
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setActiveMode('chat')}
                  className={`flex items-center gap-3 p-2 rounded-lg font-medium transition-colors ${
                    activeMode === 'chat' 
                      ? 'bg-secondary-container text-on-secondary-container' 
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  Chats
                </button>
                <button
                  onClick={() => setActiveMode('projects')}
                  className={`flex items-center gap-3 p-2 rounded-lg font-medium transition-colors ${
                    activeMode === 'projects' 
                      ? 'bg-secondary-container text-on-secondary-container' 
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  <Folder className="w-4 h-4" />
                  Projects
                </button>
                <button
                  onClick={() => setActiveMode('swarm')}
                  className={`flex items-center gap-3 p-2 rounded-lg font-medium transition-colors ${
                    activeMode === 'swarm' 
                      ? 'bg-secondary-container text-on-secondary-container' 
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Agents
                </button>
                <button
                  onClick={() => setActiveMode('workspace')}
                  className={`flex items-center gap-3 p-2 rounded-lg font-medium transition-colors ${
                    activeMode === 'workspace' 
                      ? 'bg-secondary-container text-on-secondary-container' 
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  Canvas
                </button>
              </div>
            </nav>

            {/* Recent Chats */}
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Recent</span>
                <button
                  onClick={() => {
                    const name = prompt('New Folder Name:');
                    if (name) createFolder(name);
                  }}
                  className="text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer p-1"
                  title="New Folder"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
              </div>
              
              <div className="flex flex-col gap-1 overflow-y-auto pr-1 custom-scrollbar">
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
                          if (activeMode !== 'chat') setActiveMode('chat');
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
                        isActive={session.id === activeSid && activeMode === 'chat'}
                        onClick={() => {
                          switchSession(session.id);
                          if (activeMode !== 'chat') setActiveMode('chat');
                        }}
                        onDelete={() => deleteSession(session.id)}
                        folders={folders}
                        onMoveToFolder={(folderId) => updateSessionMeta(session.id, { folderId })}
                      />
                    ))}

                  {filteredSessions.length === 0 && folders?.length === 0 && (
                     <div className="text-left py-4 pl-2">
                       <p className="text-[11px] text-on-surface-variant font-medium">
                         No conversations
                       </p>
                     </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* User / Settings (Bottom) */}
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-outline-variant/30 w-full min-w-[224px]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface">
                <User className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-on-surface leading-tight">User</span>
                <span className="text-[10px] text-on-surface-variant">Pro Plan</span>
              </div>
            </div>
            <div className="flex gap-1">
               <button 
                 onClick={() => setActiveMode('settings')}
                 className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors"
               >
                 <Settings className="w-4 h-4" />
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
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSidebarOpen(true)}
              className="absolute top-[12px] left-[12px] z-30 p-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/30 text-on-surface-variant hover:text-on-surface transition-all shadow-sm cursor-pointer"
            >
              <PanelLeftOpen size={16} />
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
          clearHistory={() => {}}
          models={models}
          setModel={setModel}
          allModels={allModels}
        />
      </main>
    </ErrorBoundary>
  );
};

/* ── Sub-components for Sidebar ──────────────── */

const FolderItem = ({ folder, sessions, activeSid, onDeleteFolder, onSelectSession, onDeleteSession, updateSessionMeta, allFolders }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="mb-1">
      <div 
        className="flex items-center justify-between p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high cursor-pointer group transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <ChevronRight size={14} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          <Folder size={14} className="flex-shrink-0 opacity-70" />
          <span className="text-sm font-medium truncate opacity-90">{folder.name}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteFolder(); }}
          className="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-error transition-all rounded-md"
        >
          <Trash2 size={12} />
        </button>
      </div>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="pl-6 mt-1 flex flex-col gap-1 overflow-hidden"
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
              <div className="py-1 px-2 text-xs text-on-surface-variant/70 italic">Empty folder</div>
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
      <div
        onClick={onClick}
        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
          isActive
            ? 'bg-secondary-container text-on-secondary-container'
            : 'text-on-surface-variant hover:bg-surface-container-high'
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden w-full">
          {!isNested && <MessageSquare className={`w-4 h-4 flex-shrink-0 ${isActive ? '' : 'opacity-70'}`} />}
          <span className={`text-sm font-medium truncate ${isActive ? '' : 'opacity-90'}`}>
            {session.title || 'New Chat'}
          </span>
        </div>
        
        {/* Action buttons appear on hover */}
        <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? 'opacity-100' : ''}`}>
          <div className="relative">
            <button 
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className="p-1 hover:bg-on-surface-variant/10 rounded-md transition-all"
            >
              <MoreHorizontal size={14} />
            </button>
            
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-36 py-1 bg-surface-container-high border border-outline-variant/30 rounded-xl shadow-lg z-50 overflow-hidden text-on-surface">
                <div className="px-3 py-1.5 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider bg-surface-container-highest/50">Move to</div>
                <button 
                  onClick={(e) => { e.stopPropagation(); onMoveToFolder(null); setShowMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-surface-container-highest transition-colors"
                >
                  No Folder
                </button>
                {folders?.map((f: any) => (
                  <button 
                    key={f.id}
                    onClick={(e) => { e.stopPropagation(); onMoveToFolder(f.id); setShowMenu(false); }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-surface-container-highest transition-colors truncate"
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
            className="p-1 hover:bg-error/10 hover:text-error rounded-md transition-all text-on-surface-variant"
            title="Delete Conversation"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};
