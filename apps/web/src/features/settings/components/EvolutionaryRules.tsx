import React from 'react';
import { motion } from 'framer-motion';
import { Brain, Trash2 } from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

interface EvolvedRule {
  metric: string;
  critique: string;
  rule: string;
  timestamp: number;
}

interface EvolutionaryRulesProps {
  evolvedRules: EvolvedRule[];
  setEvolvedRules: React.Dispatch<React.SetStateAction<EvolvedRule[]>>;
}

export const EvolutionaryRules: React.FC<EvolutionaryRulesProps> = ({
  evolvedRules,
  setEvolvedRules,
}) => {
  const handleClearRules = async () => {
    try {
      const res = await fetchWithAuth('/api/v1/nyx/reset', { 
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      });
      if (res.ok) {
        setEvolvedRules([]);
        toast.success('Successfully reset evolved memory!');
      } else {
        toast.error('Failed to reset evolved memory.');
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  return (
    <div className="mt-6 group p-5 rounded-md bg-card border border-border hover:border-accent/25 transition-all duration-300 relative overflow-hidden shadow-sm border border-border">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent/20 via-accent/10 to-accent/20 opacity-70 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-accent">
            EVOLVED MEMORY MANAGER
          </p>
          <h3 className="text-xs font-bold text-foreground mt-0.5">
            Meta-Cognitive Self-Correction
          </h3>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-accent bg-accent/10 px-2 py-0.5 rounded-md border border-accent/20">
          {evolvedRules.length} Lessons Learned
        </span>
      </div>

      <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-1 mb-4">
        {evolvedRules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center border border-dashed border-border rounded-md bg-secondary/10">
            <Brain className="w-8 h-8 text-muted-foreground/20 animate-pulse" />
            <p className="text-[11px] text-muted-foreground/80 mt-2 font-medium">
              No evolved memory rules recorded yet.
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5 max-w-[240px]">
              Nyx automatically criticizes itself post-interaction and learns how to improve.
            </p>
          </div>
        ) : (
          evolvedRules.map((rule, idx) => (
            <div
              key={idx}
              className="p-3 border border-border rounded-md bg-secondary/20 hover:bg-secondary/40 transition-colors flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/20 font-bold uppercase tracking-wider">
                  {rule.metric}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground/80">
                  {new Date(rule.timestamp).toLocaleDateString()}{' '}
                  {new Date(rule.timestamp).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <div className="text-[11px] text-muted-foreground/90 leading-relaxed italic">
                "What was wrong: {rule.critique}"
              </div>

              <div className="text-[11px] font-mono text-accent bg-accent/5 border border-accent/20 rounded-md p-2 select-all leading-normal">
                {rule.rule}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mt-4">
        <p className="text-[11px] text-muted-foreground/80 leading-relaxed max-w-[280px]">
          Critic processes interactions out-of-band and saves micro-rules that are injected in
          future runs. This prevents regression and builds robust codebases.
        </p>
        <motion.button
          whileTap={evolvedRules.length === 0 ? {} : { scale: 0.95 }}
          onClick={handleClearRules}
          disabled={evolvedRules.length === 0}
          className={`px-4 py-2.5 rounded-md border text-[11px] font-bold uppercase tracking-[0.2em] transition-all flex items-center gap-2 shrink-0 ${
            evolvedRules.length === 0
              ? 'bg-white/5 border-white/5 text-muted-foreground/30 cursor-not-allowed'
              : 'bg-red-500/5 border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 cursor-pointer shadow-sm'
          }`}
        >
          <Trash2 size={10} />
          Reset Memory
        </motion.button>
      </div>
    </div>
  );
};
