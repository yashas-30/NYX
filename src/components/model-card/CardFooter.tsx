// ─── CardFooter ───────────────────────────────────────────────────────────────
// Bottom bar: wipe-output button, remove-node button.
// To add/change footer controls: edit only this file.

import React from 'react';
import { RotateCcw, X } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import { UI_TEXT } from '../../lib/design-system/copy';

interface CardFooterProps {
  metadata?: { tokensPerSecond?: number; latency?: number; tokens?: number };
  onReset: () => void;
  onRemove: () => void;
}

export const CardFooter: React.FC<CardFooterProps> = ({
  metadata,
  onReset,
  onRemove,
}) => (
  <div className="shrink-0 px-4 py-2.5 flex items-center justify-between border-t-2 border-border-strong bg-muted/5 relative z-10">
    <div className="flex-1" /> {/* Left spacer */}

    <div className="flex items-center gap-4">
      {/* Performance Metrics */}
      {metadata?.tokensPerSecond !== undefined && metadata.tokensPerSecond > 0 && (
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-primary/[0.03] border border-primary/10 shadow-sm transition-all hover:bg-primary/[0.05]">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary-rgb),0.4)]" />
          <span className="text-[10px] font-mono font-black text-primary tracking-tighter">
            {metadata.tokensPerSecond.toFixed(1)} <span className="text-[7px] opacity-60 ml-0.5">TPS</span>
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 border-l border-border-strong pl-4">
        <Tooltip content="Clear">
          <button
            onClick={onReset}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-muted/5 hover:bg-muted/10 text-muted-foreground/60 hover:text-foreground transition-all group border border-border-strong/20 active:scale-90 shadow-sm"
          >
            <RotateCcw size={14} strokeWidth={2} className="group-hover:-rotate-180 transition-transform duration-700" />
          </button>
        </Tooltip>
        <Tooltip content="Remove">
          <button
            onClick={onRemove}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-destructive/5 hover:bg-destructive/10 text-muted-foreground/60 hover:text-destructive transition-all group border border-destructive/10 active:scale-90 shadow-sm"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </Tooltip>
      </div>
    </div>
  </div>
);
