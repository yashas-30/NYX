import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface HermesTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  progress: number;
  createdAt: string;
  completedAt?: string;
  logs: string[];
}

export interface HermesCron {
  id: string;
  name: string;
  description: string;
  cronExpression: string; // e.g. "*/15 * * * *" or preset
  isActive: boolean;
  lastRun?: string;
  nextRun?: string;
  prompt: string;
}

export interface MemoryEntity {
  id: string;
  name: string;
  type: string;
  description: string;
}

export interface MemoryRelation {
  id: string;
  source: string; // Entity ID or Name
  target: string; // Entity ID or Name
  relationType: string; // e.g. "developer_of", "built_with"
}

export interface MemoryObservation {
  id: string;
  entityId: string;
  fact: string;
  createdAt: string;
}

export interface HermesState {
  tasks: HermesTask[];
  crons: HermesCron[];
  entities: MemoryEntity[];
  relations: MemoryRelation[];
  observations: MemoryObservation[];
  diagnostics: {
    os: string;
    cpu: string;
    memory: string;
    sandboxStatus: 'secure' | 'isolated' | 'local';
    activeMcpServers: string[];
    lastCheck: string;
  };

  // Task Actions
  addTask: (title: string, description: string) => string;
  updateTask: (id: string, updates: Partial<HermesTask>) => void;
  appendTaskLog: (id: string, log: string) => void;
  deleteTask: (id: string) => void;
  clearTasks: () => void;

  // Cron Actions
  addCron: (name: string, description: string, cronExpression: string, prompt: string) => string;
  updateCron: (id: string, updates: Partial<HermesCron>) => void;
  deleteCron: (id: string) => void;

  // Memory Graph Actions
  addEntity: (name: string, type: string, description: string) => string;
  deleteEntity: (id: string) => void;
  addRelation: (source: string, target: string, relationType: string) => string;
  deleteRelation: (id: string) => void;
  addObservation: (entityId: string, fact: string) => string;
  deleteObservation: (id: string) => void;

  // Diagnostics Actions
  runDiagnostics: () => void;
}

const DEFAULT_ENTITIES: MemoryEntity[] = [
  { id: 'ent-1', name: 'Yashas', type: 'Person', description: 'Primary developer and operator of NYX platform.' },
  { id: 'ent-2', name: 'NYX', type: 'Application', description: 'Universal AI desktop client and agent environment.' },
  { id: 'ent-3', name: 'Tauri', type: 'Framework', description: 'Rust-based webview application builder.' },
];

const DEFAULT_RELATIONS: MemoryRelation[] = [
  { id: 'rel-1', source: 'Yashas', target: 'NYX', relationType: 'developer_of' },
  { id: 'rel-2', source: 'NYX', target: 'Tauri', relationType: 'built_with' },
];

const DEFAULT_OBSERVATIONS: MemoryObservation[] = [
  { id: 'obs-1', entityId: 'ent-1', fact: 'Yashas prefers dark mode layouts and StyreneB typography.', createdAt: new Date(Date.now() - 3600000 * 24).toISOString() },
  { id: 'obs-2', entityId: 'ent-2', fact: 'NYX utilizes Fastify on the Node.js backend for high throughput SSE.', createdAt: new Date(Date.now() - 3600000 * 2).toISOString() },
];

const DEFAULT_CRONS: HermesCron[] = [
  {
    id: 'cron-1',
    name: 'Morning Briefing',
    description: 'Summarize news, emails, and upcoming calendar items.',
    cronExpression: '0 9 * * 1-5',
    isActive: true,
    prompt: 'Summarize today\'s project context, files modified in the last 24 hours, and compile a quick standup briefing.',
    nextRun: 'Tomorrow at 9:00 AM',
  },
  {
    id: 'cron-2',
    name: 'Code Lint & Checkup',
    description: 'Check codebase health, formatting, and errors recursively.',
    cronExpression: '0 */4 * * *',
    isActive: false,
    prompt: 'Run full type-check and lint commands on the workspace. Report any new warnings or errors.',
    nextRun: 'Paused',
  }
];

