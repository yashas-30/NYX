import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface PinModalProps {
  open: boolean;
  value: string;
  handlePinInput: (digit: string) => void;
  setPinModal: (val: any) => void;
}

export const PinModal: React.FC<PinModalProps> = ({
  open,
  value,
  handlePinInput,
  setPinModal
}) => {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/90 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.98, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            exit={{ scale: 0.98, opacity: 0 }}
            className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center max-w-xs shadow-2xl"
          >
            <div className="mb-10 text-center">
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-primary mb-2">Lock</h3>
              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Authorize</p>
            </div>

            <div className="flex gap-2.5 mb-12">
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div 
                  key={i} 
                  className={`w-10 h-12 rounded-xl border flex items-center justify-center transition-all duration-300 ${
                    value.length > i 
                      ? 'bg-primary/10 border-primary/50' 
                      : 'bg-muted/10 border-border'
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                    value.length > i ? 'bg-primary scale-100' : 'bg-foreground/5 scale-50'
                  }`} />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 w-full">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'Clear', 0, 'Exit'].map(n => (
                <button 
                  key={n} 
                  onClick={() => { 
                    if(n === 'Clear') setPinModal((prev: any) => ({ ...prev, value: '' }));
                    else if(n === 'Exit') setPinModal((prev: any) => ({ ...prev, open: false }));
                    else handlePinInput(n.toString());
                  }} 
                  className={`h-14 rounded-xl font-bold transition-all active:scale-95 ${
                    typeof n === 'number' 
                      ? 'bg-muted/20 border border-border text-foreground hover:bg-muted/40 hover:border-primary/30' 
                      : 'text-[9px] uppercase tracking-widest text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
