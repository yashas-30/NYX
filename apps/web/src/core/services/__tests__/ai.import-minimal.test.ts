import { describe, it, expect } from 'vitest';

// Only import the pure exported functions — no AIService class
// This tests whether the module graph causes the hang
describe('pure functions from ai.service', () => {
  it('loads countTokens', async () => {
    const mod = await import('../ai.service');
    expect(typeof mod.countTokens).toBe('function');
  });
});
