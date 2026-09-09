import React, { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  Globe,
  Wrench,
  GitFork,
  Brain,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Clock,
  Sparkles,
} from 'lucide-react';

export type AgentActivityType = 'memory' | 'search' | 'tool' | 'subagent' | 'reasoning' | 'plan';

export interface AgentActivityItem {
  id: string;
  type: AgentActivityType;
  label: string;
  status: 'running' | 'completed' | 'error';
  timestamp: number;
  durationMs?: number;
  details?: any;
  subagentName?: string;
  subagentTask?: string;
  subagentSteps?: AgentActivityItem[];
}

interface AgentActivityTrackerProps {
  activities?: AgentActivityItem[];
  isStreaming?: boolean;
}

const getActivityIcon = (type: AgentActivityType) => {
  switch (type) {
    case 'memory':
      return <Database className="w-3.5 h-3.5 text-sky-400" />;
    case 'search':
      return <Globe className="w-3.5 h-3.5 text-emerald-400" />;
    case 'tool':
      return <Wrench className="w-3.5 h-3.5 text-amber-400" />;
    case 'subagent':
      return <GitFork className="w-3.5 h-3.5 text-purple-400" />;
    case 'plan':
    case 'reasoning':
      return <Brain className="w-3.5 h-3.5 text-indigo-400" />;
    default:
      return <Sparkles className="w-3.5 h-3.5 text-zinc-400" />;
  }
};

const ActivityItemRow: React.FC<{
  item: AgentActivityItem;
  isNested?: boolean;
}> = ({ item, isNested = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasDetails =
    !!item.details || (item.subagentSteps && item.subagentSteps.length > 0) || !!item.subagentTask;

  return (
    <div
      className={`flex flex-col ${isNested ? 'ml-4 pl-3 border-l border-white/5 my-1.5' : 'my-1'}`}
    >
      <div
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
          hasDetails ? 'cursor-pointer hover:bg-white/[0.04]' : ''
        } ${item.status === 'running' ? 'bg-white/[0.03]' : ''}`}
      >
        <div className="flex-shrink-0">{getActivityIcon(item.type)}</div>

        <span className="font-mono text-zinc-300 flex-1 truncate select-none">{item.label}</span>

        {item.durationMs !== undefined && item.durationMs > 0 && (
          <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1 flex-shrink-0">
            <Clock className="w-2.5 h-2.5" />
            {item.durationMs}ms
          </span>
        )}

        <div className="flex-shrink-0 ml-1">
          {item.status === 'running' ? (
            <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
          ) : item.status === 'completed' ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          ) : (
            <AlertCircle className="w-3 h-3 text-rose-400" />
          )}
        </div>

        {hasDetails && (
          <div className="text-zinc-500 hover:text-zinc-300">
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {isExpanded && hasDetails && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-1 px-3 py-2 bg-[#09090b] border border-white/5 rounded-md text-[11px] font-mono text-zinc-400 space-y-2">
              {item.subagentTask && (
                <div>
                  <div className="text-zinc-500 uppercase text-[9px] tracking-wider mb-0.5">
                    Delegated Task:
                  </div>
                  <div className="text-zinc-300 whitespace-pre-wrap">{item.subagentTask}</div>
                </div>
              )}

              {item.details && (
                <div>
                  <div className="text-zinc-500 uppercase text-[9px] tracking-wider mb-0.5">
                    Action Details:
                  </div>
                  <pre className="text-zinc-300 overflow-x-auto whitespace-pre-wrap max-h-32 scrollbar-thin">
                    {typeof item.details === 'string'
                      ? item.details
                      : JSON.stringify(item.details, null, 2)}
                  </pre>
                </div>
              )}

              {item.subagentSteps && item.subagentSteps.length > 0 && (
                <div>
                  <div className="text-zinc-500 uppercase text-[9px] tracking-wider mb-1">
                    Child Steps ({item.subagentSteps.length}):
                  </div>
                  <div className="space-y-1">
                    {item.subagentSteps.map((subStep) => (
                      <ActivityItemRow key={subStep.id} item={subStep} isNested={true} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const AgentActivityTracker: React.FC<AgentActivityTrackerProps> = memo(
  ({ activities, isStreaming = false }) => {
    const [isTrackerOpen, setIsTrackerOpen] = useState(isStreaming);

    if (!activities || activities.length === 0) return null;

    const inProgressCount = activities.filter((a) => a.status === 'running').length;
    const completedCount = activities.filter((a) => a.status === 'completed').length;

    return (
      <div className="my-2.5 border border-white/10 rounded-xl bg-[#0d0d10] overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setIsTrackerOpen(!isTrackerOpen)}
          className="w-full flex items-center justify-between px-3.5 py-2 bg-[#121214] hover:bg-[#161619] transition-colors text-left"
        >
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-300">
            <span className="relative flex h-2 w-2">
              {inProgressCount > 0 ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              )}
            </span>
            <span className="font-medium text-zinc-200">
              {inProgressCount > 0
                ? `Activity in progress: ${inProgressCount} running`
                : `Activity complete: ${completedCount} actions finished`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wide">
              {activities.length} steps
            </span>
            {isTrackerOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            )}
          </div>
        </button>

        <AnimatePresence initial={false}>
          {isTrackerOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-2 space-y-0.5 border-t border-white/5"
            >
              {activities.map((activity) => (
                <ActivityItemRow key={activity.id} item={activity} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

AgentActivityTracker.displayName = 'AgentActivityTracker';
