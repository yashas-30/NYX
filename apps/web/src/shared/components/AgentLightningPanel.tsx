/**
 * @file src/shared/components/AgentLightningPanel.tsx
 * @description Sleek glassmorphism side panel detailing the Microsoft Agent Lightning RL training loop,
 *              spans, rollouts, and active APO system prompt optimizations.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ZapIcon as Zap, XIcon as X, ThumbsUpIcon as ThumbsUp, ThumbsDownIcon as ThumbsDown, Trash2Icon as Trash2, CheckIcon as Check } from '@animateicons/react/lucide';
import { ShieldAlert, Clock, GitCommit, FileText, Cpu, AlertCircle, RefreshCw } from 'lucide-react';
import { LightningRollout } from '../hooks/useAgentLightning';

interface AgentLightningPanelProps {
  isOpen: boolean;
  onClose: () => void;
  lightningState: {
    lightningEnabled: boolean;
    setLightningEnabled: (enabled: boolean) => void;
    rollouts: LightningRollout[];
    apoDirectives: Record<'chat' | 'coder', string[]>;
    averageReward: number;
    isOptimizing: boolean;
    submitReward: (id: string, reward: number) => void;
    clearHistory: () => void;
  };
  agentType: 'chat' | 'coder';
}

export const AgentLightningPanel: React.FC<AgentLightningPanelProps> = ({
  isOpen,
  onClose,
  lightningState,
  agentType,
}) => {
  const {
    lightningEnabled,
    setLightningEnabled,
    rollouts,
    apoDirectives,
    averageReward,
    isOptimizing,
    submitReward,
    clearHistory,
  } = lightningState;

  const activeRollouts = rollouts.filter((r) => r.agentType === agentType);
  const activeDirectives = apoDirectives[agentType];

  // Prepare simple reward history data for SVG chart
  const ratedRollouts = [...activeRollouts].reverse().filter((r) => r.reward !== null);

  // Build running average data points to show learning curves
  const chartPoints = React.useMemo(() => {
    if (ratedRollouts.length === 0) {
      // Static mock learning curve representing optimization steps
      return [
        { x: 0, y: 40 },
        { x: 25, y: 55 },
        { x: 50, y: 70 },
        { x: 75, y: 82 },
        { x: 100, y: 91 },
      ];
    }

    let sum = 0;
    return ratedRollouts.map((r, i) => {
      sum += r.reward ?? 0;
      const runningAvg = sum / (i + 1);
      // Map x to 0..100, y to 0..100 based on 0.0..1.0 reward
      const percentX = ratedRollouts.length > 1 ? (i / (ratedRollouts.length - 1)) * 100 : 50;
      const percentY = 20 + runningAvg * 70; // padded between 20 and 90
      return { x: percentX, y: percentY };
    });
  }, [ratedRollouts]);

  // Generate SVG path from points
  const linePath = React.useMemo(() => {
    if (chartPoints.length === 0) return '';
    return chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${100 - p.y}`).join(' ');
  }, [chartPoints]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop layer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-[3px]"
          />

          {/* Panel Container */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ ease: [0.32, 0.72, 0, 1], duration: 0.3 }}
            className="fixed top-0 right-0 h-full w-full max-w-[420px] z-[1001] bg-card border-l border-border flex flex-col text-foreground font-sans"
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between p-5 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-md bg-muted/50 border border-border flex items-center justify-center text-foreground animate-pulse">
                  <Zap size={16}  />
                </span>
                <div>
                  <h3 className="text-sm font-bold tracking-tight uppercase flex items-center gap-1.5 text-foreground">
                    Agent Lightning
                  </h3>
                  <p className="text-[10px] text-muted-foreground">
                    Microsoft RL & APO Optimization Engine
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Panel Area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin scrollbar-thumb-white/5">
              {/* Lightning Feature Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-md bg-muted/20 border border-border">
                <div className="flex items-start gap-3">
                  <Zap
                    size={16}
                    className={`mt-0.5 ${lightningEnabled ? 'text-foreground fill-foreground/20' : 'text-muted-foreground'}`}
                  />
                  <div>
                    <h4 className="text-xs font-bold text-foreground">Lightning Optimization Loop</h4>
                    <p className="text-[9.5px] text-muted-foreground mt-0.5">
                      Adapt prompts dynamically using reinforcement learning feedback
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setLightningEnabled(!lightningEnabled)}
                  className={`w-9 h-5 rounded-md p-0.5 transition-colors relative duration-300 outline-none shrink-0 cursor-pointer ${
                    lightningEnabled ? 'bg-foreground' : 'bg-muted border border-border'
                  }`}
                >
                  <motion.div
                    layout
                    className={`w-4 h-4 rounded-md shadow-sm ${lightningEnabled ? 'bg-background' : 'bg-muted-foreground'}`}
                    animate={{ x: lightningEnabled ? 16 : 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>

              {/* Learning / Optimization metrics */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 bg-muted/20 border border-border rounded-md text-center">
                  <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                    Rollouts
                  </div>
                  <div className="text-lg font-black text-foreground mt-1">{activeRollouts.length}</div>
                  <div className="text-[8px] text-muted-foreground mt-0.5">spans traced</div>
                </div>
                <div className="p-3 bg-muted/20 border border-border rounded-md text-center">
                  <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                    APO Rules
                  </div>
                  <div className="text-lg font-black text-foreground mt-1">
                    {activeDirectives.length}
                  </div>
                  <div className="text-[8px] text-muted-foreground mt-0.5">prompt weights</div>
                </div>
                <div className="p-3 bg-muted/20 border border-border rounded-md text-center">
                  <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                    Avg Reward
                  </div>
                  <div
                    className={`text-lg font-black mt-1 ${averageReward > 0.8 ? 'text-emerald-500' : 'text-foreground'}`}
                  >
                    {(averageReward * 100).toFixed(0)}%
                  </div>
                  <div className="text-[8px] text-muted-foreground mt-0.5">alignment score</div>
                </div>
              </div>

              {/* Optimization chart (RL feedback loop representation) */}
              <div className="p-4 bg-muted/20 border border-border rounded-md space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <GitCommit size={12} className="text-foreground" />
                    Learning Trajectory (APO Loop)
                  </h4>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-muted text-foreground font-mono border border-border font-bold uppercase">
                    RL-MDP Active
                  </span>
                </div>

                <div className="h-28 relative mt-2 rounded-md bg-muted/40 border border-border overflow-hidden p-2">
                  <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {/* SVG learning line path */}
                    {linePath && (
                      <>
                        <defs>
                          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <path d={`${linePath} L 100 100 L 0 100 Z`}  />
                        <motion.path
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          d={linePath}
                          
                          stroke="#06b6d4"
                          
                        />
                      </>
                    )}
                  </svg>

                  {/* Grid Lines Overlay */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-2 text-[8px] font-mono text-zinc-600">
                    <div className="border-b border-white/[0.02] w-full text-right">
                      1.0 (Optimal)
                    </div>
                    <div className="border-b border-white/[0.02] w-full text-right">0.5</div>
                    <div className="w-full text-right">0.0 (Unstable)</div>
                  </div>
                </div>
                <p className="text-[8.5px] text-muted-foreground leading-normal text-center">
                  Reward feedback dynamically reinforces correct outputs, triggering targeted
                  Automatic Prompt Optimization (APO).
                </p>
              </div>

              {/* Dynamic APO Prompt Directives */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Cpu size={12} className="text-foreground" />
                    APO Prompt Optimizations ({activeDirectives.length})
                  </h4>
                  {isOptimizing && (
                    <span className="flex items-center gap-1 text-[9px] text-foreground font-bold animate-pulse">
                      <RefreshCw size={10} className="animate-spin" /> Optimizing...
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {activeDirectives.length === 0 ? (
                    <div className="p-4 rounded-md border border-dashed border-border text-center text-muted-foreground text-xs">
                      <AlertCircle size={14} className="mx-auto text-muted-foreground mb-1.5" />
                      No prompt rules generated yet. Provide thumbs up/down rewards to trigger
                      automatic continuous optimization!
                    </div>
                  ) : (
                    activeDirectives.map((rule, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-start gap-2.5 p-3 rounded-md bg-muted/10 border border-border"
                      >
                        <span className="w-4 h-4 rounded bg-muted/50 border border-border text-foreground flex items-center justify-center text-[9px] font-bold shrink-0 font-mono mt-0.5">
                          ✓
                        </span>
                        <div className="text-[10.5px] leading-relaxed text-foreground font-medium">
                          {rule}
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>

              {/* Rollout Trace Logs */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FileText size={12} className="text-foreground" />
                    Rollout Trace History ({activeRollouts.length})
                  </h4>
                  {activeRollouts.length > 0 && (
                    <button
                      onClick={clearHistory}
                      className="text-[9.5px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 size={10} /> Clear
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  {activeRollouts.length === 0 ? (
                    <div className="p-4 rounded-md border border-dashed border-border text-center text-muted-foreground text-xs">
                      No rollouts recorded. Start a chat or code generation to collect spans.
                    </div>
                  ) : (
                    activeRollouts.map((rollout) => (
                      <div
                        key={rollout.id}
                        className="p-3 bg-muted/10 border border-border rounded-md space-y-2 text-left"
                      >
                        <div className="flex items-center justify-between text-[8px] font-mono text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock size={8} /> {new Date(rollout.timestamp).toLocaleTimeString()}
                          </span>
                          <span className="uppercase font-bold tracking-widest text-foreground">
                            {rollout.id.slice(0, 13)}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="text-[10px] text-foreground font-semibold break-words">
                            <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground mr-1.5">
                              Task:
                            </span>
                            {rollout.task}
                          </div>
                          <div className="text-[9.5px] text-muted-foreground leading-normal break-words">
                            <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground mr-1.5">
                              Action:
                            </span>
                            {rollout.response}
                          </div>
                        </div>

                        {/* Rollout Spans List */}
                        <div className="pt-1.5 border-t border-border flex items-center gap-3">
                          {rollout.spans.map((span, sidx) => (
                            <div
                              key={sidx}
                              className="flex items-center gap-1 text-[8.5px] text-muted-foreground font-medium"
                            >
                              <Cpu size={10} className="text-foreground/70" />
                              <span>{span.name}</span>
                              <span className="text-muted-foreground font-mono">({span.durationMs}ms)</span>
                            </div>
                          ))}
                        </div>

                        {/* Interactive Grader / Reward selection */}
                        <div className="pt-2 border-t border-border flex items-center justify-between">
                          <span className="text-[8.5px] text-muted-foreground font-bold uppercase tracking-wider">
                            Grader Reward:
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => submitReward(rollout.id, 1.0)}
                              className={`p-1.5 rounded-md border transition-all cursor-pointer flex items-center justify-center ${
                                rollout.reward === 1.0
                                  ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-500'
                                  : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                              }`}
                              title="Assign +1.0 Reward (Thumbs Up)"
                            >
                              <ThumbsUp
                                size={11}
                                
                              />
                            </button>
                            <button
                              onClick={() => submitReward(rollout.id, 0.0)}
                              className={`p-1.5 rounded-md border transition-all cursor-pointer flex items-center justify-center ${
                                rollout.reward === 0.0
                                  ? 'bg-red-500/10 border-red-500/35 text-red-500'
                                  : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                              }`}
                              title="Assign 0.0 Reward (Thumbs Down)"
                            >
                              <ThumbsDown
                                size={11}
                                
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Panel footer */}
            <div className="p-4 bg-muted/20 border-t border-border text-[9px] text-muted-foreground text-center flex items-center justify-center gap-1.5 select-none shrink-0">
              <ShieldAlert size={10} className="text-muted-foreground" />
              <span>Vault protected traces. Dynamic updates run isolated.</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
