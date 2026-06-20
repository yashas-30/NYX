/**
 * Agent Safety Envelope to prevent runaway agents.
 * Limits iterations, cost, wall time, and detects repetitive output.
 */
export class AgentSafetyEnvelope {
  private maxIterations: number;
  private maxCostUsd: number;
  private maxWallTimeMs: number;
  private startTime: number;
  private iterations: number;
  private costUsd: number;
  private recentOutputs: string[];

  constructor(
    maxIterations = 20,
    maxCostUsd = 2.0,
    maxWallTimeMs = 300_000 // 300 seconds
  ) {
    this.maxIterations = maxIterations;
    this.maxCostUsd = maxCostUsd;
    this.maxWallTimeMs = maxWallTimeMs;
    this.startTime = Date.now();
    this.iterations = 0;
    this.costUsd = 0.0;
    this.recentOutputs = [];
  }

  /**
   * Call at each iteration of the agent loop.
   * @param output - The output string from the agent (optional)
   * @param costIncrement - Additional cost incurred in this iteration (optional)
   * @throws if any safety limit is exceeded
   */
  tick(output?: string, costIncrement: number = 0): void {
    this.iterations++;
    this.costUsd += costIncrement;

    // Check iteration limit
    if (this.iterations > this.maxIterations) {
      throw new Error(
        `Agent safety limit exceeded: max iterations (${this.maxIterations}) reached`
      );
    }

    // Check cost limit
    if (this.costUsd > this.maxCostUsd) {
      throw new Error(
        `Agent safety limit exceeded: max cost ($${this.maxCostUsd}) reached. Current cost: $${this.costUsd.toFixed(4)}`
      );
    }

    // Check wall time limit
    const elapsedMs = Date.now() - this.startTime;
    if (elapsedMs > this.maxWallTimeMs) {
      throw new Error(
        `Agent safety limit exceeded: max wall time (${this.maxWallTimeMs}ms) reached. Elapsed: ${elapsedMs}ms`
      );
    }

    // Track output for repetition detection
    if (output !== undefined && output !== null) {
      this.recentOutputs.push(output.trim());
      // Keep only last 3 outputs
      if (this.recentOutputs.length > 3) {
        this.recentOutputs.shift();
      }

      // Check for repetitive output: if we have 3 outputs, compare similarities
      if (this.recentOutputs.length === 3) {
        const [o1, o2, o3] = this.recentOutputs;
        const sim12 = this.stringSimilarity(o1, o2);
        const sim13 = this.stringSimilarity(o1, o3);
        const sim23 = this.stringSimilarity(o2, o3);
        const avgSimilarity = (sim12 + sim13 + sim23) / 3;

        if (avgSimilarity > 0.92) {
          throw new Error(
            `Agent safety limit exceeded: repetitive output detected (similarity > 0.92)`
          );
        }
      }
    }
  }

  /**
   * Simple string similarity using Dice coefficient of bigrams.
   * Returns a value between 0 and 1.
   */
  private stringSimilarity(s1: string, s2: string): number {
    if (s1.length === 0 && s2.length === 0) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    const bigrams1 = this.getBigrams(s1);
    const bigrams2 = this.getBigrams(s2);

    const intersectionSize = bigrams1.filter((bg) => bigrams2.includes(bg)).length;
    const total = bigrams1.length + bigrams2.length;

    return total === 0 ? 0 : (2 * intersectionSize) / total;
  }

  private getBigrams(str: string): string[] {
    const bigrams: string[] = [];
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.push(str.substring(i, i + 2));
    }
    return bigrams;
  }

  /**
   * Get current safety metrics for debugging or logging.
   */
  getMetrics() {
    return {
      iterations: this.iterations,
      maxIterations: this.maxIterations,
      costUsd: this.costUsd,
      maxCostUsd: this.maxCostUsd,
      elapsedMs: Date.now() - this.startTime,
      maxWallTimeMs: this.maxWallTimeMs,
      recentOutputsCount: this.recentOutputs.length,
    };
  }
}