import React from 'react';
import { Plus, Send, Loader2 } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import { UI_TEXT } from '../../lib/design-system/copy';

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
    <footer className="shrink-0 w-full px-4 py-3 bg-white/10 dark:bg-black/10 backdrop-blur-md z-40 border-t border-white/10 dark:border-white/5">
      <div className={`mx-auto transition-all duration-500 ease-out ${globalPrompt.trim().length > 0 ? 'max-w-2xl' : 'max-w-lg'}`}>
        <form onSubmit={(e) => { 
          e.preventDefault(); 
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          runComparison(); 
          setTimeout(() => {
            window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
          }, 100);
        }} className="relative">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border border-white/30 dark:border-white/10 rounded-2xl focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 transition-all shadow-xl">
            {/* Add model button */}
            <Tooltip content={columnsCount >= 2 ? 'Maximum 2 models' : 'Add model'}>
              <button
                type="button"
                aria-label={columnsCount >= 2 ? 'Maximum 2 models reached' : 'Add model'}
                onClick={() => onOpenForge()}
                disabled={columnsCount >= 2}
                className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center touch-manipulation transition-all duration-300 ${
                  columnsCount >= 2
                    ? 'opacity-20 cursor-not-allowed text-muted-foreground'
                    : 'text-muted-foreground/50 hover:text-primary hover:bg-primary/10 active:scale-90'
                }`}
              >
                <Plus size={16} strokeWidth={2} />
              </button>
            </Tooltip>

            {/* Prompt input — global CSS ensures font-size ≥ 16px to prevent iOS zoom */}
            <input
              className="flex-1 bg-transparent border-none focus:ring-0 outline-none text-foreground/90 placeholder:text-muted-foreground/35 font-medium text-sm leading-snug"
              placeholder={UI_TEXT.dashboard.arena.promptPlaceholder}
              value={globalPrompt}
              onChange={e => setGlobalPrompt(e.target.value)}
              onKeyDown={e => { 
                if (e.key === 'Enter') { 
                  e.preventDefault(); 
                  e.currentTarget.blur();
                  runComparison(); 
                  setTimeout(() => {
                    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                  }, 100);
                } 
              }}
            />

            {/* Send button */}
            <Tooltip content={UI_TEXT.dashboard.arena.sendButton}>
              <button
                onClick={runComparison}
                disabled={isGlobalLoading || columnsCount === 0 || !globalPrompt.trim()}
                className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center touch-manipulation transition-all duration-300 ${
                  globalPrompt.trim() && !isGlobalLoading
                    ? 'bg-primary text-white shadow-lg shadow-primary/25 active:scale-90 hover:scale-105'
                    : 'bg-muted/20 text-muted-foreground/30 cursor-not-allowed'
                }`}
              >
                {isGlobalLoading ? (
                  <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                ) : (
                  <Send size={15} strokeWidth={2} />
                )}
              </button>
            </Tooltip>
          </div>
        </form>
      </div>
    </footer>

  );
};

export const DashboardFooter = React.memo(DashboardFooterComponent);
