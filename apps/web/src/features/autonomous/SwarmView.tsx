import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Play, Pause, RotateCcw, CheckCircle, AlertCircle, Clock, GitBranch, Terminal, FileText, Globe, Sparkles, ChevronRight, Zap, Settings, X, Plus, Trash2
} from 'lucide-react';
import { useNyxStore } from '@src/shared/store/useNyxStore';

const isTauriEnv = typeof window !== 'undefined' &&
  ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

let invoke: any = null;
let listen: any = null;
if (isTauriEnv) {
  import('@tauri-apps/api/core').then(m => invoke = m.invoke);
  import('@tauri-apps/api/event').then(m => listen = m.listen);
}

interface SwarmAgent {
  id: string;
  name: string;
  role: 'planner' | 'researcher' | 'coder' | 'reviewer' | 'writer' | 'tester';
  status: 'idle' | 'running' | 'completed' | 'failed';
  progress: number;
  task: string;
  result: string;
  tools: string[];
  startTime?: string;
  endTime?: string;
}

interface SwarmTask {
  id: string;
  title: string;
  description: string;
  agents: SwarmAgent[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  aggregatedResult: string;
}

const DEMO_SWARMS: SwarmTask[] = [
  {
    id: 'swarm-1',
    title: 'Build a REST API from scratch',
    description: 'Create a complete Node.js REST API with authentication, database, and documentation',
    status: 'completed',
    createdAt: '2 hours ago',
    completedAt: '1 hour ago',
    aggregatedResult: 'Successfully built a complete REST API with Express, JWT auth, PostgreSQL, and OpenAPI documentation. All endpoints tested and passing.',
    agents: [
      { id: 'a-1', name: 'Planner', role: 'planner', status: 'completed', progress: 100, task: 'Decompose project into subtasks', result: 'Identified 6 major components: auth, users, posts, database, tests, docs', tools: ['decompose_task'], startTime: '2h ago', endTime: '1h 58m ago' },
      { id: 'a-2', name: 'Architect', role: 'coder', status: 'completed', progress: 100, task: 'Design database schema and API structure', result: 'Created ERD with 5 tables, designed 12 REST endpoints', tools: ['design_schema', 'create_api'], startTime: '1h 58m ago', endTime: '1h 55m ago' },
      { id: 'a-3', name: 'Backend Dev', role: 'coder', status: 'completed', progress: 100, task: 'Implement authentication and middleware', result: 'JWT auth, bcrypt hashing, role-based access control implemented', tools: ['run_code', 'write_file'], startTime: '1h 55m ago', endTime: '1h 50m ago' },
      { id: 'a-4', name: 'API Dev', role: 'coder', status: 'completed', progress: 100, task: 'Implement CRUD endpoints', result: 'All 12 endpoints implemented with validation and error handling', tools: ['run_code', 'write_file'], startTime: '1h 50m ago', endTime: '1h 45m ago' },
      { id: 'a-5', name: 'Tester', role: 'tester', status: 'completed', progress: 100, task: 'Write tests and run validation', result: '42 tests written, 100% pass rate, 87% code coverage', tools: ['run_tests', 'lint_code'], startTime: '1h 45m ago', endTime: '1h 40m ago' },
      { id: 'a-6', name: 'Writer', role: 'writer', status: 'completed', progress: 100, task: 'Generate documentation', result: 'README, API docs, and deployment guide written', tools: ['write_file'], startTime: '1h 40m ago', endTime: '1h 35m ago' },
    ],
  },
  {
    id: 'swarm-2',
    title: 'Research and summarize AI papers',
    description: 'Find 10 recent papers on multimodal agents, summarize key findings, and create a comparison table',
    status: 'running',
    createdAt: '15 minutes ago',
    aggregatedResult: '',
    agents: [
      { id: 'a-7', name: 'Researcher A', role: 'researcher', status: 'completed', progress: 100, task: 'Search and collect papers on arXiv', result: 'Found 12 relevant papers, downloaded PDFs', tools: ['web_search', 'download_pdf'], startTime: '15m ago', endTime: '12m ago' },
      { id: 'a-8', name: 'Researcher B', role: 'researcher', status: 'running', progress: 65, task: 'Search and collect papers from Google Scholar', result: 'Found 8 papers, analyzing 5 of them', tools: ['web_search', 'read_pdf'], startTime: '12m ago' },
      { id: 'a-9', name: 'Analyzer', role: 'planner', status: 'running', progress: 30, task: 'Extract key findings and methodologies', result: 'Processing paper 3 of 8...', tools: ['read_pdf', 'extract_data'], startTime: '8m ago' },
      { id: 'a-10', name: 'Writer', role: 'writer', status: 'idle', progress: 0, task: 'Create comparison table and summary', result: '', tools: ['write_file'] },
    ],
  },
  {
    id: 'swarm-3',
    title: 'Fix TypeScript errors across codebase',
    description: 'Identify and fix all TypeScript errors, update types, and ensure type safety',
    status: 'failed',
    createdAt: '1 day ago',
    completedAt: '1 day ago',
    aggregatedResult: 'Partially completed. Fixed 287 errors, but 45 errors remain in legacy modules. Need manual review.',
    agents: [
      { id: 'a-11', name: 'Scanner', role: 'planner', status: 'completed', progress: 100, task: 'Scan codebase for all TypeScript errors', result: 'Found 332 errors across 45 files', tools: ['run_command', 'grep_search'], startTime: '1d ago', endTime: '23h 59m ago' },
      { id: 'a-12', name: 'Fixer A', role: 'coder', status: 'completed', progress: 100, task: 'Fix errors in features/ and core/', result: 'Fixed 156 errors in 23 files', tools: ['edit_file', 'run_command'], startTime: '23h 59m ago', endTime: '23h 30m ago' },
      { id: 'a-13', name: 'Fixer B', role: 'coder', status: 'failed', progress: 60, task: 'Fix errors in legacy/ and utils/', result: 'Failed to fix 45 errors in legacy modules. Complex circular dependencies.', tools: ['edit_file'], startTime: '23h 30m ago', endTime: '23h ago' },
      { id: 'a-14', name: 'Reviewer', role: 'reviewer', status: 'completed', progress: 100, task: 'Review fixes and run type check', result: 'Verified 287 fixes. Type check passes on fixed files.', tools: ['run_command'], startTime: '23h ago', endTime: '22h 55m ago' },
    ],
  },
];

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  planner: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  researcher: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  coder: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  reviewer: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  writer: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  tester: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
};

