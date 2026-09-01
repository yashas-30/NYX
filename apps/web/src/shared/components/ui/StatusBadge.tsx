// ─── StatusBadge ──────────────────────────────────────────────────────────────
// Pure display component for the node status pill (idle/loading/success/error).
// No logic here — just reads a status string and renders the correct style.

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Status = 'idle' | 'loading' | 'success' | 'error' | 'offline' | 'no_key';

interface StatusBadgeProps {
  status: Status;
  labelOverride?: string;
}

const CONFIGS: Record<Status, { label: string; dot: string; badge: string }> = {
  idle: {
    label: '',
    dot: 'bg-primary/80 animate-pulse',
    badge: 'bg-primary/5 border-primary/20 text-primary',
  },
  loading: {
    label: '',
    dot: 'bg-primary animate-pulse',
    badge: 'bg-primary/10 border-primary/30 text-primary',
  },
  success: {
    label: '',
    dot: 'bg-primary',
    badge: 'bg-primary/5 border-primary/20 text-primary',
  },
  error: {
    label: '',
    dot: 'bg-destructive',
    badge: 'bg-destructive/10 border-destructive/20 text-destructive',
  },
  offline: {
    label: '',
    dot: 'bg-muted-foreground/30',
    badge: 'bg-muted/10 border-border text-muted-foreground/40',
  },
  no_key: {
    label: '',
    dot: 'bg-amber-500',
    badge: 'bg-amber-500/10 border-amber-500/20 text-amber-500',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, labelOverride }) => {
  const cfg = CONFIGS[status];
  const label = labelOverride || cfg.label;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status + label}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className={`flex items-center justify-center rounded-md border ${cfg.badge} ${label ? 'gap-2 px-5 py-2 text-[12px] font-bold uppercase tracking-widest' : 'w-5 h-5 p-0'}`}
      >
        <span className={`rounded-full ${cfg.dot} ${label ? 'w-1.5 h-1.5' : 'w-2 h-2'}`} />
        {label}
      </motion.div>
    </AnimatePresence>
  );
};
