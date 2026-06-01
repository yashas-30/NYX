export interface PromptAnalysis {
  intent: 'question' | 'command' | 'conversation' | 'search' | 'code';
  tone: 'casual' | 'professional' | 'technical';
  domain: string;
  requiresWebSearch: boolean;
  requiresReasoning: boolean;
  estimatedComplexity: 1 | 2 | 3;
}

export class PromptAnalysisService {
  /**
   * Analyzes a prompt rapidly (local heuristic rules + regex)
   * Designed to be run on every keystroke or submission without API calls.
   */
  public analyze(prompt: string): PromptAnalysis {
    const lower = prompt.toLowerCase();
    
    return {
      intent: this.detectIntent(lower),
      tone: this.detectTone(lower),
      domain: this.detectDomain(lower),
      requiresWebSearch: this.checkWebSearchNeed(lower),
      requiresReasoning: this.checkReasoningNeed(lower),
      estimatedComplexity: this.estimateComplexity(lower, prompt),
    };
  }

  private detectIntent(lower: string): PromptAnalysis['intent'] {
    if (lower.match(/^(what|how|why|when|where|who)\b|\?$/)) return 'question';
    if (lower.match(/^(write|create|build|generate|code|fix|refactor)\b/)) return 'code';
    if (lower.match(/^(search|find|lookup|google)\b/)) return 'search';
    if (lower.match(/^(do|make|set|change|update)\b/)) return 'command';
    return 'conversation';
  }

  private detectTone(lower: string): PromptAnalysis['tone'] {
    if (lower.includes('explain') && (lower.includes('code') || lower.includes('how does'))) return 'technical';
    if (lower.match(/\b(hey|hi|thanks|lol|dude|bro)\b/)) return 'casual';
    return 'professional';
  }

  private detectDomain(lower: string): string {
    const domains = [
      { pattern: /\b(react|typescript|python|rust|go|api|database|sql)\b/, name: 'software_engineering' },
      { pattern: /\b(math|physics|chemistry|biology|science)\b/, name: 'science' },
      { pattern: /\b(stock|market|finance|invest|economy)\b/, name: 'finance' },
      { pattern: /\b(law|legal|court|sue|attorney)\b/, name: 'legal' },
      { pattern: /\b(health|medical|doctor|symptom|disease)\b/, name: 'medical' }
    ];

    for (const d of domains) {
      if (d.pattern.test(lower)) return d.name;
    }
    return 'general';
  }

  private checkWebSearchNeed(lower: string): boolean {
    const timeSensitive = /\b(today|latest|current|now|news|recent|weather|price)\b/;
    const explicitSearch = /\b(search|find|lookup|google)\b/;
    return timeSensitive.test(lower) || explicitSearch.test(lower);
  }

  private checkReasoningNeed(lower: string): boolean {
    const reasoningKeywords = /\b(why|how|explain|step by step|analyze|compare|solve|prove)\b/;
    return reasoningKeywords.test(lower);
  }

  private estimateComplexity(lower: string, original: string): 1 | 2 | 3 {
    if (original.length > 500 || lower.includes('compare') || lower.includes('analyze')) return 3;
    if (original.length > 100 || this.checkReasoningNeed(lower)) return 2;
    return 1;
  }
}

export const promptAnalysisService = new PromptAnalysisService();
