import { HybridModelRouter } from './hybridRouter';

export async function generateSessionTitleAsync(
  prompt: string,
  apiKeys: Record<string, string>,
  checkStatusFn: (provider: string) => Promise<'online' | 'offline' | 'no-key'>
): Promise<string> {
  try {
    // Route to a fast local model if hot, or fast remote
    const decision = await HybridModelRouter.routeSimpleTask('naming', apiKeys, checkStatusFn);

    console.log('[TitleGenerator] Selected model for naming:', decision.modelId, 'provider:', decision.provider);

    // Placeholder for actual LLM generation. 
    // In production, this would call executeWithFallbackChain using the decision.
    return "Generated Title";
  } catch (err) {
    console.error('[TitleGenerator] Failed to generate title', err);
    return "";
  }
}
