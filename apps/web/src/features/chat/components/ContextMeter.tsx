import React from 'react';
import { motion } from 'framer-motion';

interface ContextMeterProps {
  usedTokens: number;
  totalTokens: number;
  label?: string;
}

export const ContextMeter: React.FC<ContextMeterProps> = ({
  usedTokens,
  totalTokens,
  label = 'Context Window',
}) => {
  const percentage = totalTokens > 0 ? Math.min(100, Math.max(0, (usedTokens / totalTokens) * 100)) : 0;
  
  let colorClass = 'bg-emerald-500';
  if (percentage > 90) colorClass = 'bg-red-500';
  else if (percentage > 75) colorClass = 'bg-amber-500';

  return (
    <div className="flex flex-col gap-1 w-full max-w-xs">
      <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span>
          {usedTokens.toLocaleString()} / {totalTokens.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <motion.div
          className={`h-full ${colorClass} rounded-full`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
};
