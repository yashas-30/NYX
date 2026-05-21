/**
 * @file src/features/coder/components/CoderHeader.tsx
 * @description Header bar with mode tabs, agent info, latency, status badge, and clear button.
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TerminalIcon, Box, Settings as SettingsIcon, Zap, Trash2 } from 'lucide-react';
import { StatusBadge } from '@/src/components/ui/StatusBadge';
import { AgentPersona } from '@/src/core/types';

interface CoderHeaderProps {
  activeMode: 'coder' | 'registry' | 'settings';
  onModeChange: (mode: 'coder' | 'registry' | 'settings') => void;
  currentPersona: AgentPersona;
  metrics: { latency: number; tokens: number; tps: number };
  isLoading: boolean;
  badgeStatus: 'success' | 'loading' | 'offline' | 'no_key';
  onClear: () => void;
}

export const CoderHeader: React.FC<CoderHeaderProps> = ({
  activeMode,
  onModeChange,
  currentPersona,
  metrics,
  isLoading,
  badgeStatus,
  onClear
}) => {
  return (
    <header className="flex items-center justify-between p-2.5 sm:p-3 border-b border-white/10 dark:border-white/5 shrink-0 select-none bg-white/10 dark:bg-black/10 backdrop-blur-md">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1 bg-black/10 dark:bg-white/5 p-0.5 rounded-xl border border-white/10 dark:border-white/5">
          <button 
            onClick={() => onModeChange('coder')} 
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${activeMode === 'coder' ? 'bg-[#181224]/85 dark:bg-[#120B1C]/90 text-purple-400 border border-purple-500/20 shadow-sm font-black' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
          >
            <TerminalIcon size={12} />
            <span>NYX 2.0</span>
          </button>
          <button 
            onClick={() => onModeChange('registry')} 
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${activeMode === 'registry' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
          >
            <Box size={12} />
            <span>Models</span>
          </button>
          <button 
            onClick={() => onModeChange('settings')} 
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${activeMode === 'settings' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
          >
            <SettingsIcon size={12} />
            <span>Settings</span>
          </button>
        </div>
        <div className="h-4 w-px bg-white/15 dark:bg-white/5 mx-1 hidden lg:block" />
        <div className="flex flex-col hidden lg:flex">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold tracking-tight text-foreground/80">{currentPersona.name}</span>
            <span className="text-[7px] font-mono text-muted-foreground bg-white/20 dark:bg-white/5 px-1.5 py-0.5 rounded border border-white/10 dark:border-white/5">v{currentPersona.version}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="hidden sm:flex items-center gap-2 bg-white/20 dark:bg-white/5 px-2.5 py-1 rounded-xl border border-white/10 dark:border-white/5 shadow-sm group">
          <Zap className="w-3 h-3 text-amber-500 dark:text-amber-400 group-hover:scale-110 transition-transform" />
          <div className="flex flex-col min-w-[42px]">
            <span className="text-[7px] font-bold text-muted-foreground uppercase tracking-wider leading-none">Latency</span>
            <span className="text-[10px] font-mono font-bold leading-none mt-0.5 text-foreground/85">
              {isLoading && metrics.latency === 0 ? (
                <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.5 }}>...</motion.span>
              ) : `${metrics.latency}ms`}
            </span>
          </div>
        </div>

        <StatusBadge status={badgeStatus} />
        
        <button 
          onClick={onClear}
          className="p-1.5 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all border border-transparent hover:border-destructive/20 group"
          title="Clear Session"
        >
          <Trash2 size={13} strokeWidth={1.5} className="group-hover:scale-110 transition-transform" />
        </button>
      </div>
    </header>
  );
};
