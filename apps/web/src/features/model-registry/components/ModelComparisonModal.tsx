// fallow-ignore-file code-duplication
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Scale, Cpu, HardDrive, Zap, Activity } from 'lucide-react';
import { LocalModelPreset } from '@src/types';

interface ModelComparisonModalProps {
  show: boolean;
  onClose: () => void;
  models: LocalModelPreset[];
  compatibility: any;
}

export const ModelComparisonModal: React.FC<ModelComparisonModalProps> = ({
  show,
  onClose,
  models,
  compatibility,
}) => {
  if (!show || models.length === 0) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[700] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-background/80 backdrop-blur-md cursor-pointer"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
            transition: { type: 'spring', stiffness: 350, damping: 30 },
          }}
          exit={{
            opacity: 0,
            scale: 0.95,
            y: 15,
            transition: { duration: 0.18, ease: 'easeOut' },
          }}
          className="relative w-full max-w-5xl bg-card border border-border rounded-md shadow-[0_30px_70px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden cursor-default z-[710]"
        >
          {/* Header */}
          <div className="p-4 px-6 border-b border-border bg-muted/20 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Scale size={16} className="text-accent" />
              <h3 className="text-xs font-black tracking-[0.25em] text-accent uppercase">
                Model Comparison
              </h3>
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="p-1.5 rounded-md text-muted-foreground/45 hover:text-foreground hover:bg-muted transition-all cursor-pointer"
            >
              <X size={14} />
            </motion.button>
          </div>

          <div className="flex flex-1 overflow-x-auto custom-scrollbar p-6 gap-6">
            {models.map((m) => {
              const compat = compatibility?.presetsCompatibility?.find(
                (c: any) => c.modelId === m.id
              );
              const meetsRam = compat ? compat.isCompatible : true;

              return (
                <div
                  key={m.id}
                  className="min-w-[280px] flex-1 flex flex-col gap-4 border border-border rounded-md p-5 bg-background shadow-sm"
                >
                  <div className="space-y-1 border-b border-border pb-4">
                    <span className="inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                      {m.provider || 'Local'}
                    </span>
                    <h4 className="text-[14px] font-bold text-foreground leading-tight mt-2">
                      {m.name}
                    </h4>
                    <p className="text-[11px] text-muted-foreground line-clamp-3 leading-relaxed mt-1">
                      {m.description}
                    </p>
                  </div>

                  {/* Benchmarks */}
                  <div className="space-y-3">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                      Benchmarks
                    </h5>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col items-center p-2 rounded-md bg-muted/10 border border-border">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                          MMLU
                        </span>
                        <span className="text-[12px] font-mono font-bold text-accent">
                          {m.metadata?.mmluScore || '--'}
                        </span>
                      </div>
                      <div className="flex flex-col items-center p-2 rounded-md bg-muted/10 border border-border">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                          H-Eval
                        </span>
                        <span className="text-[12px] font-mono font-bold text-accent">
                          {m.metadata?.humanEvalScore || '--'}
                        </span>
                      </div>
                      <div className="flex flex-col items-center p-2 rounded-md bg-muted/10 border border-border">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                          MT-B
                        </span>
                        <span className="text-[12px] font-mono font-bold text-accent">
                          {m.metadata?.mtBenchScore || '--'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Specs */}
                  <div className="space-y-3 mt-2">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                      Specifications
                    </h5>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[11px] border-b border-border/30 pb-1">
                        <span className="text-muted-foreground">Parameters</span>
                        <span className="font-mono font-bold text-foreground/90">
                          {m.paramCount || '--'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] border-b border-border/30 pb-1">
                        <span className="text-muted-foreground">Quantization</span>
                        <span className="font-mono font-bold text-foreground/90">
                          {m.quantization || '--'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] border-b border-border/30 pb-1">
                        <span className="text-muted-foreground">Context Window</span>
                        <span className="font-mono font-bold text-foreground/90">
                          {m.contextLength || '--'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] pb-1">
                        <span className="text-muted-foreground">Download Size</span>
                        <span className="font-mono font-bold text-foreground/90">
                          {m.size || '--'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* System Requirements */}
                  <div className="space-y-3 mt-2">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                      System Req (Proj.)
                    </h5>
                    <div
                      className={`p-3 rounded-md border ${!meetsRam ? 'bg-red-500/5 border-red-500/10' : 'bg-emerald-500/5 border-emerald-500/10'}`}
                    >
                      <div className="flex justify-between items-center text-[11px] mb-2">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <HardDrive size={10} /> Min RAM
                        </span>
                        <span className="font-mono font-bold text-foreground">{m.ramRequired}</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] mb-2">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Zap size={10} /> Min VRAM
                        </span>
                        <span className="font-mono font-bold text-foreground">
                          {m.vramRequired || 'None'}
                        </span>
                      </div>
                      {compat && (
                        <div className="flex justify-between items-center text-[11px] pt-2 border-t border-border">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <Activity size={10} /> Speed Class
                          </span>
                          <span
                            className={`font-black uppercase tracking-wider ${compat.speedClass === 'fast' ? 'text-emerald-400' : compat.speedClass === 'moderate' ? 'text-amber-400' : 'text-zinc-400'}`}
                          >
                            {compat.speedClass}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
