import { useState, useCallback } from 'react';
import { analyzePrompt, routeToAgent } from '@src/core/services/promptClassifier';
import {
  isMissingDebugDetails,
  MISSING_DEBUG_DETAILS_RESPONSE,
} from '@nyx/shared';
import { ChatMessage } from '@src/infrastructure/types';
import { toast } from '@src/shared/components/ui/sonner';

interface PromptAnalysisProps {
  updateHistory: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  setIsLoading: (loading: boolean) => void;
  clearController: () => void;
}

export const usePromptAnalysis = ({
  updateHistory,
  setIsLoading,
  clearController,
}: PromptAnalysisProps) => {
  const [agentMode, setAgentMode] = useState<'chat' | 'coder' | 'architect' | null>(null);
  const [agentReasoning, setAgentReasoning] = useState<string>('');
  const [missingDebugWarning, setMissingDebugWarning] = useState<{ prompt: string } | null>(null);

  const analyzeAndRoute = useCallback(
    (prompt: string, bypassGate: boolean = false) => {
      // Step 1: Analyze prompt
      // fallow-ignore-next-line code-duplication
      const analysis = analyzePrompt(prompt);
      const route = routeToAgent(analysis);

      // Step 2: Show routing decision to user
      setAgentMode(route.agent);
      setAgentReasoning(route.reasoning);

      // Step 3: Check for missing debug details
      if (!bypassGate && analysis.intent === 'code_debug' && isMissingDebugDetails(prompt, 'debug')) {
        updateHistory((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: MISSING_DEBUG_DETAILS_RESPONSE,
            timestamp: Date.now(),
            status: 'success',
          },
        ]);
        setMissingDebugWarning({ prompt });
        toast.error('Please provide your code or error logs');
        setIsLoading(false);
        clearController();
        return null; // Return null to indicate early exit
      }

      setMissingDebugWarning(null);
      return { analysis, route };
    },
    [updateHistory, setIsLoading, clearController]
  );

  return { agentMode, setAgentMode, agentReasoning, setAgentReasoning, analyzeAndRoute, missingDebugWarning, setMissingDebugWarning };
};
