export type Intent = 'coding' | 'creative' | 'general' | 'query';

export class IntentRouter {
  /**
   * Classifies the user's intent locally using simple heuristics.
   * Can be upgraded to use a fast local embedding or classification model.
   */
  async classify(prompt: string): Promise<Intent> {
    const p = prompt.toLowerCase();
    
    if (
      p.includes('```') || 
      p.includes('function') || 
      p.includes('class') || 
      p.includes('code') || 
      p.includes('error') || 
      p.includes('bug') ||
      p.includes('implement')
    ) {
      return 'coding';
    }
    
    if (
      p.includes('story') || 
      p.includes('creative') || 
      p.includes('poem') || 
      p.includes('write')
    ) {
      return 'creative';
    }

    if (
      p.includes('how to') ||
      p.includes('what is') ||
      p.includes('explain')
    ) {
      return 'query';
    }
    
    return 'general';
  }

  /**
   * Returns ideal model parameters and system overrides based on intent.
   */
  getIntentConfig(intent: Intent) {
    switch (intent) {
      case 'coding':
        return {
          temperature: 0.1,
          systemPrefix: "You are an elite coding assistant. Focus on correctness, edge cases, and robust execution. DO NOT provide conversational filler.",
          requiresTools: true
        };
      case 'creative':
        return {
          temperature: 0.8,
          systemPrefix: "You are a creative writing partner. Be expressive, imaginative, and engaging.",
          requiresTools: false
        };
      case 'query':
        return {
          temperature: 0.3,
          systemPrefix: "You are a knowledgeable technical assistant. Explain concepts clearly and concisely.",
          requiresTools: true // might need to search web
        };
      default:
        return {
          temperature: 0.4,
          systemPrefix: "You are a helpful and highly capable AI assistant.",
          requiresTools: false
        };
    }
  }
}
