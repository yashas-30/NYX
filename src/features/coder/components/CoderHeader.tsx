import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Zap,
  Trash2,
  Timer,
  PanelLeftOpen,
  ChevronDown,
  Share2,
  Lock,
  Unlock,
  Download,
  Search,
  X,
} from 'lucide-react';
import { StatusBadge } from '@src/shared/components/ui/StatusBadge';
import { AgentPersona } from '@src/infrastructure/types';
import { toast } from '@src/shared/components/ui/sonner';
import { useNyxStore } from '@src/shared/store/useNyxStore';

import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { useScraplingStatus } from '@src/shared/hooks/useScraplingStatus';
import { useLiveTimer } from '@src/shared/hooks/useLiveTimer';

interface CoderHeaderProps {
  activeMode?: 'coder' | 'registry' | 'settings';
  onModeChange?: (mode: 'coder' | 'registry' | 'settings') => void;
  currentPersona?: AgentPersona;
  metrics: { latency: number; tokens: number; tps: number };
  isLoading: boolean;
  badgeStatus: 'success' | 'loading' | 'offline' | 'no_key';
  onClear: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  sessionTitle?: string;
  mode?: 'chat' | 'code';
  onOpenLightning?: () => void;
  history?: any[];
  messageSearchQuery?: string;
  onMessageSearchChange?: (query: string) => void;
}

import { formatLatency } from '@src/shared/utils/format';

