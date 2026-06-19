/**
 * Provider-specific defaults (per-provider max tokens + token estimation).
 */

/**
 * Returns the appropriate max_tokens default for each provider.
 * These mirror the limits in the Rust llm.rs command.
 */
export function getDefaultMaxTokens(provider: string): number {
  switch (provider) {
    case 'anthropic':
      return 32_768;  // Claude Sonnet/Opus support 64K+; use 32K as safe default
    case 'openai':
    case 'openrouter':
    case 'deepseek':
      return 16_384;
    case 'gemini':
      return 8_192;
    case 'ollama':
    case 'lmstudio':
      return 8_192;   // Local models — conservative to avoid OOM
    default:
      return 8_192;
  }
}

/**
 * Provider-specific characters-per-token ratios for accurate context budgeting.
 * Using GPT-4's cl100k tokenizer for all providers (as was done before) gives
 * 15-30% wrong counts for Gemini (SentencePiece) and Claude (BPE variant).
 */
export function estimateTokens(text: string, provider: string): number {
  const len = text.length;
  switch (provider) {
    case 'gemini':
      return Math.ceil(len / 3.5);   // Gemini SentencePiece: ~3.5 chars/token
    case 'anthropic':
      return Math.ceil(len / 3.7);   // Claude BPE variant: ~3.7 chars/token
    case 'openai':
    case 'openrouter':
    case 'deepseek':
      return Math.ceil(len / 4.0);   // GPT-4 cl100k: ~4 chars/token
    default:
      return Math.ceil(len / 3.8);   // Conservative middle ground
  }
}
