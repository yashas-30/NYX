/**
 * @file src/features/coder/components/CoderHeader.tsx
 * @description Gemini-style top header with sidebar toggle, mode tabs, real-time latency,
 *              status badge, and clear button.
 */

import React, { useMemo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TerminalIcon, Box, Settings as SettingsIcon, Zap, Trash2, Timer, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { StatusBadge } from '@/src/components/ui/StatusBadge';
import { AgentPersona } from '@/src/core/types';
import { Logo } from '@/src/lib/design-system/icons';

interface CoderHeaderProps {
  activeMode: 'coder' | 'registry' | 'settings';
  onModeChange: (mode: 'coder' | 'registry' | 'settings') => void;
  currentPersona: AgentPersona;
  metrics: { latency: number; tokens: number; tps: number };
  isLoading: boolean;
  badgeStatus: 'success' | 'loading' | 'offline' | 'no_key';
  onClear: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

/** Format latency: shows ms below 1000, then switches to X.Xs or Xm Y.Ys format */
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
  activeMode,
  onModeChange,
  currentPersona,
  metrics,
  isLoading,
  badgeStatus,
  onClear,
  sidebarOpen = true,
  onToggleSidebar,
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
    <header className="flex items-center justify-between px-3 py-2 border-b border-white/[0.05] shrink-0 select-none bg-[#131315]/90 backdrop-blur-md">
      {/* Left: sidebar toggle + logo + tabs */}
      <div className="flex items-center gap-2">
        {/* Sidebar toggle button */}
        {onToggleSidebar && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onToggleSidebar}
            className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-white/5 transition-all"
          >
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </motion.button>
        )}

        {/* Logo */}
        <div className="flex items-center gap-1.5">
          <Logo size={22} />
          <span className="text-[11px] font-black tracking-tight text-foreground/70 hidden sm:block">NYX</span>
        </div>

        <div className="w-px h-4 bg-white/10 mx-1" />

        {/* Mode tabs */}
        <div className="flex items-center gap-0.5 bg-white/4 p-0.5 rounded-xl border border-white/[0.06]">
          <TabButton
            active={activeMode === 'coder'}
            onClick={() => onModeChange('coder')}
            icon={<TerminalIcon size={11} />}
            label="NYX 2.0"
            activeClass="bg-violet-500/15 text-violet-300 border-violet-500/25"
          />
          <TabButton
            active={activeMode === 'registry'}
            onClick={() => onModeChange('registry')}
            icon={<Box size={11} />}
            label="Models"
            activeClass="bg-primary/10 text-primary border-primary/20"
          />
          <TabButton
            active={activeMode === 'settings'}
            onClick={() => onModeChange('settings')}
            icon={<SettingsIcon size={11} />}
            label="Settings"
            activeClass="bg-primary/10 text-primary border-primary/20"
          />
        </div>
      </div>

      {/* Right: metrics + status + clear */}
      <div className="flex items-center gap-1.5">
        {/* Latency badge */}
        <div className="hidden sm:flex items-center gap-1.5 bg-white/4 px-2.5 py-1.5 rounded-xl border border-white/[0.05] shadow-inner">
          {isLoading ? (
            <Timer className="w-3 h-3 text-primary animate-pulse" />
          ) : (
            <Zap className="w-3 h-3 text-amber-500/80" />
          )}
          <span className={`text-[10px] font-mono font-bold tabular-nums transition-colors ${
            isLoading
              ? 'text-primary'
              : metrics.latency > 5000
                ? 'text-amber-500'
                : 'text-foreground/70'
          }`}>
            {isLoading ? (
              <motion.span key={latencyText} initial={{ opacity: 0.6 }} animate={{ opacity: 1 }}>
                {latencyText}
              </motion.span>
            ) : latencyText}
          </span>
        </div>

        {/* TPS badge */}
        {(metrics.tps > 0 || (!isLoading && metrics.tokens > 0)) && (
          <div className="hidden sm:flex items-center gap-1.5 bg-white/4 px-2.5 py-1.5 rounded-xl border border-white/[0.05] shadow-inner">
            <Zap className="w-3 h-3 text-emerald-500/80" />
            <span className="text-[10px] font-mono font-bold text-foreground/70 tabular-nums">
              {metrics.tps > 0 ? metrics.tps : '—'}
              <span className="text-[8px] opacity-50 ml-0.5">t/s</span>
            </span>
          </div>
        )}

        <StatusBadge status={badgeStatus} />

        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={onClear}
          className="p-1.5 rounded-xl bg-white/4 hover:bg-red-500/10 text-muted-foreground/40 hover:text-red-400 transition-all border border-white/[0.05] hover:border-red-500/20 shadow-sm"
          title="Clear Session"
        >
          <Trash2 size={13} strokeWidth={1.5} />
        </motion.button>
      </div>
    </header>
  );
};

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeClass: string;
}> = ({ active, onClick, icon, label, activeClass }) => (
  <motion.button
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 border relative ${
      active
        ? 'border-white/[0.06] text-foreground shadow-sm bg-white/5'
        : 'border-transparent text-muted-foreground/50 hover:text-foreground/70'
    }`}
  >
    {active && (
      <motion.div
        layoutId="headerActiveTabBackground"
        className="absolute inset-0 rounded-lg -z-10 bg-white/[0.06] border border-white/[0.08] shadow-sm"
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      />
    )}
    <span className={`transition-transform duration-200 ${active ? 'scale-105 text-primary' : 'opacity-65'}`}>{icon}</span>
    <span className="hidden sm:block translate-y-[-0.5px]">{label}</span>
  </motion.button>
);
