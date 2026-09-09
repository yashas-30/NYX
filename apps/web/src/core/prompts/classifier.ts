/**
 * classifier.ts
 *
 * Deterministic, grammar-aware prompt intent classification,
 * multi-pattern disambiguation, and safety level detection.
 */

import { ChatContext, PromptCategory, SafetyLevel } from './types';

// -----------------------------------------------------------------------------
// Intent Detection Regex Matrices
// -----------------------------------------------------------------------------

const DIAGRAM_PATTERNS = [
  /\b(?:diagram-design|diagram|flowchart|sequence\s*diagram|architecture\s*diagram|er\s*diagram|entity\s*relationship|class\s*diagram|state\s*machine|state\s*diagram|mindmap|c4\s*diagram|c4\s*model|c4\s*context|c4\s*container|gantt\s*chart|network\s*topology|system\s*topology|gitgraph|pie\s*chart|piechart|donut\s*chart|bar\s*chart|bar\s*graph|line\s*chart|line\s*graph|scatter\s*plot|bubble\s*chart|polar\s*chart|radar\s*chart|spider\s*chart|treemap|slopegraph|ridgeline|histogram)\b/i,
  /\b(?:diagram|visualize|flow\s*chart|schema\s*diagram|data\s*flow|sankey|fishbone|wardley\s*map|kanban|user\s*journey|deployment\s*diagram|dependency\s*graph|uml\s*class|story\s*map|db\s*schema|database\s*schema|flywheel|loop\s*diagram|medallion\s*architecture|quadrant\s*chart|radar\s*chart|spider\s*chart|polar\s*chart|swimlane|layer\s*stack|venn\s*diagram|pyramid\s*chart|treemap|it\s*state|dp\s*integration|security\s*matrix|graph|graphs|chart|charts|plot|plots)\b/i,
  /(?:draw|generate|build|create|show|design|model|plot|render|visualize|make)\s+(?:an?\s+)?(?:diagram|flowchart|architecture\s+map|schema|topology|workflow\s+chart|sankey|flywheel|wardley|journey\s*map|medallion|graph|chart|pie\s*chart|piechart|donut\s*chart|bar\s*chart|bar\s*graph|line\s*chart|line\s*graph|scatter\s*plot|radar\s*chart|spider\s*chart|polar\s*chart|gantt|treemap|plot)\b/i,
];

