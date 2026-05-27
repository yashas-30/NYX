/**
 * @file src/features/coder/components/SubagentPanel.tsx
 * @description Live status panel for the subagent swarm.
 * Shows each subagent's type, status, assigned model (local/cloud badge), and progress bar.
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SubagentTask } from '@/src/core/types';
import { Cpu, Cloud, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

interface SubagentPanelProps {
  tasks: SubagentTask[];
  isLoading: boolean;
}

export const SubagentPanel: React.FC<SubagentPanelProps> = ({ tasks, isLoading }) => {
  if (!isLoading && tasks.length === 0) return null;

  const getStatusIcon = (status: SubagentTask['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 size={12} className="text-[#22D3EE] animate-spin" />;
      case 'completed':
        return <CheckCircle2 size={12} className="text-emerald-400" />;
      case 'failed':
        return <AlertCircle size={12} className="text-red-400" />;
      default:
        return <div className="w-3 h-3 rounded-full border border-zinc-600" />;
    }
  };

  const getProviderBadge = (task: SubagentTask) => {
    if (!task.assignedModel) return null;
    const isLocal =
      task.assignedModel.provider === 'nyx-native' ||
      task.assignedModel.provider === 'qwen-local';

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${
          isLocal
            ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_8px_rgba(34, 211, 238,0.05)]'
            : 'bg-[#22D3EE]/10 text-[#22D3EE] border border-[#22D3EE]/20'
        }`}
      >
        {isLocal ? <Cpu size={10} /> : <Cloud size={10} />}
        {task.assignedModel.provider}
      </span>
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        key="subagent-panel"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full px-4 pt-4 pb-2"
      >
        {/* Outer Shell (Double-Bezel Architecture) */}
        <div className="w-full bg-white/[0.02] border border-white/5 p-[2px] rounded-3xl shadow-xl">
          {/* Inner Core */}
          <div className="w-full bg-[#111622]/90 backdrop-blur-2xl border border-white/5 p-4 rounded-[calc(1.5rem-2px)]">
            
            {/* Header section */}
            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-white/[0.04]">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22D3EE]/60 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22D3EE]" />
                </span>
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-400">
                  Subagent Swarm Status
                </span>
              </div>
              {isLoading && (
                <span className="text-[9px] text-[#22D3EE]/80 font-black tracking-widest animate-pulse uppercase">
                  Orchestrating...
                </span>
              )}
            </div>

            {/* Tasks list */}
            <div className="space-y-2">
              {tasks.map(task => (
                /* Nested Sub-Shell for task item */
                <div
                  key={task.id}
                  className="group flex items-center gap-3.5 p-1.5 rounded-xl bg-white/[0.01] border border-white/5 shadow-sm transition-all hover:bg-white/[0.02] hover:border-white/10"
                >
                  <div className="flex-1 flex items-center gap-3 px-2 py-1.5 min-w-0">
                    <div className="shrink-0 transition-transform duration-300 group-hover:scale-110">
                      {getStatusIcon(task.status)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black text-zinc-300 uppercase tracking-wider">
                          {task.type}
                        </span>
                        {getProviderBadge(task)}
                      </div>
                      <p className="text-[10px] text-zinc-500 truncate mt-1 font-bold leading-relaxed tracking-wide">
                        {task.description}
                      </p>
                      {task.result?.error && (
                        <p className="text-[10px] text-red-400/80 mt-1 font-mono truncate">
                          {task.result.error}
                        </p>
                      )}
                    </div>
                  </div>

                  {task.status === 'running' && (
                    <div className="h-1 w-12 bg-white/5 rounded-full overflow-hidden flex-shrink-0 mr-2">
                      <motion.div
                        className="h-full bg-[#22D3EE]"
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && tasks.length === 0 && (
                <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-white/[0.01] border border-white/5">
                  <Loader2 size={12} className="text-[#22D3EE] animate-spin" />
                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Decomposing task dependency graph...</span>
                </div>
              )}
            </div>

          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
