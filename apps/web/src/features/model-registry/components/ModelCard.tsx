import React from 'react';
import { motion } from 'framer-motion';

interface ModelCardProps {
  name: string;
  provider: string;
  description: string;
  specs?: { contextWindow: string; maxOutput: string; modality: string };
  usage?: { used: number; remaining: number };
  hasKey?: boolean;
  status?: 'online' | 'offline' | 'no-key';
}

/** Pure display model card — library view only, no add functionality */
export const ModelCard: React.FC<ModelCardProps> = ({
  name,
  provider,
  description,
  specs,
  usage,
  hasKey,
  status,
}) => {
  const providerLabel = provider;

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="group relative p-3 rounded-md border border-solid flex flex-col gap-2.5 transform-gpu transition-all duration-500 overflow-hidden shadow-sm bg-card border-border hover:border-accent/30 hover:bg-secondary/30"
      style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
    >
      {/* Provider badge + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/20">
              {providerLabel}
            </span>
            {status && (
              <span
                className={`
                text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border
                ${
                  status === 'online'
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    : status === 'offline'
                      ? 'bg-red-500/10 text-red-500 border-red-500/20'
                      : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                }
              `}
              >
                {status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Auth'}
              </span>
            )}
          </div>
          <h4 className="text-[12px] font-bold truncate leading-tight tracking-tight text-foreground group-hover:text-accent transition-colors">
            {name}
          </h4>
        </div>
      </div>

      {/* Description */}
      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed font-medium">
        {description}
      </p>

      {/* Specs grid */}
      {(specs || (usage && hasKey)) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-3 border-t border-border/30">
          {specs && (
            <>
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">
                  Context
                </span>
                <span className="text-[10px] font-mono font-bold text-foreground/80">
                  {specs.contextWindow}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">
                  Modality
                </span>
                <span className="text-[10px] font-mono font-bold text-foreground/80">
                  {specs.modality}
                </span>
              </div>
            </>
          )}
          {usage && hasKey && (
            <>
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-accent/75">
                  Used
                </span>
                <span className="text-[10px] font-mono font-bold text-accent/80">
                  {(usage.used / 1000).toFixed(1)}k
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500/75">
                  Remaining
                </span>
                <span className="text-[10px] font-mono font-bold text-emerald-400">
                  {(usage.remaining / 1000).toFixed(1)}k
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Quota Exceeded Message */}
      {hasKey && usage && usage.remaining <= 0 && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 p-2.5 rounded-md bg-destructive/10 border border-destructive/20 flex items-center justify-center gap-2"
        >
          <div className="w-1.5 h-1.5 rounded-md bg-destructive animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-destructive">
            Quota Reached
          </span>
        </motion.div>
      )}
    </motion.div>
  );
};
