import { useCallback } from 'react';
import { triggerCritic, triggerMemoryCommit } from '@src/infrastructure/api/coderApi';
import { detectProvider, getEffectiveApiKey } from '@src/infrastructure/utils/provider';

interface BackgroundTasksProps {
  models: Record<string, string>;
  apiKeys: Record<string, string>;
}

export const useBackgroundTasks = ({ models, apiKeys }: BackgroundTasksProps) => {
  // fallow-ignore-next-line code-duplication
  const triggerBackgroundCritic = useCallback(
    async (prompt: string, responseText: string, complexity?: string) => {
      // Skip critic for trivial/simple prompts — saves tokens and reduces noise
      const trivialComplexities = ['trivial', 'simple'];
      if (complexity && trivialComplexities.includes(complexity)) {
        console.debug(
          '[BackgroundCritic] Skipping critic for low-complexity prompt (complexity:',
          complexity,
          ')'
        );
        return;
      }
      // Also skip very short responses (< 200 chars) — likely single-line completions
      if (responseText.trim().length < 200) {
        console.debug(
          '[BackgroundCritic] Skipping critic — response too short for meaningful evaluation'
        );
        return;
      }

      const nyxModel = models['nyx'];
      if (!nyxModel) return;
      const activeProvider = detectProvider(nyxModel);
      const apiKey = getEffectiveApiKey(activeProvider, apiKeys) || '';

      try {
        await triggerCritic({
          prompt,
          response: responseText,
          apiKey,
          provider: activeProvider,
          modelId: nyxModel,
        });
      } catch (err: any) {
        console.error('[useBackgroundTasks] Background critic failed:', err);
      }
    },
    [models, apiKeys]
  );

  const commitToMemory = useCallback(
    (prompt: string, responseText: string) => {
      const nyxModel = models['nyx'];
      if (!nyxModel) return;
      const nyxProvider = detectProvider(nyxModel);

      // Asynchronously trigger memory keeper commit
      triggerMemoryCommit({
        prompt,
        response: responseText,
        provider: nyxProvider,
        modelId: nyxModel,
        agentType: 'code',
      }).catch((err: any) => {
        console.warn('[Coder Pipeline] Memory keeper commit failed:', err);
      });
    },
    [models]
  );

  return { triggerBackgroundCritic, commitToMemory };
};
