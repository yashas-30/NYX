// src/features/chat/promptBuilders.ts

import { ChatMessage } from '@src/infrastructure/types';
import { TokenEstimator } from '../services/tokenEstimator';

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
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[]; items?: any }>;
    required?: string[];
  };
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

function estimateTokens(text?: string, modelId?: string): number {
  return TokenEstimator.estimateTokens(text, modelId);
}

// ── Main Builder ─────────────────────────────────────────────────────────────

export async function buildChatPrompts(
  modelId: string,
  context: ChatContext,
  rawPrompt: string,
  history: ChatMessage[],
  webSearchResults?: string
): Promise<ChatPromptBuildResult> {
  const cacheKey = generateCacheKey(modelId, context, rawPrompt, history.length);
  const cached = promptCache.get(cacheKey);
  if (cached && !webSearchResults) {
    // Return cached if available and no dynamic web search
    return cached;
  }

  const now = new Date(); // Fresh date per call
  const contextBreakdown: Record<string, number> = {};

  // Build system prompt
  let systemPrompt = buildChatSystemPromptInternal(modelId, context, now);
  
  // Inject memory prompt
  try {
    const { MemoryStore } = await import('../agents/memoryStore');
    const memoryAddon = await MemoryStore.getMemoryPrompt(rawPrompt);
    if (memoryAddon) {
      systemPrompt += `\n${memoryAddon}`;
    }
  } catch (e) {
    console.warn('[chatPrompts] Failed to inject memory', e);
  }
  
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
  const historyText = formatHistoryForPrompt(history, context.previousMessages, modelId);
  contextBreakdown.history = estimateTokens(historyText, modelId);

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

  // ── 1. Role (R) ───────────────────────────────────────────────────────────
  parts.push(`[ROLE]
You are NYX, an advanced AI assistant built by the NYX team. You are independent, precise, and highly capable. You act as a general conversational assistant.
Your capabilities:
- Answer questions, explain concepts, brainstorm ideas
- Analyze text, summarize content, compare options
- Help with writing, editing, and creative tasks
- Provide recommendations and guidance

You CANNOT:
- Execute code or commands
- Access the file system
- Browse the internet in real-time (unless search results are provided in context)
- Generate and run production code autonomously`);

  // ── 2. Scenario (S) ───────────────────────────────────────────────────────
  parts.push(`[SCENARIO]
The user is interacting with you through the NYX chat interface. You need to provide helpful, direct, and accurate responses to their prompts.`);

  // ── 3. Context (C) ────────────────────────────────────────────────────────
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  let contextStr = `[CONTEXT]
Temporal Context:
- Current Date: ${dateStr}
- Current Time: ${timeStr}
- Current Year: ${now.getFullYear()}`;

  if (userName || userPreferences?.preferredName) {
    const name = userPreferences?.preferredName || userName;
    contextStr += `\nUser Profile:\n- Preferred Name: "${name}"`;
    if (userPreferences?.expertiseLevel) contextStr += `\n- Expertise Level: ${userPreferences.expertiseLevel}`;
    if (userPreferences?.detailPreference) contextStr += `\n- Detail Preference: ${userPreferences.detailPreference}`;
    if (userPreferences?.formatPreference) contextStr += `\n- Format Preference: ${userPreferences.formatPreference}`;
    if (userPreferences?.lastTopics?.length) contextStr += `\n- Recent Topics: ${userPreferences.lastTopics.slice(-3).join(', ')}`;
  }
  parts.push(contextStr);

  // ── 4. Instructions (I) ───────────────────────────────────────────────────
  const detailLevel = userPreferences?.detailPreference || 'balanced';
  const lengthGuide: Record<string, string> = {
    concise: 'Keep responses under 150 words. One paragraph preferred. Be direct.',
    balanced: 'Keep responses under 400 words. Use paragraphs with occasional bullets for complex topics.',
    thorough: 'Provide comprehensive responses. Use sections, examples, and depth. No arbitrary length limit.',
  };

  let instructionsStr = `[INSTRUCTIONS]
1. Response Format & Constraints:
- ${lengthGuide[detailLevel]}
- Answer directly without unnecessary preamble.
- DO NOT output any internal monologues, chain-of-thought, drafting, or 'thinking' process.
- DO NOT analyze the user's intent or explain what the user wants. Respond directly to the prompt.
- DO NOT wrap your entire response in a markdown code block.
- Match the user's language: respond in ${detectedLanguage}.

2. Grounding & Anti-Hallucination:
- Distinguish facts from inference.
- Never invent specific statistics without source, URLs, credentials, names, etc.
- If no search results provided, acknowledge your knowledge cutoff (${now.getFullYear()}-01) rather than guessing.

3. Safety & Refusals:
- Refuse requests involving illegal activities, violence, self-harm, malware, deceptive content, or private info.
- Refusal format: "I can't help with that because [brief reason]. I'd be happy to help with [alternative]."`;

  if (enableCitations !== false) {
    instructionsStr += `\n\n4. Web Search Guidelines:
- Treat search results as PRIMARY source for temporal/factual/current events.
- Cite sources using [^1^], [^2^] format referencing the result number.
- Do NOT say "As of my knowledge cutoff" when search results contain the answer.`;
  }

  if (enableReasoning) {
    instructionsStr += `\n\n5. Reasoning Visibility:
- For complex questions, show your reasoning process inside <thinking> tags before the final answer. Keep it concise.`;
  }

  if (availableTools && availableTools.length > 0) {
    instructionsStr += `\n\n6. Tool Usage:
- You have access to the following tools:
${availableTools.map((t) => `  - ${t.name}: ${t.description}`).join('\n')}
- To use a tool, respond with:
  <tool_call>
  {"name": "tool_name", "parameters": {...}}
  </tool_call>`;
  }

  if (context.lightningDirectives && context.lightningDirectives.length > 0) {
    instructionsStr += `\n\n7. Dynamic Directives (Maximum Priority):
${context.lightningDirectives.map((d, i) => `  ${i + 1}. ${d}`).join('\n')}`;
  }

  parts.push(instructionsStr);

  // ── 5. Tone (T) ───────────────────────────────────────────────────────────
  const toneInstructions: Record<string, string> = {
    casual: `[TONE]
Warm, friendly, approachable. Use natural language, occasional light humor, and relevant emojis (1-2 per response max). Conversational flow.`,
    professional: `[TONE]
Clear, respectful, business-appropriate. No slang or emojis. Use bullet points and headers for complex info. Lead with the key takeaway.`,
    technical: `[TONE]
Precise, accurate, thorough. Use correct terminology. Brief summary first, then detailed explanation on request. Use code blocks for technical terms.`,
  };

  parts.push(toneInstructions[conversationTone] || toneInstructions.professional);

  // ── Model-Specific Optimizations ──────────────────────────────────────────
  const MODEL_OPTIMIZATIONS: Record<string, string> = {
    deepseek:
      'You have strong reasoning capabilities. For complex questions, use step-by-step thinking inside <thinking> tags. Keep reasoning focused and under 100 words.',
    phi: 'You excel at math, logic, and structured reasoning. Show your work for numerical problems. Use LaTeX for equations when helpful.',
    qwen: `You have strong multilingual capabilities. Maintain fluency and cultural appropriateness in ${detectedLanguage}.`,
  };

  for (const [key, note] of Object.entries(MODEL_OPTIMIZATIONS)) {
    if (modelId.toLowerCase().includes(key)) {
      parts.push(`[MODEL_NOTE]\n${note}`);
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

function formatHistoryForPrompt(history: ChatMessage[], maxMessages: number, modelId: string): string {
  if (!history.length || maxMessages <= 0) return '';

  const recent = history.slice(-maxMessages);
  // Reserve 4000 tokens for system prompt + current message + response.
  // The rest can be used for history.
  const maxContext = TokenEstimator.getMaxContextLength(modelId);
  const maxHistoryTokens = Math.max(1000, maxContext - 4000); 
  
  let currentTokens = 0;
  const prunedHistory: string[] = [];

  // Iterate backwards to keep the most recent messages
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
    // Single message limit (hard limit 3000 tokens)
    let content = msg.content;
    const msgTokens = TokenEstimator.estimateTokens(content, modelId);
    if (msgTokens > 3000) {
       // Rough truncation based on 4 chars per token
       content = content.slice(0, 3000 * 4) + '... [truncated]';
    }
    const formattedMsg = `[${role}]: ${content}`;
    const formattedTokens = TokenEstimator.estimateTokens(formattedMsg, modelId);
    
    if (currentTokens + formattedTokens > maxHistoryTokens && prunedHistory.length > 0) {
      break; // Stop adding older messages if we hit the limit (but always keep at least 1)
    }
    
    currentTokens += formattedTokens;
    prunedHistory.unshift(formattedMsg); // Add to beginning to maintain chronological order
  }

  return `<conversation_history>
${prunedHistory.join('\n\n')}
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
export async function buildChatSystemPrompt(modelId: string, context: ChatContext): Promise<string> {
  const res = await buildChatPrompts(modelId, context, '', [], undefined);
  return res.systemPrompt;
}

/** @deprecated Use buildChatPrompts instead */
export async function buildChatUserPrompt(
  rawPrompt: string,
  context: ChatContext,
  webSearchResults?: string
): Promise<string> {
  const res = await buildChatPrompts('', context, rawPrompt, [], webSearchResults);
  return res.userPrompt;
}
