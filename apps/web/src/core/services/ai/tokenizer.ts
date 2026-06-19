import type { Tiktoken } from 'tiktoken';

let tokenizer: Tiktoken | null = null;
let tokenizerPromise: Promise<Tiktoken> | null = null;

/**
 * Lazy-load the tiktoken BPE tokenizer (ONNX backend).
 * First call downloads the ONNX model (~18 MB) and compiles BPE ranks.
 * Subsequent calls resolve instantly from cache.
 */
export async function getTokenizer(): Promise<Tiktoken> {
  if (tokenizer) return tokenizer;
  if (tokenizerPromise) return tokenizerPromise;

  tokenizerPromise = (async () => {
    const { encoding_for_model } = await import('tiktoken');
    const enc = encoding_for_model('gpt-4' as any);
    tokenizer = enc;
    return enc;
  })();

  return tokenizerPromise;
}

/**
 * Count tokens in text using the BPE tokenizer.
 * Falls back to estimateTokens on failure.
 */
export async function countTokens(text: string): Promise<number> {
  try {
    const enc = await getTokenizer();
    return enc.encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}
