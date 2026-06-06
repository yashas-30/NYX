/**
 * @file src/features/chat/components/ChatHeader.tsx
 * @description Production-grade chat header with model switching, context
 *   monitoring, attachment support, and Claude/Kimi-parity UX.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { useScraplingStatus } from '@src/shared/hooks/useScraplingStatus';
import { useLiveTimer } from '@src/shared/hooks/useLiveTimer';

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
  estimatedCostUsd?: number;
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

import { formatLatency } from '@src/shared/utils/format';

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
      <div className="w-16 h-1.5 rounded-md bg-muted/60 overflow-hidden">
        <motion.div
          className={`h-full rounded-md ${isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'}`}
          initial={{ width: 0 }}
          animate={{ width: `${ratio * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <span
        className={`text-[10px] font-mono ${isCritical ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-muted-foreground/80'} group-hover:text-muted-foreground transition-colors`}
      >
        {Math.round(ratio * 100)}%
      </span>
    </div>
  );
};

const ConnectionDot: React.FC<{ status: ChatHeaderProps['connectionStatus'] }> = ({ status }) => {
  const colors = {
    online: 'bg-emerald-500',
    degraded: 'bg-amber-500 animate-pulse',
    offline: 'bg-red-500',
  };
  const labels = { online: 'Connected', degraded: 'Slow', offline: 'Disconnected' };

  return (
    <div className="flex items-center gap-1.5" title={labels[status || 'online']}>
      <span className={`w-1.5 h-1.5 rounded-md ${colors[status || 'online']}`} />
      <span className="text-[10px] text-muted-foreground hidden lg:inline">
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
        whileHover={{ scale: 1.05, backgroundColor: 'var(--input)' }}
        whileTap={{ scale: 0.94 }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        disabled={disabled}
        className={`p-2 rounded-md border transition-all cursor-pointer relative ${
          dragOver
            ? 'bg-accent/10 border-accent/30 text-accent'
            : 'text-muted-foreground hover:text-foreground border-transparent hover:border-border'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        title="Attach files (or drag & drop)"
      >
        <Paperclip size={13} strokeWidth={1.8} />
        {dragOver && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 rounded-md border-2 border-dashed border-accent/50 bg-accent/5 flex items-center justify-center"
          >
            <span className="text-[10px] text-accent font-medium">Drop files</span>
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
        whileHover={{ scale: 1.05, backgroundColor: 'var(--input)' }}
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen(!open)}
        className="p-2 rounded-md text-muted-foreground hover:text-foreground border border-transparent hover:border-border transition-all cursor-pointer"
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
            className="absolute top-full right-0 mt-1 w-56 bg-popover/95 backdrop-blur-xl border border-border rounded-md shadow-[0_8px_32px_rgba(0,0,0,0.04)] overflow-hidden z-50"
          >
            <div className="px-3 py-2 border-b border-border">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Share
              </span>
            </div>

            <button
              onClick={handleCopyLink}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors text-left"
            >
              {copied ? (
                <Check size={13} className="text-emerald-400" />
              ) : (
                <Share2 size={13} className="text-muted-foreground" />
              )}
              <span className="text-[12px] text-foreground/80">
                {copied ? 'Copied!' : 'Copy link'}
              </span>
            </button>

            {onExport && (
              <>
                <div className="px-3 py-1.5 border-t border-border">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
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
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors text-left"
                  >
                    <FileText size={13} className="text-muted-foreground" />
                    <span className="text-[12px] text-foreground/80 capitalize">{fmt}</span>
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
  const scraplingStatus = useScraplingStatus();
  const liveElapsed = useLiveTimer(isLoading);

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
    <header className="flex flex-col shrink-0 select-none bg-background border-b border-border">
      {/* Main header row */}
      <div className="flex items-center justify-between px-6 py-4">
        {/* Left zone: Sidebar toggle + Model selector */}
        <div className="flex items-center gap-2 min-w-0">
          {onToggleSidebar && (
            <motion.button
              whileHover={{ scale: 1.05, backgroundColor: 'var(--input)' }}
              whileTap={{ scale: 0.95 }}
              onClick={onToggleSidebar}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground border border-transparent hover:border-border transition-all cursor-pointer shrink-0"
              title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            </motion.button>
          )}

          <div className="hidden sm:block relative">
            <motion.button
              whileHover={{ scale: 1.02, backgroundColor: 'var(--input)' }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowModelSelector((v) => !v);
              }}
              disabled={isLoading}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border transition-all select-none ${
                showModelSelector
                  ? 'bg-muted border-border'
                  : 'bg-transparent border-transparent hover:border-border text-muted-foreground hover:text-foreground'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {currentModel ? getCustomModelIcon(currentModel) : <Bot className="w-3.5 h-3.5" />}
              <span className="truncate max-w-[150px] text-[11px] font-semibold text-foreground/90">
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
                  className="text-[13px] font-semibold text-foreground/85 bg-muted/50 border border-border rounded-md px-2.5 py-1 outline-none focus:border-primary/30 w-48 sm:w-64"
                  maxLength={60}
                />
              </motion.div>
            ) : (
              <motion.button
                whileHover={{ backgroundColor: 'var(--input)' }}
                onClick={() => {
                  setEditTitle(sessionTitle);
                  setIsEditingTitle(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer select-none transition-all"
                title="Click to rename"
              >
                <span className="text-[13px] font-semibold text-foreground/85 translate-y-[-0.5px] truncate max-w-[140px] sm:max-w-[200px]">
                  {sessionTitle}
                </span>
                <ChevronDown size={11} className="text-muted-foreground opacity-60 mt-0.5" />
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
          <div className="hidden md:flex items-center gap-3 px-3 py-1 bg-muted/30 border border-border rounded-md text-muted-foreground font-mono text-[10px] mr-1">
            <div className="flex items-center gap-1.5" title="Response latency">
              <Wifi size={11} className="text-muted-foreground" />
              <span>{displayLatency > 0 ? formatLatency(displayLatency) : '0ms'}</span>
            </div>
            <div className="w-[1px] h-3 bg-border" />
            <div className="flex items-center gap-1.5" title="Tokens per second">
              <Zap size={11} className="text-muted-foreground" />
              <span>{metrics.tps} tok/s</span>
            </div>
            {metrics.estimatedCostUsd !== undefined && metrics.estimatedCostUsd > 0 && (
              <>
                <div className="w-[1px] h-3 bg-border" />
                <div className="flex items-center gap-1.5" title="Estimated Cost">
                  <span className="text-emerald-400 font-medium">
                    ${metrics.estimatedCostUsd.toFixed(5)}
                  </span>
                </div>
              </>
            )}
            <div className="w-[1px] h-3 bg-border" />
            <div className="flex items-center gap-1.5" title="Tokens generated">
              <HardDrive size={11} className="text-muted-foreground" />
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all cursor-pointer"
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
                    className="p-2 rounded-md text-cyan-400 hover:text-cyan-600 border border-transparent hover:border-cyan-200 transition-all cursor-pointer"
                    title="Agent Lightning"
                  >
                    <Zap size={13} fill="currentColor" strokeWidth={1.8} />
                  </motion.button>
                )}

                {/* Privacy */}
                <motion.button
                  whileHover={{
                    scale: 1.05,
                    backgroundColor: privacyMode ? 'rgba(239,68,68,0.1)' : 'var(--input)',
                  }}
                  whileTap={{ scale: 0.94 }}
                  onClick={handlePrivacyToggle}
                  className={`p-2 rounded-md border transition-all cursor-pointer ${
                    privacyMode
                      ? 'text-red-400 bg-red-500/10 border-red-500/20'
                      : 'text-muted-foreground hover:text-foreground border-transparent hover:border-border'
                  }`}
                  title={privacyMode ? 'Privacy Mode On' : 'Privacy Mode Off'}
                >
                  {privacyMode ? (
                    <Lock size={13} strokeWidth={2.2} />
                  ) : (
                    <Unlock size={13} strokeWidth={1.8} />
                  )}
                </motion.button>

                {/* Scrapling Health Badge */}
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/40 border border-border text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground select-none cursor-pointer"
                  title={`Scrapling Health: ${scraplingStatus === 'running' ? 'Running & Healthy' : scraplingStatus === 'restarting' ? 'Restarting...' : scraplingStatus === 'offline' ? 'Offline (using fallback)' : 'Checking Status...'}`}
                  onClick={() => toast.info(`Scrapling status is: ${scraplingStatus}`)}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-md ${
                      scraplingStatus === 'running'
                        ? 'bg-emerald-400'
                        : scraplingStatus === 'restarting'
                          ? 'bg-yellow-400 animate-pulse'
                          : scraplingStatus === 'checking'
                            ? 'bg-muted-foreground/50'
                            : 'bg-red-400'
                    }`}
                  />
                  Search
                </div>

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
                  className="p-2 rounded-md text-muted-foreground hover:text-destructive border border-transparent hover:border-border transition-all cursor-pointer"
                  title="Clear chat"
                >
                  <Trash2 size={13} strokeWidth={1.8} />
                </motion.button>

                {/* More menu (mobile model selector + shortcuts) */}
                <div className="sm:hidden relative">
                  <motion.button
                    whileHover={{ scale: 1.05, backgroundColor: 'var(--input)' }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setShowShortcuts(!showShortcuts)}
                    className="p-2 rounded-md text-muted-foreground hover:text-foreground border border-transparent hover:border-border transition-all cursor-pointer"
                  >
                    <MoreHorizontal size={13} />
                  </motion.button>

                  <AnimatePresence>
                    {showShortcuts && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute top-full right-0 mt-1 w-48 bg-popover border border-border rounded-md shadow-[0_8px_32px_rgba(0,0,0,0.04)] overflow-hidden z-50 p-2"
                      >
                        <div className="text-[10px] text-muted-foreground px-2 py-1 uppercase tracking-wider">
                          Shortcuts
                        </div>
                        <div className="flex items-center justify-between px-2 py-1">
                          <span className="text-[11px] text-muted-foreground font-medium">
                            New chat
                          </span>
                          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                            ⌘K
                          </kbd>
                        </div>
                        <div className="flex items-center justify-between px-2 py-1">
                          <span className="text-[11px] text-muted-foreground">Stop gen</span>
                          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
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
