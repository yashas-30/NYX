import React from 'react';
import type { ModelStatus } from '@nyx/shared';

interface ModelStatusBadgeProps {
  status: ModelStatus;
  shutdownDate?: string;
  compact?: boolean;
}

const CONFIG: Record<ModelStatus, { label: string; className: string; title?: string }> = {
  ga: {
    label: 'GA',
    className:
      'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    title: 'Generally Available — stable and production-ready',
  },
  preview: {
    label: 'Preview',
    className: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    title: 'Preview — subject to change before GA',
  },
  deprecated: {
    label: 'Deprecated',
    className: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  },
  alias: {
    label: 'Alias',
    className: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
    title: 'Alias — always resolves to the latest stable model',
  },
};

/**
 * Displays a model lifecycle status badge (GA / Preview / Deprecated / Alias).
 * Used inside the ModelSelector model list and any model info surfaces.
 */
export const ModelStatusBadge: React.FC<ModelStatusBadgeProps> = ({
  status,
  shutdownDate,
  compact = false,
}) => {
  const cfg = CONFIG[status];
  if (!cfg) return null;

  const label = compact ? cfg.label.slice(0, 3).toUpperCase() : cfg.label;

  const title =
    status === 'deprecated' && shutdownDate
      ? `Deprecated — scheduled for shutdown on ${shutdownDate}`
      : cfg.title;

  return (
    <span
      title={title}
      className={`
        inline-flex items-center shrink-0
        text-[5.5px] font-black uppercase tracking-wider
        px-1 py-0.5 rounded-[3px] border
        ${cfg.className}
      `}
    >
      {label}
    </span>
  );
};
