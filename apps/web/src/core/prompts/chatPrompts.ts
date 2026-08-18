/**
 * chatPrompts.ts
 *
 * Builds the system prompt and user prompt for each conversation turn.
 *
 * 2026 Context Engineering principles applied:
 * 1. Static content first (identity, rules) — enables prompt caching
 * 2. Dynamic content last (user data, search results, date) — separated by XML tags
 * 3. User input is always wrapped in semantic tags to prevent prompt injection
 * 4. Style directives are concrete, not abstract — explicit structure contracts
 * 5. Instructions in user prompt reinforce system prompt at turn level
 * 6. No instruction bloat — every line must change model behavior to stay
 */

import { getLuciferPersona } from '../agents/luciferPersona';
import type { ChatMessage } from '@src/infrastructure/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatContext {
  userName?: string;
  userPreferences?: UserPreferences;
  conversationTone: 'casual' | 'professional' | 'technical';
  detectedLanguage: string;
  topicDomain?: string;
  previousMessages: number;
  lightningDirectives?: string[];
  availableTools?: ToolDefinition[];
  enableCitations?: boolean;
  maxResponseTokens?: number;
  historySummary?: string;
  reasoningEnabled?: boolean;
  /** True when the request goes to a local GGUF model via llama-server. */
  localModel?: boolean;
  customSystemPrompt?: string;
  hasWebSearch?: boolean;
  isLuciferMode?: boolean;
}

export interface UserPreferences {
  preferredName?: string;
  expertiseLevel?: 'beginner' | 'intermediate' | 'expert';
  detailPreference?: 'concise' | 'balanced' | 'thorough';
  formatPreference?: 'paragraph' | 'bullets' | 'numbered' | 'mixed';
  lastTopics?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

export interface ChatPromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  metadata: {
    version: string;
    estimatedTokens: number;
    contextBreakdown: Record<string, number>;
    safetyLevel: 'standard' | 'enhanced' | 'strict';
  };
}

// ── Token Estimation (rough: ~4 chars per token) ─────────────────────────────

