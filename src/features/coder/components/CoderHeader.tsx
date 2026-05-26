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
    <header className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0 select-none bg-[#0B0E14]/40 backdrop-blur-xl">
      {/* Left: sidebar toggle + logo + tabs */}
      <div className="flex items-center gap-3">
        {/* Sidebar toggle button */}
        {onToggleSidebar && (
          <motion.button
            whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.05)' }}
            whileTap={{ scale: 0.95 }}
            onClick={onToggleSidebar}
            className="p-2 rounded-xl text-muted-foreground/45 hover:text-primary border border-transparent hover:border-white/5 transition-all cursor-pointer"
          >
            {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
          </motion.button>
        )}
 
        {/* Logo */}
        <div className="flex items-center gap-2 select-none pl-1">
          <span className="text-[13px] font-black uppercase tracking-[0.25em] text-foreground font-sans">
            NY<span className="text-cyan-400">X</span>
          </span>
          <span className="text-[9px] font-black uppercase tracking-widest text-cyan-400/40 border border-white/5 px-2 py-0.5 rounded-lg bg-white/[0.02] hidden xs:block">
            V2.0
          </span>
        </div>
 
        <div className="w-px h-4 bg-white/10 mx-1" />
      </div>
 
      {/* Right: metrics + status + clear */}
      <div className="flex items-center gap-2">
        {/* Latency badge (Double-Bezel Architecture) */}
        <div className="hidden sm:flex items-center p-[2px] bg-white/[0.02] border border-white/5 rounded-xl shadow-sm">
          <div className="flex items-center gap-1.5 bg-[#0B0E14]/60 border border-white/5 px-2.5 py-1 rounded-[calc(0.75rem-2px)]">
            {isLoading ? (
              <Timer className="w-3 h-3 text-cyan-400 animate-pulse" />
            ) : (
              <Zap className="w-3 h-3 text-amber-400" />
            )}
            <span className={`text-[10px] font-mono font-extrabold tracking-wide tabular-nums transition-colors ${
              isLoading
                ? 'text-cyan-400'
                : metrics.latency > 5000
                  ? 'text-amber-400'
                  : 'text-foreground/75'
            }`}>
              {isLoading ? (
                <motion.span key={latencyText} initial={{ opacity: 0.6 }} animate={{ opacity: 1 }}>
                  {latencyText}
                </motion.span>
              ) : latencyText}
            </span>
          </div>
        </div>
 
        {/* TPS badge (Double-Bezel Architecture) */}
        {(metrics.tps > 0 || (!isLoading && metrics.tokens > 0)) && (
          <div className="hidden sm:flex items-center p-[2px] bg-white/[0.02] border border-white/5 rounded-xl shadow-sm">
            <div className="flex items-center gap-1.5 bg-[#0B0E14]/60 border border-white/5 px-2.5 py-1 rounded-[calc(0.75rem-2px)]">
              <Zap className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] font-mono font-extrabold text-foreground/75 tabular-nums">
                {metrics.tps > 0 ? metrics.tps : '—'}
                <span className="text-[8px] opacity-40 ml-0.5 uppercase">t/s</span>
              </span>
            </div>
          </div>
        )}
 
        <StatusBadge status={badgeStatus} />
 
        <motion.button
          whileHover={{ scale: 1.05, backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}
          whileTap={{ scale: 0.94 }}
          onClick={onClear}
          className="p-2 rounded-xl bg-white/[0.02] text-muted-foreground/45 hover:text-red-400 transition-all border border-white/5 shadow-sm cursor-pointer"
          title="Clear Session"
        >
          <Trash2 size={13} strokeWidth={1.8} />
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
