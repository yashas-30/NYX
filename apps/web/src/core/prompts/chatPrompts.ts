import { NYX_PERSONA } from '../agents/nyxPersona';
import { LUCIFER_PERSONA } from '../agents/luciferPersona';
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
  webSearchResults?: string
): ChatPromptBuildResult {
  const now = new Date();
  const contextBreakdown: Record<string, number> = {};

  const systemPrompt = buildChatSystemPromptInternal(modelId, context, now);
  contextBreakdown.system = estimateTokens(systemPrompt);

  // Build user-facing prompt — web search context prepended if available.
  // DO NOT include history here; it's already in backendMessages in useChatLogic.
  let userPrompt = rawPrompt;
  if (webSearchResults) {
    userPrompt = `[RESEARCH]\n${webSearchResults}\n[/RESEARCH]\n\n${rawPrompt}`;
  }
  contextBreakdown.user = estimateTokens(userPrompt);

  return {
    systemPrompt,
    userPrompt,
    metadata: {
      version: '2.1.0',
      estimatedTokens: Object.values(contextBreakdown).reduce((a, b) => a + b, 0),
      contextBreakdown,
      safetyLevel: detectSafetyLevel(rawPrompt),
    },
  };
}

// ── System Prompt Builder ─────────────────────────────────────────────────────
//
// Design principle (2026):
//   • Flat prose only — no XML tag wrappers.  XML tags were ~200 tokens of
//     structural noise.  Frontier models parse prose structure natively.
//     GGUF models tokenise XML tags as raw text anyway.
//   • Target: ≤180 tokens for local, ≤250 tokens for cloud.
//
function buildChatSystemPromptInternal(
  _modelId: string,
  context: ChatContext,
  now: Date
): string {
  const {
    userName,
    userPreferences,
    conversationTone,
    detectedLanguage,
    availableTools,
    lightningDirectives,
    reasoningEnabled,
    localModel,
    customSystemPrompt,
  } = context;

  const parts: string[] = [];

  // ── Core Identity ─────────────────────────────────────────────────────────
  if (context.isLuciferMode) {
    parts.push(LUCIFER_PERSONA);
    if (customSystemPrompt && customSystemPrompt.trim().length > 0 && !customSystemPrompt.includes('Lucifer')) {
      parts.push(customSystemPrompt.trim());
    }
  } else if (customSystemPrompt && customSystemPrompt.trim().length > 0) {
    parts.push(customSystemPrompt.trim());
  } else {
    parts.push(NYX_PERSONA);
  }

  // ── Date ──────────────────────────────────────────────────────────────────
  parts.push(
    `Today is ${now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}.`
  );

  // ── User personalization (only when known) ────────────────────────────────
  const name = userPreferences?.preferredName || userName;
  if (name) {
    const detail = userPreferences?.detailPreference
      ? ` Prefer ${userPreferences.detailPreference} responses.`
      : '';
    parts.push(`The user's name is ${name}.${detail}`);
  }

  // ── Tone (only for non-default values) ───────────────────────────────────
  if (conversationTone === 'professional') {
    parts.push('Adopt a professional, direct tone. Avoid slang and emoji.');
  } else if (conversationTone === 'technical') {
    parts.push('Be technically precise. Use correct terminology. Show code in fenced blocks.');
  }
  // casual = default NYX persona tone — no extra instruction

  // ── Core response rules ───────────────────────────────────────────────────
  parts.push(
    `STRICT DIRECTNESS MANDATE:\n` +
    `- Answer directly without conversational preamble, greetings, or prompt restatements.\n` +
    `- Respond in ${detectedLanguage}.\n` +
    `- Use markdown formatting naturally. Never explain tool execution or search steps.`
  );

  // ── Reasoning control (only when explicitly configured) ──────────────────
  if (reasoningEnabled === false) {
    parts.push('Do not output <think> reasoning tags. Reply directly.');
  } else if (reasoningEnabled === true) {
    parts.push('Use <think>…</think> to reason before your final answer.');
  }

  // ── Web search grounding ──────────────────────────────────────────────────
  if (context.hasWebSearch) {
    parts.push(
      'CRITICAL REAL-TIME ACCESS NOTICE: Real-time live web search results are attached in the user prompt under [LIVE WEB SEARCH RESULTS]. You HAVE live web search access for this request. Read and use the facts inside [LIVE WEB SEARCH RESULTS] to directly answer the user\'s question accurately. Do NOT state that you lack real-time information.'
    );
  } else {
    parts.push(
      'When live web search results appear in the user prompt, use the facts provided to answer the user\'s question directly.'
    );
  }

  // ── Tool definitions (cloud only, when tools are registered) ─────────────
  if (!localModel && availableTools && availableTools.length > 0) {
    const toolList = availableTools
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n');
    parts.push(
      `Available tools:\n${toolList}\n\n` +
        'Call tools by responding with:\n' +
        '<tool_call>\n{"name": "tool_name", "parameters": {...}}\n</tool_call>'
    );
  }

  // ── Lightning directives (highest priority — always last) ─────────────────
  if (lightningDirectives && lightningDirectives.length > 0) {
    parts.push(
      'Critical instructions (override all above):\n' +
        lightningDirectives.map((d, i) => `${i + 1}. ${d}`).join('\n')
    );
  }

  return parts.join('\n\n');
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
