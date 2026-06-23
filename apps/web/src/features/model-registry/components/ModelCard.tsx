import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info } from '@phosphor-icons/react';
import { ModelStatusBadge } from '../ModelStatusBadge';
import type { ModelStatus } from '@nyx/shared';

interface ModelCardProps {
  name: string;
  provider: string;
  description: string;
  specs?: { contextWindow: string; maxOutput: string; modality: string };
  features?: string[];
  pros?: string[];
  cons?: string[];
  usage?: { used: number; remaining: number };
  hasKey?: boolean;
  status?: 'online' | 'offline' | 'no-key';
  lifecycleStatus?: ModelStatus;
  shutdownDate?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  index?: number;
  isLocal?: boolean;
  isLoaded?: boolean;
  onLoad?: () => void;
  onUnload?: () => void;
  onUninstall?: () => void;
  loadingState?: 'loading' | 'unloading' | 'uninstalling' | 'idle';
}

/** Pure display model card — library view only, no add functionality */
export const ModelCard: React.FC<ModelCardProps> = ({
  name,
  provider,
  description,
  specs,
  features,
  pros,
  cons,
  usage,
  hasKey,
  status,
  lifecycleStatus,
  shutdownDate,
  isExpanded = false,
  onToggleExpand,
  index = 0,
  isLocal = false,
  isLoaded = false,
  onLoad,
  onUnload,
  onUninstall,
  loadingState = 'idle',
}) => {
  const providerLabel = provider;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ duration: 0.2, ease: 'easeOut', delay: index * 0.04 }}
      className="group relative p-4 rounded-xl flex flex-col transform-gpu transition-[transform,background-color,border-color,box-shadow] duration-500 overflow-hidden border border-border bg-card/50 hover:bg-card hover:border-accent/30 shadow-sm hover:shadow-md"
      style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
    >
      {/* Provider badge + status */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/20">
              {providerLabel}
            </span>
            {lifecycleStatus && (
              <ModelStatusBadge status={lifecycleStatus} shutdownDate={shutdownDate} />
            )}
            {status && (
              <span
                className={`
                text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border
                ${
                  status === 'online'
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    : status === 'offline'
                      ? 'bg-red-500/10 text-red-500 border-red-500/20'
                      : 'bg-muted text-muted-foreground border-border'
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
        {/* Info Button */}
        {(features || pros || cons) && (
          <button 
            onClick={onToggleExpand} 
            className={`p-1.5 rounded-md transition-colors shrink-0 ${isExpanded ? 'bg-primary/20 text-primary' : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'}`}
            title="View Details"
          >
            <Info size={16} weight={isExpanded ? "fill" : "regular"} />
          </button>
        )}
      </div>

      {/* Description */}
      <p className={`text-[11px] text-muted-foreground leading-relaxed font-medium mb-2.5 ${isExpanded ? '' : 'line-clamp-2 min-h-[36px]'}`}>
        {description}
      </p>

      {/* Specs grid */}
      {(specs || (usage && hasKey)) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-3 border-t border-border/30 mt-auto">
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

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (features || pros || cons) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-4 mt-3 border-t border-border/30 flex flex-col gap-3">
              {features && features.length > 0 && (
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">Features</span>
                  <ul className="list-disc list-outside ml-3 mt-1 space-y-0.5">
                    {features.map((f, i) => (
                      <li key={i} className="text-[10px] text-foreground/80 leading-snug">{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {pros && pros.length > 0 && (
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500/80">Good</span>
                  <ul className="list-disc list-outside ml-3 mt-1 space-y-0.5">
                    {pros.map((p, i) => (
                      <li key={i} className="text-[10px] text-emerald-500/90 leading-snug">{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {cons && cons.length > 0 && (
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-destructive/80">Bad</span>
                  <ul className="list-disc list-outside ml-3 mt-1 space-y-0.5">
                    {cons.map((c, i) => (
                      <li key={i} className="text-[10px] text-destructive/90 leading-snug">{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Local Model Actions */}
      {isLocal && (
        <div className="pt-3 mt-3 border-t border-border/30 flex justify-end gap-2">
          {onUninstall && (
            <button
              onClick={onUninstall}
              disabled={loadingState === 'uninstalling'}
              className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:opacity-50 transition-colors mr-auto"
            >
              {loadingState === 'uninstalling' ? 'Uninstalling...' : 'Uninstall'}
            </button>
          )}
          {isLoaded ? (
            <button
              onClick={onUnload}
              disabled={loadingState === 'unloading'}
              className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
            >
              {loadingState === 'unloading' ? 'Unloading...' : 'Unload'}
            </button>
          ) : (
            <button
              onClick={onLoad}
              disabled={loadingState === 'loading'}
              className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors"
            >
              {loadingState === 'loading' ? 'Loading to GPU...' : 'Load to GPU'}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};