const DEFAULT_TASKS: HermesTask[] = [
  {
    id: 'task-mock-1',
    title: 'Autonomous PR Check & CI Audit',
    description: 'Monitor open PR branches, pull updates locally, execute sandboxed tests, and publish CI checklist.',
    status: 'completed',
    progress: 100,
    createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    completedAt: new Date(Date.now() - 3600000 * 2.8).toISOString(),
    logs: [
      '[Hermes Gateway] Triggered by cron job: Code Health Check',
      '[Hermes Task Planner] Decomposing task into subtasks...',
      '[1/3] Fetching latest commits from git remote...',
      '[Tool Execution] git fetch origin',
      '[Observation] Successfully fetched 2 remote branches: feat/canvas, patch/stream',
      '[2/3] Running vitest suite in secure workspace sandbox...',
      '[Tool Execution] npm run test',
      '[Observation] Test result: 42 tests passed, 0 failed. Exit code 0.',
      '[3/3] Committing test verification to long-term memory...',
      '[Tool Execution] manage_hermes_memory (add_observation)',
      '[Observation] Observation added successfully for entity: NYX',
      '[Hermes Gateway] Task completed successfully in 12.3s.'
    ]
  }
];

export const useHermesStore = create<HermesState>()(
  persist(
    (set, get) => ({
      tasks: DEFAULT_TASKS,
      crons: DEFAULT_CRONS,
      entities: DEFAULT_ENTITIES,
      relations: DEFAULT_RELATIONS,
      observations: DEFAULT_OBSERVATIONS,
      diagnostics: {
        os: 'Windows 11 (x64)',
        cpu: 'Intel Core i9 / AMD Ryzen 9',
        memory: '32 GB DDR5',
        sandboxStatus: 'secure',
        activeMcpServers: ['memory-mcp', 'scheduled-tasks', 'browser-use'],
        lastCheck: new Date().toLocaleTimeString(),
      },

      addTask: (title, description) => {
        const id = `task-${Date.now()}`;
        const newTask: HermesTask = {
          id,
          title,
          description,
          status: 'pending',
          progress: 0,
          createdAt: new Date().toISOString(),
          logs: [`[Hermes Gateway] Task queued: "${title}"`],
        };
        set((state) => ({ tasks: [newTask, ...state.tasks] }));
        return id;
      },

      updateTask: (id, updates) => {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        }));
      },

      appendTaskLog: (id, log) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, logs: [...t.logs, log] } : t
          ),
        }));
      },

      deleteTask: (id) => {
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
      },

      clearTasks: () => {
        set({ tasks: [] });
      },

      addCron: (name, description, cronExpression, prompt) => {
        const id = `cron-${Date.now()}`;
        const newCron: HermesCron = {
          id,
          name,
          description,
          cronExpression,
          isActive: true,
          prompt,
          nextRun: 'Calculated at schedule interval',
        };
        set((state) => ({ crons: [...state.crons, newCron] }));
        return id;
      },

      updateCron: (id, updates) => {
        set((state) => ({
          crons: state.crons.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        }));
      },

      deleteCron: (id) => {
        set((state) => ({ crons: state.crons.filter((c) => c.id !== id) }));
      },

      addEntity: (name, type, description) => {
        const id = `ent-${Date.now()}`;
        const newEntity: MemoryEntity = { id, name, type, description };
        set((state) => ({ entities: [...state.entities, newEntity] }));
        return id;
      },

      deleteEntity: (id) => {
        // Cascades delete relations & observations
        set((state) => ({
          entities: state.entities.filter((e) => e.id !== id),
          relations: state.relations.filter((r) => r.source !== id && r.target !== id),
          observations: state.observations.filter((o) => o.entityId !== id),
        }));
      },

      addRelation: (source, target, relationType) => {
        const id = `rel-${Date.now()}`;
        const newRelation: MemoryRelation = { id, source, target, relationType };
        set((state) => ({ relations: [...state.relations, newRelation] }));
        return id;
      },

      deleteRelation: (id) => {
        set((state) => ({ relations: state.relations.filter((r) => r.id !== id) }));
      },

      addObservation: (entityId, fact) => {
        const id = `obs-${Date.now()}`;
        const newObs: MemoryObservation = { id, entityId, fact, createdAt: new Date().toISOString() };
        set((state) => ({ observations: [...state.observations, newObs] }));
        return id;
      },

      deleteObservation: (id) => {
        set((state) => ({ observations: state.observations.filter((o) => o.id !== id) }));
      },

      runDiagnostics: () => {
        const isTauri = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
        set((state) => ({
          diagnostics: {
            os: isTauri ? 'Windows 11 (Tauri Container)' : 'Universal Web Host (Vite)',
            cpu: 'Multi-Core Virtual Engine',
            memory: 'Active Context Allocator (Heap)',
            sandboxStatus: isTauri ? 'isolated' : 'local',
            activeMcpServers: state.diagnostics.activeMcpServers,
            lastCheck: new Date().toLocaleTimeString(),
          },
        }));
      },
    }),
    {
      name: 'nyx-hermes-state',
      partialize: (state) => ({
        tasks: state.tasks,
        crons: state.crons,
        entities: state.entities,
        relations: state.relations,
        observations: state.observations,
      }),
    }
  )
);
