/**
 * promptRouting.test.ts
 * Comprehensive test suite for modular prompt classification and category-specific builders.
 */

import { describe, it, expect } from 'vitest';
import {
  buildChatPrompts,
  detectPromptCategory,
  detectSafetyLevel,
  extractRequestedSlideCount,
  buildRhythmGuideline,
  buildCopyConstraints,
  ChatContext,
} from '../core/prompts';

describe('Modular Prompt Routing & Classification', () => {
  const baseContext: ChatContext = {
    conversationTone: 'professional',
    detectedLanguage: 'en',
    previousMessages: 0,
  };

  describe('Category Classification (detectPromptCategory)', () => {
    it('identifies presentation prompts accurately', () => {
      expect(detectPromptCategory('Create a 6-slide presentation on Rust memory safety')).toBe(
        'presentation'
      );
      expect(detectPromptCategory('Generate pitch deck for AI startup')).toBe('presentation');
      expect(detectPromptCategory('make a ppt on renewable energy')).toBe('presentation');
    });

    it('identifies diagram and visual modeling prompts', () => {
      expect(detectPromptCategory('Draw a mermaid sequence diagram for OAuth flow')).toBe(
        'diagram'
      );
      expect(
        detectPromptCategory('Generate an architecture diagram showing microservices topology')
      ).toBe('diagram');
      expect(detectPromptCategory('Create an ER diagram for ecommerce database')).toBe('diagram');
    });

    it('identifies live web search queries', () => {
      expect(detectPromptCategory('Search the web for the latest SpaceX launch status')).toBe(
        'websearch'
      );
      expect(detectPromptCategory('What is the current stock price of Apple today?')).toBe(
        'websearch'
      );
      expect(
        detectPromptCategory('Tell me about quantum computing', {
          ...baseContext,
          hasWebSearch: true,
        })
      ).toBe('websearch');
    });

    it('identifies deep research whitepaper requests', () => {
      expect(
        detectPromptCategory('Provide a deep research report comparing Paxos vs Raft consensus')
      ).toBe('research');
      expect(
        detectPromptCategory(
          'In-depth analysis of state of the art transformer attention mechanisms'
        )
      ).toBe('research');
      expect(
        detectPromptCategory('Write a comprehensive whitepaper on zero-knowledge rollups')
      ).toBe('research');
    });

    it('identifies code engineering and refactoring requests', () => {
      expect(detectPromptCategory('Implement a red-black tree in TypeScript')).toBe('code');
      expect(detectPromptCategory('Debug this TypeError in my React hook and refactor it')).toBe(
        'code'
      );
      expect(
        detectPromptCategory('Write an async fn in Rust to stream bytes over tokio TCP socket')
      ).toBe('code');
    });

    it('defaults to general conversation for standard queries', () => {
      expect(detectPromptCategory('Explain the concept of entropy in thermodynamics')).toBe(
        'general'
      );
      expect(detectPromptCategory('Who was Marcus Aurelius and what is Stoicism?')).toBe('general');
    });
  });

  describe('Category-Specific Prompt Generation', () => {
    it('generates Slidev Studio prompt for presentation category', () => {
      const result = buildChatPrompts(
        'gemini-3.7-flash',
        baseContext,
        'Make an 8 slide presentation on autonomous agents',
        []
      );

      expect(result.metadata.category).toBe('presentation');
      expect(result.systemPrompt).toContain('Gemini 3.7 Flash');
      expect(result.systemPrompt).toContain('Slidev (Vue/Vite/UnoCSS)');
      expect(result.systemPrompt).toContain('LAYOUT-SPECIFIC TEXT BUDGETS');
      expect(result.systemPrompt).toContain('ZERO SCRATCHPAD OR WORD COUNTING');
      expect(result.systemPrompt).toContain('<mandatory_slide_sequence>');
    });

    it('generates Web Search prompt for live web search category', () => {
      const result = buildChatPrompts(
        'openai/gpt-oss-120b',
        baseContext,
        'What are the latest announcements from today?',
        [],
        'Search Result 1: Major breakthroughs announced...'
      );

      expect(result.metadata.category).toBe('websearch');
      expect(result.systemPrompt).toContain('GPT OSS 120B');
      expect(result.systemPrompt).toContain('<grounded_synthesis_rules>');
      expect(result.systemPrompt).toContain('FACTUAL GROUNDING & ATTRIBUTION');
      expect(result.userPrompt).toContain('[Web Search Results]');
    });

    it('generates Deep Research prompt for comprehensive whitepapers', () => {
      const result = buildChatPrompts(
        'gemini-2.5-flash',
        baseContext,
        'Deep research report on quantum error correction codes',
        []
      );

      expect(result.metadata.category).toBe('research');
      expect(result.systemPrompt).toContain('Gemini 2.5 Flash');
      expect(result.systemPrompt).toContain('<whitepaper_structure>');
      expect(result.systemPrompt).toContain('STRUCTURED TRADE-OFF MATRICES');
    });

    it('generates Visual Architecture prompt for diagrams', () => {
      const result = buildChatPrompts(
        'meta/llama-3.3-70b-instruct',
        baseContext,
        'Draw a mermaid sequence diagram for user login and JWT issuance',
        []
      );

      expect(result.metadata.category).toBe('diagram');
      expect(result.systemPrompt).toContain('Llama 3.3 70B Instruct');
      expect(result.systemPrompt).toContain('<diagram_design_rules>');
      expect(result.systemPrompt).toContain('39 VISUAL LAYOUT TYPES');
      expect(result.systemPrompt).toContain('SEMANTIC COLOR TOKENS');
    });

    it('generates Code Engineering prompt for software implementation', () => {
      const result = buildChatPrompts(
        'codestral-latest',
        baseContext,
        'Implement an LRU cache in TypeScript with O(1) get and set operations',
        []
      );

      expect(result.metadata.category).toBe('code');
      expect(result.systemPrompt).toContain('Codestral');
      expect(result.systemPrompt).toContain('MINIMAL SURGICAL DIFFS');
      expect(result.systemPrompt).toContain('ZERO HARDCODING & DOMAIN-AGNOSTIC ARCHITECTURE');
      expect(result.systemPrompt).toContain('<software_engineering_standards>');
    });

    it('generates general prompt for standard queries', () => {
      const result = buildChatPrompts(
        'gemini-2.5-flash',
        baseContext,
        'What are the core philosophical principles of epistemology?',
        []
      );

      expect(result.metadata.category).toBe('general');
      expect(result.systemPrompt).toContain('Gemini 2.5 Flash');
      expect(result.systemPrompt).toContain('<capabilities_and_guidelines>');
      expect(result.systemPrompt).toContain('TRUTHFUL SELF-IDENTIFICATION');
      expect(result.systemPrompt).toContain('<formatting_and_math_contract>');
    });

    it('injects available tools and lightning directives into system prompt', () => {
      const contextWithTools: ChatContext = {
        ...baseContext,
        availableTools: [
          {
            name: 'deep_research',
            description: 'Perform deep technical research across web sources.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Query to research' },
              },
            },
          },
        ],
        lightningDirectives: ['Prioritize memory safety', 'Always use strict types'],
      };

      const result = buildChatPrompts(
        'claude-3-5-sonnet',
        contextWithTools,
        'Analyze memory allocation strategies',
        []
      );

      expect(result.systemPrompt).toContain('<available_tools>');
      expect(result.systemPrompt).toContain('deep_research');
      expect(result.systemPrompt).toContain('<lightning_directives>');
      expect(result.systemPrompt).toContain('Prioritize memory safety');
    });
  });

  describe('Safety Classification', () => {
    it('classifies defensive security queries as standard', () => {
      expect(detectSafetyLevel('How to patch and secure SQL injection vulnerabilities')).toBe(
        'standard'
      );
      expect(detectSafetyLevel('Security audit of our authentication flow')).toBe('standard');
    });

    it('classifies potentially malicious requests as strict', () => {
      expect(detectSafetyLevel('How to create ransomware malware and steal password data')).toBe(
        'strict'
      );
    });
  });
});
