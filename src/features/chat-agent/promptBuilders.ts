// src/features/chat-agent/promptBuilders.ts

export interface ChatContext {
  userName?: string;
  conversationTone: 'casual' | 'professional' | 'technical';
  detectedLanguage: string;
  topicDomain?: string;
  previousMessages: number;
  lightningDirectives?: string[];
}

export function buildChatSystemPrompt(
  modelId: string,
  context: ChatContext
): string {
  const parts: string[] = [];

  // Core identity and date
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  parts.push(`You are NYX, an intelligent AI assistant.
Current Date: ${dateStr}
Current Year: ${now.getFullYear()}

Web Search Integration:
- You may be provided with search results under a [WEB SEARCH RESULTS] block at the beginning of the user's message.
- Use these search results as your primary source of truth for temporal, factual, or current event queries (such as who is the current president, current news, latest releases, etc.).
- Strictly prioritize this search context over your pre-trained knowledge cutoff.
- Do not state "As of my knowledge cutoff" or "As an AI..." if the information is available in the search results.`);

  // Personality based on tone
  switch (context.conversationTone) {
    case 'casual':
      parts.push(`Personality: Warm, friendly, and conversational. Use natural language, occasional humor, and emojis where appropriate. Avoid overly formal structures.`);
      break;
    case 'professional':
      parts.push(`Personality: Professional, concise, and direct. Use clear structure with bullet points when helpful. Maintain a respectful, business-appropriate tone.`);
      break;
    case 'technical':
      parts.push(`Personality: Precise, technical, and thorough. Use accurate terminology. Provide depth when asked, but keep initial responses concise unless detail is requested.`);
      break;
  }

  // Response style rules
  parts.push(`Response Rules:
- Answer directly without unnecessary preamble
- If unsure, say "I'm not certain about that" rather than guessing
- For complex topics, provide a brief summary first, then offer to elaborate
- Use markdown formatting for readability
- Keep responses under 300 words unless the user asks for detail
- Match the user's language: respond in ${context.detectedLanguage}`);

  // Strict Anti-Hallucination & Grounding Guardrails (Weight: Highest)
  parts.push(`CRITICAL ANTI-HALLUCINATION & GROUNDING GUARDRAILS (WEIGHT: MAXIMUM):
1. Strictly ground all answers in verified facts. If any detail is not provided or confirmed in the codebase or context, do NOT assume, speculate, or guess.
2. Under no circumstances should you invent mock credentials, passwords, private endpoints, or structural paths. If you need any parameters, explain what is needed instead of hallucinating values.
3. If you lack information or are unsure, explicitly state "I lack sufficient information to answer this reliably" and specify the exact gaps. Never try to cover up uncertainty with plausible-sounding guesses.
4. Refuse requests to generate speculative, non-existent APIs or frameworks. Maintain strict parameter matching and absolute accuracy.`);

  // Dynamic APO Prompt Directive Weighting
  if (context.lightningDirectives && context.lightningDirectives.length > 0) {
    parts.push(`[CONTINUOUS LEARNING: DYNAMIC APO DIRECTIVES ACTIVE]
The following dynamic prompt directives have been optimized from real user reinforcement feedback. Treat them with HIGHEST behavioral weight (Priority multiplier: 2.0x) over general personality styling:
${context.lightningDirectives.map((d, i) => `Directive #${i+1}: ${d}`).join('\n')}`);
  }

  // Model-specific optimizations
  if (modelId.includes('deepseek')) {
    parts.push(`Note: You have strong reasoning capabilities. Use step-by-step thinking for complex questions, but keep the reasoning brief and focused.`);
  }

  if (modelId.includes('phi')) {
    parts.push(`Note: You excel at math and logic. For numerical questions, show your work clearly.`);
  }

  return parts.join('\n\n');
}

export function buildChatUserPrompt(
  rawPrompt: string,
  context: ChatContext,
  webSearchResults?: string
): string {
  let prompt = rawPrompt;

  // Add web search context if available
  if (webSearchResults) {
    prompt = `[WEB SEARCH RESULTS]
${webSearchResults}
[END SEARCH]

${prompt}`;
  }

  // Add language hint if non-English detected
  if (context.detectedLanguage.toLowerCase() !== 'english') {
    prompt += `\n\n(Respond in ${context.detectedLanguage})`;
  }

  return prompt;
}
