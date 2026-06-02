import { callAI, InferenceResult, AISettings } from './inferenceClient';
import { CostTrackerService } from './costTracker.service';

export class EnsembleService {
  /**
   * Executes the same prompt across multiple models in parallel.
   * Returns an array of all responses, or a single "voted" response if a judge is used.
   */
  static async executeEnsemble(
    prompt: string,
    apiKeys: Record<string, string>,
    models: Array<{ provider: string; modelId: string }>,
    judgeModel?: { provider: string; modelId: string }
  ): Promise<InferenceResult | InferenceResult[]> {
    const inputTokens = CostTrackerService.estimateTokens(prompt);

    const promises = models.map(async (route) => {
      const apiKey = apiKeys[route.provider];
      if (!apiKey) return null;

      try {
        const res = await callAI(route.modelId, route.provider, prompt, apiKey);

        await CostTrackerService.recordUsage(
          route.modelId,
          route.provider,
          inputTokens,
          res.tokens || 0
        );

        return { ...res, _modelId: route.modelId, _provider: route.provider };
      } catch (err) {
        console.warn(`[Ensemble] Failed on ${route.provider}`, err);
        return null;
      }
    });

    const results = (await Promise.all(promises)).filter((r) => r !== null) as (InferenceResult & {
      _modelId: string;
      _provider: string;
    })[];

    if (!judgeModel || results.length === 0) {
      return results;
    }

    // Pass results to judge model
    const judgeApiKey = apiKeys[judgeModel.provider];
    if (!judgeApiKey) return results;

    let judgePrompt = `Please evaluate the following code generation responses for the prompt: "${prompt}"\n\n`;
    results.forEach((r, idx) => {
      judgePrompt += `--- Option ${idx + 1} (${r._modelId}) ---\n${r.text}\n\n`;
    });
    judgePrompt += `Select the best Option and output its exact content. Prefix your answer with the Option number you chose.`;

    const judgeTokens = CostTrackerService.estimateTokens(judgePrompt);

    const finalRes = await callAI(
      judgeModel.modelId,
      judgeModel.provider,
      judgePrompt,
      judgeApiKey
    );

    await CostTrackerService.recordUsage(
      judgeModel.modelId,
      judgeModel.provider,
      judgeTokens,
      finalRes.tokens || 0
    );

    return finalRes;
  }
}
