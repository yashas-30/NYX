/**
 * @file intent-embeddings.ts
 * @description Semantic intent embeddings for similarity-based prompt classification.
 *   Each embedding contains semantic vectors, high-signal keywords, anti-keywords,
 *   and a base priority weight.
 */

import type { IntentEmbedding } from './types';

export const INTENT_EMBEDDINGS: IntentEmbedding[] = [
  {
    intent: 'greeting',
    vectors: [
      'user is saying hello hi hey good morning',
      'casual opening of conversation',
      'introduction or first contact',
    ],
    keywords: ['hello', 'hi', 'hey', 'good morning', 'good evening', 'greetings', 'sup', 'yo'],
    antiKeywords: ['help me', 'fix', 'error', 'write', 'create', 'build'],
    weight: 1.0,
  },
  {
    intent: 'farewell',
    vectors: [
      'user is saying goodbye ending conversation',
      'wrapping up session',
    ],
    keywords: ['bye', 'goodbye', 'see you', 'later', 'done', 'thanks bye', 'gotta go'],
    antiKeywords: ['hello', 'help'],
    weight: 1.0,
  },
  {
    intent: 'gratitude',
    vectors: [
      'user is expressing thanks or appreciation',
      'positive feedback on help received',
    ],
    keywords: ['thanks', 'thank you', 'appreciate', 'helpful', 'great', 'awesome', 'perfect'],
    antiKeywords: ['help me', 'fix', 'error', 'write'],
    weight: 0.9,
  },
  {
    intent: 'general_chat',
    vectors: [
      'general non-technical conversation',
      'casual chat or opinion question',
      'asking about preferences or recommendations',
    ],
    keywords: ['what do you think', 'opinion', 'recommend', 'prefer', 'best way', 'how about'],
    antiKeywords: ['code', 'function', 'error', 'bug', 'file', 'write'],
    weight: 0.6,
  },
  {
    intent: 'code_generation',
    vectors: [
      'user wants to write new code or create a function',
      'building a new feature or component',
      'implementing from scratch',
    ],
    keywords: ['write', 'create', 'build', 'implement', 'generate', 'make', 'develop', 'new function', 'new component'],
    antiKeywords: ['fix', 'error', 'bug', 'explain', 'review', 'refactor'],
    weight: 0.9,
  },
  {
    intent: 'code_debug',
    vectors: [
      'user has an error or bug to fix',
      'something is broken or not working',
      'diagnosing runtime or compile errors',
    ],
    keywords: ['error', 'bug', 'fix', 'broken', 'crash', 'exception', 'failing', 'not working', 'stack trace', 'traceback'],
    antiKeywords: ['write', 'create', 'build', 'new', 'implement'],
    weight: 1.0,
  },
  {
    intent: 'code_review',
    vectors: [
      'user wants code reviewed or audited',
      'looking for improvements or issues in existing code',
    ],
    keywords: ['review', 'audit', 'check', 'improve', 'optimize', 'feedback on', 'look at', 'evaluate'],
    antiKeywords: ['write', 'create', 'fix', 'error', 'bug'],
    weight: 0.8,
  },
  {
    intent: 'architecture_design',
    vectors: [
      'system design or architecture planning',
      'database schema or API design',
      'high-level technical decisions',
    ],
    keywords: ['design', 'architecture', 'schema', 'api design', 'system', 'structure', 'plan', 'blueprint'],
    antiKeywords: ['fix', 'error', 'bug', 'write function'],
    weight: 0.9,
  },
  {
    intent: 'refactor',
    vectors: [
      'improving existing code without changing behavior',
      'cleaning up or restructuring code',
    ],
    keywords: ['refactor', 'clean up', 'restructure', 'simplify', 'optimize', 'improve', 'technical debt'],
    antiKeywords: ['fix', 'error', 'bug', 'write new', 'create'],
    weight: 0.8,
  },
  {
    intent: 'explain_code',
    vectors: [
      'user wants to understand how code works',
      'asking for explanation or documentation',
    ],
    keywords: ['explain', 'how does', 'what does', 'understand', 'describe', 'walk me through', 'what is happening'],
    antiKeywords: ['fix', 'write', 'create', 'build', 'implement'],
    weight: 0.8,
  },
  {
    intent: 'terminal_command',
    vectors: [
      'user wants to run terminal or shell commands',
      'build, deploy, or system operations',
    ],
    keywords: ['run', 'execute', 'terminal', 'shell', 'command', 'npm', 'pip', 'build', 'deploy', 'git'],
    antiKeywords: ['write function', 'create component'],
    weight: 0.9,
  },
  {
    intent: 'file_operation',
    vectors: [
      'user wants to read, write, or modify files',
      'file management operations',
    ],
    keywords: ['file', 'read', 'write', 'modify', 'delete', 'rename', 'move', 'copy', 'open'],
    antiKeywords: ['function', 'component', 'class'],
    weight: 0.7,
  },
  {
    intent: 'web_search',
    vectors: [
      'user needs current or real-time information',
      'searching the web for latest data',
    ],
    keywords: ['search', 'find', 'latest', 'current', 'news', 'recent', 'lookup', 'google'],
    antiKeywords: ['code', 'function', 'write', 'create'],
    weight: 0.8,
  },
  {
    intent: 'codebase_query',
    vectors: [
      'user wants to find or locate something in the codebase',
      'searching for files, functions, or references',
    ],
    keywords: ['find', 'locate', 'where is', 'search for', 'grep', 'find in', 'look for'],
    antiKeywords: ['write', 'create', 'build', 'fix'],
    weight: 0.8,
  },
  {
    intent: 'clarification',
    vectors: [
      'user is asking about a previous response',
      'requesting more details or explanation',
    ],
    keywords: ['what do you mean', 'explain', 'clarify', 'elaborate', 'confused', 'i do not understand'],
    antiKeywords: ['write', 'create', 'fix', 'error'],
    weight: 0.7,
  },
  {
    intent: 'correction',
    vectors: [
      'user is correcting a previous misunderstanding',
      'pointing out an error in prior response',
    ],
    keywords: ['no', 'not', 'actually', 'wait', 'hold on', 'that is wrong', 'incorrect', 'i meant'],
    antiKeywords: ['hello', 'thanks'],
    weight: 0.9,
  },
  {
    intent: 'continuation',
    vectors: [
      'user wants to continue previous response',
      'asking to proceed or keep going',
    ],
    keywords: ['continue', 'go on', 'more', 'keep going', 'and then', 'next', 'what else'],
    antiKeywords: ['hello', 'thanks', 'fix', 'error'],
    weight: 0.8,
  },
  {
    intent: 'data_analysis',
    vectors: [
      'analyzing data, metrics, or statistics',
      'visualization and charting tasks',
    ],
    keywords: ['analyze', 'data', 'metrics', 'chart', 'graph', 'plot', 'visualize', 'statistics', 'trend'],
    antiKeywords: ['fix', 'error', 'bug', 'write component'],
    weight: 0.8,
  },
];
