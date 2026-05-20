import React from 'react';
import { motion } from 'framer-motion';
import { History } from 'lucide-react';
import { ComparisonHistoryItem } from '@/src/types';
import { UI_TEXT } from '../../lib/design-system/copy';

interface HistoryViewProps {
  history: ComparisonHistoryItem[];
  restoreHistory: (item: ComparisonHistoryItem) => void;
}

const HistoryViewComponent: React.FC<HistoryViewProps> = ({
  history,
  restoreHistory
}) => {
  return (
    <motion.div 
      key="history" 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }} 
      className="h-full w-full p-[2vw] flex flex-col min-h-0 overflow-hidden"
    >
      <div className="flex-1 min-h-0 w-full flex flex-col bg-white/30 dark:bg-zinc-900/20 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-3xl overflow-hidden shadow-xl relative">
        <header className="flex items-center justify-between p-4 border-b border-white/10 dark:border-white/5 shrink-0 select-none bg-white/10 dark:bg-black/10 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground">{UI_TEXT.history.title}</h2>
              <p className="text-muted-foreground text-[8px] font-black uppercase tracking-[0.2em] opacity-40">Saved Sessions</p>
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">
          {history.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
              {history.map(item => (
                <button 
                  key={item.id} 
                  onClick={() => restoreHistory(item)} 
                  className="p-4 rounded-2xl bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border border-white/20 dark:border-white/5 text-left hover:bg-white/60 dark:hover:bg-zinc-800/40 hover:border-primary/20 transition-all group shadow-sm hover:shadow-lg hover:-translate-y-0.5 duration-500 flex flex-col justify-between h-36 min-w-0"
                >
                  <div className="min-w-0 w-full">
                    <p className="text-[8px] font-bold text-muted-foreground/30 uppercase tracking-widest mb-3 group-hover:text-primary transition-colors">
                      {new Date(item.timestamp).toLocaleString()}
                    </p>
                    <h3 className="text-xs font-bold text-foreground/80 line-clamp-3 leading-relaxed transition-colors tracking-tight break-words">
                      {item.globalPrompt}
                    </h3>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-24 flex flex-col items-center justify-center text-center opacity-40">
               <div className="w-16 h-16 rounded-2xl bg-white/20 dark:bg-white/5 border border-white/15 dark:border-white/5 flex items-center justify-center mb-6">
                 <History size={28} strokeWidth={1.5} className="text-muted-foreground/40" />
               </div>
               <h3 className="text-lg font-bold text-foreground mb-2">{UI_TEXT.history.empty}</h3>
               <p className="text-[10px] font-medium text-muted-foreground/60 max-w-xs leading-relaxed">
                 Your saved comparisons will appear here once you start exploring.
               </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export const HistoryView = React.memo(HistoryViewComponent);
