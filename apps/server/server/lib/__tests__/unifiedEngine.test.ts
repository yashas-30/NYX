import { describe, it, expect } from 'vitest';
import { UnifiedEngine } from '../unifiedEngine.js';

describe('UnifiedEngine', () => {
  it('should be defined', () => {
    expect(UnifiedEngine).toBeDefined();
    expect(UnifiedEngine.executeStream).toBeTypeOf('function');
  });
});
