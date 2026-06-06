import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AgentModeBadgeProps {
  mode: 'chat' | 'coder' | 'architect' | null;
  reasoning: string;
  isLoading: boolean;
}

export const AgentModeBadge: React.FC<AgentModeBadgeProps> = ({ mode, reasoning, isLoading }) => {
  if (!mode || !isLoading) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-[11px] text-zinc-400 w-fit"
      >
        {mode === 'chat' ? (
          <>
            <span className="w-1.5 h-1.5 rounded-md bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 font-medium">Chat</span>
          </>
        ) : mode === 'architect' ? (
          <>
            <span className="w-1.5 h-1.5 rounded-md bg-purple-400 animate-pulse" />
            <span className="text-purple-400 font-medium">Architect</span>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-md bg-blue-400 animate-pulse" />
            <span className="text-blue-400 font-medium">Coder</span>
          </>
        )}
        <span className="text-zinc-500">—</span>
        <span className="truncate max-w-[200px]" title={reasoning}>
          {reasoning}
        </span>
      </motion.div>
    </AnimatePresence>
  );
};
