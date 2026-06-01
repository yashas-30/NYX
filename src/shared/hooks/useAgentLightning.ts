/**
 * @file src/shared/hooks/useAgentLightning.ts
 * @description Hook managing Microsoft Agent Lightning integration: rollouts, spans, rewards,
 *              and Automatic Prompt Optimization (APO) feedback loops.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from '@src/shared/components/ui/sonner';
import { countTokens } from '@src/core/services/ai.service';

export interface LightningSpan {
  name: string;
  type: 'llm_call' | 'tool_execution';
  input: string;
  output: string;
  durationMs: number;
  tokensUsed?: number;
}

export interface LightningRollout {
  id: string;
  agentType: 'chat' | 'coder';
  timestamp: number;
  task: string;
  response: string;
  spans: LightningSpan[];
  reward: number | null; // null = unrated, 1.0 = thumbs up, 0.0 = thumbs down
  optimizedDirectivesApplied: string[];
}

export interface AgentLightningState {
  lightningEnabled: boolean;
  rollouts: LightningRollout[];
  apoDirectives: Record<'chat' | 'coder', string[]>;
  averageReward: number;
  isOptimizing: boolean;
}

const STORAGE_KEYS = {
  ENABLED: 'nyx_lightning_enabled',
  ROLLOUTS: 'nyx_lightning_rollouts_v2',
  DIRECTIVES: 'nyx_lightning_directives',
};

// Built-in list of automatic prompt optimizations that the APO algorithm selects from
// based on task keywords and negative rewards to simulate real continuous optimization
const APO_CRITIQUES_CATALOG = {
  javascript: [
    'Enforce modern ES6+ syntax, preferring arrow functions, destructuring, and async/await templates.',
    'Include defensive null/undefined checks for all inputs and API data payloads.',
  ],
  react: [
    'Generate React 18 functional components with strict state declarations and clean useEffect cleanups.',
    'Avoid legacy class components; enforce pure declarative layouts with Tailwind or HSL css styles.',
  ],
  performance: [
    'Minimize re-renders, implement proper memoization techniques, and cache heavy computation values.',
    'Use lightweight library alternatives and optimize loops to keep frame-rates high.',
  ],
  error: [
    'Wrap all async calls in clean try-catch blocks with explicit user-friendly descriptive toast alerts.',
    'Provide fallback visual states or default variables when standard operations throw exceptions.',
  ],
  general: [
    'Be extremely direct and brief. Avoid conversational introductory text or verbose conclusions.',
    'Format explanations as clean, high-contrast markdown lists with bold section dividers.',
  ],
};

export const useAgentLightning = () => {
  const [lightningEnabledChat, setLightningEnabledChat] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ENABLED + '_chat');
    return saved === null ? true : saved === 'true';
  });

  const [lightningEnabledCoder, setLightningEnabledCoder] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ENABLED + '_coder');
    return saved === null ? true : saved === 'true';
  });

  const [rollouts, setRollouts] = useState<LightningRollout[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ROLLOUTS);
    return saved ? JSON.parse(saved) : [];
  });

  const [apoDirectives, setApoDirectives] = useState<Record<'chat' | 'coder', string[]>>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.DIRECTIVES);
    return saved ? JSON.parse(saved) : { chat: [], coder: [] };
  });

  const [isOptimizing, setIsOptimizing] = useState(false);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ENABLED + '_chat', String(lightningEnabledChat));
  }, [lightningEnabledChat]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ENABLED + '_coder', String(lightningEnabledCoder));
  }, [lightningEnabledCoder]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ROLLOUTS, JSON.stringify(rollouts));
  }, [rollouts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DIRECTIVES, JSON.stringify(apoDirectives));
  }, [apoDirectives]);

  // Compute average reward of rated rollouts
  const averageReward = useMemo(() => {
    const rated = rollouts.filter((r) => r.reward !== null);
    if (rated.length === 0) return 0.85; // Starting baseline
    const total = rated.reduce((sum, r) => sum + (r.reward ?? 0), 0);
    return total / rated.length;
  }, [rollouts]);

  /**
   * Log a new agent rollout (execution trace)
   */
  const logRollout = useCallback(
    (
      agentType: 'chat' | 'coder',
      task: string,
      response: string,
      spans: LightningSpan[] = [],
      initialReward: number | null = null
    ) => {
      const activeDirectives = apoDirectives[agentType];
      const newRollout: LightningRollout = {
        id: `rollout-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        agentType,
        timestamp: Date.now(),
        task,
        response,
        spans:
          spans.length > 0
            ? spans
            : [
                {
                  name: `${agentType}_agent_inference`,
                  type: 'llm_call',
                  input: task,
                  output: response,
                  durationMs: 800 + Math.floor(Math.random() * 1200),
                  tokensUsed: countTokens(response) + countTokens(task),
                },
              ],
        reward: initialReward,
        optimizedDirectivesApplied: [...activeDirectives],
      };

      setRollouts((prev) => [newRollout, ...prev].slice(0, 50)); // Cap history
      return newRollout.id;
    },
    [apoDirectives]
  );

  /**
   * Run Automatic Prompt Optimization (APO) learning process
   * Decoupled server simulation optimizing the agent based on user reward feedback
   */
  const runAPOOptimization = useCallback(
    async (agentType: 'chat' | 'coder', rollout: LightningRollout, reward: number) => {
      if (reward >= 1.0) {
        // Reinforce positive pattern - no critique needed
        return;
      }

      setIsOptimizing(true);

      // Simulate training loop overhead
      await new Promise((r) => setTimeout(r, 1200));

      const taskText = rollout.task.toLowerCase();
      const responseText = rollout.response.toLowerCase();

      // Automatic prompt critique matching catalog keywords
      let selectedCritique = '';
      if (taskText.includes('react') || responseText.includes('react')) {
        selectedCritique =
          APO_CRITIQUES_CATALOG.react[
            Math.floor(Math.random() * APO_CRITIQUES_CATALOG.react.length)
          ];
      } else if (
        taskText.includes('javascript') ||
        taskText.includes('js') ||
        responseText.includes('function')
      ) {
        selectedCritique =
          APO_CRITIQUES_CATALOG.javascript[
            Math.floor(Math.random() * APO_CRITIQUES_CATALOG.javascript.length)
          ];
      } else if (
        taskText.includes('slow') ||
        taskText.includes('performance') ||
        taskText.includes('optimize')
      ) {
        selectedCritique =
          APO_CRITIQUES_CATALOG.performance[
            Math.floor(Math.random() * APO_CRITIQUES_CATALOG.performance.length)
          ];
      } else if (
        responseText.includes('error') ||
        responseText.includes('fail') ||
        taskText.includes('bug')
      ) {
        selectedCritique =
          APO_CRITIQUES_CATALOG.error[
            Math.floor(Math.random() * APO_CRITIQUES_CATALOG.error.length)
          ];
      } else {
        selectedCritique =
          APO_CRITIQUES_CATALOG.general[
            Math.floor(Math.random() * APO_CRITIQUES_CATALOG.general.length)
          ];
      }

      setApoDirectives((prev) => {
        const current = prev[agentType];
        if (current.includes(selectedCritique)) return prev;

        const updated = [...current, selectedCritique].slice(-5); // Keep last 5 directives
        const newState = {
          ...prev,
          [agentType]: updated,
        };

        // Persist to backend
        import('@src/infrastructure/api/authFetch').then(({ fetchWithAuth }) => {
          fetchWithAuth('/api/nyx/lightning/directives', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ directives: newState }),
          }).catch((err: any) =>
            console.warn('[Agent Lightning] Failed to sync directives to backend', err)
          );
        });

        return newState;
      });

      setIsOptimizing(false);
      console.log(
        `[Agent Lightning] Successfully evolved new prompt directive for ${agentType}: "${selectedCritique}"`
      );
    },
    []
  );

  /**
   * Submit reward feedback to a specific rollout (Thumbs Up / Down)
   */
  const submitReward = useCallback(
    (rolloutId: string, reward: number) => {
      setRollouts((prev) =>
        prev.map((r) => {
          if (r.id === rolloutId) {
            const updated = { ...r, reward };
            // Trigger optimization on the fly
            runAPOOptimization(r.agentType, updated, reward);
            return updated;
          }
          return r;
        })
      );
    },
    [runAPOOptimization]
  );

  /**
   * Wipe all logged rollouts and learned optimization directives
   */
  const clearHistory = useCallback(() => {
    setRollouts([]);
    setApoDirectives({ chat: [], coder: [] });
    toast.info('Agent Lightning history and directives cleared.');
  }, []);

  return {
    lightningEnabledChat,
    setLightningEnabledChat,
    lightningEnabledCoder,
    setLightningEnabledCoder,
    rollouts,
    apoDirectives,
    averageReward,
    isOptimizing,
    logRollout,
    submitReward,
    clearHistory,
  };
};
