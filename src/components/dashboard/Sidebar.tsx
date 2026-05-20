import React from 'react';
import { motion } from 'framer-motion';
import { History, Settings, DoorOpen, LayoutGrid, Database, Activity, Code } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import { Logo } from '../../lib/design-system/icons';
import { UI_TEXT } from '../../lib/design-system/copy';

interface SidebarProps {
  activeMode: 'grid' | 'analysis' | 'history' | 'settings' | 'registry' | 'coder';
  setActiveMode: (mode: 'grid' | 'analysis' | 'history' | 'settings' | 'registry' | 'coder') => void;
  onExit?: () => void;
  hasOutput: boolean;
  hasHistory: boolean;
}

const NAV_ITEMS = [
  { mode: 'grid'     as const, icon: LayoutGrid, labelKey: 'arena' as const },
  { mode: 'registry' as const, icon: Database,   labelKey: 'registry' as const },
  { mode: 'analysis' as const, icon: Activity,   labelKey: 'analysis' as const },
  { mode: 'coder'    as const, icon: Code,       labelKey: 'coder' as const },
  { mode: 'history'  as const, icon: History,    labelKey: 'history' as const },
  { mode: 'settings' as const, icon: Settings,   labelKey: 'settings' as const },
];

const SidebarComponent: React.FC<SidebarProps> = ({ activeMode, setActiveMode, onExit }) => {
  return (
    <nav
      className={[
        'mobile-nav-bar',
        // ── Mobile: frosted glass bottom tab bar ─────────────────────
        'fixed bottom-0 left-0 right-0 z-[100]',
        'h-[60px] flex flex-row items-center justify-around px-1',
        'bg-white/70 dark:bg-zinc-900/80 backdrop-blur-2xl',
        'border-t border-white/20 dark:border-white/5',
        // ── Desktop: left column ──────────────────────────────────────
        'md:static md:w-14 md:h-full md:flex-col md:items-center',
        'md:justify-start md:px-0 md:py-4 md:gap-1.5',
        'md:border-t-0 md:border-r md:border-white/10 dark:md:border-white/5',
        'md:bg-white/5 dark:md:bg-black/10 md:backdrop-blur-md',
        // ── Common ───────────────────────────────────────────────────
        'select-none shrink-0',
        '[&::-webkit-scrollbar]:hidden',
      ].join(' ')}
    >
      {/* Logo — desktop only */}
      <div className="hidden md:flex items-center justify-center w-full py-1 mb-1">
        <motion.div
          animate={{
            boxShadow: [
              '0 0 10px 0px rgba(var(--primary-rgb),0)',
              '0 0 18px 1px rgba(var(--primary-rgb),0.12)',
              '0 0 10px 0px rgba(var(--primary-rgb),0)',
            ],
          }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          className="w-9 h-9 rounded-2xl bg-white/10 dark:bg-white/5 border border-white/15 dark:border-white/5 flex items-center justify-center backdrop-blur-sm"
        >
          <Logo size={20} />
        </motion.div>
      </div>

      {/* Nav buttons */}
      {NAV_ITEMS.map((item) => {
        const isActive = activeMode === item.mode;
        const label = UI_TEXT.dashboard.sidebar[item.labelKey];
        return (
          <Tooltip key={item.mode} content={label} side="right">
            <button
              onClick={() => setActiveMode(item.mode)}
              aria-label={label}
              className={[
                // 44px min touch target — iOS HIG & Android material guidelines
                'relative flex flex-col items-center justify-center gap-[2px]',
                'min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl',
                'transition-all duration-300 active:scale-95 touch-manipulation z-10',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground/60 hover:text-foreground hover:bg-white/10 dark:hover:bg-white/5',
              ].join(' ')}
            >
              {isActive && (
                <motion.div
                  layoutId="active-pill-bg"
                  className="absolute inset-0 bg-primary/10 dark:bg-primary/15 rounded-xl -z-10"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}

              <span className="relative z-10 flex flex-col items-center justify-center gap-[2px]">
                <item.icon size={17} strokeWidth={isActive ? 2 : 1.5} />

                {/* Label — visible on mobile only */}
                <span className="text-[8px] font-semibold leading-none tracking-wide md:hidden">
                  {label}
                </span>
              </span>

              {/* Active dot on mobile, left bar on desktop */}
              {isActive && (
                <motion.span
                  layoutId="active-indicator"
                  className={[
                    'absolute bg-primary rounded-full z-25 shadow-[0_0_8px_rgba(var(--primary-rgb),0.4)]',
                    // Mobile: thin bar above the button
                    '-top-px left-1/2 -translate-x-1/2 w-5 h-[2px]',
                    // Desktop: luminous vertical bar on left edge
                    'md:top-auto md:left-auto md:-translate-x-0 md:-translate-y-1/2',
                    'md:-left-[7px] md:top-1/2 md:w-[2px] md:h-6',
                  ].join(' ')}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          </Tooltip>
        );
      })}

      {/* Exit button — desktop only (mobile has no room) */}
      <div className="hidden md:flex mt-auto items-center justify-center w-full">
        <Tooltip content="Exit" side="right">
          <button
            onClick={onExit}
            aria-label="Exit"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/5 transition-all duration-300 active:scale-95"
          >
            <DoorOpen size={17} strokeWidth={1.5} />
          </button>
        </Tooltip>
      </div>
    </nav>
  );
};

export const Sidebar = React.memo(SidebarComponent);
