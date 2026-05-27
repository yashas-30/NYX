/**
 * @file src/components/dashboard/PlanView.tsx
 * @description Dedicated swarm planner view displaying live execution tree.
 */

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDotDashed,
  CircleX,
  Terminal,
  Activity,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import { SubagentTask } from '@src/infrastructure/types';
import { NyxLoader } from '@src/shared/design-system/icons';

interface Subtask {
  id: string;
  title: string;
  description: string;
  status: 'completed' | 'in-progress' | 'pending' | 'need-help' | 'failed';
  priority: 'high' | 'medium' | 'low';
  tools?: string[];
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'completed' | 'in-progress' | 'pending' | 'need-help' | 'failed';
  priority: 'high' | 'medium' | 'low';
  level: number;
  dependencies: string[];
  subtasks: Subtask[];
}

const mapSubagentTasksToTasks = (subagentTasks: SubagentTask[]): Task[] => {
  return subagentTasks.map(task => {
    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (task.complexity === 'complex' || task.complexity === 'enterprise') {
      priority = 'high';
    } else if (task.complexity === 'trivial') {
      priority = 'low';
    }

    let status: Task['status'] = 'pending';
    if (task.status === 'completed') {
      status = 'completed';
    } else if (task.status === 'running') {
      status = 'in-progress';
    } else if (task.status === 'failed') {
      status = 'failed';
    }

    const subtasks: Subtask[] = [];
    const taskStatus = task.status;

    if (task.type === 'researcher') {
      subtasks.push({
        id: `${task.id}.1`,
        title: 'Scan codebase symbol indexes',
        description: 'Locate file paths, parse AST imports, and scan keyword definitions.',
        status: taskStatus === 'completed' ? 'completed' : (taskStatus === 'running' ? 'in-progress' : 'pending'),
        priority: 'high',
        tools: ['grep_search', 'list_dir', 'view_file']
      });
      subtasks.push({
        id: `${task.id}.2`,
        title: 'Query web search fallback',
        description: 'Read documentation endpoints for standard libraries and APIs.',
        status: taskStatus === 'completed' ? 'completed' : 'pending',
        priority: 'medium',
        tools: ['search_web', 'read_url_content']
      });
    } else if (task.type === 'coder') {
      subtasks.push({
        id: `${task.id}.1`,
        title: 'Analyze replacement bounds',
        description: 'Find matching lines and prepare replacement diff chunks.',
        status: taskStatus === 'completed' ? 'completed' : (taskStatus === 'running' ? 'in-progress' : 'pending'),
        priority: 'high',
        tools: ['view_file']
      });
      subtasks.push({
        id: `${task.id}.2`,
        title: 'Write code modifications',
        description: 'Apply multi-replace chunks to target files in workspace.',
        status: taskStatus === 'completed' ? 'completed' : (taskStatus === 'running' ? 'in-progress' : 'pending'),
        priority: 'high',
        tools: ['replace_file_content', 'write_to_file']
      });
    } else if (task.type === 'reviewer' || task.type === 'tester') {
      subtasks.push({
        id: `${task.id}.1`,
        title: 'Trigger static compile check',
        description: 'Run TypeScript noEmit checks on the workspace code.',
        status: taskStatus === 'completed' ? 'completed' : (taskStatus === 'running' ? 'in-progress' : 'pending'),
        priority: 'high',
        tools: ['run_command']
      });
      subtasks.push({
        id: `${task.id}.2`,
        title: 'Verify production packaging',
        description: 'Bundle client resources and verify server entrypoints compile cleanly.',
        status: taskStatus === 'completed' ? 'completed' : 'pending',
        priority: 'medium',
        tools: ['run_command']
      });
    } else {
      subtasks.push({
        id: `${task.id}.1`,
        title: 'Process instruction loop',
        description: task.description,
        status: taskStatus === 'completed' ? 'completed' : (taskStatus === 'running' ? 'in-progress' : 'pending'),
        priority: 'medium',
        tools: task.assignedModel ? [task.assignedModel.provider] : []
      });
    }

    return {
      id: task.id,
      title: `${task.type.toUpperCase()}: ${task.description.split('\n')[0]}`,
      description: task.description,
      status,
      priority,
      level: 0,
      dependencies: task.dependencies,
      subtasks
    };
  });
};

