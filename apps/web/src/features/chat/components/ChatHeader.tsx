/**
 * @file src/features/chat/components/ChatHeader.tsx
 * @description Production-grade chat header with model switching, context
 *   monitoring, attachment support, and Claude/Kimi-parity UX.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@src/shared/components/ui/sonner';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { ModelSelector } from '@src/shared/components/ModelSelector';
import { getCustomModelIcon } from '@src/shared/utils/modelIcons';
import { ModelInfo } from '@src/types';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { useLiveTimer } from '@src/shared/hooks/useLiveTimer';
import { useUsageStore } from '@src/shared/store/useUsageStore';
import { detectProvider, getEffectiveApiKey } from '@src/infrastructure/utils/provider';
import { formatLatency } from '@src/shared/utils/format';

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
  onExportChat?: (format: 'markdown' | 'json' | 'txt' | 'html' | 'obsidian' | 'notion' | 'gist') => void;
  connectionStatus?: 'online' | 'offline' | 'degraded';
  isNewChat?: boolean;
  onShareChat?: (expiration?: string) => Promise<string>;
  onToggleMemory?: () => void;
  onOpenBranchManager?: () => void;
  onToggleContextPanel?: () => void; // Added for new UI
  contextPanelOpen?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ShareMenu: React.FC<{
  onExport: ChatHeaderProps['onExportChat'];
  title: string;
  onShareChat?: (expiration?: string) => Promise<string>;
}> = ({ onExport, title, onShareChat }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expiration, setExpiration] = useState<'1h' | '1d' | '7d' | 'never'>('never');
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
      const url = onShareChat ? await onShareChat(expiration) : window.location.href;
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
      <button
        onClick={() => setOpen(!open)}
        className={`text-on-surface-variant hover:text-on-surface transition-colors p-1.5 rounded-full hover:bg-surface-variant cursor-pointer ${open ? 'bg-surface-variant text-on-surface' : ''}`}
        title="Share Chat"
      >
        <span className="material-symbols-outlined text-[20px]">share</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            className="absolute top-full right-0 mt-2 w-64 bg-surface-container-highest border border-outline-variant rounded-xl shadow-lg overflow-hidden z-50 p-2 space-y-2"
          >
            <div className="px-2 py-1">
              <span className="font-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">
                Share Link
              </span>
            </div>

            <div className="px-1 py-1 space-y-3">
              <div className="flex items-center gap-2 justify-between px-1">
                <span className="font-body-sm text-on-surface-variant">Expires:</span>
                <select
                  value={expiration}
                  onChange={(e: any) => setExpiration(e.target.value)}
                  className="bg-surface-container border border-outline-variant rounded-md px-2 py-1 font-body-sm text-on-surface outline-none cursor-pointer"
                >
                  <option value="1h">1 Hour</option>
                  <option value="1d">1 Day</option>
                  <option value="7d">7 Days</option>
                  <option value="never">Never</option>
                </select>
              </div>

              <button
                onClick={handleCopyLink}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 transition-colors text-on-primary font-label-md cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {copied ? 'check' : 'link'}
                </span>
                <span>{copied ? 'Copied!' : 'Copy Share Link'}</span>
              </button>
            </div>

            {onExport && (
              <>
                <div className="px-2 py-1 pt-3 border-t border-outline-variant">
                  <span className="font-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">
                    Export Format
                  </span>
                </div>
                <div className="space-y-0.5">
                  {(['markdown', 'json', 'txt', 'html', 'obsidian', 'notion', 'gist'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => {
                        onExport(fmt);
                        setOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-variant rounded-lg text-left transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-on-surface-variant text-[18px]">description</span>
                      <span className="font-body-sm text-on-surface capitalize">
                        {fmt === 'txt' ? 'Plain Text' : fmt === 'markdown' ? 'Markdown' : fmt === 'html' ? 'HTML Webpage' : fmt === 'obsidian' ? 'Obsidian Note' : fmt === 'notion' ? 'Notion Format' : fmt === 'gist' ? 'GitHub Gist' : fmt.toUpperCase()}
                      </span>
                    </button>
                  ))}
                </div>
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
  onToggleMemory,
  onOpenBranchManager,
  onToggleContextPanel,
  contextPanelOpen
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(sessionTitle);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('gemini');
  
  const titleInputRef = useRef<HTMLInputElement>(null);
  const privacyMode = useNyxStore((state) => state.privacyMode);
  const setPrivacyMode = useNyxStore((state) => state.setPrivacyMode);
  const lastPrivacyToggle = useRef(0);

  // Focus title input when editing
  useEffect(() => {
    if (isEditingTitle) titleInputRef.current?.focus();
  }, [isEditingTitle]);

  const handleTitleSubmit = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== sessionTitle) {
      onTitleChange?.(trimmed);
    }
    setIsEditingTitle(false);
  };

  const handlePrivacyToggle = () => {
    const now = Date.now();
    if (now - lastPrivacyToggle.current < 500) return;
    lastPrivacyToggle.current = now;

    const newMode = !privacyMode;
    setPrivacyMode(newMode);
    toast.info(newMode ? 'Privacy Mode enabled' : 'Privacy Mode disabled', {
      description: newMode
        ? 'Zero disk footprint. Keys and history stored in memory only.'
        : 'Normal SQLite / local storage persistence active.',
    });
  };

  return (
    <header className="w-full h-16 flex items-center justify-between px-6 py-4 bg-surface-bright/80 backdrop-blur-md sticky top-0 z-40 border-b border-transparent transition-colors duration-300">
      
      {/* Left zone: Sidebar toggle + Session Title */}
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button 
            onClick={onToggleSidebar}
            className="xl:hidden text-on-surface-variant hover:text-on-surface transition-colors p-1 rounded-full hover:bg-surface-variant"
          >
            <span className="material-symbols-outlined text-[20px]">menu</span>
          </button>
        )}
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse hidden md:block"></span>
        <span className="font-label-mono text-[10px] text-on-surface-variant uppercase tracking-wider hidden md:block">Active Session</span>
        
        {isEditingTitle ? (
          <div className="flex items-center gap-2">
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
              className="font-title-md font-medium text-on-surface bg-surface-container-highest border border-outline rounded-md px-2 py-1 outline-none focus:border-primary w-[200px]"
              maxLength={60}
            />
          </div>
        ) : (
          <div className="flex items-center gap-xs group">
            <h1 className="font-title-md font-medium text-on-surface truncate max-w-[200px] md:max-w-[400px]">
              {sessionTitle}
            </h1>
            <button 
              onClick={() => {
                setEditTitle(sessionTitle);
                setIsEditingTitle(true);
              }}
              className="text-on-surface-variant hover:text-on-surface transition-colors opacity-0 group-hover:opacity-100 p-1"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
            </button>
          </div>
        )}
      </div>

      {/* Right zone: Model Selector + Actions */}
      <div className="flex items-center gap-sm relative">
        
        {/* Model Selector Capsule */}
        <div className="relative">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setShowModelSelector((v) => !v);
            }}
            disabled={isLoading}
            className={`bg-surface-container-highest border border-outline-variant rounded-full px-sm py-1.5 flex items-center gap-xs hover:bg-surface-variant transition-colors group ${showModelSelector ? 'bg-surface-variant ring-2 ring-primary/20' : ''}`}
          >
            <span className="material-symbols-outlined text-primary text-[16px]">psychology</span>
            <span className="font-label-md font-medium text-on-surface truncate max-w-[120px] md:max-w-none">
              {currentModel?.name || 'Select model'}
            </span>
            <span className={`material-symbols-outlined text-on-surface-variant text-[16px] group-hover:text-on-surface transition-transform ${showModelSelector ? 'rotate-180' : ''}`}>
              arrow_drop_down
            </span>
          </button>
          
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

        <div className="w-px h-6 bg-outline-variant mx-1 hidden md:block"></div>

        <div className="hidden md:flex items-center gap-1">
          {onToggleMemory && (
            <button 
              onClick={onToggleMemory}
              className="text-on-surface-variant hover:text-on-surface transition-colors p-1.5 rounded-full hover:bg-surface-variant" 
              title="Memory Settings"
            >
              <span className="material-symbols-outlined text-[20px]">memory</span>
            </button>
          )}

          {onOpenBranchManager && (
            <button 
              onClick={onOpenBranchManager}
              className="text-on-surface-variant hover:text-on-surface transition-colors p-1.5 rounded-full hover:bg-surface-variant" 
              title="Branch Manager"
            >
              <span className="material-symbols-outlined text-[20px]">account_tree</span>
            </button>
          )}

          <ShareMenu onExport={onExportChat} title={sessionTitle} onShareChat={onShareChat} />

          <button 
            onClick={onClear}
            className="text-on-surface-variant hover:text-error transition-colors p-1.5 rounded-full hover:bg-error-container" 
            title="Clear Chat"
          >
            <span className="material-symbols-outlined text-[20px]">delete</span>
          </button>
        </div>

        {/* Context Panel Toggle (Desktop) */}
        {onToggleContextPanel && (
          <button 
            onClick={onToggleContextPanel}
            className={`hidden xl:flex text-on-surface-variant hover:text-on-surface transition-colors p-1.5 rounded-full hover:bg-surface-variant ${contextPanelOpen ? 'bg-surface-variant text-on-surface' : ''}`}
            title="Toggle Context Panel"
          >
            <span className="material-symbols-outlined text-[20px]">info</span>
          </button>
        )}
      </div>
    </header>
  );
};
