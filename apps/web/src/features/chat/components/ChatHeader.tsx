/**
 * @file src/features/chat/components/ChatHeader.tsx
 * @description Production-grade chat header with model switching, context
 *   monitoring, attachment support, and Claude/Kimi-parity UX.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2Icon as Trash2, BrainIcon as Brain, ChevronDownIcon as ChevronDown, LockIcon as Lock, ZapIcon as Zap, PaperclipIcon as Paperclip, WifiIcon as Wifi, WifiOffIcon as WifiOff, DownloadIcon as Download, CheckIcon as Check, XIcon as X } from '@animateicons/react/lucide';
import { PanelLeftOpen, PanelLeftClose, Share2, Unlock, Square, Bot, Cpu, Clock, MessageSquare, FileText, MoreHorizontal, Keyboard, AlertCircle, HardDrive } from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { ModelSelector } from '@src/shared/components/ModelSelector';
import { getCustomModelIcon } from '@src/shared/utils/modelIcons';
import { ModelInfo } from '@src/types';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { useLiveTimer } from '@src/shared/hooks/useLiveTimer';
import { useUsageStore } from '@src/core/stores/useUsageStore';
import { detectProvider, getEffectiveApiKey } from '@src/infrastructure/utils/provider';

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
  onToggleMemory?: () => void;
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
        whileTap={{ scale: 0.95 }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        disabled={disabled}
        className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors relative cursor-pointer ${dragOver
            ? 'bg-accent/10 text-accent'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
          } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        title="Attach files (or drag & drop)"
      >
        <Paperclip size={15}  />
        {dragOver && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 rounded-md border-2 border-dashed border-accent/50 bg-accent/5 flex items-center justify-center"
          >
            <span className="text-[10px] text-accent font-medium hidden">Drop</span>
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
    <div ref={ref} className="relative flex items-center">
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
        className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer ${open ? 'bg-muted/60 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
          }`}
        title="Share & Export"
      >
        <Share2 size={15}  />
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

const ModelUsageIndicator: React.FC<{ modelId: string | null; apiKey?: string; allModels: any[] }> = ({ modelId, apiKey, allModels }) => {
  const { usage, refreshLimits } = useUsageStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => refreshLimits(), 15000);
    return () => clearInterval(timer);
  }, [refreshLimits]);

  if (!modelId) return null;
  const modelConfig = allModels.find(m => m.id === modelId);
  const limits = modelConfig?.limits;
  if (!limits) return null;

  const key = `${modelId}_${apiKey || 'default'}`;
  const currentUsage = usage[key] || { rpmUsed: 0, tpmUsed: 0, rpdUsed: 0 };
  const rpmRatio = limits.rpm ? currentUsage.rpmUsed / limits.rpm : 0;

  const isWarning = rpmRatio > 0.8;
  const isCritical = rpmRatio >= 1;

  return (
    <div
      className="relative flex items-center gap-1.5 px-2 py-1 cursor-pointer group"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="flex items-center gap-1 text-muted-foreground/80 hover:text-foreground transition-colors" title="Rate Limits">
        <Cpu size={13} className={isCritical ? 'text-red-500' : isWarning ? 'text-amber-500' : ''} />
        <span className="text-[11px] font-mono hidden xl:inline">
          {currentUsage.rpmUsed}/{limits.rpm}
        </span>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            className="absolute top-full right-0 mt-2 w-48 bg-popover/95 backdrop-blur-xl border border-border rounded-md shadow-lg p-3 z-50 flex flex-col gap-2"
          >
            <div className="flex justify-between items-center pb-2 border-b border-border/50">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Usage limit</span>
            </div>

            <div className="flex flex-col gap-1.5 text-[12px] font-mono">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">RPM</span>
                <span className={isCritical ? 'text-red-400' : 'text-foreground/90'}>
                  {currentUsage.rpmUsed} / {limits.rpm}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">TPM</span>
                <span className="text-foreground/90">
                  {formatTokens(currentUsage.tpmUsed)} / {limits.tpm ? formatTokens(limits.tpm) : '∞'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">RPD</span>
                <span className="text-foreground/90">
                  {currentUsage.rpdUsed} / {limits.rpd ? limits.rpd : '∞'}
                </span>
              </div>
            </div>
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
  onToggleMemory,
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
  const liveElapsed = useLiveTimer(isLoading);

  const apiKeys = useNyxStore((state) => state.apiKeys);
  const currentProvider = currentModelId ? detectProvider(currentModelId) : '';
  const currentApiKey = getEffectiveApiKey(currentProvider, apiKeys) || undefined;

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
    <header className="h-14 shrink-0 select-none bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/40 z-10">
      {/* Main header row */}
      <div className="w-full h-full flex items-center justify-between px-2 sm:px-4 lg:px-6 gap-2 sm:gap-4">
        {/* Left zone: Sidebar toggle + Model selector */}
        <div className="flex items-center gap-1 sm:gap-3 min-w-0 shrink justify-start">
          {onToggleSidebar && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onToggleSidebar}
              className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer shrink-0"
              title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </motion.button>
          )}

          <div className="flex relative min-w-0 shrink">
            <motion.button
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowModelSelector((v) => !v);
              }}
              disabled={isLoading}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors select-none w-full ${showModelSelector
                  ? 'bg-muted/80 text-foreground'
                  : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="shrink-0">
                {currentModel ? getCustomModelIcon(currentModel) : <Bot className="w-4 h-4" />}
              </div>
              <span className="truncate max-w-[80px] sm:max-w-[150px] text-[13px] font-medium text-foreground/90">
                {currentModel?.name || 'Select model'}
              </span>
              <ChevronDown
                className={`w-4 h-4 opacity-50 shrink-0 transition-transform ${showModelSelector ? 'rotate-180' : ''}`}
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
          <div className="hidden md:flex ml-2 shrink-0">
            <ConnectionDot status={connectionStatus} />
          </div>
        </div>

        {/* Center zone: Session title + Context */}
        <div className="flex-1 flex items-center justify-center gap-2 min-w-0 px-2 shrink">
          {/* Editable session title */}
          <div className="hidden sm:flex items-center justify-center gap-2 min-w-0">
            {isEditingTitle ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1.5 min-w-0 shrink"
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
                  className="text-[14px] font-medium text-foreground bg-muted border border-border/50 rounded-md px-3 py-1 outline-none focus:border-primary/40 w-full max-w-[200px]"
                  maxLength={60}
                />
              </motion.div>
            ) : (
              <button
                onClick={() => {
                  setEditTitle(sessionTitle);
                  setIsEditingTitle(true);
                }}
                className="flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md cursor-pointer select-none transition-colors hover:bg-muted/40 group min-w-0 shrink"
                title="Click to rename"
              >
                <span className="text-[14px] font-medium text-foreground/90 truncate">
                  {sessionTitle}
                </span>
                <ChevronDown size={14} className="text-muted-foreground opacity-0 group-hover:opacity-50 transition-opacity shrink-0 hidden sm:block" />
              </button>
            )}
          </div>
        </div>

        {/* Right zone: Actions */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 shrink-0 justify-end">


          <div className="flex items-center gap-1 shrink-0">
            {/* Model Usage Indicator */}
            <div className="hidden lg:block shrink-0">
              <ModelUsageIndicator modelId={currentModelId || null} apiKey={currentApiKey} allModels={allModels || []} />
            </div>

            {/* Attach files */}
            {onAttachFiles && (
              <div className="hidden sm:block">
                <AttachmentButton onAttach={onAttachFiles} disabled={isLoading} />
              </div>
            )}

             {/* Agent Lightning */}
            {onOpenLightning && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onOpenLightning}
                className="w-8 h-8 flex items-center justify-center rounded-md text-cyan-500 hover:text-cyan-600 hover:bg-cyan-500/10 transition-colors cursor-pointer shrink-0"
                title="Agent Lightning"
              >
                <Zap size={15}   />
              </motion.button>
            )}

            {/* Memory Manager */}
            {onToggleMemory && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onToggleMemory}
                className="w-8 h-8 flex items-center justify-center rounded-md text-violet-400 hover:text-violet-500 hover:bg-violet-500/10 transition-colors cursor-pointer shrink-0"
                title="Memory Manager"
              >
                <Brain size={15}  />
              </motion.button>
            )}

            {/* Privacy */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handlePrivacyToggle}
              className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer shrink-0 ${privacyMode
                  ? 'text-red-500 bg-red-500/10 hover:bg-red-500/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              title={privacyMode ? 'Privacy Mode On' : 'Privacy Mode Off'}
            >
              {privacyMode ? (
                <Lock size={15}  />
              ) : (
                <Unlock size={15}  />
              )}
            </motion.button>

            {/* Share & Export */}
            <ShareMenu onExport={onExportChat} title={sessionTitle} onShareChat={onShareChat} />

            {/* Clear */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onClear}
              className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
              title="Clear chat"
            >
              <Trash2 size={15}  />
            </motion.button>

            {/* More menu (mobile shortcuts) */}
            <div className="sm:hidden relative shrink-0">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowShortcuts(!showShortcuts)}
                className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                <MoreHorizontal size={15} />
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
          </div>
        </div>
      </div>
    </header>
  );
};