export const CoderHeader: React.FC<CoderHeaderProps> = ({
  metrics,
  isLoading,
  badgeStatus,
  onClear,
  sidebarOpen = true,
  onToggleSidebar,
  sessionTitle = 'New chat',
  mode = 'chat',
  onOpenLightning,
  history = [],
  messageSearchQuery = '',
  onMessageSearchChange,
}) => {
  const privacyMode = useNyxStore((state) => state.privacyMode);
  const setPrivacyMode = useNyxStore((state) => state.setPrivacyMode);
  const [showExport, setShowExport] = useState(false);
  const scraplingStatus = useScraplingStatus();
  const liveElapsed = useLiveTimer(isLoading);

  const displayLatency = isLoading ? liveElapsed : metrics.latency;
  const latencyText = formatLatency(displayLatency);

  const downloadFile = (filename: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = () => {
    const md = history.map((m) => `### ${m.role}\n\n${m.content}`).join('\n\n---\n\n');
    downloadFile(`session-${Date.now()}.md`, md, 'text/markdown');
    setShowExport(false);
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(history, null, 2);
    downloadFile(`session-${Date.now()}.json`, json, 'application/json');
    setShowExport(false);
  };

  const handleExportPDF = () => {
    window.print();
    setShowExport(false);
  };

  return (
    <header className="flex items-center justify-between px-6 py-3 shrink-0 select-none bg-background border-b border-white/[0.03]">
      {/* Left: Collapsed sidebar toggle trigger */}
      <div className="flex items-center gap-2">
        {!sidebarOpen && onToggleSidebar && (
          <motion.button
            whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.05)' }}
            whileTap={{ scale: 0.95 }}
            onClick={onToggleSidebar}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white border border-transparent hover:border-white/5 transition-all cursor-pointer mr-1"
          >
            <PanelLeftOpen size={14} />
          </motion.button>
        )}
      </div>

      {/* Center: Dropdown session title (Claude style) */}
      <motion.div
        whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
        onClick={() => toast.info(`Active chat: ${sessionTitle}`)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl cursor-pointer select-none transition-all duration-200"
      >
        <span className="text-[13px] font-semibold text-foreground/85 translate-y-[-0.5px]">
          {sessionTitle}
        </span>
        <ChevronDown size={11} className="text-zinc-500 opacity-60 mt-0.5" />
      </motion.div>

      {/* Right: share, status, clear */}
      <div className="flex items-center gap-2.5">
        {onMessageSearchChange && (
          <div className="relative flex items-center group">
            <Search
              size={12}
              className="absolute left-2.5 text-zinc-500 group-hover:text-zinc-400 transition-colors pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search messages..."
              value={messageSearchQuery}
              onChange={(e) => onMessageSearchChange(e.target.value)}
              className="w-36 md:w-48 bg-white/[0.03] hover:bg-white/[0.05] focus:bg-white/[0.05] border border-white/[0.05] focus:border-white/10 rounded-full py-1.5 pl-7 pr-7 text-xs text-zinc-300 placeholder:text-zinc-600 outline-none transition-all focus:w-48 md:focus:w-56"
            />
            {messageSearchQuery && (
              <button
                onClick={() => onMessageSearchChange('')}
                className="absolute right-2 p-0.5 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-white/10 transition-colors"
              >
                <X size={10} />
              </button>
            )}
          </div>
        )}

        {/* Scrapling Health Badge */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-800/40 border border-white/5 text-[9px] font-extrabold uppercase tracking-wider text-zinc-400 select-none cursor-pointer"
          title={`Scrapling Health: ${scraplingStatus === 'running' ? 'Running & Healthy' : scraplingStatus === 'restarting' ? 'Restarting...' : scraplingStatus === 'offline' ? 'Offline (using fallback)' : 'Checking Status...'}`}
          onClick={async () => {
            toast.info(`Scrapling status is: ${scraplingStatus}`);
          }}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              scraplingStatus === 'running'
                ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                : scraplingStatus === 'restarting'
                  ? 'bg-yellow-400 animate-pulse shadow-[0_0_6px_#facc15]'
                  : scraplingStatus === 'checking'
                    ? 'bg-zinc-500'
                    : 'bg-red-400 shadow-[0_0_6px_#f87171]'
            }`}
          />
          <span>Scrapling</span>
        </div>
        {/* Agent Lightning Button */}
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
            title="Agent Lightning Continuous Learning"
          >
            <Zap size={13} fill="currentColor" strokeWidth={1.8} />
          </motion.button>
        )}

        {/* Privacy Mode Toggle */}
        <motion.button
          whileHover={{
            scale: 1.05,
            backgroundColor: privacyMode ? 'rgba(239,68,68,0.1)' : 'rgba(34,211,238,0.05)',
          }}
          whileTap={{ scale: 0.94 }}
          onClick={() => {
            setPrivacyMode(!privacyMode);
            if (!privacyMode) {
              toast.warning(
                'Privacy Mode Enabled: Zero disk footprints, keys and history stored in memory only.'
              );
            } else {
              toast.info(
                'Privacy Mode Disabled: Normal SQLite / local storage persistence active.'
              );
            }
          }}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            privacyMode
              ? 'text-red-400 bg-red-500/10 border-red-500/20'
              : 'text-zinc-500 hover:text-white border-transparent hover:border-white/5'
          }`}
          title={privacyMode ? 'Privacy Mode Active (Click to disable)' : 'Toggle Privacy Mode'}
        >
          {privacyMode ? (
            <Lock size={13} strokeWidth={2.2} />
          ) : (
            <Unlock size={13} strokeWidth={1.8} />
          )}
        </motion.button>

        {/* Export Action */}
        <div className="relative">
          <motion.button
            whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.05)' }}
            whileTap={{ scale: 0.94 }}
            onClick={() => setShowExport(!showExport)}
            className="p-2 rounded-xl text-zinc-500 hover:text-white border border-transparent hover:border-white/5 transition-all cursor-pointer"
            title="Export Chat"
          >
            <Download size={13} strokeWidth={1.8} />
          </motion.button>

          {showExport && (
            <div className="absolute right-0 mt-2 w-36 bg-secondary border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
              <button
                onClick={handleExportMarkdown}
                className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
              >
                Markdown
              </button>
              <button
                onClick={handleExportJSON}
                className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors cursor-pointer border-t border-white/5"
              >
                JSON
              </button>
              <button
                onClick={handleExportPDF}
                className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors cursor-pointer border-t border-white/5"
              >
                PDF
              </button>
            </div>
          )}
        </div>

        {/* Share Action */}
        <motion.button
          whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.05)' }}
          whileTap={{ scale: 0.94 }}
          onClick={() => {
            navigator.clipboard.writeText(window.location.href);
            toast.success('App share link copied!');
          }}
          className="p-2 rounded-xl text-zinc-500 hover:text-white border border-transparent hover:border-white/5 transition-all cursor-pointer"
          title="Share Chat"
        >
          <Share2 size={13} strokeWidth={1.8} />
        </motion.button>

        {/* Reset / Clear Chat */}
        <motion.button
          whileHover={{
            scale: 1.05,
            backgroundColor: 'rgba(239,68,68,0.08)',
            borderColor: 'rgba(239,68,68,0.2)',
          }}
          whileTap={{ scale: 0.94 }}
          onClick={onClear}
          className="p-2 rounded-xl text-zinc-500 hover:text-red-400 border border-transparent hover:border-white/5 transition-all cursor-pointer"
          title="Clear Session"
        >
          <Trash2 size={13} strokeWidth={1.8} />
        </motion.button>
      </div>
    </header>
  );
};
