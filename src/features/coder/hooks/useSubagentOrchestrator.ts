/**
 * @file src/features/coder/hooks/useSubagentOrchestrator.ts
 * @description Hook to manage the SubagentOrchestrator lifecycle.
 */

import { useRef } from 'react';
import { SubagentOrchestrator } from '../services/SubagentOrchestrator';

/**
 * WRONG-5 fix: Use useRef instead of useCallback to maintain a stable orchestrator
 * instance across renders without recreating it unnecessarily.
 */
export function useSubagentOrchestrator() {
  const orchestratorRef = useRef<SubagentOrchestrator | null>(null);
  if (!orchestratorRef.current) {
    orchestratorRef.current = new SubagentOrchestrator();
  }
  const createOrchestrator = () => {
    orchestratorRef.current = new SubagentOrchestrator();
    return orchestratorRef.current;
  };
  return { createOrchestrator, orchestrator: orchestratorRef };
}