export const PlanView: React.FC<{
  subagentTasks?: SubagentTask[];
  isLoading: boolean;
  onBackToChat?: () => void;
}> = ({ subagentTasks, isLoading, onBackToChat }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expandedTasks, setExpandedTasks] = useState<string[]>(['decomp']);
  const [expandedSubtasks, setExpandedSubtasks] = useState<Record<string, boolean>>({});

  const prefersReducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  useEffect(() => {
    if (subagentTasks && subagentTasks.length > 0) {
      setTasks(mapSubagentTasksToTasks(subagentTasks));
    } else {
      // Default initial tasks if none exist (showing plan dashboard structure)
      setTasks([
        {
          id: 'decomp',
          title: 'PLANNER: Decompose dependency graph',
          description: 'Analyze context files and build the task planning sequence.',
          status: 'completed',
          priority: 'high',
          level: 0,
          dependencies: [],
          subtasks: [
            {
              id: 'decomp.1',
              title: 'Evaluate workspace telemetry',
              description: 'Retrieve file hierarchy and recent repository commit hashes.',
              status: 'completed',
              priority: 'high',
              tools: ['workspace-intel']
            },
            {
              id: 'decomp.2',
              title: 'Spawn subagent specifications',
              description: 'Map execution stages to specialist models.',
              status: 'completed',
              priority: 'medium',
              tools: ['hybrid-router']
            }
          ]
        },
        {
          id: 'swarm',
          title: 'SWARM: Orchestrate parallel execution',
          description: 'Execute planned tasks asynchronously via segmented subagents.',
          status: 'in-progress',
          priority: 'high',
          level: 0,
          dependencies: ['decomp'],
          subtasks: [
            {
              id: 'swarm.1',
              title: 'Initialize coder loop',
              description: 'Start prompt engineering tool agent.',
              status: 'in-progress',
              priority: 'high',
              tools: ['coder-agent']
            }
          ]
        }
      ]);
    }
  }, [subagentTasks]);

  useEffect(() => {
    if (tasks.length > 0) {
      const activeTask = tasks.find(t => t.status === 'in-progress');
      if (activeTask) {
        setExpandedTasks(prev => prev.includes(activeTask.id) ? prev : [...prev, activeTask.id]);
      } else if (expandedTasks.length === 0) {
        setExpandedTasks([tasks[0].id]);
      }
    }
  }, [tasks]);

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const toggleSubtaskExpansion = (taskId: string, subtaskId: string) => {
    const key = `${taskId}-${subtaskId}`;
    setExpandedSubtasks(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleTaskStatus = (taskId: string) => {
    setTasks(prev =>
      prev.map(task => {
        if (task.id === taskId) {
          const statuses: Task['status'][] = ['completed', 'in-progress', 'pending', 'need-help', 'failed'];
          const currentIndex = Math.floor(Math.random() * statuses.length);
          const newStatus = statuses[currentIndex];
          const updatedSubtasks = task.subtasks.map(subtask => ({
            ...subtask,
            status: newStatus === 'completed' ? 'completed' as const : subtask.status
          }));
          return {
            ...task,
            status: newStatus,
            subtasks: updatedSubtasks
          };
        }
        return task;
      })
    );
  };

  const toggleSubtaskStatus = (taskId: string, subtaskId: string) => {
    setTasks(prev =>
      prev.map(task => {
        if (task.id === taskId) {
          const updatedSubtasks = task.subtasks.map(subtask => {
            if (subtask.id === subtaskId) {
              const newStatus = subtask.status === 'completed' ? 'pending' as const : 'completed' as const;
              return { ...subtask, status: newStatus };
            }
            return subtask;
          });
          const allSubtasksCompleted = updatedSubtasks.every(s => s.status === 'completed');
          return {
            ...task,
            subtasks: updatedSubtasks,
            status: allSubtasksCompleted ? ('completed' as const) : task.status
          };
        }
        return task;
      })
    );
  };

  // Animation variants with reduced motion support
  const taskVariants: any = {
    hidden: { 
      opacity: 0, 
      y: prefersReducedMotion ? 0 : -5 
    },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { 
        type: prefersReducedMotion ? "tween" : "spring", 
        stiffness: 500, 
        damping: 30,
        duration: prefersReducedMotion ? 0.2 : undefined
      }
    },
    exit: {
      opacity: 0,
      y: prefersReducedMotion ? 0 : -5,
      transition: { duration: 0.15 }
    }
  };

  const subtaskListVariants: any = {
    hidden: { 
      opacity: 0, 
      height: 0,
      overflow: "hidden" 
    },
    visible: { 
      height: "auto", 
      opacity: 1,
      overflow: "visible",
      transition: { 
        duration: 0.25, 
        staggerChildren: prefersReducedMotion ? 0 : 0.05,
        when: "beforeChildren",
        ease: [0.2, 0.65, 0.3, 0.9] // Custom easing curve for Apple-like feel
      }
    },
    exit: {
      height: 0,
      opacity: 0,
      overflow: "hidden",
      transition: { 
        duration: 0.2,
        ease: [0.2, 0.65, 0.3, 0.9]
      }
    }
  };

  const subtaskVariants: any = {
    hidden: { 
      opacity: 0, 
      x: prefersReducedMotion ? 0 : -10 
    },
    visible: { 
      opacity: 1, 
      x: 0,
      transition: { 
        type: prefersReducedMotion ? "tween" : "spring", 
        stiffness: 500, 
        damping: 25,
        duration: prefersReducedMotion ? 0.2 : undefined
      }
    },
    exit: {
      opacity: 0,
      x: prefersReducedMotion ? 0 : -10,
      transition: { duration: 0.15 }
    }
  };

  const subtaskDetailsVariants: any = {
    hidden: { 
      opacity: 0, 
      height: 0,
      overflow: "hidden"
    },
    visible: { 
      opacity: 1, 
      height: "auto",
      overflow: "visible",
      transition: { 
        duration: 0.25,
        ease: [0.2, 0.65, 0.3, 0.9]
      }
    }
  };

  const statusBadgeVariants: any = {
    initial: { scale: 1 },
    animate: { 
      scale: prefersReducedMotion ? 1 : [1, 1.08, 1],
      transition: { 
        duration: 0.35,
        ease: [0.34, 1.56, 0.64, 1] // Springy custom easing for bounce effect
      }
    }
  };

  return (
    <div className="bg-background text-foreground h-full w-full overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-border">
          <div className="flex items-center gap-3">
            {onBackToChat && (
              <motion.button
                whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.05)' }}
                whileTap={{ scale: 0.95 }}
                onClick={onBackToChat}
                className="p-2 rounded-xl text-zinc-400 hover:text-white border border-border bg-card/50 transition-all cursor-pointer"
                title="Back to Chat"
              >
                <ArrowLeft size={14} />
              </motion.button>
            )}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Activity size={13} className="text-primary" />
                <h1 className="text-xs font-black uppercase tracking-[0.25em] text-primary">Swarm Execution Planner</h1>
              </div>
              <p className="text-[10px] text-muted-foreground font-bold leading-none uppercase tracking-wide">Decompose, route, compile, and verify workspace updates.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-card/30 border border-border p-2.5 rounded-2xl">
            <NyxLoader size={26} />
            {isLoading && (
              <span className="text-[9px] text-primary font-black uppercase tracking-widest animate-pulse">Running loop...</span>
            )}
          </div>
        </div>

        {/* Planner tree Card */}
        <motion.div 
          className="bg-card border-border rounded-lg border shadow overflow-hidden"
          initial={{ opacity: 0, y: 10 }}
          animate={{ 
            opacity: 1, 
            y: 0,
            transition: {
              duration: 0.3,
              ease: [0.2, 0.65, 0.3, 0.9]
            }
          }}
        >
          <LayoutGroup id="swarm-planner-dashboard-group">
            <div className="p-4 overflow-hidden">
              <ul className="space-y-1 overflow-hidden">
                {tasks.map((task, index) => {
                  const isExpanded = expandedTasks.includes(task.id);
                  const isCompleted = task.status === "completed";

                  return (
                    <motion.li
                      key={task.id}
                      className={` ${index !== 0 ? "mt-1 pt-2 border-t border-border/40" : ""} `}
                      initial="hidden"
                      animate="visible"
                      variants={taskVariants}
                    >
                      {/* Task row */}
                      <motion.div 
                        className="group flex items-center px-3 py-1.5 rounded-md cursor-pointer"
                        onClick={() => toggleTaskExpansion(task.id)}
                        whileHover={{ 
                          backgroundColor: "rgba(255,255,255,0.02)",
                          transition: { duration: 0.2 }
                        }}
                      >
                        <motion.div
                          className="mr-2 flex-shrink-0 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTaskStatus(task.id);
                          }}
                          whileTap={{ scale: 0.9 }}
                          whileHover={{ scale: 1.1 }}
                        >
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={task.status}
                              initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
                              animate={{ opacity: 1, scale: 1, rotate: 0 }}
                              exit={{ opacity: 0, scale: 0.8, rotate: 10 }}
                              transition={{
                                duration: 0.2,
                                ease: [0.2, 0.65, 0.3, 0.9]
                              }}
                            >
                              {task.status === "completed" ? (
                                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
                              ) : task.status === "in-progress" ? (
                                <CircleDotDashed className="h-4.5 w-4.5 text-primary animate-spin" />
                              ) : task.status === "need-help" ? (
                                <CircleAlert className="h-4.5 w-4.5 text-amber-500" />
                              ) : task.status === "failed" ? (
                                <CircleX className="h-4.5 w-4.5 text-red-500" />
                              ) : (
                                <Circle className="text-muted-foreground h-4.5 w-4.5" />
                              )}
                            </motion.div>
                          </AnimatePresence>
                        </motion.div>

                        <div className="flex min-w-0 flex-grow items-center justify-between">
                          <div className="mr-2 flex-1 truncate">
                            <span
                              className={`text-xs font-semibold tracking-wide ${isCompleted ? "text-muted-foreground line-through font-normal" : "text-foreground"}`}
                            >
                              {task.title}
                            </span>
                            <p className="text-[9px] text-muted-foreground font-bold truncate leading-none uppercase tracking-wide mt-1">
                              {task.description}
                            </p>
                          </div>

                          <div className="flex flex-shrink-0 items-center space-x-2 text-xs">
                            {task.dependencies.length > 0 && (
                              <div className="flex items-center mr-2">
                                <div className="flex flex-wrap gap-1">
                                  {task.dependencies.map((dep, idx) => (
                                    <motion.span
                                      key={idx}
                                      className="bg-muted text-muted-foreground border border-border/40 rounded px-1.5 py-0.5 text-[8px] font-bold shadow-sm uppercase tracking-wider"
                                      initial={{ opacity: 0, scale: 0.9 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      transition={{
                                        duration: 0.2,
                                        delay: idx * 0.05
                                      }}
                                      whileHover={{ 
                                        y: -1, 
                                        backgroundColor: "rgba(255,255,255,0.05)",
                                        transition: { duration: 0.2 } 
                                      }}
                                    >
                                      Dep: {dep}
                                    </motion.span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <motion.span
                              className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider border ${
                                task.status === "completed"
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : task.status === "in-progress"
                                    ? "bg-primary/10 text-primary border-primary/20"
                                    : task.status === "need-help"
                                      ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                      : task.status === "failed"
                                        ? "bg-red-500/10 text-red-400 border-red-500/20"
                                        : "bg-muted text-muted-foreground border-transparent"
                              }`}
                              variants={statusBadgeVariants}
                              initial="initial"
                              animate="animate"
                              key={task.status}
                            >
                              {task.status}
                            </motion.span>
                          </div>
                        </div>
                      </motion.div>

                      {/* Subtasks - staggered */}
                      <AnimatePresence mode="wait">
                        {isExpanded && task.subtasks.length > 0 && (
                          <motion.div 
                            className="relative overflow-hidden mt-0.5 ml-5.5"
                            variants={subtaskListVariants}
                            initial="hidden"
                            animate="visible"
                            exit="hidden"
                            layout
                          >
                            {/* Vertical connecting line aligned with task icon */}
                            <div className="absolute top-0 bottom-0 left-[20px] border-l-2 border-dashed border-border/20" />
                            <ul className="border-muted mt-1 mr-2 mb-1.5 ml-3 space-y-0.5">
                              {task.subtasks.map((subtask) => {
                                const subtaskKey = `${task.id}-${subtask.id}`;
                                const isSubtaskExpanded = !!expandedSubtasks[subtaskKey];

                                return (
                                  <motion.li
                                    key={subtask.id}
                                    className="group flex flex-col py-0.5 pl-6 cursor-pointer"
                                    onClick={() =>
                                      toggleSubtaskExpansion(task.id, subtask.id)
                                    }
                                    variants={subtaskVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    layout
                                  >
                                    <motion.div 
                                      className="flex flex-1 items-center rounded-md p-1 hover:bg-white/[0.02] transition-colors"
                                      layout
                                    >
                                      <motion.div
                                        className="mr-2 flex-shrink-0 cursor-pointer"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleSubtaskStatus(task.id, subtask.id);
                                        }}
                                        whileTap={{ scale: 0.9 }}
                                        whileHover={{ scale: 1.1 }}
                                        layout
                                      >
                                        <AnimatePresence mode="wait">
                                          <motion.div
                                            key={subtask.status}
                                            initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
                                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                            exit={{ opacity: 0, scale: 0.8, rotate: 10 }}
                                            transition={{
                                              duration: 0.2,
                                              ease: [0.2, 0.65, 0.3, 0.9]
                                            }}
                                          >
                                            {subtask.status === "completed" ? (
                                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                            ) : subtask.status === "in-progress" ? (
                                              <CircleDotDashed className="h-3.5 w-3.5 text-primary animate-spin" />
                                            ) : subtask.status === "need-help" ? (
                                              <CircleAlert className="h-3.5 w-3.5 text-amber-500" />
                                            ) : subtask.status === "failed" ? (
                                              <CircleX className="h-3.5 w-3.5 text-red-500" />
                                            ) : (
                                              <Circle className="text-muted-foreground h-3.5 w-3.5" />
                                            )}
                                          </motion.div>
                                        </AnimatePresence>
                                      </motion.div>

                                      <span
                                        className={`text-xs font-semibold tracking-wide ${subtask.status === "completed" ? "text-muted-foreground line-through font-normal" : "text-foreground/90"}`}
                                      >
                                        {subtask.title}
                                      </span>
                                    </motion.div>

                                    <AnimatePresence mode="wait">
                                      {isSubtaskExpanded && (
                                        <motion.div 
                                          className="text-muted-foreground border-border/20 mt-1 ml-1.5 border-l border-dashed pl-5 text-[11px] overflow-hidden space-y-2 pb-1.5"
                                          variants={subtaskDetailsVariants}
                                          initial="hidden"
                                          animate="visible"
                                          exit="hidden"
                                          layout
                                        >
                                          <p className="leading-relaxed font-medium">{subtask.description}</p>
                                          {subtask.tools && subtask.tools.length > 0 && (
                                            <div className="mt-0.5 mb-1 flex flex-wrap items-center gap-1.5">
                                              <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                                <Terminal size={10} /> Tools:
                                              </span>
                                              <div className="flex flex-wrap gap-1">
                                                {subtask.tools.map((tool, idx) => (
                                                  <motion.span
                                                    key={idx}
                                                    className="bg-primary/5 text-primary border border-primary/10 px-1.5 py-0.5 rounded text-[9px] font-mono leading-none tracking-tight uppercase"
                                                    initial={{ opacity: 0, y: -5 }}
                                                    animate={{ 
                                                      opacity: 1, 
                                                      y: 0,
                                                      transition: {
                                                        duration: 0.2,
                                                        delay: idx * 0.05
                                                      }
                                                    }}
                                                    whileHover={{ 
                                                      y: -1, 
                                                      backgroundColor: "rgba(255,255,255,0.05)",
                                                      transition: { duration: 0.2 } 
                                                    }}
                                                  >
                                                    {tool}
                                                  </motion.span>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </motion.li>
                                );
                              })}
                            </ul>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.li>
                  );
                })}
              </ul>
            </div>
          </LayoutGroup>
        </motion.div>
      </div>
    </div>
  );
};
