import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Cpu,
  MessageSquare,
  Library,
  Settings,
  Check,
  CornerDownLeft,
  ArrowLeft,
} from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { AVAILABLE_MODELS } from '@shared/config/models';

interface CommandPaletteProps {
  activeMode: 'registry' | 'settings' | 'chat' | 'compare' | 'workspace';
  setActiveMode: (mode: 'registry' | 'settings' | 'chat' | 'compare' | 'workspace') => void;
  createSession: (initialMessages?: any[]) => string;
  clearHistory: () => void;
  models: Record<'nyx', string>;
  setModel: (modelId: string) => void;
  allModels?: any[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  activeMode,
  setActiveMode,
  createSession,
  clearHistory,
  models,
  setModel,
  allModels,
}) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'commands' | 'models'>('commands');
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const privacyMode = useNyxStore((state) => state.privacyMode);
  const setPrivacyMode = useNyxStore((state) => state.setPrivacyMode);

  const currentModelId = models['nyx'];

  // Global keyboard shortcut listeners (even when closed)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Toggle Palette: Cmd+K / Ctrl+K
      if (cmdOrCtrl && e.key.toLowerCase() === 'k' && !e.shiftKey) {
        e.preventDefault();
        setOpen((p) => {
          if (p) {
            setQuery('');
            return false;
          }
          setView('commands');
          setSelectedIndex(0);
          return true;
        });
      }

      // New Chat: Cmd+N / Ctrl+N
      if (cmdOrCtrl && e.key.toLowerCase() === 'n' && !e.shiftKey) {
        e.preventDefault();
        createSession([]);
        setActiveMode('chat');
        toast.success('Started a new conversation');
        setOpen(false);
      }

      // Clear History: Cmd+Shift+K / Ctrl+Shift+K
      if (cmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        clearHistory();
        toast.success('Conversation context cleared');
        setOpen(false);
      }

      // Toggle Privacy: Cmd+Shift+P / Ctrl+Shift+P
      if (cmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        const nextMode = !privacyMode;
        setPrivacyMode(nextMode);
        if (nextMode) {
          toast.warning('Privacy Mode Enabled: Zero disk footprints.');
        } else {
          toast.info('Privacy Mode Disabled: Saved to disk.');
        }
        setOpen(false);
      }

      // Switch Model Menu: Cmd+M / Ctrl+M
      if (cmdOrCtrl && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setOpen(true);
        setView('models');
        setSelectedIndex(0);
        setQuery('');
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [createSession, clearHistory, privacyMode, setPrivacyMode, setActiveMode, activeMode]);

  // Focus input when palette opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, view]);

  // Reset selected index when query or view changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, view]);

  // Base Commands list
  const commands = useMemo(() => {
    const list = [
      {
        id: 'new_chat',
        title: 'New Conversation',
        subtitle: 'Start a clean chat session',
        icon: <Plus size={16} />,
        shortcut: ['⌘', 'N'],
        action: () => {
          createSession([]);
          setActiveMode('chat');
          toast.success('New conversation started');
        },
      },
      {
        id: 'clear_chat',
        title: 'Clear Chat Context',
        subtitle: 'Wipe current message stream',
        icon: <Trash2 size={16} />,
        shortcut: ['⌘', '⇧', 'K'],
        action: () => {
          clearHistory();
          toast.success('Chat context cleared');
        },
      },
      {
        id: 'toggle_privacy',
        title: privacyMode ? 'Disable Privacy Mode' : 'Enable Privacy Mode',
        subtitle: privacyMode ? 'Resume SQLite database syncing' : 'Incognito memory-only session',
        icon: privacyMode ? <Unlock size={16} /> : <Lock size={16} />,
        shortcut: ['⌘', '⇧', 'P'],
        action: () => {
          const next = !privacyMode;
          setPrivacyMode(next);
          if (next) {
            toast.warning('Privacy Mode Enabled');
          } else {
            toast.info('Privacy Mode Disabled');
          }
        },
      },
      {
        id: 'switch_model',
        title: 'Switch AI Model...',
        subtitle: 'Select available GGUF/Cloud model',
        icon: <Cpu size={16} />,
        shortcut: ['⌘', 'M'],
        action: () => setView('models'),
      },
      {
        id: 'go_chat',
        title: 'Go to NYX',
        subtitle: 'Open the conversational AI workspace',
        icon: <MessageSquare size={16} />,
        action: () => {
          setActiveMode('chat');
        },
      },
      {
        id: 'go_registry',
        title: 'Go to Model Library',
        subtitle: 'Download or manage GGUF models',
        icon: <Library size={16} />,
        action: () => {
          setActiveMode('registry');
        },
      },
      {
        id: 'go_settings',
        title: 'Go to Settings',
        subtitle: 'Configure workspaces and API keys',
        icon: <Settings size={16} />,
        action: () => {
          setActiveMode('settings');
        },
      },
    ];

    return list.filter(
      (cmd) =>
        cmd.title.toLowerCase().includes(query.toLowerCase()) ||
        cmd.subtitle.toLowerCase().includes(query.toLowerCase())
    );
  }, [query, privacyMode, createSession, clearHistory, setPrivacyMode, setActiveMode]);

  // Models list filter
  const filteredModels = useMemo(() => {
    if (view !== 'models') return [];
    const source = allModels || AVAILABLE_MODELS;
    return source.filter(
      (model) =>
        model.name.toLowerCase().includes(query.toLowerCase()) ||
        model.provider.toLowerCase().includes(query.toLowerCase()) ||
        model.id.toLowerCase().includes(query.toLowerCase())
    );
  }, [view, query, allModels]);

  // Keyboard navigation inside the open palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const listLength = view === 'commands' ? commands.length : filteredModels.length;

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % listLength);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + listLength) % listLength);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (listLength === 0) return;

      if (view === 'commands') {
        const cmd = commands[selectedIndex];
        if (cmd) {
          cmd.action();
          if (cmd.id !== 'switch_model') {
            setOpen(false);
            setQuery('');
          }
        }
      } else {
        const mdl = filteredModels[selectedIndex];
        if (mdl) {
          setModel(mdl.id);
          toast.success(`Switched to ${mdl.name}`);
          setOpen(false);
          setQuery('');
        }
      }
    } else if (e.key === 'Backspace' && query === '' && view === 'models') {
      e.preventDefault();
      setView('commands');
    }
  };

  // Keep selected item in view
  useEffect(() => {
    if (listRef.current && listRef.current.children.length > 0) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, view, query]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Palette Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="relative w-full max-w-[600px] rounded-xl border border-border bg-card shadow-2xl overflow-hidden font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header / Input Area */}
            <div className="flex items-center px-4 py-3 border-b border-border bg-muted/30">
              {view === 'models' ? (
                <button
                  onClick={() => {
                    setView('commands');
                    setQuery('');
                  }}
                  className="mr-3 p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                  title="Back to Commands (Backspace)"
                >
                  <ArrowLeft size={16} />
                </button>
              ) : (
                <Search size={18} className="text-muted-foreground mr-3" />
              )}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  view === 'commands'
                    ? 'Type a command or search...'
                    : 'Search for an AI model...'
                }
                className="flex-1 bg-transparent border-none outline-none text-[15px] placeholder:text-muted-foreground/60 text-foreground py-1"
                spellCheck={false}
                autoComplete="off"
              />
              <div className="flex items-center gap-1.5 ml-3">
                <kbd className="hidden sm:inline-flex items-center justify-center h-5 px-1.5 rounded bg-muted border border-border text-[10px] font-medium text-muted-foreground uppercase shadow-sm">
                  ESC
                </kbd>
                <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">
                  to close
                </span>
              </div>
            </div>

            {/* Results List */}
            <div
              ref={listRef}
              className="max-h-[340px] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
            >
              {view === 'commands' && commands.length > 0 && (
                <div className="space-y-1">
                  {commands.map((cmd, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <div
                        key={cmd.id}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={() => {
                          cmd.action();
                          if (cmd.id !== 'switch_model') {
                            setOpen(false);
                            setQuery('');
                          }
                        }}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`flex items-center justify-center w-7 h-7 rounded-md ${
                              isSelected ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {cmd.icon}
                          </div>
                          <div className="flex flex-col truncate">
                            <span className={`text-[13px] font-medium ${isSelected ? 'text-primary' : ''}`}>
                              {cmd.title}
                            </span>
                            <span className="text-[11px] text-muted-foreground truncate">
                              {cmd.subtitle}
                            </span>
                          </div>
                        </div>
                        {cmd.shortcut && (
                          <div className="flex items-center gap-1 ml-4 shrink-0">
                            {cmd.shortcut.map((key, i) => (
                              <kbd
                                key={i}
                                className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded border text-[11px] font-medium shadow-sm ${
                                  isSelected
                                    ? 'bg-primary/20 border-primary/30 text-primary'
                                    : 'bg-background border-border text-muted-foreground'
                                }`}
                              >
                                {key}
                              </kbd>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {view === 'models' && filteredModels.length > 0 && (
                <div className="space-y-1">
                  {filteredModels.map((mdl, idx) => {
                    const isSelected = idx === selectedIndex;
                    const isActive = currentModelId === mdl.id;
                    return (
                      <div
                        key={mdl.id}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={() => {
                          setModel(mdl.id);
                          toast.success(`Switched to ${mdl.name}`);
                          setOpen(false);
                          setQuery('');
                        }}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary/10' : 'hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`flex items-center justify-center w-7 h-7 rounded-md ${
                              isActive
                                ? 'bg-green-500/20 text-green-500'
                                : isSelected
                                ? 'bg-primary/20 text-primary'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            <Cpu size={14} />
                          </div>
                          <div className="flex flex-col truncate">
                            <span
                              className={`text-[13px] font-medium flex items-center gap-2 ${
                                isSelected ? 'text-primary' : 'text-foreground'
                              }`}
                            >
                              {mdl.name}
                              {isActive && (
                                <span className="text-[9px] uppercase tracking-widest font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded">
                                  Active
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] text-muted-foreground truncate uppercase tracking-wide">
                              {mdl.provider} • {mdl.contextSize ? `${Math.round(mdl.contextSize / 1024)}k ctx` : 'Unknown ctx'}
                            </span>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="text-primary ml-4 shrink-0 flex items-center gap-1.5 text-[11px] font-medium">
                            <span>Select</span>
                            <CornerDownLeft size={12} />
                          </div>
                        )}
                        {isActive && !isSelected && (
                          <div className="text-green-500 ml-4 shrink-0">
                            <Check size={16} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Empty States */}
              {view === 'commands' && commands.length === 0 && (
                <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
                  <Search size={24} className="mb-2 opacity-20" />
                  <p className="text-[13px] font-medium">No commands found</p>
                  <p className="text-[11px] opacity-60">Try searching for something else</p>
                </div>
              )}

              {view === 'models' && filteredModels.length === 0 && (
                <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
                  <Cpu size={24} className="mb-2 opacity-20" />
                  <p className="text-[13px] font-medium">No models found</p>
                  <p className="text-[11px] opacity-60">Try a different search term</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-[10px] text-muted-foreground/70 font-medium">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="inline-flex items-center justify-center h-4 px-1 rounded border border-border/50 bg-background text-[9px] shadow-sm font-sans">
                    ↑
                  </kbd>
                  <kbd className="inline-flex items-center justify-center h-4 px-1 rounded border border-border/50 bg-background text-[9px] shadow-sm font-sans">
                    ↓
                  </kbd>
                  <span>Navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="inline-flex items-center justify-center h-4 px-1 rounded border border-border/50 bg-background text-[9px] shadow-sm font-sans">
                    ↵
                  </kbd>
                  <span>Select</span>
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span>NYX Command Menu</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
