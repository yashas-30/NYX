/**
 * @file src/features/coder/hooks/useAgentState.ts
 * @description Manages NYX agent state and model selection.
 */

import { useState, useCallback } from 'react';
import { AgentPersona } from '@src/infrastructure/types';
import { DEFAULT_AGENTS } from '@src/config/agents';

interface AgentStateProps {
  models?: Record<'nyx', string>;
  setModel?: (modelId: string) => void;
}

export const useAgentState = ({
  models: propModels,
  setModel: propSetModel
}: AgentStateProps = {}) => {
  const [localModels, setLocalModels] = useState<Record<'nyx', string>>({
    nyx: ''
  });
  const models = propModels ?? localModels;
  const setModel = useCallback((mid: string) => {
    if (propSetModel) {
      propSetModel(mid);
    } else {
      setLocalModels({ nyx: mid });
    }
  }, [propSetModel]);

  const [agentPersonas, setAgentPersonas] = useState<Record<'nyx', AgentPersona>>(DEFAULT_AGENTS);

  return {
    activeAgent: 'nyx' as const,
    models,
    setModel,
    agentPersonas,
    setAgentPersonas
  };
};
