/**
 * @file urgency.ts
 * @description Urgency detection for user prompts based on frustration indicators.
 */

import type { PromptAnalysis } from './types';

// ---------------------------------------------------------------------------
// Urgency detection
// ---------------------------------------------------------------------------

export function detectUrgency(prompt: string): PromptAnalysis['urgency'] {
  const urgentPatterns = [
    /\b(urgent|asap|immediately|deadline|production|down|broken|critical|emergency|help)\b/i,
    /\b(stuck|blocked|cannot|can't|won't|doesn't work|not working at all)\b/i,
    /\b(!{2,}|ALL CAPS|screaming)\b/,
  ];
  const highCount = urgentPatterns.filter((r) => r.test(prompt)).length;
  if (highCount >= 2) return 'high';
  if (highCount === 1) return 'normal';
  return 'low';
}
