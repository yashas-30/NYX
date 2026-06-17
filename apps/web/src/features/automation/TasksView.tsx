import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Clock, Play, Pause, Trash2, Plus, CheckCircle, AlertCircle, Clock3, Repeat, ArrowRight, Zap, Settings, FileText, ChevronRight, Edit3
} from 'lucide-react';

interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  schedule: string;
  cron: string;
  nextRun: string;
  lastRun: string | null;
  status: 'active' | 'paused' | 'running' | 'failed' | 'completed';
  type: 'report' | 'scan' | 'backup' | 'sync' | 'custom';
  lastResult: string | null;
  history: TaskRun[];
}

interface TaskRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: 'success' | 'failed' | 'running';
  output: string;
  duration: string;
}

const DEMO_TASKS: ScheduledTask[] = [
  {
    id: 'task-1',
    name: 'Morning Briefing',
    description: 'Generate a daily summary of emails, calendar, and news',
    schedule: 'Daily at 8:00 AM',
    cron: '0 8 * * *',
    nextRun: 'Tomorrow at 8:00 AM',
    lastRun: 'Today at 8:00 AM',
    status: 'active',
    type: 'report',
    lastResult: 'Generated 3-page briefing covering 12 emails, 4 meetings, and 8 news items.',
    history: [
      { id: 'run-1', startedAt: '2025-06-17 08:00:00', completedAt: '2025-06-17 08:00:45', status: 'success', output: 'Briefing generated successfully', duration: '45s' },
      { id: 'run-2', startedAt: '2025-06-16 08:00:00', completedAt: '2025-06-16 08:01:12', status: 'success', output: 'Briefing generated successfully', duration: '1m 12s' },
    ],
  },
  {
    id: 'task-2',
    name: 'Code Health Check',
    description: 'Run linting, type checking, and security scan on codebase',
    schedule: 'Every 4 hours',
    cron: '0 */4 * * *',
    nextRun: 'In 2 hours',
    lastRun: '2 hours ago',
    status: 'active',
    type: 'scan',
    lastResult: '0 errors, 3 warnings, 0 security issues. All checks passed.',
    history: [
      { id: 'run-3', startedAt: '2025-06-17 12:00:00', completedAt: '2025-06-17 12:00:30', status: 'success', output: 'All checks passed', duration: '30s' },
      { id: 'run-4', startedAt: '2025-06-17 08:00:00', completedAt: '2025-06-17 08:00:28', status: 'success', output: 'All checks passed', duration: '28s' },
      { id: 'run-5', startedAt: '2025-06-17 04:00:00', completedAt: '2025-06-17 04:00:35', status: 'success', output: '3 warnings found', duration: '35s' },
    ],
  },
  {
    id: 'task-3',
    name: 'Project Backup',
    description: 'Backup all project files and databases to cloud storage',
    schedule: 'Daily at 2:00 AM',
    cron: '0 2 * * *',
    nextRun: 'Tomorrow at 2:00 AM',
    lastRun: 'Today at 2:00 AM',
    status: 'active',
    type: 'backup',
    lastResult: 'Backed up 1.2 GB to S3. 24 files, 1 database snapshot.',
    history: [
      { id: 'run-6', startedAt: '2025-06-17 02:00:00', completedAt: '2025-06-17 02:03:45', status: 'success', output: 'Backup completed', duration: '3m 45s' },
    ],
  },
  {
    id: 'task-4',
    name: 'Weekly Research Digest',
    description: 'Compile and summarize AI research papers from arXiv and papers-with-code',
    schedule: 'Every Monday at 9:00 AM',
    cron: '0 9 * * 1',
    nextRun: 'Monday at 9:00 AM',
    lastRun: 'Last Monday at 9:00 AM',
    status: 'paused',
    type: 'report',
    lastResult: 'Compiled 23 papers into 8-page digest. Highlighted 3 breakthrough findings.',
    history: [
      { id: 'run-7', startedAt: '2025-06-16 09:00:00', completedAt: '2025-06-16 09:05:22', status: 'success', output: 'Digest generated', duration: '5m 22s' },
    ],
  },
  {
    id: 'task-5',
    name: 'Git Sync Check',
    description: 'Check if local repositories are in sync with remotes',
    schedule: 'Every 30 minutes',
    cron: '*/30 * * * *',
    nextRun: 'In 15 minutes',
    lastRun: '15 minutes ago',
    status: 'failed',
    type: 'sync',
    lastResult: 'Error: Authentication failed for 2 repositories. Token expired.',
    history: [
      { id: 'run-8', startedAt: '2025-06-17 13:30:00', completedAt: '2025-06-17 13:30:05', status: 'failed', output: 'Authentication failed', duration: '5s' },
      { id: 'run-9', startedAt: '2025-06-17 13:00:00', completedAt: '2025-06-17 13:00:04', status: 'failed', output: 'Authentication failed', duration: '4s' },
    ],
  },
];

