// src/features/chat/promptBuilders.ts

import { ChatMessage } from '@src/infrastructure/types';

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
  enableReasoning?: boolean;
  enableCitations?: boolean;
  maxResponseTokens?: number;
  historySummary?: string;
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

class PromptLRUCache {
  private cache = new Map<string, ChatPromptBuildResult>();
  private maxSize = 100;

  get(key: string) {
    if (!this.cache.has(key)) return undefined;
    const val = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, val);
    return val;
  }

  set(key: string, val: ChatPromptBuildResult) {
    if (this.cache.size >= this.maxSize) {
      this.cache.delete(this.cache.keys().next().value!);
    }
    this.cache.set(key, val);
  }
}

const promptCache = new PromptLRUCache();

function generateCacheKey(
  modelId: string,
  context: ChatContext,
  rawPrompt: string,
  historyLength: number
): string {
  // Simple hash of full prompt
  const promptHash = rawPrompt.split('').reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);
  return `${modelId}:${context.conversationTone}:${context.detectedLanguage}:${historyLength}:${promptHash}`;
}

// ── Token Estimation (rough: ~4 chars per token) ─────────────────────────────

function estimateTokens(text?: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// ── Main Builder ─────────────────────────────────────────────────────────────

export function buildChatPrompts(
  modelId: string,
  context: ChatContext,
  rawPrompt: string,
  history: ChatMessage[],
  webSearchResults?: string
): ChatPromptBuildResult {
  const cacheKey = generateCacheKey(modelId, context, rawPrompt, history.length);
  const cached = promptCache.get(cacheKey);
  if (cached && !webSearchResults) {
    // Return cached if available and no dynamic web search
    return cached;
  }

  const now = new Date(); // Fresh date per call
  const contextBreakdown: Record<string, number> = {};

  // Build system prompt
  const systemPrompt = buildChatSystemPromptInternal(modelId, context, now);
  contextBreakdown.system = estimateTokens(systemPrompt);

  // Build user prompt with history injection
  const userPrompt = buildChatUserPromptInternal(
    rawPrompt,
    context,
    history,
    webSearchResults,
    now
  );
  contextBreakdown.user = estimateTokens(userPrompt);

  // History tokens
  const historyText = formatHistoryForPrompt(history, context.previousMessages);
  contextBreakdown.history = estimateTokens(historyText);

  const totalTokens = Object.values(contextBreakdown).reduce((a, b) => a + b, 0);

  const result: ChatPromptBuildResult = {
    systemPrompt,
    userPrompt: historyText ? `${historyText}\n\n${userPrompt}` : userPrompt,
    metadata: {
      version: '1.0.0',
      estimatedTokens: totalTokens,
      contextBreakdown,
      safetyLevel: detectSafetyLevel(rawPrompt),
    },
  };

  if (!webSearchResults) {
    promptCache.set(cacheKey, result);
  }

  return result;
}

// ── System Prompt Builder ─────────────────────────────────────────────────────

function buildChatSystemPromptInternal(modelId: string, context: ChatContext, now: Date): string {
  const parts: string[] = [];
  const {
    userName,
    userPreferences,
    conversationTone,
    detectedLanguage,
    enableReasoning,
    enableCitations,
    availableTools,
  } = context;

  // ── Identity & Temporal Context ───────────────────────────────────────────

  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  parts.push(`<identity>
You are NYX, an intelligent AI assistant created by Moonshot AI. You are helpful, harmless, and honest.
Current Date: ${dateStr}
Current Time: ${timeStr}
Current Year: ${now.getFullYear()}
</identity>`);

  // ── Personalization (Kimi-style memory) ───────────────────────────────────

  if (userName || userPreferences?.preferredName) {
    const name = userPreferences?.preferredName || userName;
    parts.push(`<user_profile>
The user's preferred name is "${name}". Address them by this name naturally.
${userPreferences?.expertiseLevel ? `Their expertise level: ${userPreferences.expertiseLevel}. Adjust technical depth accordingly.` : ''}
${userPreferences?.detailPreference ? `Their detail preference: ${userPreferences.detailPreference}.` : ''}
${userPreferences?.formatPreference ? `Their format preference: ${userPreferences.formatPreference}.` : ''}
${userPreferences?.lastTopics?.length ? `Recent topics discussed: ${userPreferences.lastTopics.slice(-3).join(', ')}.` : ''}
</user_profile>`);
  }

  // ── Role Definition ───────────────────────────────────────────────────────

  parts.push(`<role>
You are a general conversational assistant. Your capabilities:
- Answer questions, explain concepts, brainstorm ideas
- Analyze text, summarize content, compare options
- Help with writing, editing, and creative tasks
- Provide recommendations and guidance

You CANNOT:
- Execute code or commands
- Access the file system
- Browse the internet in real-time (unless search results are provided in context)
- Generate and run production code autonomously
</role>`);

  // ── Personality (Tone-Adaptive) ───────────────────────────────────────────

  const toneInstructions: Record<string, string> = {
    casual: `<personality>
Tone: Warm, friendly, approachable. Use natural language, occasional light humor, and relevant emojis (1-2 per response max). 
Structure: Conversational flow, avoid rigid formatting unless requested.
Examples: "Hey! 😊 Great question...", "No worries, here's the deal..."
</personality>`,
    professional: `<personality>
Tone: Clear, respectful, business-appropriate. No slang or emojis.
Structure: Use bullet points and headers for complex info. Lead with the key takeaway.
Examples: "Here are the three main considerations...", "To summarize:..."
</personality>`,
    technical: `<personality>
Tone: Precise, accurate, thorough. Use correct terminology.
Structure: Brief summary first, then detailed explanation on request. Use code blocks for technical terms.
Examples: "The core mechanism is...", "At the protocol level, this works by..."
</personality>`,
  };

  parts.push(toneInstructions[conversationTone] || toneInstructions.professional);

  // ── Response Guidelines (Adaptive Length) ─────────────────────────────────

  const detailLevel = userPreferences?.detailPreference || 'balanced';
  const lengthGuide: Record<string, string> = {
    concise: 'Keep responses under 150 words. One paragraph preferred. Be direct.',
    balanced:
      'Keep responses under 400 words. Use paragraphs with occasional bullets for complex topics.',
    thorough:
      'Provide comprehensive responses. Use sections, examples, and depth. No arbitrary length limit.',
  };

  parts.push(`<response_rules>
- ${lengthGuide[detailLevel]}
- Answer directly without unnecessary preamble ("Sure!", "I'd be happy to help")
- DO NOT output any internal monologues, chain-of-thought, drafting, or 'thinking' process.
- DO NOT analyze the user's intent or explain what the user wants. Respond directly to the prompt.
- Provide a structured response without saying "User Intent:" or "What I should do:".
- DO NOT wrap your entire response in a markdown code block (like \`\`\`text or \`\`\`markdown). Output regular markdown directly so it renders properly.
- If unsure, express confidence level: "I'm confident that..." / "I believe..." / "I'm uncertain about..."
- For multi-part questions, address each part explicitly
- Use markdown: **bold** for emphasis, \`code\` for technical terms, lists for sequences
- Match the user's language: respond in ${detectedLanguage}
- When declining a request, explain why briefly and suggest alternatives
</response_rules>`);

  // ── Web Search Grounding (Claude-style citations) ─────────────────────────

  if (enableCitations !== false) {
    parts.push(`<web_search_guidelines>
When [RESEARCH] results are provided in the user message:
- Treat search results as PRIMARY source for temporal/factual/current events
- Cite sources using [^1^], [^2^] format referencing the result number
- Prioritize search context over training knowledge cutoff
- Do NOT say "As of my knowledge cutoff" or "As an AI language model" when search results contain the answer
- If search results are insufficient, say so explicitly rather than guessing
</web_search_guidelines>`);
  }

  // ── Reasoning Visibility (Claude-style thinking) ──────────────────────────

  if (enableReasoning) {
    parts.push(`<reasoning>
For complex questions, show your reasoning process inside <thinking> tags before the final answer.
Example:
<thinking>
The user is asking about X. Key factors are A, B, C. 
A leads to... B suggests... Therefore...
</thinking>

Keep thinking concise (2-4 sentences). The user can expand/collapse this section.
</reasoning>`);
  }

  // ── Tool Definitions (if available) ───────────────────────────────────────

  if (availableTools && availableTools.length > 0) {
    parts.push(`<tools>
You have access to the following tools. Use them when appropriate:
${availableTools.map((t) => `- ${t.name}: ${t.description}`).join('\n')}

To use a tool, respond with:
<tool_call>
{"name": "tool_name", "parameters": {...}}
</tool_call>
</tools>`);
  }

  // ── Anti-Hallucination (Nuance over blanket refusal) ──────────────────────

  parts.push(`<grounding_rules>
1. Distinguish facts from inference:
   - FACT (training data): State confidently
   - INFERENCE (logical deduction): Preface with "Based on this, it seems..."
   - UNKNOWN: Say "I don't have reliable information about that" and suggest how to find out

2. Never invent:
   - Specific statistics without source
   - URLs, credentials, API keys, passwords
   - Names of people, products, or organizations you're uncertain about

3. For current events: If no search results provided, acknowledge your knowledge cutoff (${now.getFullYear()}-01) rather than guessing
</grounding_rules>`);

  // ── Safety & Refusals ─────────────────────────────────────────────────────

  // fallow-ignore-next-line code-duplication
  parts.push(`<safety>
Refuse requests involving:
- Illegal activities, violence, self-harm
- Generation of malware, exploits, or harmful code
- Creation of deceptive content (deepfakes, scams)
- Private information about non-public individuals

Refusal format: "I can't help with that because [brief reason]. I'd be happy to help with [alternative]."
</safety>`);

  // ── Dynamic APO Directives (Highest Priority) ─────────────────────────────

  if (context.lightningDirectives && context.lightningDirectives.length > 0) {
    parts.push(`<directives priority="maximum">
The following user-optimized directives override general instructions:
${context.lightningDirectives.map((d, i) => `${i + 1}. ${d}`).join('\n')}
</directives>`);
  }

  // ── Model-Specific Optimizations ──────────────────────────────────────────

  const MODEL_OPTIMIZATIONS: Record<string, string> = {
    deepseek:
      'You have strong reasoning capabilities. For complex questions, use step-by-step thinking inside <thinking> tags. Keep reasoning focused and under 100 words.',
    phi: 'You excel at math, logic, and structured reasoning. Show your work for numerical problems. Use LaTeX for equations when helpful.',
    qwen: `You have strong multilingual capabilities. Maintain fluency and cultural appropriateness in ${detectedLanguage}.`,
  };

  for (const [key, note] of Object.entries(MODEL_OPTIMIZATIONS)) {
    if (modelId.toLowerCase().includes(key)) {
      parts.push(`<model_note>\n${note}\n</model_note>`);
    }
  }

  return parts.join('\n\n');
}

// ── User Prompt Builder ───────────────────────────────────────────────────────

function buildChatUserPromptInternal(
  rawPrompt: string,
  context: ChatContext,
  history: ChatMessage[],
  webSearchResults: string | undefined,
  now: Date
): string {
  const parts: string[] = [];

  // Web search context (if available)
  if (webSearchResults) {
    parts.push(`[RESEARCH]
${webSearchResults}
[END RESEARCH]`);
  }

  // Recent conversation summary (for continuity)
  if (context.historySummary) {
    parts.push(`<conversation_context>\n${context.historySummary}\n</conversation_context>`);
  } else if (history.length > 0 && context.previousMessages > 0) {
    const recentHistory = history.slice(-context.previousMessages);
    const summary = summarizeHistory(recentHistory);
    if (summary) {
      parts.push(`<conversation_context>\n${summary}\n</conversation_context>`);
    }
  }

  // Topic domain hint
  if (context.topicDomain) {
    parts.push(`<topic_domain>${context.topicDomain}</topic_domain>`);
  }

  // User message
  parts.push(`<user_message>
${rawPrompt}
</user_message>`);

  // Language hint for non-English
  if (context.detectedLanguage.toLowerCase() !== 'english') {
    parts.push(`<instruction>Respond in ${context.detectedLanguage}.</instruction>`);
  }

  return parts.join('\n\n');
}

// ── History Formatter (Sliding Window with Summarization) ───────────────────

function formatHistoryForPrompt(history: ChatMessage[], maxMessages: number): string {
  if (!history.length || maxMessages <= 0) return '';

  const recent = history.slice(-maxMessages);
  const formatted = recent
    .map((msg, i) => {
      const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
      const content =
        msg.content.length > 2000 ? msg.content.slice(0, 2000) + '... [truncated]' : msg.content;
      return `[${role}]: ${content}`;
    })
    .join('\n\n');

  return `<conversation_history>
${formatted}
</conversation_history>`;
}

function summarizeHistory(history: ChatMessage[]): string {
  if (history.length < 3) return '';

  const topics = new Set<string>();
  const lastUserMsgs = history.filter((m) => m.role === 'user').slice(-3);

  for (const msg of lastUserMsgs) {
    const words = msg.content
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 5);
    words.slice(0, 5).forEach((w) => topics.add(w));
  }

  if (topics.size === 0) return '';

  return `Recent discussion topics: ${Array.from(topics).slice(0, 8).join(', ')}. Maintain continuity with these themes.`;
}

// ── Safety Level Detection ────────────────────────────────────────────────────

function detectSafetyLevel(prompt: string): 'standard' | 'enhanced' | 'strict' {
  const lower = prompt.toLowerCase();

  // Safe contexts (defensive security work)
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

// ── Backward-Compatible Exports ─────────────────────────────────────────────

/** @deprecated Use buildChatPrompts instead */
export function buildChatSystemPrompt(modelId: string, context: ChatContext): string {
  return buildChatPrompts(modelId, context, '', [], undefined).systemPrompt;
}

/** @deprecated Use buildChatPrompts instead */
export function buildChatUserPrompt(
  rawPrompt: string,
  context: ChatContext,
  webSearchResults?: string
): string {
  return buildChatPrompts('', context, rawPrompt, [], webSearchResults).userPrompt;
}
