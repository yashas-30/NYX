import { describe, it, expect } from 'vitest';
import { pruneTextByQuery } from '../../features/agents/tools/index.js';

describe('pruneTextByQuery', () => {
  const sampleText = `Introduction to Machine Learning.
This paragraph covers the basic concepts of ML, supervised learning, unsupervised learning, and neural networks.

Boilerplate footer information.
Privacy policy, terms of service, cookie settings, and copyright 2026. All rights reserved.

Advanced Deep Learning Topics.
Neural networks, backpropagation, gradient descent, transformers, and attention mechanisms are discussed here.

Contact Us.
Email us at contact@example.com or visit our office.`;

  it('returns original text if it is shorter than maxChars', () => {
    const result = pruneTextByQuery(sampleText, 'neural networks', 10000);
    expect(result.content).toBe(sampleText);
    expect(result.truncated).toBe(false);
  });

  it('slices text if query is empty or undefined', () => {
    const result = pruneTextByQuery(sampleText, '', 50);
    expect(result.content).toBe(sampleText.slice(0, 50));
    expect(result.truncated).toBe(true);
  });

  it('selects and orders matching paragraphs by query keywords', () => {
    // Query contains "deep learning neural networks"
    // Paragraph 2 (ML introduction) and Paragraph 4 (Advanced Deep Learning) should match.
    // Paragraph 3 (Boilerplate) and Paragraph 5 (Contact) should not match.
    const result = pruneTextByQuery(sampleText, 'deep learning neural networks', 350);
    
    expect(result.content).toContain('concepts of ML');
    expect(result.content).toContain('Advanced Deep Learning Topics');
    expect(result.content).not.toContain('Boilerplate footer');
    expect(result.content).not.toContain('Contact Us');
    expect(result.truncated).toBe(true);

    // Verify original chronological order is preserved
    const idxML = result.content.indexOf('concepts of ML');
    const idxDL = result.content.indexOf('Advanced Deep Learning Topics');
    expect(idxML).toBeLessThan(idxDL);
  });

  it('filters out common stop words from scoring', () => {
    // Query has only stop words and 'transformers'
    const result = pruneTextByQuery(sampleText, 'what is a transformers and how to use it', 200);
    
    expect(result.content).toContain('transformers, and attention');
    expect(result.content).not.toContain('concepts of ML');
  });

  it('falls back to first paragraph if no keywords match', () => {
    const result = pruneTextByQuery(sampleText, 'completelyunrelatedkeyword', 100);
    expect(result.content).toBe(sampleText.split('\n\n')[0].slice(0, 100));
    expect(result.truncated).toBe(true);
  });
});
