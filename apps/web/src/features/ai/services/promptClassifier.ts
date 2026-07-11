/**
 * @file src/core/services/promptClassifier.service.ts
 * @description Semantic prompt classifier with embedding similarity,
 *   LLM-as-a-judge fallback, conversation state tracking, and
 *   hardware-aware model routing. Targets Claude/Kimi-level accuracy.
 */

import { detectHardware, HardwareAnalysis } from '@nyx/shared';
import { CODING_KNOWLEDGE_SUMMARY } from '@src/shared/config/codingKnowledge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromptIntent =
  | 'greeting'
  | 'farewell'
  | 'gratitude'
  | 'general_chat'
  | 'code_generation'
  | 'code_debug'
  | 'code_review'
  | 'architecture_design'
  | 'refactor'
  | 'explain_code'
  | 'terminal_command'
  | 'file_operation'
  | 'web_search'
  | 'codebase_query'
  | 'clarification' // "What do you mean by..."
  | 'correction' // "No, I meant..."
  | 'continuation' // "Continue" / "Go on"
  | 'data_analysis'; // "Analyze this data"

export interface PromptAnalysis {
  intent: PromptIntent;
  tone?: string;
  confidence: number;
  detectedLanguages: string[];
  frameworks: string[];
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'enterprise';
  requiresContext: boolean;
  requiresExecution: boolean;
  estimatedTokens: number;
  suggestedModel: 'local' | 'fast' | 'balanced' | 'powerful';
  hardware?: HardwareAnalysis;
  multiIntent?: PromptIntent[]; // Secondary detected intents
  urgency: 'low' | 'normal' | 'high'; // User frustration indicators
  isFollowUp: boolean; // Part of ongoing conversation
  suggestedExecutionReasoning?: string;
}

export interface ConversationState {
  turnCount: number;
  lastIntent: PromptIntent | null;
  lastLanguages: string[];
  lastFrameworks: string[];
  pendingToolCalls: boolean;
  userFrustrationLevel: number; // 0-1, increases with repeated similar prompts
  topicDrift: number; // How much current prompt diverges from history
}

export interface AgentRoute {
  agent: 'chat' | 'architect';
  reasoning: string;
  shouldUseSubagents: boolean;
  systemPrompt: string;
  tools: ToolCapability[];
  modelTier: 'local' | 'fast' | 'balanced' | 'powerful';
  temperature: number;
  maxTokens: number;
}

type ToolCapability =
  | 'web_search'
  | 'terminal'
  | 'file_write'
  | 'file_read'
  | 'image_analysis';

// ---------------------------------------------------------------------------
// Semantic intent embeddings (simplified — replace with actual embeddings in prod)
// These are keyword-anchored semantic descriptions for similarity matching
// ---------------------------------------------------------------------------

interface IntentEmbedding {
  intent: PromptIntent;
  vectors: string[]; // Semantic descriptions / example utterances
  keywords: string[]; // High-signal anchor words
  antiKeywords: string[]; // Words that disqualify this intent
  weight: number; // Base priority (like your INTENT_PRIORITY)
}

