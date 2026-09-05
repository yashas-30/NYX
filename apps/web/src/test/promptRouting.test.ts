/**
 * promptRouting.test.ts
 * Comprehensive test suite for the unified Antigravity Agent Master System Prompt.
 */

import { describe, it, expect } from 'vitest';
import {
  buildChatPrompts,
  detectPromptCategory,
  detectSafetyLevel,
  ChatContext,
} from '../core/prompts';

describe('Unified Antigravity Prompt Pipeline', () => {
  const baseContext: ChatContext = {
    conversationTone: 'professional',
    detectedLanguage: 'en',
    previousMessages: 0,
  };

  describe('Prompt Classification & Detection', () => {
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
  });

  describe('Unified Master System Prompt Assembly', () => {
    it('generates unified Antigravity system prompt for general and code prompts', () => {
      const result = buildChatPrompts(
        'gemini-3.7-flash',
        baseContext,
        'Explain how async/await works in Rust with tokio',
        []
      );

      expect(result.systemPrompt).toContain('<antigravity_behavior>');
      expect(result.systemPrompt).toContain('You are Antigravity');
      expect(result.systemPrompt).toContain('gemini-3.7-flash');
      expect(result.systemPrompt).toContain('<critical_child_safety_instructions>');
      expect(result.systemPrompt).toContain('<code_and_software_engineering>');
      expect(result.systemPrompt).toContain('<visual_diagrams_and_mermaid>');
    });

    it('routes presentation prompts to the specialized Slidev builder', () => {
      const result = buildChatPrompts(
        'gemini-3.7-flash',
        baseContext,
        'Make an 8 slide presentation on autonomous agents',
        []
      );

      // Presentation uses buildPresentationPrompt — check for Slidev-specific content
      expect(result.systemPrompt).toContain('layout: cover');
      expect(result.systemPrompt).toContain('layout: end');
      expect(result.systemPrompt).toContain('Slide 1 of 8 (layout: cover)');
      expect(result.systemPrompt).toContain('Slide 8 of 8 (layout: end)');
      expect(result.metadata.category).toBe('presentation');
    });

    it('injects web search context into user prompt', () => {
      const result = buildChatPrompts(
        'openai/gpt-4o',
        baseContext,
        'What are the latest announcements from today?',
        [],
        'Search Result 1: Major breakthroughs announced...'
      );

      expect(result.systemPrompt).toContain('<antigravity_behavior>');
      expect(result.userPrompt).toContain('[Web Search Results]');
      expect(result.userPrompt).toContain('Search Result 1: Major breakthroughs announced...');
    });

    it('injects memory context into user prompt', () => {
      const result = buildChatPrompts(
        'claude-3-5-sonnet',
        baseContext,
        'Continue refactoring the auth service',
        [],
        undefined,
        'anthropic',
        undefined,
        'User prefers JWT over session cookies'
      );

      expect(result.userPrompt).toContain('[Relevant Memory Context]');
      expect(result.userPrompt).toContain('User prefers JWT over session cookies');
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

  describe('Code Fix & Existing Code Modification Routing', () => {
    it('classifies direct fix phrases and previous code edits into code category', () => {
      expect(detectPromptCategory('fix it')).toBe('code');
      expect(detectPromptCategory('fix this')).toBe('code');
      expect(detectPromptCategory('fix the previous code')).toBe('code');
      expect(detectPromptCategory('update the existing calculator with dark mode')).toBe('code');
      expect(detectPromptCategory('add a reset button to the previous code')).toBe('code');
    });

    it('identifies code follow-up when previous response contained code', () => {
      const mockHistory = [
        { role: 'user', content: 'build a calculator' },
        {
          role: 'assistant',
          content:
            'Here is the calculator:\n```html\n<!DOCTYPE html><html><body>...</body></html>\n```',
        },
      ];
      expect(
        detectPromptCategory('make the background dark', baseContext, undefined, mockHistory as any)
      ).toBe('code');
      expect(
        detectPromptCategory('add clear button', baseContext, undefined, mockHistory as any)
      ).toBe('code');
    });

    it('injects instruction to edit existing code rather than restarting from scratch', () => {
      const mockHistory = [
        { role: 'user', content: 'build a calculator' },
        {
          role: 'assistant',
          content:
            'Here is the calculator:\n```html\n<!DOCTYPE html><html><body>...</body></html>\n```',
        },
      ];
      const result = buildChatPrompts(
        'gemini-3.7-flash',
        baseContext,
        'fix the previous code and add sound effects',
        mockHistory as any
      );

      expect(result.metadata.category).toBe('code');
      expect(result.systemPrompt).toContain('EDITING EXISTING CODE (CRITICAL)');
      expect(result.systemPrompt).toContain('NEVER start from scratch');
      expect(result.userPrompt).toContain(
        'The user is requesting fixes or modifications to the code from the previous assistant response'
      );
      expect(result.userPrompt).toContain('Edit and update that existing codebase directly');
    });
  });
});
