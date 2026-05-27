import React from 'react';
import { Box } from 'lucide-react';

/** Section header with icon, title, and right-side controls */
export const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}> = ({ icon, title, subtitle, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10 dark:border-white/5">
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 rounded-[12px] bg-[#22D3EE]/10 border border-[#22D3EE]/20 flex items-center justify-center text-[#22D3EE] shrink-0 shadow-sm transition-transform duration-500 hover:rotate-6">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-bold tracking-tight text-foreground">{title}</h3>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">{subtitle}</p>
      </div>
    </div>
    {children && <div className="flex items-center gap-2">{children}</div>}
  </div>
);

/** Empty state for when no models are found */
export const EmptyState: React.FC<{ message: string; hint: string }> = ({ message, hint }) => (
  <div className="py-12 rounded-2xl border border-dashed border-white/15 dark:border-white/5 flex flex-col items-center justify-center text-center bg-white/10 dark:bg-white/5">
    <Box size={32} className="text-muted-foreground/15 mb-3" />
    <p className="text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground">{message}</p>
    <p className="text-[11px] text-muted-foreground mt-1.5 max-w-[280px]">{hint}</p>
  </div>
);
