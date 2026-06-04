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
  activeMode: 'coder' | 'registry' | 'settings' | 'chat';
  setActiveMode: (mode: 'coder' | 'registry' | 'settings' | 'chat') => void;
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
        setActiveMode(activeMode === 'chat' ? 'chat' : 'coder');
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
          setActiveMode(activeMode === 'chat' ? 'chat' : 'coder');
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
        id: 'go_coder',
        title: 'Go to NYX Coder',
        subtitle: 'Open the code editing and chat workspace',
        icon: <MessageSquare size={16} />,
        action: () => {
          setActiveMode('coder');
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
      if (listLength > 0) {
        triggerItem(selectedIndex);
      }
    } else if (e.key === 'Backspace' && query === '' && view === 'models') {
      e.preventDefault();
      setView('commands');
    }
  };

  const triggerItem = (index: number) => {
    if (view === 'commands') {
      const cmd = commands[index];
      if (cmd) {
        cmd.action();
        if (cmd.id !== 'switch_model') {
          setOpen(false);
          setQuery('');
        }
      }
    } else if (view === 'models') {
      const model = filteredModels[index];
      if (model) {
        setModel(model.id);
        toast.success(`Active model set to: ${model.name}`);
        setOpen(false);
        setQuery('');
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] px-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0 }}
            onClick={() => {
              setOpen(false);
              setQuery('');
            }}
            className="fixed inset-0 bg-black/60 backdrop-blur-[4px]"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-zinc-950 border border-white/[0.08] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] flex flex-col relative"
          >
            {/* Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.05]">
              {view === 'models' ? (
                <button
                  onClick={() => setView('commands')}
                  className="p-1 rounded-md text-zinc-500 hover:text-white hover:bg-white/5 transition-all"
                  title="Back to commands"
                >
                  <ArrowLeft size={16} />
                </button>
              ) : (
                <Search size={18} className="text-zinc-500" />
              )}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={view === 'models' ? 'Search models...' : 'Type a command or search...'}
                className="flex-1 bg-transparent border-0 outline-0 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-0"
              />
              <span className="text-[10px] font-bold text-zinc-600 bg-white/5 px-2 py-0.5 rounded border border-white/[0.02] uppercase tracking-wider select-none">
                esc
              </span>
            </div>

            {/* List Content */}
            <div
              ref={listRef}
              className="max-h-[320px] overflow-y-auto p-2 space-y-0.5 scrollbar-thin scrollbar-thumb-white/5"
            >
              {view === 'commands' && (
                <>
                  {commands.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 text-xs">
                      No matching commands found.
                    </div>
                  ) : (
                    commands.map((cmd, idx) => (
                      <div
                        key={cmd.id}
                        data-active={idx === selectedIndex}
                        onClick={() => triggerItem(idx)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-all ${
                          idx === selectedIndex
                            ? 'bg-white/[0.06] text-white'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`p-1.5 rounded-lg border transition-all ${
                              idx === selectedIndex
                                ? 'bg-white/10 border-white/10 text-white animate-pulse'
                                : 'bg-white/[0.02] border-white/[0.03] text-zinc-500'
                            }`}
                          >
                            {cmd.icon}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold">{cmd.title}</p>
                            <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                              {cmd.subtitle}
                            </p>
                          </div>
                        </div>
                        {cmd.shortcut && (
                          <div className="flex gap-0.5 select-none pl-2">
                            {cmd.shortcut.map((key, i) => (
                              <kbd
                                key={i}
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-zinc-500 border border-white/[0.02]"
                              >
                                {key}
                              </kbd>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </>
              )}

              {view === 'models' && (
                <>
                  {filteredModels.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 text-xs">
                      No matching models found.
                    </div>
                  ) : (
                    filteredModels.map((model, idx) => {
                      const isSelected = model.id === currentModelId;
                      return (
                        <div
                          key={model.id}
                          data-active={idx === selectedIndex}
                          onClick={() => triggerItem(idx)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-all ${
                            idx === selectedIndex
                              ? 'bg-white/[0.06] text-white'
                              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={`p-1.5 rounded-lg border transition-all ${
                                idx === selectedIndex
                                  ? 'bg-[#FF3366]/10 border-[#FF3366]/20 text-[#FF3366]'
                                  : 'bg-white/[0.02] border-white/[0.03] text-zinc-500'
                              }`}
                            >
                              <Cpu size={16} />
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold flex items-center gap-1.5">
                                <span>{model.name}</span>
                                <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 bg-white/5 px-1 py-0.2 rounded border border-white/[0.02]">
                                  {model.provider}
                                </span>
                              </p>
                              <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                                {model.description}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 select-none">
                            {isSelected && <Check size={14} className="text-[#FF3366]" />}
                            {idx === selectedIndex && (
                              <CornerDownLeft size={10} className="text-zinc-500 opacity-60" />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>

            {/* Bottom Help Bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-white/[0.01] border-t border-white/[0.03] text-[10px] text-zinc-500 select-none">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.2 rounded bg-white/5 border border-white/[0.02]">
                    ↑↓
                  </kbd>{' '}
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.2 rounded bg-white/5 border border-white/[0.02]">
                    Enter
                  </kbd>{' '}
                  Select
                </span>
                {view === 'models' && (
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.2 rounded bg-white/5 border border-white/[0.02]">
                      Backspace
                    </kbd>{' '}
                    Back
                  </span>
                )}
              </div>
              <div className="text-[9px] uppercase tracking-wider text-zinc-600 font-bold">
                NYX Quick Commands
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