const WEBSEARCH_PATTERNS = [
  /\b(?:search\s+(?:the\s+)?(?:web|internet|google|online)|look\s*up\s+online|latest\s+news|recent\s+events|(?:current|latest|today'?s)\s+(?:stock\s+)?price|today'?s\s+news|what\s+happened\s+today|real[- ]time|breaking\s+news|live\s+updates?)\b/i,
  /\b(?:who\s+is\s+the\s+current|what\s+is\s+the\s+latest\s+version\s+of|weather\s+in|stock\s+ticker|market\s+cap\s+today)\b/i,
];

const CODE_PATTERNS = [
  /\b(?:write\s+code|implement|refactor|debug|fix\s+bug|stack\s*trace|typeerror|syntaxerror|referenceerror|typescript|rust|javascript|python|golang|rustc|sql|regex|component|endpoint|graphql|dockerfile|test\s+suite|function|class\s+\w+|async\s+fn|unit\s+test|api\s+route|react\s+hook)\b/i,
  /(?:fix|write|create|modify|review|optimize|program|develop)\s+(?:this|the|a|an)?\s*(?:code|function|script|hook|service|algo|algorithm|query|handler|middleware|component|app|application|program)\b/i,
  /\b(?:(?:want|need|give\s+me|generate|make|build|write|create)\s+(?:a\s+|some\s+)?code|code\s+(?:for|an?|to|in|me))\b/i,
  /\b(?:code|program|build|create|make|develop|write|implement|generate)\s+(?:me\s+)?(?:an?\s+)?(?:\w+\s+)?(?:application|app|game|calculator|calculater|counter|timer|tool|widget|script|program|ui|component|website|page|server|api|crawler|bot|solver|dashboard|view|system|editor|simulator|list|form)\b/i,
  /\b(?:code|program|script)\s+(?:me\s+)?(?:an?|the|some)?\s*[a-z0-9_-]+/i,
  /\b(?:how\s+to\s+code|help\s+me\s+code|can\s+you\s+code|please\s+code|code\s+(?:a|an|the|me|for|in|using|with))\b/i,
  /\b(?:write|create|build|make|implement|code)\s+(?:an?\s+)?(?:[a-z0-9_-]+\s+)*(?:in|using|with)\s+(?:html|css|javascript|typescript|js|ts|python|rust|golang|go|react|vue|svelte|node|c\+\+|cpp|java)\b/i,
  /(?:fix|modify|update|edit|change|patch|improve|enhance|add\s+to|redo)\s+(?:the|this|my|previous|existing|\s+)*(?:code|app|application|game|calculator|calculater|script|component|function|feature|button|styling|ui|bug|logic)/i,
  /(?:fix|update|edit|modify)\s+(?:the\s+)?previous\s+(?:response|code|version)/i,
  /\b(?:in|to)\s+(?:the|this|my|previous|\s+)*code\b/i,
  /\b(?:add|change|fix|update|integrate)\s+[\w\s]+\s+(?:in|to)\s+(?:the|this|my|previous|\s+)*code\b/i,
];

// -----------------------------------------------------------------------------
// Classifier Helpers
// -----------------------------------------------------------------------------

export function isDiagramPrompt(prompt?: string): boolean {
  if (!prompt) return false;
  const p = prompt.toLowerCase().trim();
  return (
    DIAGRAM_PATTERNS[0].test(p) ||
    DIAGRAM_PATTERNS[2].test(p) ||
    (DIAGRAM_PATTERNS[1].test(p) &&
      /(?:draw|create|generate|make|build|show|model|design|plot|render|visualize)\b/i.test(p))
  );
}

export function isWebSearchPrompt(
  prompt?: string,
  context?: ChatContext,
  webSearchResults?: string
): boolean {
  if (!!webSearchResults?.trim() || !!context?.hasWebSearch) return true;
  if (!prompt) return false;
  const p = prompt.toLowerCase().trim();
  return WEBSEARCH_PATTERNS.some((pat) => pat.test(p));
}

export function isCodePrompt(prompt?: string, hasPreviousCode?: boolean): boolean {
  if (!prompt) return false;
  const p = prompt.toLowerCase().trim();
  // A proper code fence block (```) in the prompt signals code intent
  if (p.includes('```')) return true;
  // Direct fix / repair commands
  if (/^(?:fix|debug|patch|update|solve|repair)\s+(?:it|this|that|code|bug|error)$/i.test(p))
    return true;
  // If the previous response contained code and the user asks to modify/fix/add something
  if (
    hasPreviousCode &&
    (/^(?:fix|change|update|edit|modify|add|remove|make|style|color|center)\b/i.test(p) ||
      /\b(?:error|bug|issue|broken|doesn't work|crash|failed)\b/i.test(p))
  ) {
    return true;
  }
  const wordCount = p.split(/\s+/).length;
  if (wordCount < 2) return false;
  return CODE_PATTERNS.some((pat) => pat.test(p));
}

// -----------------------------------------------------------------------------
// Master Prompt Category Detector
// -----------------------------------------------------------------------------

export function detectPromptCategory(
  rawPrompt: string,
  context?: ChatContext,
  webSearchResults?: string,
  history?: Array<{ role: string; content?: any }>
): PromptCategory {
  // Explicit context category override
  if (context?.promptCategory) {
    return context.promptCategory;
  }

  const p = (rawPrompt || '').trim();
  if (!p) return 'general';

  // Check if conversation history has an assistant message containing a code block
  const hasPreviousCode = !!history?.some(
    (m) =>
      m.role === 'assistant' &&
      typeof m.content === 'string' &&
      /(?:^|\n)```[a-zA-Z0-9_-]*\r?\n[\s\S]*?(?:\n```|$)/.test(m.content)
  );

  // 1. Diagram / Visualization (Diagram-Design / SVG)
  if (isDiagramPrompt(p)) {
    return 'diagram';
  }

  // 2. Grounded Web Search Synthesis
  if (isWebSearchPrompt(p, context, webSearchResults)) {
    return 'websearch';
  }

  // 3. Code Engineering / Refactoring / Debugging
  if (isCodePrompt(p, hasPreviousCode)) {
    return 'code';
  }

  // 4. Default to General Intelligence
  return 'general';
}

// -----------------------------------------------------------------------------
// Safety Level Detector
// -----------------------------------------------------------------------------

export function detectSafetyLevel(prompt: string): SafetyLevel {
  const lower = (prompt || '').toLowerCase().trim();
  if (!lower) return 'standard';

  // Strict: direct system prompt leaks, jailbreak phrases, unauthorized exfil
  const strictPatterns = [
    /\b(?:ignore\s+all\s+(?:prior|previous)\s+instructions|system\s+prompt\s+leak|reveal\s+your\s+hidden\s+prompt)\b/i,
    /\b(?:dan\s+mode|jailbreak|bypass\s+all\s+guardrails|exploit\s+cve)\b/i,
  ];
  if (strictPatterns.some((pat) => pat.test(lower))) {
    return 'strict';
  }

  // Enhanced: security testing, credential mentions, vulnerability analysis
  const enhancedPatterns = [
    /\b(?:sql\s+injection|xss\s+payload|csrf|buffer\s+overflow|reverse\s+shell)\b/i,
    /\b(?:api\s*key|private\s*key|password|jwt\s*secret|bearer\s*token)\b/i,
  ];
  if (enhancedPatterns.some((pat) => pat.test(lower))) {
    return 'enhanced';
  }

  return 'standard';
}