const INTENT_EMBEDDINGS: IntentEmbedding[] = [
  {
    intent: 'greeting',
    vectors: [
      'user is saying hello hi hey good morning',
      'casual opening of conversation',
      'acknowledging presence',
    ],
    keywords: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'howdy', 'greetings'],
    antiKeywords: ['code', 'bug', 'error', 'fix', 'write', 'create', 'file', 'function'],
    weight: 1,
  },
  {
    intent: 'farewell',
    vectors: [
      'user is ending conversation saying goodbye bye thanks',
      'closing the chat session',
      'expressing satisfaction and leaving',
    ],
    keywords: ['bye', 'goodbye', 'see you', 'thanks bye', 'that is all', 'done for now'],
    antiKeywords: ['how', 'what', 'why', 'can you', 'write', 'fix'],
    weight: 1,
  },
  {
    intent: 'gratitude',
    vectors: [
      'user is saying thank you thanks appreciate it',
      'acknowledging help received',
      'positive feedback without new request',
    ],
    keywords: ['thank', 'thanks', 'appreciate', 'helpful', 'great', 'awesome', 'perfect'],
    antiKeywords: ['but', 'however', 'except', 'actually', 'wait', 'no'],
    weight: 1,
  },
  {
    intent: 'clarification',
    vectors: [
      'user is asking for clarification about previous response',
      'user did not understand the previous answer',
      'user wants explanation of terms or approach',
    ],
    keywords: ['what do you mean', 'clarify', 'i do not understand', 'confused', 'elaborate'],
    antiKeywords: [],
    weight: 4,
  },
  {
    intent: 'correction',
    vectors: [
      'user is correcting previous misunderstanding',
      'user is redirecting the assistant',
      'user says no that is wrong or not what i meant',
    ],
    keywords: ['no that', 'not what', 'i meant', 'actually', 'wrong', 'incorrect', 'misunderstood'],
    antiKeywords: [],
    weight: 5,
  },
  {
    intent: 'continuation',
    vectors: [
      'user wants assistant to continue previous response',
      'user says go on continue more keep going',
      'response was cut off and user wants rest',
    ],
    keywords: ['continue', 'go on', 'keep going', 'more please', 'finish', 'rest of it'],
    antiKeywords: [],
    weight: 6,
  },
  {
    intent: 'code_generation',
    vectors: [
      'user wants new code written from scratch',
      'create implement build generate a function component api',
      'write me a react component or python script',
      'scaffolding boilerplate new file',
    ],
    keywords: ['write', 'create', 'generate', 'implement', 'build', 'scaffold', 'boilerplate'],
    antiKeywords: ['fix', 'debug', 'error', 'broken', 'why does', 'explain', 'review'],
    weight: 10,
  },
  {
    intent: 'code_debug',
    vectors: [
      'user has broken code that needs fixing',
      'error exception crash bug not working fails',
      'why is this code producing an error',
      'debug troubleshoot diagnose failure',
    ],
    keywords: [
      'fix',
      'debug',
      'error',
      'bug',
      'crash',
      'broken',
      'fails',
      'not working',
      'exception',
      'stack trace',
    ],
    antiKeywords: ['write', 'create', 'generate', 'new', 'from scratch'],
    weight: 9,
  },
  {
    intent: 'refactor',
    vectors: [
      'user wants existing code improved without changing behavior',
      'clean up optimize simplify modernize rewrite',
      'make this code better faster more readable',
      'convert to use newer patterns',
    ],
    keywords: ['refactor', 'rewrite', 'optimize', 'clean up', 'simplify', 'modernize', 'improve'],
    antiKeywords: [],
    weight: 8,
  },
  {
    intent: 'code_review',
    vectors: [
      'user wants feedback on existing code quality',
      'review audit analyze evaluate code implementation',
      'is this good code what do you think',
      'pull request code review feedback',
    ],
    keywords: [
      'review',
      'audit',
      'evaluate',
      'assess',
      'feedback',
      'what do you think',
      'is this good',
    ],
    antiKeywords: ['write', 'create', 'generate'],
    weight: 7,
  },
  {
    intent: 'architecture_design',
    vectors: [
      'user wants high level system design',
      'design architect structure organize plan system',
      'database schema api design microservices',
      'how should i structure this application',
    ],
    keywords: [
      'design',
      'architecture',
      'structure',
      'organize',
      'system design',
      'schema',
      'microservice',
    ],
    antiKeywords: ['fix', 'debug', 'error'],
    weight: 6,
  },
  {
    intent: 'explain_code',
    vectors: [
      'user wants to understand how code works',
      'explain describe walk me through what does this do',
      'how does this function work why does it',
      'line by line explanation',
    ],
    keywords: ['explain', 'how does', 'what does', 'walk me through', 'describe', 'understand'],
    antiKeywords: ['write', 'create', 'fix', 'debug'],
    weight: 5,
  },
  {
    intent: 'terminal_command',
    vectors: [
      'user wants to run execute command in terminal',
      'npm install docker build git commit deploy',
      'shell bash command line instruction',
      'how do i run this start the server',
    ],
    keywords: [
      'run',
      'execute',
      'npm',
      'yarn',
      'docker',
      'git',
      'deploy',
      'build',
      'start',
      'terminal',
    ],
    antiKeywords: ['write code', 'create file', 'function'],
    weight: 4,
  },
  {
    intent: 'file_operation',
    vectors: [
      'user wants to read write modify delete files',
      'create file save export import directory',
      'move rename copy file operations',
    ],
    keywords: ['file', 'files', 'save', 'export', 'import', 'delete', 'move', 'rename'],
    antiKeywords: [],
    weight: 3,
  },
  {
    intent: 'codebase_query',
    vectors: [
      'user is searching navigating existing codebase',
      'find locate where is show me file function',
      'project repository workspace directory search',
      'what files contain this pattern',
    ],
    keywords: [
      'find',
      'where is',
      'locate',
      'show me',
      'search',
      'project',
      'codebase',
      'repository',
    ],
    antiKeywords: ['write', 'create', 'generate'],
    weight: 3,
  },
  {
    intent: 'web_search',
    vectors: [
      'user wants current information from internet',
      'latest news current events what is happening',
      'search google look up find online',
      'information that requires real time data',
    ],
    keywords: ['latest', 'current', 'news', 'search', 'look up', 'google', 'what is the latest'],
    antiKeywords: ['code', 'function', 'bug', 'error', 'file'],
    weight: 2,
  },
  {
    intent: 'general_chat',
    vectors: [
      'general knowledge question not code related',
      'who are you what can you do tell me about',
      'opinion advice non technical discussion',
      'concept explanation without code',
    ],
    keywords: ['who are you', 'what can you do', 'tell me about', 'what is', 'how does', 'explain'],
    antiKeywords: ['code', 'function', 'bug', 'error', 'file', 'component'],
    weight: 1,
  },
  {
    intent: 'data_analysis',
    vectors: [
      'user wants to analyze data summarize calculate metrics',
      'plot graph visualize chart data insights',
      'csv json database export analysis statistics',
    ],
    keywords: ['analyze', 'data', 'metrics', 'plot', 'visualize', 'chart', 'statistics', 'csv'],
    antiKeywords: ['code', 'bug', 'deploy', 'terminal', 'git'],
    weight: 7,
  },
];

