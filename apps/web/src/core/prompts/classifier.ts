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

const PRESENTATION_PATTERNS = [
  /\b(?:ppt|presentation|powerpoint|slides|slide\s*deck|pitch\s*deck|slidev)\b/i,
  /(?:slide|deck)\b/i,
  /(?:create|make|build|generate|give|show|prepare|design)\s+(?:an?\s+)?(?:\d+\s+[- ]?slides?|presentation|slide\s*deck|pitch\s*deck|ppt)\b/i,
];

const DIAGRAM_PATTERNS = [
  /\b(?:mermaid|flowchart|sequence\s*diagram|architecture\s*diagram|er\s*diagram|entity\s*relationship|class\s*diagram|state\s*machine|state\s*diagram|mindmap|c4\s*diagram|c4\s*model|c4\s*context|c4\s*container|gantt\s*chart|network\s*topology|system\s*topology|gitgraph)\b/i,
  /\b(?:diagram|visualize|flow\s*chart|schema\s*diagram|data\s*flow|sankey|fishbone|wardley\s*map|kanban|user\s*journey|deployment\s*diagram|dependency\s*graph|uml\s*class|story\s*map|db\s*schema|database\s*schema|flywheel|loop\s*diagram|medallion\s*architecture|quadrant\s*chart|radar\s*chart|spider\s*chart|polar\s*chart|swimlane|layer\s*stack|venn\s*diagram|pyramid\s*chart|treemap|it\s*state|dp\s*integration|security\s*matrix)\b/i,
  /(?:draw|generate|build|create|show|design|model)\s+(?:an?\s+)?(?:diagram|flowchart|architecture\s+map|schema|topology|workflow\s+chart|sankey|flywheel|wardley|journey\s*map|medallion)\b/i,
];

const RESEARCH_PATTERNS = [
  /\b(?:deep\s*research|deep\s*dive|in-depth\s*analysis|research\s*report|whitepaper|literature\s*review|comprehensive\s*study|compare\s*architectures|state\s*of\s*the\s*art|exhaustive\s*survey|trade[- ]off\s*matrix|rfc\s*analysis|academic\s*paper)\b/i,
  /(?:conduct|do|perform|write|provide)\s+(?:a\s+)?(?:deep\s+research|comprehensive\s+analysis|exhaustive\s+breakdown|technical\s+whitepaper)\b/i,
];

