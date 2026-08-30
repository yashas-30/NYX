import React, { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertTriangle, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { ToolCall } from '@nyx/shared';

export const ContextIngestionCard: React.FC<{
  tools: { tool: ToolCall; status: string }[];
}> = memo(({ tools }) => {
  const [expanded, setExpanded] = useState(false);
  const isRunning = tools.some((t) => t.status === 'running');
  const isError = tools.some((t) => t.status === 'error');

  if (tools.length === 0) return null;

  const isWebSearchGroup = tools.every((t) => {
    const name = t.tool?.function?.name || (t.tool as any)?.name || (t.tool as any)?.tool;
    return name === 'web_search' || name === 'searchWeb';
  });

  const headerTitle = isWebSearchGroup
    ? `Searched ${tools.length} web source${tools.length !== 1 ? 's' : ''}`
    : `Read ${tools.length} document${tools.length !== 1 ? 's' : ''}`;

  const statusLabel = isRunning
    ? isWebSearchGroup
      ? 'Searching...'
      : 'Reading...'
    : isError
      ? 'Error'
      : isWebSearchGroup
        ? 'Searched'
        : 'Analyzed';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`my-2 rounded-md border overflow-hidden ${
        isError
          ? 'bg-red-500/5 border-red-500/20'
          : isRunning
            ? 'bg-sky-500/5 border-sky-500/20'
            : 'bg-emerald-500/5 border-emerald-500/20'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left cursor-pointer hover:bg-muted/40 transition-colors"
      >
        {isRunning ? (
          <Loader2 size={13} className="text-sky-400 animate-spin shrink-0" />
        ) : isError ? (
          <AlertTriangle size={13} className="text-red-400 shrink-0" />
        ) : (
          <Sparkles size={13} className="text-emerald-400 shrink-0" />
        )}
        <span className="text-[11px] font-semibold text-foreground/90 truncate">{headerTitle}</span>
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium uppercase tracking-wider ml-auto shrink-0 ${
            isRunning
              ? 'bg-sky-500/10 text-sky-400'
              : isError
                ? 'bg-red-500/10 text-red-400'
                : 'bg-emerald-500/10 text-emerald-400'
          }`}
        >
          {statusLabel}
        </span>
        {expanded ? (
          <ChevronDown size={12} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-muted-foreground shrink-0" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3 pt-1 border-t border-border flex flex-col gap-2">
              {tools.map((t, i) => {
                const name =
                  t.tool?.function?.name ||
                  (t.tool as any)?.name ||
                  (t.tool as any)?.tool ||
                  'Tool';
                let argsDisplay = '';
                try {
                  const rawArgs =
                    t.tool?.function?.arguments ||
                    (t.tool as any)?.args ||
                    (t.tool as any)?.arguments;
                  const parsed = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
                  if (parsed?.query) {
                    argsDisplay = ` "${parsed.query}"`;
                  }
                } catch {}

                const label =
                  name === 'web_search' || name === 'searchWeb'
                    ? `DuckDuckGo Live Search${argsDisplay}`
                    : `${name}${argsDisplay}`;

                return (
                  <div
                    key={i}
                    className="text-[11px] font-mono text-foreground/80 bg-muted/30 rounded px-2.5 py-1.5 flex justify-between items-center"
                  >
                    <span className="truncate max-w-[80%] font-sans text-[11px] text-foreground/90">
                      {label}
                    </span>
                    <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider shrink-0 ml-2">
                      {t.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
ContextIngestionCard.displayName = 'ContextIngestionCard';
