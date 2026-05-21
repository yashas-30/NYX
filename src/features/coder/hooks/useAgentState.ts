/**
 * @file src/features/coder/hooks/useAgentState.ts
 * @description Manages active agent, model selection, and agent persona state.
 */

import { useState, useCallback } from 'react';
import { AgentPersona } from '@/src/core/types';
import { DEFAULT_AGENTS } from '@/src/config/agents';

type AgentKey = 'open' | 'claude' | 'nyx';

interface AgentStateProps {
  activeAgent?: AgentKey;
  setActiveAgent?: (agent: AgentKey) => void;
  models?: Record<AgentKey, string>;
  setModel?: (modelId: string) => void;
}

export const useAgentState = ({
  activeAgent: propActiveAgent,
  setActiveAgent: propSetActiveAgent,
  models: propModels,
  setModel: propSetModel
}: AgentStateProps = {}) => {
  const [localActiveAgent, setLocalActiveAgent] = useState<AgentKey>('nyx');
  const activeAgent = propActiveAgent ?? localActiveAgent;
  const setActiveAgent = propSetActiveAgent ?? setLocalActiveAgent;

  const [localModels, setLocalModels] = useState<Record<AgentKey, string>>({
    open: 'opencode/big-pickle',
    claude: 'anthropic/claude-sonnet-4-20250514',
    nyx: 'anthropic/claude-sonnet-4-20250514'
  });
  const models = propModels ?? localModels;
  const setModel = useCallback((mid: string) => {
    if (propSetModel) {
      propSetModel(mid);
    } else {
      setLocalModels(prev => ({ ...prev, [activeAgent]: mid }));
    }
  }, [activeAgent, propSetModel]);

  const [agentPersonas, setAgentPersonas] = useState<Record<AgentKey, AgentPersona>>(DEFAULT_AGENTS);

  return {
    activeAgent,
    setActiveAgent,
    models,
    setModel,
    agentPersonas,
    setAgentPersonas
  };
};
