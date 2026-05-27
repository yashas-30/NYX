import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Zap, Trash2, Timer, PanelLeftOpen, ChevronDown, Share2 } from 'lucide-react';
import { StatusBadge } from '@src/shared/components/ui/StatusBadge';
import { AgentPersona } from '@src/infrastructure/types';
import { toast } from '@src/shared/components/ui/sonner';

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
}

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

export const CoderHeader: React.FC<CoderHeaderProps> = ({
  metrics,
  isLoading,
  badgeStatus,
  onClear,
  sidebarOpen = true,
  onToggleSidebar,
  sessionTitle = 'New chat',
}) => {
  const [liveElapsed, setLiveElapsed] = useState(0);

  useEffect(() => {
    if (isLoading) {
      const start = Date.now();
      setLiveElapsed(0);
      const interval = setInterval(() => {
        setLiveElapsed(Date.now() - start);
      }, 50);
      return () => clearInterval(interval);
    } else {
      setLiveElapsed(0);
    }
  }, [isLoading]);

  const displayLatency = isLoading ? liveElapsed : metrics.latency;
  const latencyText = formatLatency(displayLatency);

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
          whileHover={{ scale: 1.05, backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}
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

