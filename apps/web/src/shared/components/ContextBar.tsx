import { AnimatedIcon } from '@shared/components/ui/animated-icon';
import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

interface ContextBarProps {
  used: number;   // tokens used
  limit: number;  // max tokens
  onSummarize?: () => void;
}

export const ContextBar: React.FC<ContextBarProps> = ({ used, limit, onSummarize }) => {
  if (!limit || limit === 0) return null;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  if (pct < 20) return null; // Don't show until 20% used

  const isWarn = pct >= 70 && pct < 90;
  const isDanger = pct >= 90;
  const color = isDanger ? '#c64545' : isWarn ? '#e8a55a' : '#cc785c';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-4 pb-1"
    >
      <div className="flex items-center gap-2">
        <div className="flex-1 h-[2px] bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        <span className="text-[10px] font-mono shrink-0" style={{ color }}>
          {used.toLocaleString()} / {limit.toLocaleString()} tokens ({pct}%)
        </span>
        {isDanger && onSummarize && (
          <button
            onClick={onSummarize}
            className="text-[10px] px-2 py-0.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
          >
            Summarize
          </button>
        )}
        {isWarn && (
          <AnimatedIcon icon={AlertTriangle} className="w-3 h-3 shrink-0" style={{ color }} />
        )}
      </div>
    </motion.div>
  );
};