// ---------------------------------------------------------------------------
// Language & framework detection (expanded)
// ---------------------------------------------------------------------------

interface TechPattern {
  id: string;
  pattern: RegExp;
  aliases: string[];
  tokenMultiplier: number; // Tokens per line estimate
}

const LANGUAGE_PATTERNS: TechPattern[] = [
  {
    id: 'typescript',
    pattern: /\b(ts|typescript|\.ts\b|\.tsx\b|type\s+\w+\s*=|interface\s+\w+)/i,
    aliases: ['ts', 'tsx'],
    tokenMultiplier: 4,
  },
  {
    id: 'javascript',
    pattern: /\b(js|javascript|\.js\b|\.jsx\b|es6|es202\d|const\s+\w+\s*=)/i,
    aliases: ['js', 'jsx'],
    tokenMultiplier: 3.5,
  },
  {
    id: 'python',
    pattern: /\b(py|python|\.py\b|def\s+\w+\s*\(|import\s+\w+|pip\s+|django|flask|fastapi)/i,
    aliases: ['py'],
    tokenMultiplier: 3,
  },
  {
    id: 'rust',
    pattern: /\b(rust|cargo|\.rs\b|fn\s+\w+\s*\(|impl\s+|use\s+\w+::)/i,
    aliases: ['rs'],
    tokenMultiplier: 4.5,
  },
  {
    id: 'go',
    pattern: /\b(golang|\.go\b|func\s+\w+\s*\(|package\s+\w+|goroutine|channel\s+\w+)/i,
    aliases: ['golang'],
    tokenMultiplier: 4,
  },
  {
    id: 'java',
    pattern: /\b(java|spring|\.java\b|public\s+(?:class|static|void)|import\s+java\.)/i,
    aliases: [],
    tokenMultiplier: 4,
  },
  {
    id: 'cpp',
    pattern: /\b(c\+\+|cpp|\.cpp\b|\.hpp\b|std::|#include\s+<|cmake)/i,
    aliases: ['c++'],
    tokenMultiplier: 4,
  },
  {
    id: 'c',
    pattern: /\b(\.c\b|\.h\b|gcc|clang|#define\s+|malloc\s*\(|printf\s*\()(?!\+\+)/i,
    aliases: [],
    tokenMultiplier: 3.5,
  },
  {
    id: 'csharp',
    pattern: /\b(c#|csharp|\.cs\b|dotnet|\.net\s+core|async\s+Task|var\s+\w+\s*=)/i,
    aliases: ['c#', 'dotnet'],
    tokenMultiplier: 4,
  },
  {
    id: 'ruby',
    pattern: /\b(ruby|rails|\.rb\b|gemfile|def\s+\w+\s*(\||\b)|require\s+['"])/i,
    aliases: ['rb'],
    tokenMultiplier: 3,
  },
  {
    id: 'php',
    pattern: /\b(php|laravel|\.php\b|\$[a-zA-Z_]\w*\s*=|echo\s+|composer\s+)/i,
    aliases: [],
    tokenMultiplier: 3.5,
  },
  {
    id: 'swift',
    pattern: /\b(swift|\.swift\b|@objc|var\s+\w+\s*:|func\s+\w+\s*\(|UIKit|SwiftUI)/i,
    aliases: [],
    tokenMultiplier: 4,
  },
  {
    id: 'kotlin',
    pattern: /\b(kotlin|\.kt\b|@Composable|suspend\s+fun|val\s+\w+\s*:|androidx)/i,
    aliases: ['kt'],
    tokenMultiplier: 4,
  },
  {
    id: 'sql',
    pattern: /\b(sql|postgres|mysql|sqlite|select\s+.*\s+from|insert\s+into|create\s+table)/i,
    aliases: [],
    tokenMultiplier: 3,
  },
  {
    id: 'bash',
    pattern: /\b(bash|shell|sh|zsh|\.sh\b|#!\/bin\/bash|chmod|grep\s+|awk\s+|sed\s+)/i,
    aliases: ['shell'],
    tokenMultiplier: 2.5,
  },
  {
    id: 'docker',
    pattern: /\b(docker|dockerfile|container|kubernetes|k8s|helm|FROM\s+\w+|RUN\s+)/i,
    aliases: ['k8s'],
    tokenMultiplier: 3,
  },
  {
    id: 'html',
    pattern: /\b(html|\.html\b|<!DOCTYPE\s+|<div\s+|class=|id=)/i,
    aliases: [],
    tokenMultiplier: 3,
  },
  {
    id: 'css',
    pattern: /\b(css|\.css\b|tailwind|@media\s+|@keyframes|\.[a-z-]+\s*\{)/i,
    aliases: [],
    tokenMultiplier: 3,
  },
  {
    id: 'markdown',
    pattern: /\b(markdown|\.md\b|#+\s+\w+|```\w*|>\s+\w+)/i,
    aliases: ['md'],
    tokenMultiplier: 2,
  },
  { id: 'json', pattern: /\b(json|\.json\b|"[\w-]+"\s*:\s*)/i, aliases: [], tokenMultiplier: 2.5 },
  {
    id: 'yaml',
    pattern: /\b(yaml|yml|\.yml\b|\.yaml\b|\w+:\s*\w+\n)/i,
    aliases: ['yml'],
    tokenMultiplier: 2.5,
  },
];

const FRAMEWORK_PATTERNS: TechPattern[] = [
  {
    id: 'react',
    pattern: /\b(react|jsx|tsx|usestate|useeffect|usecallback|memo|forwardref|next\.js|nextjs)/i,
    aliases: [],
    tokenMultiplier: 0,
  },
  {
    id: 'vue',
    pattern: /\b(vue|nuxt|\.vue\b|v-model|v-if|v-for|composition\s+api|pinia)/i,
    aliases: [],
    tokenMultiplier: 0,
  },
  {
    id: 'angular',
    pattern: /\b(angular|rxjs|@angular|ng-module|ng-component|ng-service)/i,
    aliases: [],
    tokenMultiplier: 0,
  },
  {
    id: 'svelte',
    pattern: /\b(svelte|sveltekit|\.svelte\b|\{#if|\{#each)/i,
    aliases: [],
    tokenMultiplier: 0,
  },
  {
    id: 'express',
    pattern: /\b(express|middleware|req\.|res\.|router\.|app\.(get|post|put|delete))/i,
    aliases: [],
    tokenMultiplier: 0,
  },
  {
    id: 'nextjs',
    pattern: /\b(next\.js|nextjs|app\s+router|pages\s+router|getserversideprops|getstaticprops)/i,
    aliases: [],
    tokenMultiplier: 0,
  },
  {
    id: 'tailwind',
    pattern: /\b(tailwind|tailwindcss|tw-|className=|bg-|text-|p-|m-)/i,
    aliases: [],
    tokenMultiplier: 0,
  },
  {
    id: 'prisma',
    pattern: /\b(prisma|schema\.prisma|@prisma|prisma\.|db\.[a-z]+\.)/i,
    aliases: [],
    tokenMultiplier: 0,
  },
  {
    id: 'drizzle',
    pattern: /\b(drizzle|drizzle-orm|db\.select|db\.insert|eq\(\))/i,
    aliases: [],
    tokenMultiplier: 0,
  },
  {
    id: 'trpc',
    pattern: /\b(trpc|router\.|procedure\.|query\(\)|mutation\(\))/i,
    aliases: [],
    tokenMultiplier: 0,
  },
  {
    id: 'zod',
    pattern: /\b(zod|z\.|zod\.|schema\.parse|safeParse)/i,
    aliases: [],
    tokenMultiplier: 0,
  },
  {
    id: 'shadcn',
    pattern: /\b(shadcn|shadcn-ui|@shadcn|npx\s+shadcn)/i,
    aliases: [],
    tokenMultiplier: 0,
  },
  {
    id: 'astro',
    pattern: /\b(astro|\.astro\b|frontmatter|---\s*\n)/i,
    aliases: [],
    tokenMultiplier: 0,
  },
];

// ---------------------------------------------------------------------------
// Urgency detection
// ---------------------------------------------------------------------------

function detectUrgency(prompt: string): PromptAnalysis['urgency'] {
  const urgentPatterns = [
    /\b(urgent|asap|immediately|deadline|production|down|broken|critical|emergency|help)\b/i,
    /\b(stuck|blocked|cannot|can't|won't|doesn't work|not working at all)\b/i,
    /\b(!{2,}|ALL CAPS|screaming)\b/,
  ];
  const highCount = urgentPatterns.filter((r) => r.test(prompt)).length;
  if (highCount >= 2) return 'high';
  if (highCount === 1) return 'normal';
  return 'low';
}

// ---------------------------------------------------------------------------
// Token estimation (accurate for code)
// ---------------------------------------------------------------------------

function estimateTokens(prompt: string, languages: string[]): number {
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
  const proseTokens = proseWords * 1.3; // Better than 1.5 for English

  return Math.ceil(codeTokens + proseTokens + prompt.length * 0.1); // Symbol overhead
}

// ---------------------------------------------------------------------------
// Semantic similarity scoring (simplified — use real embeddings in production)
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

// Simple bag-of-words vectorizer for demo — replace with sentence-transformers
function textToVector(text: string): number[] {
  const words = text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);
  const vocab = Array.from(
    new Set(
      INTENT_EMBEDDINGS.flatMap((e) =>
        e.vectors
          .join(' ')
          .split(/\W+/)
          .filter((w) => w.length > 2)
      )
    )
  );
  return vocab.map((word) => words.filter((w) => w === word).length);
}

function computeSemanticScore(prompt: string, embedding: IntentEmbedding): number {
  const promptVec = textToVector(prompt);
  let maxScore = 0;

  for (const vector of embedding.vectors) {
    const vec = textToVector(vector);
    const sim = cosineSimilarity(promptVec, vec);
    maxScore = Math.max(maxScore, sim);
  }

  // Keyword boost
  const keywordHits = embedding.keywords.filter((kw) =>
    new RegExp(`\\b${kw}\\b`, 'i').test(prompt)
  ).length;
  const keywordBoost = Math.min(keywordHits * 0.15, 0.4);

  // Anti-keyword penalty
  const antiHits = embedding.antiKeywords.filter((kw) =>
    new RegExp(`\\b${kw}\\b`, 'i').test(prompt)
  ).length;
  const antiPenalty = Math.min(antiHits * 0.2, 0.5);

  return Math.max(0, maxScore + keywordBoost - antiPenalty);
}

// ---------------------------------------------------------------------------
// Core classifier
// ---------------------------------------------------------------------------

export function analyzePrompt(
  prompt: string,
  conversationState?: ConversationState
): PromptAnalysis {
  const lower = prompt.toLowerCase();

  // --- Semantic intent detection ---
  const scores: Array<{ intent: PromptIntent; score: number; weight: number }> = [];

  for (const embedding of INTENT_EMBEDDINGS) {
    const semanticScore = computeSemanticScore(prompt, embedding);
    scores.push({
      intent: embedding.intent,
      score: semanticScore,
      weight: embedding.weight,
    });
  }

  // Sort by weighted score
  scores.sort((a, b) => b.score * b.weight - a.score * a.weight);

  let bestIntent = scores[0].intent;
  let bestScore = scores[0].score;

  // Multi-intent detection (score within 20% of top)
  const multiIntent = scores
    .filter((s) => s.intent !== bestIntent && s.score > bestScore * 0.2 && s.score > 0.1)
    .map((s) => s.intent);

  // Conversation context overrides
  const isFollowUp = !!conversationState && conversationState.turnCount > 0;

  if (isFollowUp && conversationState) {
    // Continuation detection
    if (prompt.length < 20 && /^(continue|go on|more|and\?|then\?|keep going)/i.test(prompt)) {
      bestIntent = 'continuation';
      bestScore = 1;
    }

    // Correction detection
    if (/^(no|not|actually|wait|hold on|that is wrong|incorrect)/i.test(prompt)) {
      bestIntent = 'correction';
      bestScore = 1;
    }

    // Clarification
    if (/^(what do you mean|i do not understand|confused|elaborate|explain that)/i.test(prompt)) {
      bestIntent = 'clarification';
      bestScore = 1;
    }

    // Topic drift detection — if current intent diverges from last, boost confidence
    if (bestIntent !== conversationState.lastIntent) {
      const drift = computeSemanticScore(
        prompt,
        INTENT_EMBEDDINGS.find((e) => e.intent === conversationState.lastIntent) ||
          INTENT_EMBEDDINGS[0]
      );
      if (drift < 0.1) {
        // Strong drift — user changed topic completely
        bestScore = Math.min(1, bestScore + 0.1);
      }
    }
  }

  // Code block override (only if no stronger signal)
  if (/```\w*/.test(prompt)) {
    const codeGenScore = scores.find((s) => s.intent === 'code_generation')?.score || 0;
    const explainScore = scores.find((s) => s.intent === 'explain_code')?.score || 0;
    const debugScore = scores.find((s) => s.intent === 'code_debug')?.score || 0;

    // Only force code_generation if no other code intent is stronger
    if (codeGenScore > explainScore && codeGenScore > debugScore && bestScore < 0.5) {
      bestIntent = 'code_generation';
      bestScore = Math.max(bestScore, 0.6);
    }
  }

  // File path detection
  const hasFilePath =
    /\b\w+\.(ts|tsx|js|jsx|py|rs|go|java|cpp|c|cs|rb|php|swift|kt|sql|json|md|yml|yaml|html|css|scss)\b/.test(
      prompt
    );
  if (hasFilePath && bestScore < 0.4) {
    bestIntent = 'codebase_query';
    bestScore = Math.max(bestScore, 0.5);
  }

  const confidence = Math.min(1, bestScore * 2 + 0.15); // Calibrate to 0-1

  // --- Language & framework detection ---
  const detectedLanguages = LANGUAGE_PATTERNS.filter((p) => p.pattern.test(prompt)).map(
    (p) => p.id
  );

  const frameworks = FRAMEWORK_PATTERNS.filter((p) => p.pattern.test(prompt)).map((p) => p.id);

  // --- Complexity analysis ---
  const codeLines = (prompt.match(/\n/g) || []).length;
  const codeBlocks = (prompt.match(/```/g) || []).length / 2;
  const hasMultipleFiles = prompt.includes('=== FILE:') || codeBlocks > 1;
  const words = prompt.split(/\s+/).length;
  const uniqueTokens = new Set(prompt.toLowerCase().split(/\W+/)).size;
  const lexicalDensity = uniqueTokens / words; // Higher = more complex vocabulary

  let complexity: PromptAnalysis['complexity'] = 'simple';

  if (words > 300 || codeLines > 100 || hasMultipleFiles || lexicalDensity > 0.7) {
    complexity = 'enterprise';
  } else if (words > 150 || codeLines > 40 || codeBlocks > 2) {
    complexity = 'complex';
  } else if (words > 60 || codeLines > 15 || lexicalDensity > 0.55) {
    complexity = 'moderate';
  } else if (words < 8 && !hasFilePath) {
    complexity = 'trivial';
  }

  // --- Context & execution needs ---
  const contextIntents: PromptIntent[] = [
    'code_debug',
    'code_review',
    'explain_code',
    'refactor',
    'architecture_design',
    'codebase_query',
    'file_operation',
  ];
  const requiresContext = contextIntents.includes(bestIntent) || hasFilePath;

  const executionIntents: PromptIntent[] = [
    'terminal_command',
    'file_operation',
    'code_generation',
  ];
  const requiresExecution = executionIntents.includes(bestIntent) && complexity !== 'trivial';

  // Hardware analysis
  const hardware = detectHardware(prompt);

  // --- Model tier suggestion ---
  let suggestedModel: PromptAnalysis['suggestedModel'] = 'local'; // Default to local for speed/privacy

  if (complexity === 'enterprise' || bestIntent === 'architecture_design') {
    suggestedModel = 'powerful';
  } else if (complexity === 'complex' || (requiresContext && complexity === 'moderate') || requiresExecution) {
    suggestedModel = 'balanced';
  } else if (!hardware.detectedComponents.some(c => c.toLowerCase().includes('gpu'))) {
    // Fallback to fast cloud model if local GPU is unavailable and task is simple
    suggestedModel = 'fast';
  }

  // Urgency boost — urgent bugs get powerful model
  const urgency = detectUrgency(prompt);
  if (urgency === 'high' && bestIntent === 'code_debug') {
    suggestedModel = 'powerful';
  }

  let suggestedExecutionReasoning = 'Standard conversational request. Using single selected model.';
  
  if (complexity === 'enterprise' || complexity === 'complex') {
    suggestedExecutionReasoning = 'Highly complex task. Routing to ensemble synthesis to combine capabilities of multiple models.';
  }

  return {
    intent: bestIntent,
    confidence,
    detectedLanguages,
    frameworks,
    complexity,
    requiresContext,
    requiresExecution,
    estimatedTokens: estimateTokens(prompt, detectedLanguages),
    suggestedModel,
    hardware,
    multiIntent: multiIntent.length ? multiIntent : undefined,
    urgency,
    isFollowUp,
    suggestedExecutionReasoning,
  };
}

// ---------------------------------------------------------------------------
// Conversation state manager
// ---------------------------------------------------------------------------

export function createConversationState(): ConversationState {
  return {
    turnCount: 0,
    lastIntent: null,
    lastLanguages: [],
    lastFrameworks: [],
    pendingToolCalls: false,
    userFrustrationLevel: 0,
    topicDrift: 0,
  };
}

export function updateConversationState(
  state: ConversationState,
  analysis: PromptAnalysis
): ConversationState {
  // Detect repeated similar prompts (frustration indicator)
  if (analysis.intent === state.lastIntent) {
    state.userFrustrationLevel = Math.min(1, state.userFrustrationLevel + 0.2);
  } else {
    state.userFrustrationLevel = Math.max(0, state.userFrustrationLevel - 0.1);
  }

  state.topicDrift = state.lastIntent === analysis.intent ? 0 : 0.5;
  state.lastIntent = analysis.intent;
  state.lastLanguages = analysis.detectedLanguages;
  state.lastFrameworks = analysis.frameworks;
  state.turnCount++;

  return state;
}

// ---------------------------------------------------------------------------
// Agent routing (decoupled from prompts)
// ---------------------------------------------------------------------------

export function routeToAgent(analysis: PromptAnalysis, state?: ConversationState): AgentRoute {
  // Conversation management intents
  if (analysis.intent === 'greeting') {
    return {
      agent: 'chat',
      reasoning: 'Simple greeting — minimal context needed',
      shouldUseSubagents: false,
      systemPrompt: SYSTEM_PROMPTS.chat,
      tools: [],
      modelTier: 'fast',
      temperature: 0.7,
      maxTokens: 256,
    };
  }

  if (analysis.intent === 'farewell' || analysis.intent === 'gratitude') {
    return {
      agent: 'chat',
      reasoning: 'Conversation closing — warm response',
      shouldUseSubagents: false,
      systemPrompt: SYSTEM_PROMPTS.chat,
      tools: [],
      modelTier: 'fast',
      temperature: 0.8,
      maxTokens: 128,
    };
  }

  if (analysis.intent === 'continuation' && state?.lastIntent) {
    return {
      agent: 'chat',
      reasoning: `Continuing previous ${state.lastIntent} task`,
      shouldUseSubagents: false,
      systemPrompt: SYSTEM_PROMPTS.chat,
      tools: [],
      modelTier: analysis.suggestedModel,
      temperature: 0.3, // Lower temp for consistency in continuation
      maxTokens: 4096,
    };
  }

  if (analysis.intent === 'correction') {
    return {
      agent: 'chat',
      reasoning: 'Matches coding or development tasks',
      shouldUseSubagents: false,
      systemPrompt: SYSTEM_PROMPTS.chat,
      tools:
        state?.lastIntent &&
        ['code_debug', 'code_generation', 'refactor'].includes(state.lastIntent)
          ? ['file_read']
          : [],
      modelTier: analysis.suggestedModel,
      temperature: 0.4,
      maxTokens: 4096,
    };
  }

  if (analysis.intent === 'clarification') {
    return {
      agent: 'chat',
      reasoning: 'User needs explanation of previous response',
      shouldUseSubagents: false,
      systemPrompt: SYSTEM_PROMPTS.chat,
      tools: [],
      modelTier: 'fast',
      temperature: 0.6,
      maxTokens: 1024,
    };
  }

  // Data Analysis
  if (analysis.intent === 'data_analysis') {
    return {
      agent: 'chat',
      reasoning: 'Data analysis and visualization task',
      shouldUseSubagents: false,
      systemPrompt: SYSTEM_PROMPTS.analyst,
      tools: ['web_search'], // Allow fetching current data if needed
      modelTier: 'powerful', // Complex logic requires powerful model
      temperature: 0.2, // Low temp for accurate statistics
      maxTokens: 4096,
    };
  }

  // Code Generation & Refactoring (Coding Agent)
  if (analysis.intent === 'code_generation' || analysis.intent === 'refactor') {
    return {
      agent: 'chat',
      reasoning: 'Code generation/refactoring requires chat persona',
      shouldUseSubagents: false,
      systemPrompt: SYSTEM_PROMPTS.chat,
      tools: ['file_write', 'file_read', 'terminal'],
      modelTier: 'powerful',
      temperature: 0.2,
      maxTokens: 8192,
    };
  }

  // General chat routing
  if (analysis.intent === 'general_chat' && analysis.complexity === 'trivial') {
    return {
      agent: 'chat',
      reasoning: 'General knowledge question, no code involved',
      shouldUseSubagents: false,
      systemPrompt: SYSTEM_PROMPTS.chat,
      tools: analysis.confidence < 0.5 ? ['web_search'] : [],
      modelTier: 'fast',
      temperature: 0.7,
      maxTokens: 1024,
    };
  }

  // Code-related routing
  const tools: ToolCapability[] = [];
  if (analysis.requiresContext) tools.push('file_read');
  if (analysis.requiresExecution) tools.push('terminal', 'file_write');
  if (analysis.complexity === 'enterprise' || analysis.confidence < 0.6) tools.push('web_search');
  if (analysis.detectedLanguages.includes('typescript') && analysis.frameworks.includes('react')) {
    tools.push('image_analysis'); // For UI generation
  }

  // Subagent swarm trigger: Activate for highly complex or multi-step tasks
  const shouldUseSubagents =
    analysis.complexity === 'enterprise' ||
    (analysis.complexity === 'complex' && analysis.requiresExecution) ||
    analysis.intent === 'architecture_design' ||
    (analysis.multiIntent && analysis.multiIntent.length > 1);

  // Temperature tuning based on intent
  const temperature =
    analysis.intent === 'code_debug'
      ? 0.1
      : analysis.intent === 'architecture_design'
        ? 0.6
        : 0.3;

  // Max tokens based on complexity
  const maxTokens =
    analysis.complexity === 'enterprise'
      ? 8192
      : analysis.complexity === 'complex'
        ? 4096
        : analysis.complexity === 'moderate'
          ? 2048
          : 1024;

  return {
    agent: 'chat',
    reasoning: 'Fallback to chat for unclassified queries',
    shouldUseSubagents: !!shouldUseSubagents,
    systemPrompt: SYSTEM_PROMPTS.chat,
    tools,
    modelTier: analysis.suggestedModel,
    temperature,
    maxTokens,
  };
}

// ---------------------------------------------------------------------------
// System prompts (extracted to config — not inline)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPTS = {
  chat: `You are NYX, a powerful and friendly chatbot developed by Yashas. You use local models and free cloud models for response generation.

PERSONALITY:
- Warm, direct, and conversational — match the user's tone
- Never use canned intros like "Hello. I am NYX." — vary naturally
- For greetings: respond like a colleague ("Hey! What's up?" / "Morning! How can I help?")
- For general questions: answer directly, expand only when depth is needed

CONVERSATION MEMORY:
- Reference earlier context naturally
- Track user frustration — if they seem stuck, offer proactive suggestions

RULES:
- No emojis in technical content
- Never say "As an AI language model..."`,

  coder: `You are NYX, a powerful and friendly chatbot developed by Yashas that uses local models and free cloud models for response generation. While you are a chatbot, you are currently assisting the user with coding tasks.

${CODING_KNOWLEDGE_SUMMARY}

OUTPUT:
- Natural, professional, and friendly chatbot manner
- Provide complete, working code without placeholders when requested
- Simple queries get direct answers — no over-engineering
- Complex tasks get structured plans before implementation`,

  architect: `You are NYX Architect. Before writing ANY code:

1. REQUIREMENTS ANALYSIS:
   - Identify explicit and implicit requirements
   - List edge cases and constraints
   - Define success criteria

2. DESIGN PHASE:
   - File structure and component hierarchy
   - Data flow and state management
   - API contracts and types
   - Error handling strategy
   - Performance budget

3. IMPLEMENTATION PLAN:
   - Order of operations (dependencies first)
   - Testing strategy
   - Deployment considerations

Output your analysis as structured markdown, then implement exactly to the plan.`,

  analyst: `You are NYX, a powerful chatbot developed by Yashas that uses local and free cloud models, currently specializing in Data Analysis and Visualization.

YOUR GOAL: Provide clear, accurate, and actionable insights from data.

PROTOCOLS:
1. When asked to analyze data, always outline your methodology first.
2. If writing code for analysis, ensure it is robust and well-commented.
3. For visualizations, recommend the most appropriate chart type.
4. Do NOT hallucinate data.`,
};

// ---------------------------------------------------------------------------
// LLM fallback for low-confidence classifications
// ---------------------------------------------------------------------------

const LLM_CLASSIFIER_PROMPT = `You are a prompt intent classifier. Analyze the user's message and classify it into EXACTLY ONE category.

Categories:
- greeting: saying hello/hi/hey
- farewell: saying goodbye/thanks/done
- gratitude: thanking without new request
- general_chat: non-technical question or conversation
- code_generation: write/create/build new code
- code_debug: fix error/bug/crash
- code_review: review/audit existing code
- architecture_design: system design, database schema, API design
- refactor: improve existing code without changing behavior
- explain_code: understand how code works
- terminal_command: run commands, build, deploy
- file_operation: read/write/modify files
- web_search: current events, latest news, real-time info
- codebase_query: find/locate/search in existing project
- clarification: asking about previous response
- correction: correcting previous misunderstanding
- continuation: asking to continue previous response
- data_analysis: analyze data, metrics, plot, visualize

Respond ONLY with a JSON object:
{"intent": "category_name", "confidence": 0.0-1.0, "reasoning": "brief explanation"}`;

export async function classifyWithLLM(
  prompt: string,
  llmExecutor: (prompt: string, system: string) => Promise<string>
): Promise<{ intent: PromptIntent; confidence: number }> {
  try {
    const response = await llmExecutor(prompt, LLM_CLASSIFIER_PROMPT);
    const parsed = JSON.parse(response);
    return {
      intent: parsed.intent as PromptIntent,
      confidence: parsed.confidence,
    };
  } catch {
    return { intent: 'general_chat', confidence: 0.3 };
  }
}

// ---------------------------------------------------------------------------
// Unified entry point with fallback
// ---------------------------------------------------------------------------

export async function classifyPrompt(
  prompt: string,
  conversationState?: ConversationState,
  llmExecutor?: (prompt: string, system: string) => Promise<string>
): Promise<{ analysis: PromptAnalysis; route: AgentRoute }> {
  const analysis = analyzePrompt(prompt, conversationState);

  // Low confidence fallback to LLM
  if (analysis.confidence < 0.4 && llmExecutor) {
    const llmResult = await classifyWithLLM(prompt, llmExecutor);
    if (llmResult.confidence > analysis.confidence) {
      analysis.intent = llmResult.intent;
      analysis.confidence = llmResult.confidence;
    }
  }

  const route = routeToAgent(analysis, conversationState);
  return { analysis, route };
}

// Re-export for backward compatibility
export { detectHardware };
export type { HardwareAnalysis };
