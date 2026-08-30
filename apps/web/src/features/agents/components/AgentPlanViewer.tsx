/**
 * AgentPlanViewer.tsx
 *
 * True Black Minimalist visual DAG / step execution checklist rendering live agent status.
 * Conforms to NYX DESIGN.md guidelines.
 */

import React from 'react';
import { ConductorPlan, AgentExecutionStep } from '../hooks/useAgentRunner';

interface AgentPlanViewerProps {
  plan: ConductorPlan | null;
  currentStepId: number | null;
  statusMessage: string;
  executionSteps: AgentExecutionStep[];
  isRunning: boolean;
  onCancel?: () => void;
}

export const AgentPlanViewer: React.FC<AgentPlanViewerProps> = ({
  plan,
  currentStepId,
  statusMessage,
  executionSteps,
  isRunning,
  onCancel,
}) => {
  if (!plan && !isRunning && executionSteps.length === 0) {
    return null;
  }

  return (
    <div className="my-4 rounded-xl border border-white/10 bg-[#09090b] p-4 text-zinc-200 shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="relative flex h-2.5 w-2.5 items-center justify-center">
            {isRunning && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                isRunning ? 'bg-cyan-500' : 'bg-emerald-500'
              }`}
            />
          </div>
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Autonomous Agent Swarm
          </span>
        </div>

        {isRunning && onCancel && (
          <button
            onClick={onCancel}
            className="rounded-md border border-rose-500/30 bg-rose-950/20 px-2.5 py-1 text-xs font-medium text-rose-400 transition hover:bg-rose-900/40"
          >
            Cancel Run
          </button>
        )}
      </div>

      {/* Goal Title */}
      {plan?.goal && (
        <div className="mt-3">
          <span className="text-xs text-zinc-500">Objective:</span>
          <p className="font-sans text-sm font-medium text-white">{plan.goal}</p>
        </div>
      )}

      {/* Plan Steps Checklist */}
      {plan?.steps && plan.steps.length > 0 && (
        <div className="mt-4 space-y-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
            Execution Plan DAG
          </span>
          <div className="space-y-1.5">
            {plan.steps.map((step) => {
              const isCurrent = currentStepId === step.step_id;
              const isCompleted = step.status === 'completed';
              const isFailed = step.status === 'failed';

              return (
                <div
                  key={step.step_id}
                  className={`flex items-start space-x-3 rounded-lg border p-2.5 transition-all ${
                    isCurrent
                      ? 'border-cyan-500/40 bg-cyan-950/20'
                      : isCompleted
                        ? 'border-emerald-500/20 bg-emerald-950/10'
                        : isFailed
                          ? 'border-rose-500/30 bg-rose-950/10'
                          : 'border-white/5 bg-zinc-900/40'
                  }`}
                >
                  <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-white/20 font-mono text-[10px] text-zinc-400">
                    {isCompleted ? '✓' : isFailed ? '✕' : step.step_id}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-200">{step.title}</span>
                      <span
                        className={`font-mono text-[10px] uppercase ${
                          isCompleted
                            ? 'text-emerald-400'
                            : isFailed
                              ? 'text-rose-400'
                              : isCurrent
                                ? 'text-cyan-400'
                                : 'text-zinc-500'
                        }`}
                      >
                        {step.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-400">{step.description}</p>
                    {step.result_summary && (
                      <p className="mt-1 font-mono text-[10px] text-zinc-500 line-clamp-2">
                        ↳ {step.result_summary}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live Tool Execution Stream */}
      {executionSteps.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
            ReAct Scratchpad & Tools
          </span>
          <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {executionSteps.map((step, idx) => (
              <div
                key={idx}
                className="rounded border border-white/5 bg-[#121214] p-2 font-mono text-[11px]"
              >
                {step.thought && (
                  <p className="text-zinc-400">
                    <span className="text-zinc-600">Thought:</span> {step.thought}
                  </p>
                )}
                {step.tool_name && (
                  <div className="mt-1 flex items-center space-x-1.5">
                    <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">
                      ⚙ {step.tool_name}
                    </span>
                    {step.tool_args && (
                      <span className="text-zinc-500 truncate max-w-xs">
                        {JSON.stringify(step.tool_args)}
                      </span>
                    )}
                  </div>
                )}
                {step.tool_result && (
                  <p
                    className={`mt-1 line-clamp-2 ${
                      step.is_error ? 'text-rose-400' : 'text-zinc-500'
                    }`}
                  >
                    ↳ {step.tool_result}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-[11px] text-zinc-400">
        <span className="truncate">{statusMessage}</span>
      </div>
    </div>
  );
};
