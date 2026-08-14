const FLUFF_PATTERNS = [
  // ── Leaked instruction tags & special prompt tokens ────────────────────────
  /^(?:<\/?(?:role|state|constraints|tools|system|system_instructions|instructions|context|prompt|user|assistant|think|thought|safety)\b[^>]*>|\[\/?(?:INST|SYSTEM|SAFETY|RESEARCH|CONTEXT)\]|<\|im_start\|>|<\|im_end\|>)\s*/i,

  // ── Leaked system directives & section headers ──────────────────────────────
  /^(?:Instruction|STRICT DIRECTNESS MANDATE|CRITICAL REAL-TIME GROUNDING MANDATE|ACTIVE MODEL CAPABILITY PROFILE|PREVIOUS ASSISTANT RESPONSE CONTEXT|CURRENT ENGINE CONTEXT|SYSTEM DIRECTIVE|SYSTEM INSTRUCTIONS|DEVELOPER INSTRUCTIONS|INSTRUCTIONS|SYSTEM|DEVELOPER):?\s*/i,
  /^(?:as requested by the system|following system instructions|according to system prompt|per system directive).*\n+/i,
  /^(?:Answer the user's question about model capabilities using ONLY the verified data above|Format as a clear, friendly markdown response).*\n*/i,

  // ── Leaked prompt context blocks (web search injection) ────────────────────
  // Strip the whole [LIVE WEB SEARCH RESULTS]...[/LIVE WEB SEARCH RESULTS] block if echoed
  /^\[LIVE WEB SEARCH RESULTS\][\s\S]*?\[\/LIVE WEB SEARCH RESULTS\]\s*/i,
  // Strip "User question:" or "User query:" prefixes that come from search prompt injection
  /^(?:User question|User query|User's question|User's query):\s*/i,
  // Strip any other bracket-wrapped context blocks at the start
  /^\[(?:CONTEXT|RESEARCH CONTEXT|SYSTEM CONTEXT|LIVE WEB SEARCH RESULTS)[^\]]*\][\s\S]*?\[\/(?:CONTEXT|RESEARCH CONTEXT|SYSTEM CONTEXT|LIVE WEB SEARCH RESULTS)\]\s*/i,

  // ── Conversational fluff & AI self-identifications ──────────────────────────
  /^(?:sure|certainly|of course|absolutely|happily|i'd be happy to|here is|here's|below is|as requested)[!.,]?\s*(?:here (?:is|are)|the following)?/i,
  /^as (?:lucifer|an ai|a helpful ai)(?:, the supreme ai agent)?(?: of nyx)?[!.,]?\s*/i,
  /^i (?:have|will|am going to) (?:created|generated|analyzed|processed|retrieved|found|written).*\.\s*/i,
  /^(?:based on|according to) (?:the|your) (?:search|provided|retrieved) (?:results|data|context),?\s*/i,
  /^(?:you asked|you requested|you wanted) (?:me to|for).*\n+/i,
  /^here is the (?:code|answer|result|information|response) (?:you requested)?:?\s*/i,
  /^(?:the user is asking|the user's request|i need to use|since no specific search|i will formulate|i should use|in this interaction, i should|the user has asked).*\n+/i,
  /^(?:The user is asking for|I need to use the provided|Since no specific search was executed|The user's request is a research query|I should use the \w+ tool|I will formulate a search query).*\n*/gi,
];

export class StreamFluffFilter {
  private buffer = '';
  private headPassed = false;

  public processChunk(chunk: string): string {
    if (this.headPassed) return chunk;

    this.buffer += chunk;
    // Wait for either 120 chars or a paragraph break — whichever comes first.
    // This is small enough to catch short preambles but avoids false-positives on
    // legitimate content that starts with a word matching a fluff pattern.
    if (this.buffer.length < 120 && !this.buffer.includes('\n')) {
      return '';
    }

    this.headPassed = true;
    let cleaned = this.buffer;
    for (const pattern of FLUFF_PATTERNS) {
      cleaned = cleaned.replace(pattern, '');
    }
    return cleaned;
  }

  public flush(): string {
    if (this.headPassed) return '';
    this.headPassed = true;
    let cleaned = this.buffer;
    for (const pattern of FLUFF_PATTERNS) {
      cleaned = cleaned.replace(pattern, '');
    }
    return cleaned;
  }
}

