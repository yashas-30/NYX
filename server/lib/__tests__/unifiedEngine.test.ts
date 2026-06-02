import { describe, it, expect } from 'vitest';
import { UnifiedEngine } from '../unifiedEngine.ts';

describe('UnifiedEngine', () => {
  it('should format prompts correctly', () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello' },
    ];
    // We cast to any to access the private method for testing
    const formatted = (UnifiedEngine as any).formatPrompt(messages);
    expect(formatted).toContain('<|system|>\nYou are a helpful assistant');
    expect(formatted).toContain('<|user|>\nHello');
  });
});
