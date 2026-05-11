import React from 'react';
import { motion } from 'motion/react';
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
    <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full w-full pt-4 px-6 pb-20 overflow-y-auto custom-scrollbar">
      <h2 className="text-xl font-bold tracking-tight text-foreground mb-5">{UI_TEXT.history.title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
        {history.length > 0 ? (
          history.map(item => (
            <button 
              key={item.id} 
              onClick={() => restoreHistory(item)} 
              className="p-4 rounded-[14px] bg-card/40 backdrop-blur-3xl border border-border-strong text-left hover:bg-card/60 hover:border-primary/20 transition-all group shadow-sm hover:shadow-lg duration-500"
            >
              <p className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-widest mb-3 group-hover:text-primary transition-colors">
                {new Date(item.timestamp).toLocaleString()}
              </p>
              <h3 className="text-sm font-bold text-foreground/80 line-clamp-2 leading-relaxed transition-colors tracking-tight">
                {item.globalPrompt}
              </h3>
            </button>
          ))
        ) : (
          <div className="col-span-full py-40 flex flex-col items-center justify-center text-center opacity-20">
             <div className="w-24 h-24 rounded-[24px] bg-muted/10 border border-border-strong flex items-center justify-center mb-8">
               <History size={40} strokeWidth={1.5} className="text-muted-foreground" />
             </div>
             <h3 className="text-2xl font-bold text-foreground mb-4">{UI_TEXT.history.empty}</h3>
             <p className="text-[11px] font-medium text-muted-foreground/60 max-w-xs leading-relaxed">
               Your saved comparisons will appear here once you start exploring.
             </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export const HistoryView = React.memo(HistoryViewComponent);