const STATUS_ICONS = {
  idle: Clock,
  running: Play,
  completed: CheckCircle,
  failed: AlertCircle,
};

export default function SwarmView() {
  const [swarms, setSwarms] = useState<SwarmTask[]>(DEMO_SWARMS);
  const [activeSwarm, setActiveSwarm] = useState<SwarmTask | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [agentCount, setAgentCount] = useState(3);

  const apiKeys = useNyxStore((state) => state.apiKeys);
  const currentModelId = useNyxStore((state) => state.models?.nyx) || 'gemini-3.5-flash';

  const getProviderForModel = (modelId: string) => {
    if (modelId.includes('gemini') || modelId.includes('gemma')) return 'gemini';
    if (modelId.includes('claude')) return 'anthropic';
    if (modelId.includes('gpt')) return 'openai';
    return 'gemini';
  };

  const startSwarm = async (swarm: SwarmTask) => {
    if (swarm.status === 'running') return;
    
    setSwarms((prev) =>
      prev.map((s) => (s.id === swarm.id ? { ...s, status: 'running' as const } : s))
    );
    
    // Also update activeSwarm ref
    setActiveSwarm((prev) => prev?.id === swarm.id ? { ...prev, status: 'running' as const } : prev);
    
    if (!isTauriEnv || !invoke || !listen) {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        setSwarms((prev) =>
          prev.map((s) => {
            if (s.id !== swarm.id) return s;
            const updatedAgents = s.agents.map((a, idx) => {
              const agentProgress = Math.min(100, Math.max(0, (progress * s.agents.length) - (idx * 100)));
              const status = agentProgress === 100 ? 'completed' as const : agentProgress > 0 ? 'running' as const : 'idle' as const;
              return {
                ...a,
                status,
                progress: agentProgress,
                result: agentProgress === 100 ? `Completed step: ${a.task}` : a.result
              };
            });
            const status = progress >= 100 ? 'completed' as const : 'running' as const;
            
            const updatedSwarm = {
              ...s,
              status,
              agents: updatedAgents,
              aggregatedResult: progress >= 100 ? "Successfully executed all tasks in browser mock mode." : ""
            };
            
            if (activeSwarm?.id === s.id) {
              setActiveSwarm(updatedSwarm);
            }
            return updatedSwarm;
          })
        );
        if (progress >= 100) clearInterval(interval);
      }, 1000);
      return;
    }

    const eventName = `swarm_stream_${swarm.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const provider = getProviderForModel(currentModelId);
    const apiKey = apiKeys[provider] || '';

    try {
      const unlisten = await listen(eventName, (event: any) => {
        const payload = event.payload;

        if (payload.type === 'swarm_decomposition') {
          setSwarms((prev) =>
            prev.map((s) => {
              if (s.id !== swarm.id) return s;
              const updatedSwarm = {
                ...s,
                agents: payload.agents.map((a: any) => ({
                  ...a,
                  status: 'idle',
                  progress: 0,
                  result: ''
                }))
              };
              if (activeSwarm?.id === s.id) {
                setActiveSwarm(updatedSwarm);
              }
              return updatedSwarm;
            })
          );
        } else if (payload.type === 'swarm_agent_update') {
          setSwarms((prev) =>
            prev.map((s) => {
              if (s.id !== swarm.id) return s;
              const updatedSwarm = {
                ...s,
                agents: s.agents.map((a) => {
                  if (a.id === payload.agent_id) {
                    return {
                      ...a,
                      status: payload.status,
                      progress: payload.progress,
                      task: payload.task || a.task,
                      result: payload.result || a.result
                    };
                  }
                  return a;
                })
              };
              if (activeSwarm?.id === s.id) {
                setActiveSwarm(updatedSwarm);
              }
              return updatedSwarm;
            })
          );
        } else if (payload.type === 'swarm_aggregated_result') {
          setSwarms((prev) =>
            prev.map((s) => {
              if (s.id !== swarm.id) return s;
              const updatedSwarm = {
                ...s,
                status: 'completed' as const,
                aggregatedResult: payload.result
              };
              if (activeSwarm?.id === s.id) {
                setActiveSwarm(updatedSwarm);
              }
              return updatedSwarm;
            })
          );
        } else if (payload.type === 'error') {
          setSwarms((prev) =>
            prev.map((s) => {
              const updatedSwarm = { ...s, status: 'failed' as const };
              if (activeSwarm?.id === s.id) {
                setActiveSwarm(updatedSwarm);
              }
              return updatedSwarm;
            })
          );
        }
      });

      await invoke('orchestrate_supervisor', {
        messages: [{ role: 'user', content: `${swarm.title}\nDescription: ${swarm.description}` }],
        context: {
          request_id: `swarm_req_${Date.now()}`,
          session_id: `swarm_session_${swarm.id}`,
          provider,
          model: currentModelId,
          api_key: apiKey,
          max_iterations: 10,
          system_instruction: "You are the Agent Swarm Supervisor.",
          agent_type: 'swarm',
        },
        event_name: eventName,
      });

      unlisten();
    } catch (err: any) {
      console.error('Swarm execution failed:', err);
      setSwarms((prev) =>
        prev.map((s) => {
          const updatedSwarm = { ...s, status: 'failed' as const };
          if (activeSwarm?.id === s.id) {
            setActiveSwarm(updatedSwarm);
          }
          return updatedSwarm;
        })
      );
    }
  };


  const createSwarm = () => {
    if (!newTaskTitle.trim()) return;
    const newSwarm: SwarmTask = {
      id: `swarm-${Date.now()}`,
      title: newTaskTitle,
      description: newTaskDesc,
      status: 'pending',
      createdAt: 'Just now',
      aggregatedResult: '',
      agents: Array.from({ length: agentCount }, (_, i) => ({
        id: `agent-${Date.now()}-${i}`,
        name: ['Planner', 'Researcher', 'Coder', 'Reviewer', 'Writer'][i] || `Agent ${i + 1}`,
        role: ['planner', 'researcher', 'coder', 'reviewer', 'writer'][i] as any,
        status: 'idle',
        progress: 0,
        task: 'Waiting for task assignment...',
        result: '',
        tools: ['decompose_task', 'web_search', 'write_file'],
      })),
    };
    setSwarms((prev) => [newSwarm, ...prev]);
    setNewTaskTitle('');
    setNewTaskDesc('');
    setIsCreating(false);
    setActiveSwarm(newSwarm);
  };

  const SwarmCard = ({ swarm }: { swarm: SwarmTask }) => {
    const statusColor = {
      pending: 'text-muted-foreground',
      running: 'text-primary',
      completed: 'text-green-500',
      failed: 'text-red-500',
    }[swarm.status];

    const runningAgents = swarm.agents.filter((a) => a.status === 'running').length;
    const completedAgents = swarm.agents.filter((a) => a.status === 'completed').length;
    const totalProgress = swarm.agents.reduce((acc, a) => acc + a.progress, 0) / swarm.agents.length;

    return (
      <motion.div
        layout
        onClick={() => setActiveSwarm(swarm)}
        className={`p-4 bg-card border rounded-xl cursor-pointer transition-all ${
          activeSwarm?.id === swarm.id ? 'border-primary/30' : 'border-border hover:border-primary/20'
        }`}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users size={16} className={statusColor} />
            <h3 className="text-sm font-medium text-foreground">{swarm.title}</h3>
          </div>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${statusColor} bg-opacity-10`}>
            {swarm.status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{swarm.description}</p>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                swarm.status === 'completed' ? 'bg-green-500' : swarm.status === 'failed' ? 'bg-red-500' : 'bg-primary'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${totalProgress}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{Math.round(totalProgress)}%</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users size={9} /> {swarm.agents.length} agents
          </span>
          {runningAgents > 0 && (
            <span className="flex items-center gap-1 text-primary">
              <Zap size={9} /> {runningAgents} running
            </span>
          )}
          <span>{swarm.createdAt}</span>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Users size={18} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Agent Swarm</h1>
              <p className="text-xs text-muted-foreground">
                {swarms.length} tasks · {swarms.reduce((acc, s) => acc + s.agents.length, 0)} agents total
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-all"
          >
            <Plus size={14} /> New Swarm Task
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Swarm List */}
        <div className="w-80 border-r border-border overflow-y-auto p-4 space-y-3">
          {swarms.map((swarm) => (
            <SwarmCard key={swarm.id} swarm={swarm} />
          ))}
        </div>

        {/* Active Swarm Detail */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeSwarm ? (
            <>
              <div className="shrink-0 px-6 py-4 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <Users size={16} className="text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">{activeSwarm.title}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeSwarm.status === 'running' && (
                      <button className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
                        <Pause size={14} />
                      </button>
                    )}
                    {activeSwarm.status === 'pending' && (
                      <button className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-all">
                        <Play size={12} /> Start
                      </button>
                    )}
                    <button className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
                      <RotateCcw size={14} />
                    </button>
                    <button className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{activeSwarm.description}</p>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {/* Execution Graph */}
                <div className="mb-6">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Execution Graph</h3>
                  <div className="grid grid-cols-1 gap-3">
                    {activeSwarm.agents.map((agent, index) => {
                      const colors = ROLE_COLORS[agent.role] || ROLE_COLORS.planner;
                      const StatusIcon = STATUS_ICONS[agent.status];
                      return (
                        <motion.div
                          key={agent.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className={`flex items-center gap-4 p-4 bg-card border rounded-xl ${colors.border}`}
                        >
                          <div className={`w-10 h-10 rounded-lg ${colors.bg} flex items-center justify-center ${colors.text}`}>
                            <StatusIcon size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-foreground">{agent.name}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors.bg} ${colors.text}`}>
                                {agent.role}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {agent.startTime && `${agent.startTime} → ${agent.endTime || 'now'}`}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{agent.task}</p>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <motion.div
                                  className={`h-full rounded-full ${
                                    agent.status === 'completed' ? 'bg-green-500' : agent.status === 'failed' ? 'bg-red-500' : 'bg-primary'
                                  }`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${agent.progress}%` }}
                                  transition={{ duration: 0.5 }}
                                />
                              </div>
                              <span className="text-[10px] text-muted-foreground w-8">{agent.progress}%</span>
                            </div>
                            {agent.result && (
                              <p className="text-[11px] text-foreground mt-2 bg-muted/50 p-2 rounded-lg">{agent.result}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {agent.tools.map((tool) => (
                              <span key={tool} className="px-1.5 py-0.5 rounded bg-muted text-[9px] text-muted-foreground">
                                {tool}
                              </span>
                            ))}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                {/* Aggregated Result */}
                {activeSwarm.aggregatedResult && (
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                    <h3 className="text-xs font-medium text-primary uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Sparkles size={12} /> Aggregated Result
                    </h3>
                    <p className="text-sm text-foreground leading-relaxed">{activeSwarm.aggregatedResult}</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Users size={48} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Select a swarm task</p>
                <p className="text-xs mt-1 opacity-60">Create a task to spawn multiple agents working in parallel</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            onClick={() => setIsCreating(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[520px] bg-card border border-border rounded-xl p-6 shadow-xl"
            >
              <h2 className="text-lg font-semibold text-foreground mb-4">Create Agent Swarm</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Task Title</label>
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="e.g., Build a complete API backend"
                    className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
                  <textarea
                    value={newTaskDesc}
                    onChange={(e) => setNewTaskDesc(e.target.value)}
                    placeholder="Describe what the swarm should accomplish..."
                    className="w-full h-20 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Number of Agents</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={2}
                      max={8}
                      value={agentCount}
                      onChange={(e) => setAgentCount(Number(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium text-foreground w-6">{agentCount}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Recommended: 3-5 agents for most tasks</p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setIsCreating(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createSwarm}
                    disabled={!newTaskTitle.trim()}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Create Swarm
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
