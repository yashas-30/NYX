import { get_encoding, Tiktoken } from 'tiktoken';

export class TokenEstimator {
  private static cl100k: Tiktoken | null = null;

  static init() {
    if (!this.cl100k) {
      try {
        this.cl100k = get_encoding('cl100k_base');
      } catch (e) {
        console.warn('Failed to load cl100k_base tokenizer. Using fallback estimation.', e);
      }
    }
  }

  /**
   * Estimate the number of tokens in the given text.
   * If modelId is provided, it can apply specific multipliers for different tokenizers.
   */
  static estimateTokens(text?: string, modelId?: string): number {
    if (!text) return 0;
    
    // Default fallback is 4 chars per token
    let estimate = Math.ceil(text.length / 4);

    try {
      this.init();
      if (this.cl100k) {
        estimate = this.cl100k.encode(text).length;
      }
    } catch (e) {
      // Fallback
    }

    // Adjust for specific models if we know they use less efficient tokenizers
    if (modelId) {
      const lowerModel = modelId.toLowerCase();
      if (lowerModel.includes('qwen') || lowerModel.includes('llama') || lowerModel.includes('deepseek')) {
        // Many open source models have smaller vocabularies for non-English, 
        // leading to higher token counts (about 1.2x to 1.5x of cl100k on average).
        estimate = Math.ceil(estimate * 1.3);
      }
    }

    return estimate;
  }

  /**
   * Get the safe maximum context length for a given model.
   */
  static getMaxContextLength(modelId: string): number {
    const lowerModel = modelId.toLowerCase();
    
    // Very small local models
    if (lowerModel.includes('1.5b') || lowerModel.includes('1b')) return 4000;
    if (lowerModel.includes('3b') || lowerModel.includes('mini')) return 8000;
    if (lowerModel.includes('7b') || lowerModel.includes('8b')) return 16000;
    
    // Known long context models
    if (lowerModel.includes('gpt-4o')) return 128000;
    if (lowerModel.includes('claude-3')) return 200000;
    if (lowerModel.includes('gemini-1.5')) return 1000000;
    
    // Safe default for unknown local models
    return 8000;
  }
}