const WEBSEARCH_PATTERNS = [
  /\b(?:search\s+(?:the\s+)?(?:web|internet|google|online)|look\s*up\s+online|latest\s+news|recent\s+events|(?:current|latest|today'?s)\s+(?:stock\s+)?price|today'?s\s+news|what\s+happened\s+today|real[- ]time|breaking\s+news|live\s+updates?)\b/i,
  /\b(?:who\s+is\s+the\s+current|what\s+is\s+the\s+latest\s+version\s+of|weather\s+in|stock\s+ticker|market\s+cap\s+today)\b/i,
];

const CODE_PATTERNS = [
  /\b(?:write\s+code|implement|refactor|debug|fix\s+bug|stack\s*trace|typeerror|syntaxerror|referenceerror|typescript|rust|javascript|python|golang|rustc|sql|regex|component|endpoint|graphql|dockerfile|test\s+suite|function|class\s+\w+|async\s+fn|unit\s+test|api\s+route|react\s+hook)\b/i,
  /(?:fix|write|create|modify|review|optimize)\s+(?:this|the)?\s*(?:code|function|script|hook|service|algo|algorithm|query|handler|middleware)\b/i,
];

// -----------------------------------------------------------------------------
// Classifier Helpers
// -----------------------------------------------------------------------------

export function isPresentationPrompt(prompt?: string): boolean {
  if (!prompt) return false;
  const p = prompt.toLowerCase().trim();
  return (
    /\b(?:ppt|presentation|powerpoint|slides|slide\s*deck|pitch\s*deck|slidev)\b/i.test(p) ||
    (/(?:slide|deck)\b/i.test(p) &&
      /(?:create|make|build|generate|give|show|prepare|design)\b/i.test(p))
  );
}

export function isDiagramPrompt(prompt?: string): boolean {
  if (!prompt) return false;
  const p = prompt.toLowerCase().trim();
  return (
    DIAGRAM_PATTERNS[0].test(p) ||
    (DIAGRAM_PATTERNS[1].test(p) &&
      /(?:draw|create|generate|make|build|show|model|design)\b/i.test(p))
  );
}

export function isResearchPrompt(prompt?: string): boolean {
  if (!prompt) return false;
  const p = prompt.toLowerCase().trim();
  return RESEARCH_PATTERNS.some((pat) => pat.test(p));
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

export function isCodePrompt(prompt?: string): boolean {
  if (!prompt) return false;
  const p = prompt.toLowerCase().trim();
  if (p.includes('```') || p.includes('`')) return true;
  return CODE_PATTERNS.some((pat) => pat.test(p));
}

// -----------------------------------------------------------------------------
// Master Prompt Category Detector
// -----------------------------------------------------------------------------

export function detectPromptCategory(
  rawPrompt: string,
  context?: ChatContext,
  webSearchResults?: string
): PromptCategory {
  // Explicit context category override
  if (context?.promptCategory) {
    return context.promptCategory;
  }

  const p = (rawPrompt || '').trim();
  if (!p) return 'general';

  // 1. Presentation / Slidev takes priority when slide formatting is explicitly requested
  if (isPresentationPrompt(p)) {
    return 'presentation';
  }

  // 2. Diagram / Visualization / Mermaid
  if (isDiagramPrompt(p)) {
    return 'diagram';
  }

  // 3. Deep Research / Comprehensive Whitepaper
  if (isResearchPrompt(p) || !!context?.hasDeepResearch) {
    return 'research';
  }

  // 4. Grounded Web Search Synthesis
  if (isWebSearchPrompt(p, context, webSearchResults)) {
    return 'websearch';
  }

  // 5. Code Engineering / Refactoring / Debugging
  if (isCodePrompt(p)) {
    return 'code';
  }

  // 6. Default to General Intelligence
  return 'general';
}

// -----------------------------------------------------------------------------
// Safety Level Detector
// -----------------------------------------------------------------------------

export function detectSafetyLevel(prompt: string): SafetyLevel {
  const lower = (prompt || '').toLowerCase().trim();
  if (!lower) return 'standard';

  // Defensive context override (legitimate security reviews, audits, and hardening)
  const safeContexts = [
    /how\s+(to|do\s+i)\s+(fix|patch|secure|harden|protect|prevent|mitigate)/i,
    /(audit|review|assessment|analysis)\s+of\s+(my|our|the)\s+(security|auth|system|codebase|contracts?)/i,
    /prevent\s+(hacking|exploits?|attacks?|vulnerabilit(?:y|ies)|injections?)/i,
    /sanitize\s+(user\s+input|inputs?|queries|database)/i,
  ];
  if (safeContexts.some((pattern) => pattern.test(lower))) {
    return 'standard';
  }

  // High-risk and sensitive patterns
  const sensitivePatterns = [
    /(hack|exploit|vulnerability|bypass|crack)\s+(security|auth|login|firewall|passwords?)/i,
    /(create|make|build|write|generate)\s+(virus|malware|trojan|ransomware|keylogger|rootkit|botnet|worm)/i,
    /(steal|extract|dump|exfiltrate)\s+(password|credit.card|ssn|personal.data|credentials|tokens)/i,
    /(how\s+to|steps\s+to)\s+(illegal|crime|fraud|scam|phish|ddos|attack)/i,
  ];

  const matchCount = sensitivePatterns.filter((pattern) => pattern.test(lower)).length;
  if (matchCount >= 2) return 'strict';
  if (matchCount === 1) return 'enhanced';
  return 'standard';
}
