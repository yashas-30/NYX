import { HybridModelRouter } from './hybridRouter';

export async function generateSessionTitleAsync(
  prompt: string,
  apiKeys: Record<string, string>,
  checkStatusFn: (provider: string) => Promise<'online' | 'offline' | 'no-key'>
): Promise<string> {
  try {
    // Route to a fast local model if hot, or fast remote
    const decision = await HybridModelRouter.routeSimpleTask('naming', apiKeys, checkStatusFn);

    // TODO: wire executeFn here using decision.modelId and decision.provider
    // For now, return empty so the session uses the first user message as title.
    void decision;
    return '';
  } catch {
    return '';
  }
}
