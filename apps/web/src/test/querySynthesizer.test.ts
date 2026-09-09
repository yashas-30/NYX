import { describe, it, expect } from 'vitest';
import { distillSearchQuery } from '../shared/querySynthesizer';

describe('distillSearchQuery', () => {
  it('distills conversational pie chart creation prompt into clean search terms', () => {
    const prompt =
      'create a pie chart for types of religion in the entire world and it should also how on each country what are the majority religions';
    const distilled = distillSearchQuery(prompt);
    expect(distilled).not.toMatch(/create/i);
    expect(distilled).not.toMatch(/pie\s*chart/i);
    expect(distilled).not.toMatch(/it\s+should/i);
    expect(distilled.toLowerCase()).toContain('religion');
  });

  it('distills diagram requests cleanly', () => {
    const prompt = 'generate a flowchart of OAuth2 authorization code flow with PKCE';
    const distilled = distillSearchQuery(prompt);
    expect(distilled).not.toMatch(/generate/i);
    expect(distilled).not.toMatch(/flowchart/i);
    expect(distilled).toContain('OAuth2 authorization code flow with PKCE');
  });

  it('distills web search questions with politeness and detail suffixes', () => {
    const prompt =
      'Can you please search the web for latest quantum computing breakthroughs in 2025 in detail?';
    const distilled = distillSearchQuery(prompt);
    expect(distilled).not.toMatch(/can\s+you\s+please/i);
    expect(distilled).not.toMatch(/search\s+the\s+web/i);
    expect(distilled).not.toMatch(/in\s+detail/i);
    expect(distilled).toContain('quantum computing breakthroughs in 2025');
  });

  it('handles direct simple queries without mangling', () => {
    const prompt = 'Rust async vs goroutines performance benchmark';
    const distilled = distillSearchQuery(prompt);
    expect(distilled).toBe('Rust async vs goroutines performance benchmark');
  });

  it('handles slash commands', () => {
    const prompt = '/web latest AI models released this week';
    const distilled = distillSearchQuery(prompt);
    expect(distilled).toBe('latest AI models released this week');
  });

  it('caps excessively long search queries to avoid search engine rejection', () => {
    const longPrompt =
      'Can you please explain and search for the historical diplomatic relations between France and Great Britain during the nineteenth century including all relevant treaties and conflicts in full detail?';
    const distilled = distillSearchQuery(longPrompt);
    expect(distilled.length).toBeLessThanOrEqual(120);
    expect(distilled.split(/\s+/).length).toBeLessThanOrEqual(12);
  });
});
