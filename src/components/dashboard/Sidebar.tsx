import React from 'react';
import { motion } from 'framer-motion';
import { History, Settings, DoorOpen, LayoutGrid, Database, Activity, Sun, Moon, Code } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import { UI_TEXT } from '../../lib/design-system/copy';
import { useTheme } from '../../context/ThemeContext';
import { Logo } from '../../lib/design-system/icons';

interface SidebarProps {
  activeMode: 'grid' | 'analysis' | 'history' | 'settings' | 'registry' | 'coder';
  setActiveMode: (mode: 'grid' | 'analysis' | 'history' | 'settings' | 'registry' | 'coder') => void;
  onExit?: () => void;
  hasOutput: boolean;
  hasHistory: boolean;
}

const SidebarComponent: React.FC<SidebarProps> = ({ activeMode, setActiveMode, onExit, hasOutput, hasHistory }) => {
  const { theme, toggleTheme } = useTheme();
  
  const navItems = [
    { mode: 'grid' as const,     icon: LayoutGrid, label: UI_TEXT.dashboard.sidebar.arena },
    { mode: 'registry' as const, icon: Database,   label: UI_TEXT.dashboard.sidebar.registry },
    { mode: 'analysis' as const, icon: Activity,   label: UI_TEXT.dashboard.sidebar.analysis },
    { mode: 'coder' as const,    icon: Code,       label: UI_TEXT.dashboard.sidebar.coder },
    { mode: 'history' as const,  icon: History,    label: UI_TEXT.dashboard.sidebar.history },
    { mode: 'settings' as const, icon: Settings,   label: UI_TEXT.dashboard.sidebar.settings },
  ];

  return (
    <nav className="w-12 border-r border-border-strong flex flex-col items-center py-4 gap-4 bg-background z-50 transition-all duration-500 shrink-0 select-none">
      <div className="relative group">
        <motion.div
          animate={{ 
            boxShadow: [
              "0 0 15px 0px rgba(var(--primary-rgb), 0)",
              "0 0 25px 2px rgba(var(--primary-rgb), 0.2)",
              "0 0 15px 0px rgba(var(--primary-rgb), 0)"
            ]
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="w-8 h-8 rounded-xl bg-foreground/5 border border-border-strong flex items-center justify-center relative z-10"
        >
          <Logo size={16} className="text-foreground" />
        </motion.div>
        {/* Subtle Outer Glow Layer */}
        <motion.div
          animate={{ opacity: [0.1, 0.2, 0.1], scale: [1, 1.1, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 bg-primary/10 blur-lg rounded-full"
        />
      </div>
      
      <div className="flex flex-col gap-3 flex-1">
        {navItems.map((item) => {
          const isActive = activeMode === item.mode;
          return (
            <Tooltip key={item.mode} content={item.label} side="right">
              <button
                onClick={() => setActiveMode(item.mode)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative group ${
                  isActive 
                    ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <item.icon size={16} strokeWidth={1.5} className="transition-transform group-hover:scale-105" />
                
                {isActive && (
                  <motion.div 
                    layoutId="active-indicator"
                    className="absolute -left-2 w-1 h-5 bg-primary rounded-full" 
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <Tooltip content={theme === 'dark' ? 'Light' : 'Dark'} side="right">
          <button 
            onClick={toggleTheme} 
            className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-primary transition-all hover:bg-muted/40 active:scale-90"
          >
            {theme === 'dark' ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
          </button>
        </Tooltip>

        <Tooltip content="Exit" side="right">
          <button 
            onClick={onExit} 
            className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all active:scale-90"
          >
            <DoorOpen size={16} strokeWidth={1.5} />
          </button>
        </Tooltip>
      </div>
    </nav>
  );
};

export const Sidebar = React.memo(SidebarComponent);
