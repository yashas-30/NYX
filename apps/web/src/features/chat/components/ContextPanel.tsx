import React from 'react';
import { motion } from 'framer-motion';

interface ContextPanelProps {
  metrics: {
    latency: number;
    tokens: number;
    tps: number;
    totalMessages: number;
    contextTokens: number;
    contextLimit: number;
  };
  modelName?: string;
  onSummarize?: () => void;
  onClose?: () => void;
}

export const ContextPanel: React.FC<ContextPanelProps> = ({ metrics, modelName, onSummarize, onClose }) => {
  const { latency, tokens, tps, totalMessages, contextTokens, contextLimit } = metrics;
  
  const pct = contextLimit > 0 ? Math.min(100, Math.round((contextTokens / contextLimit) * 100)) : 0;
  const isWarn = pct >= 70 && pct < 90;
  const isDanger = pct >= 90;
  // Use CSS variables for colors, fallback to hardcoded if not set
  const progressColor = isDanger ? 'var(--color-error, #ffb4ab)' : isWarn ? '#fbbc04' : 'var(--color-primary, #ffb4ab)';

  return (
    <aside className="w-[280px] bg-surface-container-low border-l border-outline-variant flex-shrink-0 hidden xl:flex flex-col z-10 transition-all duration-300">
      <div className="p-md border-b border-outline-variant/50 flex items-center justify-between">
        <h3 className="font-title-sm font-semibold text-on-surface">Context Panel</h3>
        <button 
          onClick={onClose}
          className="text-on-surface-variant hover:text-on-surface transition-colors p-1 rounded-full hover:bg-surface-variant"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-md flex flex-col gap-lg">
        {/* Token Usage */}
        <section className="flex flex-col gap-sm">
          <div className="flex items-center justify-between text-on-surface-variant">
            <div className="flex items-center gap-xs">
              <span className="material-symbols-outlined text-[16px]">data_usage</span>
              <span className="font-label-md font-medium uppercase tracking-wider">Context Window</span>
            </div>
          </div>
          <div className="bg-surface-container rounded-2xl p-sm border border-outline-variant/50">
            <div className="flex justify-between items-end mb-xs">
              <span className="font-display-sm font-bold text-on-surface">
                {contextTokens > 1000 ? `${(contextTokens / 1000).toFixed(1)}k` : contextTokens}
              </span>
              <span className="font-label-sm text-on-surface-variant mb-1">
                / {contextLimit > 1000 ? `${(contextLimit / 1000).toFixed(0)}k` : contextLimit}
              </span>
            </div>
            <div className="w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden">
              <motion.div 
                className="h-1.5 rounded-full" 
                style={{ backgroundColor: progressColor }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
              />
            </div>
            <div className="mt-xs text-right">
              <span className="font-label-sm font-medium" style={{ color: progressColor }}>
                {pct}% used
              </span>
            </div>
            {isDanger && onSummarize && (
              <button
                onClick={onSummarize}
                className="mt-2 text-[10px] px-2 py-1 rounded border border-error/30 text-error hover:bg-error-container hover:text-on-error-container transition-colors w-full uppercase tracking-wider font-semibold"
              >
                Summarize Context
              </button>
            )}
          </div>
        </section>

        {/* Model Info */}
        <section className="flex flex-col gap-sm">
          <div className="flex items-center justify-between text-on-surface-variant">
            <div className="flex items-center gap-xs">
              <span className="material-symbols-outlined text-[16px]">memory</span>
              <span className="font-label-md font-medium uppercase tracking-wider">Active Model</span>
            </div>
          </div>
          <div className="bg-surface-container rounded-2xl p-sm border border-outline-variant/50">
            <div className="font-body-md font-medium text-on-surface truncate">
              {modelName || 'None Selected'}
            </div>
          </div>
        </section>

        {/* Telemetry */}
        <section className="flex flex-col gap-sm">
          <div className="flex items-center justify-between text-on-surface-variant">
            <div className="flex items-center gap-xs">
              <span className="material-symbols-outlined text-[16px]">speed</span>
              <span className="font-label-md font-medium uppercase tracking-wider">Telemetry</span>
            </div>
          </div>
          <div className="bg-surface-container rounded-2xl p-sm border border-outline-variant/50 flex flex-col gap-2">
            <div className="flex justify-between items-center py-1.5 border-b border-outline-variant/30">
              <span className="font-body-sm text-on-surface-variant">Latency</span>
              <span className="font-label-mono text-on-surface">{latency.toFixed(2)}s</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-outline-variant/30">
              <span className="font-body-sm text-on-surface-variant">Speed</span>
              <span className="font-label-mono text-on-surface">{tps.toFixed(1)} t/s</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-outline-variant/30">
              <span className="font-body-sm text-on-surface-variant">Tokens</span>
              <span className="font-label-mono text-on-surface">{tokens}</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="font-body-sm text-on-surface-variant">Messages</span>
              <span className="font-label-mono text-on-surface">{totalMessages}</span>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
};
