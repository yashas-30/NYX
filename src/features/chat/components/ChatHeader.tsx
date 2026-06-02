/**
 * @file src/features/chat/components/ChatHeader.tsx
 * @description Production-grade chat header with model switching, context
 *   monitoring, attachment support, and Claude/Kimi-parity UX.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trash2,
  PanelLeftOpen,
  PanelLeftClose,
  ChevronDown,
  Share2,
  Lock,
  Unlock,
  Zap,
  Square,
  Paperclip,
  Bot,
  Cpu,
  Wifi,
  WifiOff,
  Clock,
  MessageSquare,
  FileText,
  Download,
  Check,
  X,
  MoreHorizontal,
  Keyboard,
  AlertCircle,
  HardDrive,
} from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { ModelSelector } from '@src/shared/components/ModelSelector';
import { getCustomModelIcon } from '@src/shared/utils/modelIcons';
import { ModelInfo } from '@src/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { ModelInfo };

export interface ChatMetrics {
  latency: number;
  tokens: number;
  tps: number;
  totalMessages: number;
  contextTokens: number;
  contextLimit: number;
}

export interface ChatHeaderProps {
  metrics: ChatMetrics;
  isLoading: boolean;
  onClear: () => void;
  onStopGeneration?: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  sessionTitle?: string;
  onTitleChange?: (title: string) => void;
  onOpenLightning?: () => void;
  availableModels?: any[];
  activeModel?: any;
  onModelChange?: any;
  allModels?: any[];
  currentModelId?: string | null;
  currentModel?: any;
  onModelSelect?: (id: string) => void;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  gatewayUrls?: Record<string, string>;
  onAttachFiles?: (files: File[]) => void;
  onExportChat?: (format: 'markdown' | 'json' | 'txt') => void;
  connectionStatus?: 'online' | 'offline' | 'degraded';
  isNewChat?: boolean;
  onShareChat?: () => Promise<string>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTEXT_WARNING_THRESHOLD = 0.8;
const CONTEXT_CRITICAL_THRESHOLD = 0.95;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLatency(ms: number): string {
  if (ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms >= 60000) {
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(1);
    return `${mins}m ${secs}s`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem}s`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ContextBar: React.FC<{ used: number; limit: number }> = ({ used, limit }) => {
  const ratio = Math.min(used / limit, 1);
  const isWarning = ratio > CONTEXT_WARNING_THRESHOLD;
  const isCritical = ratio > CONTEXT_CRITICAL_THRESHOLD;

  return (
    <div
      className="flex items-center gap-2 group cursor-help"
      title={`${formatTokens(used)} / ${formatTokens(limit)} tokens`}
    >
      <div className="w-16 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'}`}
          initial={{ width: 0 }}
          animate={{ width: `${ratio * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <span
        className={`text-[10px] font-mono ${isCritical ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-zinc-600'} group-hover:text-zinc-400 transition-colors`}
      >
        {Math.round(ratio * 100)}%
      </span>
    </div>
  );
};

const ConnectionDot: React.FC<{ status: ChatHeaderProps['connectionStatus'] }> = ({ status }) => {
  const colors = {
    online: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]',
    degraded: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.4)] animate-pulse',
    offline: 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]',
  };
  const labels = { online: 'Connected', degraded: 'Slow', offline: 'Disconnected' };

  return (
    <div className="flex items-center gap-1.5" title={labels[status || 'online']}>
      <span className={`w-1.5 h-1.5 rounded-full ${colors[status || 'online']}`} />
      <span className="text-[10px] text-zinc-600 hidden lg:inline">
        {labels[status || 'online']}
      </span>
    </div>
  );
};

const AttachmentButton: React.FC<{ onAttach: (files: File[]) => void; disabled?: boolean }> = ({
  onAttach,
  disabled,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onAttach(files);
    },
    [onAttach]
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onAttach(files);
          e.target.value = '';
        }}
      />
      <motion.button
        whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.05)' }}
        whileTap={{ scale: 0.94 }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        disabled={disabled}
        className={`p-2 rounded-xl border transition-all cursor-pointer relative ${
          dragOver
            ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
            : 'text-zinc-500 hover:text-white border-transparent hover:border-white/5'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        title="Attach files (or drag & drop)"
      >
        <Paperclip size={13} strokeWidth={1.8} />
        {dragOver && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 rounded-xl border-2 border-dashed border-sky-400/50 bg-sky-500/5 flex items-center justify-center"
          >
            <span className="text-[10px] text-sky-400 font-medium">Drop files</span>
          </motion.div>
        )}
      </motion.button>
    </>
  );
};

const ShareMenu: React.FC<{
  onExport: ChatHeaderProps['onExportChat'];
  title: string;
  onShareChat?: () => Promise<string>;
}> = ({ onExport, title, onShareChat }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleCopyLink = async () => {
    try {
      const url = onShareChat ? await onShareChat() : window.location.href;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  return (
    <div ref={ref} className="relative">
      <motion.button
        whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.05)' }}
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen(!open)}
        className="p-2 rounded-xl text-zinc-500 hover:text-white border border-transparent hover:border-white/5 transition-all cursor-pointer"
        title="Share & Export"
      >
        <Share2 size={13} strokeWidth={1.8} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            className="absolute top-full right-0 mt-1 w-56 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
          >
            <div className="px-3 py-2 border-b border-white/5">
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                Share
              </span>
            </div>

            <button
              onClick={handleCopyLink}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.04] transition-colors text-left"
            >
              {copied ? (
                <Check size={13} className="text-emerald-400" />
              ) : (
                <Share2 size={13} className="text-zinc-500" />
              )}
              <span className="text-[12px] text-zinc-300">{copied ? 'Copied!' : 'Copy link'}</span>
            </button>

            {onExport && (
              <>
                <div className="px-3 py-1.5 border-t border-white/5">
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                    Export
                  </span>
                </div>
                {(['markdown', 'json', 'txt'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => {
                      onExport(fmt);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <FileText size={13} className="text-zinc-500" />
                    <span className="text-[12px] text-zinc-300 capitalize">{fmt}</span>
                  </button>
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  metrics,
  isLoading,
  onClear,
  onStopGeneration,
  sidebarOpen = true,
  onToggleSidebar,
  sessionTitle = 'New chat',
  onTitleChange,
  onOpenLightning,
  allModels,
  currentModelId,
  currentModel,
  onModelSelect,
  providerStatuses,
  gatewayUrls,
  availableModels = [],
  activeModel,
  onModelChange,
  onAttachFiles,
  onExportChat,
  connectionStatus = 'online',
  isNewChat = false,
  onShareChat,
}) => {
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(sessionTitle);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('gemini');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const privacyMode = useNyxStore((state) => state.privacyMode);
  const setPrivacyMode = useNyxStore((state) => state.setPrivacyMode);
  const lastPrivacyToggle = useRef(0);

  // Live timer during generation
  useEffect(() => {
    if (isLoading) {
      const start = Date.now();
      setLiveElapsed(0);
      const interval = setInterval(() => setLiveElapsed(Date.now() - start), 50);
      return () => clearInterval(interval);
    }
    setLiveElapsed(0);
  }, [isLoading]);

  // Focus title input when editing
  useEffect(() => {
    if (isEditingTitle) titleInputRef.current?.focus();
  }, [isEditingTitle]);

  const displayLatency = isLoading ? liveElapsed : metrics.latency;
  const latencyText = formatLatency(displayLatency);
  const contextRatio = metrics.contextLimit > 0 ? metrics.contextTokens / metrics.contextLimit : 0;

  // Debounced privacy toggle to prevent toast spam
  const handlePrivacyToggle = () => {
    const now = Date.now();
    if (now - lastPrivacyToggle.current < 500) return;
    lastPrivacyToggle.current = now;

    const newMode = !privacyMode;
    setPrivacyMode(newMode);
    toast.info(newMode ? 'Privacy Mode enabled' : 'Privacy Mode disabled', {
      icon: newMode ? <Lock size={14} /> : <Unlock size={14} />,
      description: newMode
        ? 'Zero disk footprint. Keys and history stored in memory only.'
        : 'Normal SQLite / local storage persistence active.',
    });
  };

  const handleTitleSubmit = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== sessionTitle) {
      onTitleChange?.(trimmed);
    }
    setIsEditingTitle(false);
  };

  return (
    <header className="flex flex-col shrink-0 select-none bg-background border-b border-white/[0.03]">
      {/* Main header row */}
      <div className="flex items-center justify-between px-4 py-2.5">
        {/* Left zone: Sidebar toggle + Model selector */}
        <div className="flex items-center gap-2 min-w-0">
          {onToggleSidebar && (
            <motion.button
              whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.05)' }}
              whileTap={{ scale: 0.95 }}
              onClick={onToggleSidebar}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-white border border-transparent hover:border-white/5 transition-all cursor-pointer shrink-0"
              title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            </motion.button>
          )}

          <div className="hidden sm:block relative">
            <motion.button
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.05)' }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowModelSelector((v) => !v);
              }}
              disabled={isLoading}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all select-none ${
                showModelSelector
                  ? 'bg-white/[0.04] border-white/10'
                  : 'bg-transparent border-transparent hover:border-white/5 text-zinc-400 hover:text-white'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {currentModel ? getCustomModelIcon(currentModel) : <Bot className="w-3.5 h-3.5" />}
              <span className="truncate max-w-[150px] text-[11px] font-semibold text-zinc-300">
                {currentModel?.name || 'Select model'}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 opacity-60 shrink-0 transition-transform ${showModelSelector ? 'rotate-180' : ''}`}
              />
            </motion.button>

            <AnimatePresence>
              {showModelSelector && (
                <ModelSelector
                  currentModelId={currentModelId || undefined}
                  allModels={allModels || []}
                  selectedProvider={selectedProvider}
                  searchTerm={modelSearch}
                  onProviderChange={setSelectedProvider}
                  onSearchChange={setModelSearch}
                  onSelect={(id) => {
                    if (onModelSelect) onModelSelect(id);
                    setShowModelSelector(false);
                    setModelSearch('');
                  }}
                  onClose={() => setShowModelSelector(false)}
                  providerStatuses={providerStatuses || {}}
                  isCoder={false}
                  onResetContext={() => {
                    onClear();
                    toast.success('Context reset');
                  }}
                  gatewayUrls={gatewayUrls || {}}
                  dropdown={true}
                  alignDropdown="bottom"
                />
              )}
            </AnimatePresence>
          </div>

          {/* Connection status (desktop) */}
          <div className="hidden md:flex">
            <ConnectionDot status={connectionStatus} />
          </div>
        </div>

        {/* Center zone: Session title + Context */}
        <div className="flex items-center gap-3 absolute left-1/2 -translate-x-1/2">
          {/* Editable session title */}
          <div className="flex items-center gap-2">
            {isEditingTitle ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1.5"
              >
                <input
                  ref={titleInputRef}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTitleSubmit();
                    if (e.key === 'Escape') {
                      setIsEditingTitle(false);
                      setEditTitle(sessionTitle);
                    }
                  }}
                  onBlur={handleTitleSubmit}
                  className="text-[13px] font-semibold text-foreground/85 bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1 outline-none focus:border-white/20 w-48 sm:w-64"
                  maxLength={60}
                />
              </motion.div>
            ) : (
              <motion.button
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                onClick={() => {
                  setEditTitle(sessionTitle);
                  setIsEditingTitle(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl cursor-pointer select-none transition-all"
                title="Click to rename"
              >
                <span className="text-[13px] font-semibold text-foreground/85 translate-y-[-0.5px] truncate max-w-[140px] sm:max-w-[200px]">
                  {sessionTitle}
                </span>
                <ChevronDown size={11} className="text-zinc-500 opacity-60 mt-0.5" />
              </motion.button>
            )}

            {/* Context usage indicator */}
            {metrics.totalMessages > 0 && (
              <ContextBar used={metrics.contextTokens} limit={metrics.contextLimit} />
            )}
          </div>
        </div>

        {/* Right zone: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Response metrics */}
          <div className="hidden md:flex items-center gap-3 px-3 py-1 bg-white/[0.02] border border-white/[0.04] rounded-xl text-zinc-500 font-mono text-[10px] mr-1">
            <div className="flex items-center gap-1.5" title="Response latency">
              <Wifi size={11} className="text-zinc-500" />
              <span>{displayLatency > 0 ? formatLatency(displayLatency) : '0ms'}</span>
            </div>
            <div className="w-[1px] h-3 bg-white/[0.08]" />
            <div className="flex items-center gap-1.5" title="Tokens per second">
              <Zap size={11} className="text-zinc-500" />
              <span>{metrics.tps} tok/s</span>
            </div>
            <div className="w-[1px] h-3 bg-white/[0.08]" />
            <div className="flex items-center gap-1.5" title="Tokens generated">
              <HardDrive size={11} className="text-zinc-500" />
              <span>{formatTokens(metrics.tokens)} tok</span>
            </div>
          </div>

          {/* Stop generation button (replaces everything during loading) */}
          <AnimatePresence mode="wait">
            {isLoading && onStopGeneration ? (
              <motion.button
                key="stop"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
                onClick={onStopGeneration}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all cursor-pointer"
              >
                <Square size={10} fill="currentColor" />
                <span className="text-[11px] font-medium hidden sm:inline">Stop</span>
              </motion.button>
            ) : (
              <>
                {/* Attach files */}
                {onAttachFiles && (
                  <div className="hidden sm:block">
                    <AttachmentButton onAttach={onAttachFiles} disabled={isLoading} />
                  </div>
                )}

                {/* Agent Lightning */}
                {onOpenLightning && (
                  <motion.button
                    whileHover={{
                      scale: 1.05,
                      backgroundColor: 'rgba(6,182,212,0.1)',
                      borderColor: 'rgba(6,182,212,0.25)',
                    }}
                    whileTap={{ scale: 0.94 }}
                    onClick={onOpenLightning}
                    className="p-2 rounded-xl text-cyan-400 hover:text-cyan-300 border border-cyan-500/10 bg-cyan-500/[0.03] transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.1)]"
                    title="Agent Lightning"
                  >
                    <Zap size={13} fill="currentColor" strokeWidth={1.8} />
                  </motion.button>
                )}

                {/* Privacy */}
                <motion.button
                  whileHover={{
                    scale: 1.05,
                    backgroundColor: privacyMode ? 'rgba(239,68,68,0.1)' : 'rgba(34,211,238,0.05)',
                  }}
                  whileTap={{ scale: 0.94 }}
                  onClick={handlePrivacyToggle}
                  className={`p-2 rounded-xl border transition-all cursor-pointer ${
                    privacyMode
                      ? 'text-red-400 bg-red-500/10 border-red-500/20'
                      : 'text-zinc-500 hover:text-white border-transparent hover:border-white/5'
                  }`}
                  title={privacyMode ? 'Privacy Mode On' : 'Privacy Mode Off'}
                >
                  {privacyMode ? (
                    <Lock size={13} strokeWidth={2.2} />
                  ) : (
                    <Unlock size={13} strokeWidth={1.8} />
                  )}
                </motion.button>

                {/* Share & Export */}
                <ShareMenu onExport={onExportChat} title={sessionTitle} onShareChat={onShareChat} />

                {/* Clear */}
                <motion.button
                  whileHover={{
                    scale: 1.05,
                    backgroundColor: 'rgba(239,68,68,0.08)',
                    borderColor: 'rgba(239,68,68,0.2)',
                  }}
                  whileTap={{ scale: 0.94 }}
                  onClick={onClear}
                  className="p-2 rounded-xl text-zinc-500 hover:text-red-400 border border-transparent hover:border-white/5 transition-all cursor-pointer"
                  title="Clear chat"
                >
                  <Trash2 size={13} strokeWidth={1.8} />
                </motion.button>

                {/* More menu (mobile model selector + shortcuts) */}
                <div className="sm:hidden relative">
                  <motion.button
                    whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.05)' }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setShowShortcuts(!showShortcuts)}
                    className="p-2 rounded-xl text-zinc-500 hover:text-white border border-transparent hover:border-white/5 transition-all cursor-pointer"
                  >
                    <MoreHorizontal size={13} />
                  </motion.button>

                  <AnimatePresence>
                    {showShortcuts && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute top-full right-0 mt-1 w-48 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 p-2"
                      >
                        <div className="text-[10px] text-zinc-500 px-2 py-1 uppercase tracking-wider">
                          Shortcuts
                        </div>
                        <div className="flex items-center justify-between px-2 py-1">
                          <span className="text-[11px] text-zinc-400">New chat</span>
                          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-500 font-mono">
                            ⌘K
                          </kbd>
                        </div>
                        <div className="flex items-center justify-between px-2 py-1">
                          <span className="text-[11px] text-zinc-400">Stop gen</span>
                          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-500 font-mono">
                            Esc
                          </kbd>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
};
