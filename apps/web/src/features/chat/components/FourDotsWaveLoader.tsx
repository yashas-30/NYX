import React, { memo } from 'react';
import { motion } from 'framer-motion';

interface FourDotsWaveLoaderProps {
  label?: string;
  className?: string;
  dotSizeClass?: string;
}

export const FourDotsWaveLoader: React.FC<FourDotsWaveLoaderProps> = memo(({
  label,
  className = '',
  dotSizeClass = 'w-2.5 h-2.5',
}) => {
  return (
    <div className={`inline-flex items-center gap-3 py-2 px-3.5 rounded-full bg-muted/10 border border-border/25 backdrop-blur-md shadow-sm select-none my-1.5 animate-fade-in ${className}`}>
      <div className="flex items-center gap-1.5">
        {[0, 1, 2, 3].map((idx) => (
          <motion.span
            key={idx}
            className={`${dotSizeClass} rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-400 shadow-[0_0_8px_rgba(168,85,247,0.55)]`}
            animate={{
              y: [0, -7, 0],
              scale: [0.8, 1.25, 0.8],
              opacity: [0.45, 1, 0.45],
            }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              delay: idx * 0.15,
              ease: [0.45, 0.05, 0.55, 0.95],
            }}
          />
        ))}
      </div>
      {label && (
        <span className="text-[11px] font-semibold text-muted-foreground/80 tracking-tight animate-pulse">
          {label}
        </span>
      )}
    </div>
  );
});

FourDotsWaveLoader.displayName = 'FourDotsWaveLoader';
