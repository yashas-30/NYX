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
  /** True when the request goes to a local GGUF model via llama-server.
   *  Skips citation rules — they waste tokens and aren't useful on local models. */
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

// ── Main Builder ─────────────────────────────────────────────────────────────
//
// IMPORTANT: This returns:
//   - systemPrompt: injected as system_instruction to the backend
//   - userPrompt:   the raw user text (possibly with [RESEARCH] prepended)
//
// The chat HISTORY is already passed separately as the `messages` array in
// useChatLogic.ts — do NOT concatenate history here or it will be doubled.

export function buildChatPrompts(
  modelId: string,
  context: ChatContext,
  rawPrompt: string,
  _history: ChatMessage[],
  webSearchResults?: string,
  provider?: string
): ChatPromptBuildResult {
  const now = new Date();
  const contextBreakdown: Record<string, number> = {};

  const systemPrompt = buildChatSystemPromptInternal(modelId, context, now, provider);
  contextBreakdown.system = estimateTokens(systemPrompt);

  // Build user-facing prompt — web search context prepended if available.
  // DO NOT include history here; it's already in backendMessages in useChatLogic.
  let userPrompt = rawPrompt;
  if (webSearchResults) {
    const now = new Date();
    const isoDateStr = now.toISOString().slice(0, 10);
    const isDeep = webSearchResults.includes('DEEP RESEARCH CONSOLIDATED CONTEXT');
    const isResearchQuery = /^(?:research|compare|list|explain|find me the best|what are the best|show me all)\b|\bresearch\b|\blist every\b|\bbest laptop\b/i.test(rawPrompt.trim());
    const headerTag = isDeep ? 'LONG CONTEXT DEEP RESEARCH & RAG MEMORY DATA' : 'LIVE WEB SEARCH & RAG MEMORY RESULTS';
    
    if (isDeep || isResearchQuery) {
      userPrompt =
        `[${headerTag}] (Retrieved: ${isoDateStr})\n` +
        `${webSearchResults}\n` +
        `[/${headerTag}]\n\n` +
        `Question: ${rawPrompt}\n\n` +
        `INSTRUCTIONS FOR STRUCTURED RESEARCH REPORT WITH INLINE IMAGES & VISUAL DIAGRAMS:\n` +
        `1. EXECUTIVE SUMMARY: Direct high-level answer and top recommendations.\n\n` +
        `2. VISUAL DATA & GRAPHICAL REPRESENTATION:\n` +
        `   - Include a clean Markdown Comparison Table comparing specs, battery life, performance, and price.\n` +
        `   - Include a Mermaid chart (e.g. \`\`\`mermaid\ngraph TD\n... \`\`\` or \`\`\`mermaid\npie title Battery Life\n... \`\`\`) visualizing performance or market rankings.\n\n` +
        `3. INLINE TOPIC & PRODUCT BREAKDOWNS:\n` +
        `   - Create a dedicated heading for EACH recommended topic/product (e.g. ### 1. Apple MacBook Air M3).\n` +
        `   - IMMEDIATELY BELOW each heading, embed its exact matching image from [VERIFIED INLINE PRODUCT IMAGES & SPECIFIC TOPIC MEDIA] using Markdown image syntax: ![Product Name](URL).\n` +
        `   - Include key specs, battery life, pros/cons, and exact prices (escaped as \\$1,500).\n\n` +
        `4. DO NOT place images at the end of the response — embed each image inline right under its corresponding topic heading. Do not output <think> tags.`;
    } else {
      userPrompt =
        `[${headerTag}] (Retrieved: ${isoDateStr})\n` +
        `${webSearchResults}\n` +
        `[/${headerTag}]\n\n` +
        `Question: ${rawPrompt}\n` +
        `Instructions: Answer directly and accurately using the search data above. Embed any verified image URLs provided in [VERIFIED INLINE PRODUCT IMAGES & SPECIFIC TOPIC MEDIA] inline below headings. Do not output <think> tags.`;
    }
  }
  contextBreakdown.user = estimateTokens(userPrompt);

  return {
    systemPrompt,
    userPrompt,
    metadata: {
      version: '3.0.0',
      estimatedTokens: Object.values(contextBreakdown).reduce((a, b) => a + b, 0),
      contextBreakdown,
      safetyLevel: detectSafetyLevel(rawPrompt),
    },
  };
}

// ── System Prompt Builder ─────────────────────────────────────────────────────
function buildChatSystemPromptInternal(
  _modelId: string,
  context: ChatContext,
  now: Date,
  provider?: string
): string {
  const isLocal = context.localModel || provider === 'nyx-native';
  const isoDateStr = now.toISOString().slice(0, 10);

  if (isLocal) {
    // Ultra-lightweight system prompt for local GGUF models (< 20 tokens, zero delay)
    return `You are Lucifer, an AI assistant. Today is ${isoDateStr}. Answer directly, accurately, and concisely. Do not output <think> tags.`;
  }

  // Ultra-clean system prompt for cloud models (< 40 tokens)
  return (
    `You are Lucifer, an AI assistant. Today is ${isoDateStr}.\n` +
    `Answer directly, accurately, and concisely. Embed verified image URLs if provided. Do not invent fake URLs.`
  );
}

// ── Safety Level Detection ────────────────────────────────────────────────────

function detectSafetyLevel(prompt: string): 'standard' | 'enhanced' | 'strict' {
  const lower = prompt.toLowerCase();

  // Legitimate security work — keep at standard
  const safeContexts = [
    /how\s+(to|do\s+i)\s+(fix|patch|secure|harden|protect)/i,
    /(audit|review|assessment)\s+of\s+(my|our|the)\s+(security|auth|system)/i,
    /prevent\s+(hacking|exploits|attacks)/i,
  ];
  if (safeContexts.some((p) => p.test(lower))) return 'standard';

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
