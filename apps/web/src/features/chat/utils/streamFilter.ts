const FLUFF_PATTERNS = [
  /^(?:sure|certainly|of course|absolutely|happily|i'd be happy to|here is|here's|below is|as requested)[!.,]?\s*(?:here (?:is|are)|the following)?/i,
  /^as (?:lucifer|an ai|a helpful ai)(?:, the supreme ai agent)?(?: of nyx)?[!.,]?\s*/i,
  /^i (?:have|will|am going to) (?:created|generated|analyzed|processed|retrieved|found|written).*\.\s*/i,
  /^(?:based on|according to) (?:the|your) (?:search|provided|retrieved) (?:results|data|context),?\s*/i,
  /^(?:you asked|you requested|you wanted) (?:me to|for).*\n+/i,
  /^here is the (?:code|answer|result|information|response) (?:you requested)?:?\s*/i,
  /^(?:the user has (?:said|asked|requested|provided)|i'll respond in a way|i will maintain a|i need to answer|the user is asking|in this interaction, i should).*\n+/i,
];

export class StreamFluffFilter {
  private buffer = '';
  private headPassed = false;

  public processChunk(chunk: string): string {
    if (this.headPassed) return chunk;

    this.buffer += chunk;
    if (this.buffer.length < 180 && !this.buffer.includes('\n\n')) {
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

