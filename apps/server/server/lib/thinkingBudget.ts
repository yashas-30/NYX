/**
 * @file server/lib/thinkingBudget.ts
 * @description Adaptive thinking budget resolver — scales Gemini thinking tokens
 * to prompt complexity instead of using a fixed budget.
 * Inspired by Claude's adaptive thinking and Kimi's test-time compute scaling.
 */

interface BudgetFactors {
  length: number;
  hasCode: boolean;
  hasMath: boolean;
  hasResearch: boolean;
  hasMultiStep: boolean;
  agentId?: string;
}

function analyzePrompt(prompt: string, agentId?: string): BudgetFactors {
  const lower = prompt.toLowerCase();
  return {
    length: prompt.length,
    hasCode: /```|function\s+\w+|class\s+\w+|algorithm|implement|debug|refactor/i.test(prompt),
    hasMath: /equation|integral|matrix|proof|theorem|calculus|derivative|probability/i.test(prompt),
    hasResearch: /research|analyze|compare|survey|explain in detail|comprehensive|in-depth|summarize/i.test(lower),
    hasMultiStep: /step by step|plan|roadmap|architecture|design|strategy|multiple|first.*then|workflow/i.test(lower),
    agentId,
  };
}

/**
 * Resolves the thinking token budget for a given prompt and optional agent context.
 * Returns a number in the range [256, 24576].
 *
 * Budget tiers:
 *  - Casual/tiny   → 256   (hi, thanks, yes/no)
 *  - Simple        → 1024  (short factual Q)
 *  - Medium        → 4096  (general explanation)
 *  - Hard          → 8192  (code, math, planning)
 *  - Ultra         → 16384 (deep research, architecture)
 *  - Max (planner) → 24576 (deep_planner / deep_research agents)
 */
export function resolveThinkingBudget(prompt: string, agentId?: string): number {
  const f = analyzePrompt(prompt, agentId);

  // Agent-based overrides
  if (agentId === 'deep_planner' || agentId === 'deep_research') return 24576;
  if (agentId === 'code_interpreter') return f.hasCode ? 8192 : 4096;
  if (agentId === 'persona_polisher') return 512; // synthesis only, no heavy reasoning

  // Casual / trivial (very short, no special signals)
  const isCasual = f.length < 80 && !f.hasCode && !f.hasMath && !f.hasResearch;
  if (isCasual) return 256;

  // Short factual
  if (f.length < 200 && !f.hasCode && !f.hasMath) return 1024;

  // Ultra-hard: research + code or research + math
  if (f.hasResearch && (f.hasCode || f.hasMath)) return 16384;

  // Hard: code or math or multi-step planning
  if (f.hasCode || f.hasMath || (f.hasMultiStep && f.length > 300)) return 8192;

  // Research / detailed explanation
  if (f.hasResearch || f.hasMultiStep) return 4096;

  // Default medium
  return 2048;
}

/**
 * Score prompt complexity on a 1-5 scale.
 * Used by the swarm to determine adaptive MAX_LOOPS.
 */
export function scoreComplexity(prompt: string): number {
  const f = analyzePrompt(prompt);

  let score = 1;
  if (f.length > 100) score++;
  if (f.hasCode || f.hasMath) score++;
  if (f.hasResearch) score++;
  if (f.hasMultiStep && f.length > 500) score++;

  return Math.min(score, 5);
}
