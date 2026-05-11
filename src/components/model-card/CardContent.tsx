// ─── CardContent ──────────────────────────────────────────────────────────────
// The main output area of a model node.
// Handles: idle placeholder, loading skeleton, error panel, markdown output.
// To change any of these states: edit only this file.

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Logo } from '../../lib/design-system/icons';
import { UI_TEXT } from '../../lib/design-system/copy';
import { ComparisonColumn } from '../../types';

interface CardContentProps {
  column: ComparisonColumn;
  showModelSelector: boolean;
  scrollRef: React.RefCallback<HTMLDivElement>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onDismissError: () => void;
}

export const CardContent: React.FC<CardContentProps> = ({
  column,
  showModelSelector,
  scrollRef,
  onScroll,
  onDismissError,
}) => (
  <div className="flex-1 min-h-0 h-full relative overflow-hidden">
    {/* Idle placeholder */}
    {column.status === 'idle' && !showModelSelector && (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 animate-in fade-in duration-500">
        <div className="w-20 h-20 rounded-[16px] border border-border-strong flex items-center justify-center bg-muted/20 shadow-sm">
          <Logo size={40} className="text-muted-foreground/10" />
        </div>
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
          {UI_TEXT.dashboard.arena.promptPlaceholder}
        </p>
      </div>
    )}

    {/* Loading skeleton */}
    {column.status === 'loading' && !column.output && (
      <div className="absolute inset-0 flex flex-col justify-center px-10 gap-4">
        {[100, 85, 92, 70, 88, 75].map((w, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="h-2 rounded-full bg-muted/30 relative overflow-hidden"
            style={{ width: `${w}%` }}
          >
            <motion.div
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/20 to-transparent"
            />
          </motion.div>
        ))}
      </div>
    )}

    {/* Error panel */}
    {column.status === 'error' && (
      <div className="absolute inset-0 flex items-center justify-center p-8 bg-background/40 backdrop-blur-3xl z-[60]">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-[280px] rounded-[16px] p-6 flex flex-col items-center text-center gap-6 border border-destructive/20 bg-card shadow-2xl shadow-destructive/5"
        >
          <div className="w-16 h-16 rounded-[16px] flex items-center justify-center bg-destructive/10 text-destructive border border-destructive/20">
            <AlertCircle size={28} strokeWidth={1.5} className="animate-pulse" />
          </div>
          <div className="space-y-4">
            <h4 className="text-[12px] font-bold text-destructive uppercase tracking-widest">Fault</h4>
            <div className="h-px w-12 bg-destructive/10 mx-auto my-4" />
            <p className="text-[11px] leading-relaxed text-muted-foreground/80 font-medium tracking-tight break-words">
              {column.error || 'Interrupted'}
            </p>
          </div>
          <button
            onClick={onDismissError}
            className="w-full py-3 rounded-full text-[9px] font-bold text-white uppercase bg-destructive hover:bg-destructive/90 transition-all active:scale-95 shadow-xl shadow-destructive/20 tracking-widest"
          >
            Dismiss
          </button>
        </motion.div>
      </div>
    )}

    {/* Markdown output (streaming + final) */}
    {(column.status === 'success' || (column.status === 'loading' && column.output)) && (
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 h-full overflow-y-auto overflow-x-hidden custom-scrollbar p-1"
      >
        <div className="min-h-0 overflow-hidden">
          <div className={`markdown-body overflow-hidden ${column.status === 'loading' ? 'streaming-cursor' : ''}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{column.output}</ReactMarkdown>
          </div>
        </div>
      </div>
    )}

  </div>
);
