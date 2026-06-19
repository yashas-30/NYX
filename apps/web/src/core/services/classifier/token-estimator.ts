/**
 * @file token-estimator.ts
 * @description Token estimation for prompts — code-aware with language-specific multipliers.
 */

import { LANGUAGE_PATTERNS } from './patterns';

// ---------------------------------------------------------------------------
// Token estimation (accurate for code)
// ---------------------------------------------------------------------------

export function estimateTokens(prompt: string, languages: string[]): number {
  const codeBlocks = prompt.match(/```[\s\S]*?```/g) || [];
  const prose = prompt.replace(/```[\s\S]*?```/g, '');

  let codeTokens = 0;
  for (const block of codeBlocks) {
    const lines = block.split('\n').length;
    const lang = languages[0] || 'generic';
    const multiplier = LANGUAGE_PATTERNS.find((l) => l.id === lang)?.tokenMultiplier || 4;
    codeTokens += lines * multiplier;
  }

  const proseWords = prose.split(/\s+/).length;
  const proseTokens = proseWords * 1.3;

  return Math.ceil(codeTokens + proseTokens + prompt.length * 0.1);
}