const TYPE_ICONS: Record<string, typeof Calendar> = {
  report: FileText,
  scan: Zap,
  backup: Clock,
  sync: ArrowRight,
  custom: Settings,
};

const TYPE_COLORS: Record<string, string> = {
  report: 'bg-blue-500/10 text-blue-400',
  scan: 'bg-amber-500/10 text-amber-400',
  backup: 'bg-green-500/10 text-green-400',
  sync: 'bg-purple-500/10 text-purple-400',
  custom: 'bg-muted text-muted-foreground',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: 'bg-green-500/10', text: 'text-green-400' },
  paused: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  running: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  failed: { bg: 'bg-red-500/10', text: 'text-red-400' },
  completed: { bg: 'bg-green-500/10', text: 'text-green-400' },
};

export default function TasksView() {
  const [tasks, setTasks] = useState<ScheduledTask[]>(DEMO_TASKS);
  const [selectedTask, setSelectedTask] = useState<ScheduledTask | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskCron, setNewTaskCron] = useState('0 9 * * *');
  const [newTaskType, setNewTaskType] = useState<ScheduledTask['type']>('report');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRunning, setIsRunning] = useState<string | null>(null);

  const toggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: t.status === 'active' ? 'paused' : 'active' } : t
      )
    );
  };

  const runTaskNow = (taskId: string) => {
    setIsRunning(taskId);
    setTimeout(() => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id === taskId) {
            return {
              ...t,
              status: 'active',
              lastRun: 'Just now',
              lastResult: 'Task completed successfully. Generated output in 2.3s.',
              history: [
                { id: `run-${Date.now()}`, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), status: 'success' as const, output: 'Task executed successfully', duration: '2.3s' },
                ...t.history,
              ].slice(0, 10),
            };
          }
          return t;
        })
      );
      setIsRunning(null);
    }, 2000);
  };

  const deleteTask = (taskId: string) => {
    if (!confirm('Delete this scheduled task?')) return;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    if (selectedTask?.id === taskId) setSelectedTask(null);
  };

  const createTask = () => {
    if (!newTaskName.trim()) return;
    const newTask: ScheduledTask = {
      id: `task-${Date.now()}`,
      name: newTaskName,
      description: newTaskDesc,
      schedule: 'Custom schedule',
      cron: newTaskCron,
      nextRun: 'Pending',
      lastRun: null,
      status: 'active',
      type: newTaskType,
      lastResult: null,
      history: [],
    };
    setTasks((prev) => [...prev, newTask]);
    setNewTaskName('');
    setNewTaskDesc('');
    setIsCreating(false);
  };

  const filteredTasks = tasks.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const CronBuilder = () => {
    const [minute, hour, day, month, weekday] = newTaskCron.split(' ');
    const presets = [
      { label: 'Every minute', value: '* * * * *' },
      { label: 'Every 15 minutes', value: '*/15 * * * *' },
      { label: 'Every hour', value: '0 * * * *' },
      { label: 'Every 4 hours', value: '0 */4 * * *' },
      { label: 'Daily at 8 AM', value: '0 8 * * *' },
      { label: 'Daily at 2 AM', value: '0 2 * * *' },
      { label: 'Weekly (Mon 9 AM)', value: '0 9 * * 1' },
      { label: 'Monthly (1st, 9 AM)', value: '0 9 1 * *' },
    ];
    return (
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Schedule Presets</label>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setNewTaskCron(preset.value)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                  newTaskCron === preset.value ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cron Expression</label>
          <input
            type="text"
            value={newTaskCron}
            onChange={(e) => setNewTaskCron(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm font-mono text-foreground focus:outline-none focus:border-primary/50"
          />
          <p className="text-[10px] text-muted-foreground mt-1">{minute} {hour} {day} {month} {weekday} (min hour day month weekday)</p>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Calendar size={18} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Scheduled Tasks</h1>
              <p className="text-xs text-muted-foreground">
                {tasks.filter((t) => t.status === 'active').length} active · {tasks.length} total
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-all"
          >
            <Plus size={14} /> New Task
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Task List */}
        <div className="w-80 border-r border-border flex flex-col">
          <div className="shrink-0 p-3 border-b border-border">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredTasks.map((task) => {
              const TypeIcon = TYPE_ICONS[task.type] || Settings;
              const statusStyle = STATUS_COLORS[task.status] || STATUS_COLORS.active;
              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={`p-3 rounded-lg cursor-pointer transition-all border ${
                    selectedTask?.id === task.id ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`w-8 h-8 rounded-lg ${TYPE_COLORS[task.type]} flex items-center justify-center flex-shrink-0`}>
                      <TypeIcon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-medium text-foreground truncate">{task.name}</h3>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                          {task.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock size={9} /> {task.schedule}
                        </span>
                        <span>·</span>
                        <span>{task.nextRun}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail Panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedTask ? (
            <div className="max-w-3xl space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${TYPE_COLORS[selectedTask.type]} flex items-center justify-center`}>
                    {(TYPE_ICONS[selectedTask.type] || Settings)({ size: 18 })}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{selectedTask.name}</h2>
                    <p className="text-xs text-muted-foreground">{selectedTask.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => runTaskNow(selectedTask.id)}
                    disabled={isRunning === selectedTask.id}
                    className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-all disabled:opacity-50"
                  >
                    {isRunning === selectedTask.id ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full"
                      />
                    ) : (
                      <Play size={12} />
                    )}
                    {isRunning === selectedTask.id ? 'Running...' : 'Run Now'}
                  </button>
                  <button
                    onClick={() => toggleTask(selectedTask.id)}
                    className={`p-2 rounded-lg transition-all ${
                      selectedTask.status === 'active'
                        ? 'hover:bg-amber-500/10 text-muted-foreground hover:text-amber-500'
                        : 'hover:bg-green-500/10 text-muted-foreground hover:text-green-500'
                    }`}
                  >
                    {selectedTask.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button
                    onClick={() => deleteTask(selectedTask.id)}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Schedule Info */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 bg-card border border-border rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock3 size={12} className="text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Schedule</span>
                  </div>
                  <p className="text-sm font-medium text-foreground">{selectedTask.schedule}</p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-1">{selectedTask.cron}</p>
                </div>
                <div className="p-4 bg-card border border-border rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowRight size={12} className="text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Next Run</span>
                  </div>
                  <p className="text-sm font-medium text-foreground">{selectedTask.nextRun}</p>
                </div>
                <div className="p-4 bg-card border border-border rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle size={12} className="text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Run</span>
                  </div>
                  <p className="text-sm font-medium text-foreground">{selectedTask.lastRun || 'Never'}</p>
                </div>
              </div>

              {/* Last Result */}
              {selectedTask.lastResult && (
                <div className="p-4 bg-card border border-border rounded-xl">
                  <h3 className="text-xs font-medium text-foreground mb-2 flex items-center gap-2">
                    <FileText size={12} /> Last Result
                  </h3>
                  <p className="text-sm text-foreground">{selectedTask.lastResult}</p>
                </div>
              )}

              {/* History */}
              <div>
                <h3 className="text-xs font-medium text-foreground mb-3 flex items-center gap-2">
                  <Calendar size={12} /> Run History ({selectedTask.history.length} runs)
                </h3>
                <div className="space-y-2">
                  {selectedTask.history.map((run) => (
                    <div key={run.id} className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                        run.status === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                      }`}>
                        {run.status === 'success' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground">{run.output}</p>
                        <p className="text-[10px] text-muted-foreground">{run.startedAt}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{run.duration}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Calendar size={48} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Select a task</p>
                <p className="text-xs mt-1 opacity-60">Manage scheduled tasks and view execution history</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Task Modal */}
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
              className="w-[520px] bg-card border border-border rounded-xl p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-lg font-semibold text-foreground mb-4">Create Scheduled Task</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Task Name</label>
                  <input
                    type="text"
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                    placeholder="e.g., Daily Report"
                    className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
                  <textarea
                    value={newTaskDesc}
                    onChange={(e) => setNewTaskDesc(e.target.value)}
                    placeholder="What should this task do?"
                    className="w-full h-16 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Task Type</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(['report', 'scan', 'backup', 'sync', 'custom'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setNewTaskType(type)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-medium capitalize transition-all ${
                          newTaskType === type ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                <CronBuilder />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setIsCreating(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createTask}
                    disabled={!newTaskName.trim()}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Create Task
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
