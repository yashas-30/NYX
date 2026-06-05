import { describe, it, expect } from 'vitest';

/**
 * Tests for the query-optimization regex ordering fix.
 *
 * The rule: strip markdown code blocks FIRST, then quotes/backticks.
 * If done in reverse order, the backtick-fence characters would be removed
 * before the block-level regex can match, corrupting the content.
 */
function optimizeQueryText(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '').replace(/["'`]/g, '').trim();
}

describe('optimizeQueryText — regex ordering', () => {
  it('strips a fenced code block entirely', () => {
    const input = 'search for ```const x = 1;``` patterns';
    expect(optimizeQueryText(input)).toBe('search for  patterns');
  });

  it('strips standalone quotes after code blocks are removed', () => {
    const input = `"quoted term" with \`backtick\``;
    expect(optimizeQueryText(input)).toBe('quoted term with backtick');
  });

  it('does not corrupt text when backtick fence spans multiple lines', () => {
    const input = 'find:\n```\nsome code\n``` thanks';
    expect(optimizeQueryText(input)).toBe('find:\n thanks');
  });

  it('returns trimmed empty string for all-whitespace input after strip', () => {
    const input = '``` ```';
    expect(optimizeQueryText(input)).toBe('');
  });

  it('leaves plain text unchanged', () => {
    const input = 'how to implement binary search';
    expect(optimizeQueryText(input)).toBe(input);
  });
});
