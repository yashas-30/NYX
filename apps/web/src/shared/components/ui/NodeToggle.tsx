// ─── NodeToggle ───────────────────────────────────────────────────────────────
// The on/off pill switch that activates/deactivates a comparison node.
// Pure UI — receives isSelected + onClick, emits nothing else.

import React from 'react';
import { motion } from 'framer-motion';
import { Tooltip } from '../Tooltip';

interface NodeToggleProps {
  isSelected: boolean;
  onToggle: () => void;
}

export const NodeToggle: React.FC<NodeToggleProps> = ({ isSelected, onToggle }) => (
  <Tooltip content={isSelected ? 'Active Node' : 'Enable Node'}>
    <button
      onClick={onToggle}
      className={`group/switch relative w-12 h-6 rounded-md border transition-all duration-300 overflow-hidden ${
        isSelected
          ? 'bg-primary border-primary'
          : 'bg-muted border-border hover:border-border-strong'
      }`}
    >
      <motion.div
        animate={{ x: isSelected ? 24 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={`absolute left-1 top-1 w-4 h-4 rounded-md transition-colors ${
          isSelected
            ? 'bg-primary-foreground'
            : 'bg-muted-foreground/40 group-hover/switch:bg-muted-foreground/60'
        }`}
      />
    </button>
  </Tooltip>
);
