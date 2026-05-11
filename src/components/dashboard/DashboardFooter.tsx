import React from 'react';
import { Plus, Send, Loader2, History } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import { UI_TEXT } from '../../lib/design-system/copy';
import { motion, AnimatePresence } from 'framer-motion';

interface DashboardFooterProps {
  globalPrompt: string;
  setGlobalPrompt: (val: string) => void;
  runComparison: () => void;
  isGlobalLoading: boolean;
  onOpenForge: () => void;
  columnsCount: number;
}

const DashboardFooterComponent: React.FC<DashboardFooterProps> = ({
  globalPrompt,
  setGlobalPrompt,
  runComparison,
  isGlobalLoading,
  onOpenForge,
  columnsCount
}) => {
  return (
    <footer className="shrink-0 w-full p-1.5 bg-background/40 backdrop-blur-3xl z-40 border-t border-border-strong/20">
      <div className={`mx-auto transition-all duration-700 ease-in-out ${globalPrompt.trim().length > 0 ? 'max-w-2xl' : 'max-w-lg'}`}>
        <form onSubmit={(e) => { e.preventDefault(); runComparison(); }} className="relative group">
          <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-card/50 backdrop-blur-3xl border border-border-strong/20 rounded-full focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/10 transition-all duration-500 shadow-2xl">
            {/* Left Controls */}
            <div className="shrink-0 flex items-center px-1">
              <Tooltip content={UI_TEXT.dashboard.sidebar.history}>
                <button 
                  type="button" 
                  className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-all"
                >
                  <History size={14} strokeWidth={1.5} />
                </button>
              </Tooltip>
            </div>

            {/* Input Area (Integrated Plus) */}
            <div className="flex-1 relative flex items-center group/input">
              <div className="absolute left-2 z-10">
                <Tooltip content={UI_TEXT.registry.add}>
                  <button 
                    type="button"
                    onClick={() => onOpenForge()}
                    disabled={columnsCount >= 4}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground/30 group-focus-within/input:text-primary group-hover/input:text-muted-foreground/60 hover:bg-primary/10 transition-all disabled:opacity-10"
                  >
                    <Plus size={14} strokeWidth={1.5} />
                  </button>
                </Tooltip>
              </div>
              <input 
                className="flex-1 bg-transparent border-none focus:ring-0 text-[11px] py-1 pl-8 pr-1 font-medium outline-none text-foreground/90 placeholder:text-muted-foreground/30 text-center" 
                placeholder={UI_TEXT.dashboard.arena.promptPlaceholder} 
                value={globalPrompt} 
                onChange={e => setGlobalPrompt(e.target.value)} 
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runComparison(); } }} 
              />
            </div>

            {/* Right Controls */}
            <div className="shrink-0">
              <Tooltip content={UI_TEXT.dashboard.arena.sendButton}>
                <button 
                  onClick={runComparison} 
                  disabled={isGlobalLoading || (columnsCount === 0 || !globalPrompt.trim())} 
                  className={`h-6 w-6 rounded-full flex items-center justify-center transition-all ${
                    globalPrompt.trim() && !isGlobalLoading
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-100 hover:scale-105' 
                      : 'bg-muted/20 text-muted-foreground/30 opacity-50 cursor-not-allowed'
                  }`}
                >
                  {isGlobalLoading ? (
                    <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                  ) : (
                    <Send size={14} strokeWidth={1.5} />
                  )}
                </button>
              </Tooltip>
            </div>
          </div>
        </form>
      </div>
    </footer>
  );
};

export const DashboardFooter = React.memo(DashboardFooterComponent);
