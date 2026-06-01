// ─── NodeToggle ───────────────────────────────────────────────────────────────
// The on/off pill switch that activates/deactivates a comparison node.
// Pure UI — receives isSelected + onClick, emits nothing else.

import React from 'react';
import { motion } from 'motion/react';
import { Tooltip } from '../Tooltip';

interface NodeToggleProps {
  isSelected: boolean;
  onToggle: () => void;
}

export const NodeToggle: React.FC<NodeToggleProps> = ({ isSelected, onToggle }) => (
  <Tooltip content={isSelected ? 'Active Node' : 'Enable Node'}>
    <button
      onClick={onToggle}
      className={`group/switch relative w-12 h-6 rounded-full border transition-all duration-700 overflow-hidden shadow-inner ${
        isSelected
          ? 'bg-primary border-primary'
          : 'bg-muted/20 border-border-strong hover:border-primary/20'
      }`}
    >
      <motion.div
        animate={{ x: isSelected ? 24 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={`absolute left-1 top-1 w-4 h-4 rounded-full transition-colors shadow-sm ${
          isSelected ? 'bg-white' : 'bg-muted-foreground/20 group-hover/switch:bg-primary/40'
        }`}
      />
    </button>
  </Tooltip>
);
