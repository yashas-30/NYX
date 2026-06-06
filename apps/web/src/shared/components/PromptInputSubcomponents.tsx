import React from 'react';
import { motion } from 'framer-motion';

export const SectionLabel: React.FC<{ icon: React.ReactNode; label: string; color: string }> = ({
  icon,
  label,
  color,
}) => (
  <div className={`flex items-center gap-1.5 ${color}`}>
    {icon}
    <span className="text-[8px] font-black uppercase tracking-[0.25em] opacity-80">{label}</span>
  </div>
);

export const ParamSlider: React.FC<{
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: (v: number) => string;
  accent: string;
  onChange: (v: number) => void;
  isFloat?: boolean;
}> = ({ label, hint, value, min, max, step, display, accent, onChange, isFloat }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between mb-0.5">
      <div className="flex-1 min-w-0">
        <span className="text-[8px] font-black text-muted-foreground/60 uppercase tracking-wider">
          {label}
        </span>
        <p className="text-[7px] text-muted-foreground/30 mt-0.5 leading-snug">{hint}</p>
      </div>
      <span className="text-[10px] font-mono font-bold text-foreground/50 ml-3 shrink-0 tabular-nums">
        {display(value)}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) =>
        onChange(isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10))
      }
      className={`w-full h-1.5 rounded-md appearance-none cursor-pointer bg-muted ${accent}`}
    />
  </div>
);

export const ToolButton: React.FC<{
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  activeColor: string;
}> = ({ active, onClick, title, icon, activeColor }) => (
  <motion.button
    whileTap={{ scale: 0.93 }}
    type="button"
    onClick={onClick}
    title={title}
    className={`p-1.5 rounded-md border transition-all duration-200 ${
      active
        ? `${activeColor} border-border bg-muted/20`
        : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 border-transparent'
    }`}
  >
    {icon}
  </motion.button>
);