function estimateTokens(text?: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// Universal Professional Turn Directive
//
// Injected into the USER PROMPT to reinforce structure and behavioral rules
// close to the user query for maximum instruction compliance across models.
// ─────────────────────────────────────────────────────────────────────────────

const UNIVERSAL_TURN_DIRECTIVE = `<turn_format_directive>
PROFESSIONAL EXECUTION CONTRACT:
1. Core Delivery: Deliver the direct answer or primary solution in the opening sentence. No conversational preambles ("Certainly!", "Great question!", "Sure!").
2. Adaptive Depth:
   - For simple or concise questions: Provide a sharp, direct, high-signal answer in 1–2 clear paragraphs without artificial section headers or bullet-point bloat.
   - For in-depth, technical, architectural, or research inquiries: Organize into logical Markdown sections (## Section Name) named directly after the concepts discussed.
3. Visuals & Data:
   - Provide valid Mermaid flowcharts (\`\`\`mermaid\nflowchart TD\n...\n\`\`\` with quoted node labels) for workflows, architectures, pipelines, and state diagrams.
   - Format comparisons, benchmarks, and structured specs in clean Markdown tables.
   - Provide minimal, idiomatic, runnable code blocks with language identifiers.
PROHIBITED: Robotic AI intros, repeating the user prompt, meta-commentary about the prompt or context, fabricated URLs, and artificial boilerplate headings ("Direct Answer / Key Takeaway", "Overview", "Comparison") when irrelevant.
</turn_format_directive>`;

// ─────────────────────────────────────────────────────────────────────────────
// Main Builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildChatPrompts(
  modelId: string,
  context: ChatContext,
  rawPrompt: string,
  _history: ChatMessage[],
  webSearchResults?: string,
  provider?: string,
  mediaContext?: string,
  memoryContext?: string
): ChatPromptBuildResult {
  const now = new Date();
  const contextBreakdown: Record<string, number> = {};
  const isoDateStr = now.toISOString().slice(0, 10);

  // Build system prompt — static content goes first for prompt cache efficiency
  const systemPrompt = buildSystemPrompt(
    modelId,
    context,
    isoDateStr,
    provider
  );
  contextBreakdown.system = estimateTokens(systemPrompt);

  // Build user prompt — dynamic content, wrapped in semantic tags
  const userPrompt = buildUserPrompt(rawPrompt, isoDateStr, webSearchResults, mediaContext, memoryContext);
  contextBreakdown.user = estimateTokens(userPrompt);

  return {
    systemPrompt,
    userPrompt,
    metadata: {
      version: '5.0.0',
      estimatedTokens: Object.values(contextBreakdown).reduce((a, b) => a + b, 0),
      contextBreakdown,
      safetyLevel: detectSafetyLevel(rawPrompt),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// System Prompt Builder
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(
  _modelId: string,
  context: ChatContext,
  isoDateStr: string,
  provider?: string
): string {
  // Custom system prompt: user-defined, full override — add only date
  if (context.customSystemPrompt?.trim()) {
    return `${context.customSystemPrompt.trim()}\n\n<date_context>Today is ${isoDateStr}. Do not output <think> tags.</date_context>`;
  }

  const isLocal = context.localModel || provider === 'nyx-native';

  const persona = getLuciferPersona({
    isLocalModel: isLocal,
    provider,
  });

  return `${persona}\n\n<date_context>Today is ${isoDateStr}.</date_context>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// User Prompt Builder
// ─────────────────────────────────────────────────────────────────────────────

function buildUserPrompt(
  rawPrompt: string,
  isoDateStr: string,
  webSearchResults?: string,
  mediaContext?: string,
  memoryContext?: string
): string {
  const trimmed = rawPrompt.trim();

  // Fast-path for greetings & casual conversational turns — never force textbook structures
  const isGreeting =
    (trimmed.length <= 40 &&
      /^(hi|hello|hey|greetings|good\s+(?:morning|afternoon|evening|day)|yo|sup|ping|test|howdy|what's\s+up|whats\s+up|hiya)(?:[\s!.,?]+(?:lucifer|nyx|there|bot|assistant))?[\s!.,?]*$/i.test(
        trimmed
      )) ||
    (trimmed.length <= 80 &&
      /^(who\s+are\s+you|what\s+can\s+you\s+do|tell\s+me\s+about\s+yourself|introduce\s+yourself|what\s+is\s+your\s+name|who\s+made\s+you|who\s+created\s+you|who\s+are\s+you\s+and\s+what\s+can\s+you\s+do)(?:[\s!.,?]+(?:lucifer|nyx))?[\s!.,?]*$/i.test(
        trimmed
      ));

  if (isGreeting && !webSearchResults && !mediaContext && !memoryContext) {
    return trimmed;
  }

  const blocks: string[] = [];

  // 1. Supplemental Background Memory Context Block
  if (memoryContext?.trim()) {
    blocks.push(memoryContext.trim());
  }

  // 2. Deep Research / Web Search Context Block
  if (webSearchResults?.trim()) {
    const isDeepResearch =
      webSearchResults.includes('DEEP RESEARCH CONSOLIDATED CONTEXT') ||
      webSearchResults.includes('Autonomous Deep Research Report') ||
      webSearchResults.includes('AGENTIC RESEARCH SYNTHESIS');
    const contextTag = isDeepResearch ? 'deep_research_context' : 'web_search_context';
    const contextLabel = isDeepResearch
      ? 'DEEP RESEARCH & RAG CONSOLIDATED DATA'
      : 'LIVE WEB SEARCH & RAG RESULTS';

    blocks.push(
      `<${contextTag} retrieved="${isoDateStr}" label="${contextLabel}">\n${webSearchResults.trim()}\n</${contextTag}>`
    );
  }

  // 3. Verified Media Library Context Block (separated from user input)
  if (mediaContext?.trim()) {
    blocks.push(mediaContext.trim());
  }

  // 4. User Input — Clean User Query
  blocks.push(`<user_input>\n${trimmed}\n</user_input>`);

  // 5. Turn Directive (only for informational, technical, creative, or search-augmented turns)
  if (webSearchResults || mediaContext || trimmed.length > 25) {
    blocks.push(UNIVERSAL_TURN_DIRECTIVE);
  }

  // 6. Execution Rules (Full Context Depth, Citations, Media Matching)
  const isDeepQuery = /\b(?:research|deep|detailed|explain|comprehensive|analysis|architecture|clinical|system)\b/i.test(rawPrompt);
  const depthRule = isDeepQuery
    ? `FULL CONTEXT & DEPTH: Provide an exhaustive, deeply detailed, full-context explanation. Cover every technical mechanism, architectural workflow, clinical application, algorithm, and quantitative benchmark without summarizing or omitting critical details.`
    : `DEPTH: Provide a complete, direct, high-density response matching the depth of the inquiry.`;

  const executionRules: string[] = [
    `<execution_rules>`,
    depthRule,
  ];

  if (webSearchResults?.trim()) {
    executionRules.push(
      `CITATIONS: Place all citation tags [Source N] ONLY at the very END of paragraphs or sections.
Never insert citations in the middle of sentences, inside table headers, or scattered inside table data cells.
Format multiple citations as separate tags: [Source 1] [Source 2]. Cite only sources you actually received.`
    );
  }

  if (mediaContext?.trim()) {
    executionRules.push(
      `MEDIA: If verified media appears in context (<verified_media_library>):
- NEVER embed media URLs into the middle of sentences.
- Place verified images on a clean, dedicated standalone line: ![Title](URL)
- If videos appear in context, embed using: <video src="URL" title="Title" poster="PREVIEW_URL"></video>
- Never fabricate or guess image, video, or audio URLs. Use only verified URLs from context.`
    );
  }

  executionRules.push(`</execution_rules>`);

  if (webSearchResults || mediaContext || isDeepQuery) {
    blocks.push(executionRules.join('\n\n'));
  }

  return blocks.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Safety Level Detection
//
// Used for logging and optional downstream routing decisions.
// Does NOT modify the prompt — this is metadata only.
// ─────────────────────────────────────────────────────────────────────────────

function detectSafetyLevel(prompt: string): 'standard' | 'enhanced' | 'strict' {
  const lower = prompt.toLowerCase();

  // Known-safe security contexts (audit/defense framing) → standard
  const safeContexts = [
    /how\s+(to|do\s+i)\s+(fix|patch|secure|harden|protect)/i,
    /(audit|review|assessment)\s+of\s+(my|our|the)\s+(security|auth|system)/i,
    /prevent\s+(hacking|exploits|attacks)/i,
  ];
  if (safeContexts.some((p) => p.test(lower))) return 'standard';

  // Potentially harmful patterns
  const sensitivePatterns = [
    /(hack|exploit|vulnerability|bypass)\s+(security|auth|login|firewall)/i,
    /(create|make|build)\s+(virus|malware|trojan|ransomware|keylogger)/i,
    /(steal|extract|dump)\s+(password|credit.card|ssn|personal.data)/i,
    /(how\s+to|steps\s+to)\s+(illegal|crime|fraud|scam)/i,
  ];

  const matchCount = sensitivePatterns.filter((p) => p.test(lower)).length;
  if (matchCount >= 2) return 'strict';
  if (matchCount === 1) return 'enhanced';
  return 'standard';
}
