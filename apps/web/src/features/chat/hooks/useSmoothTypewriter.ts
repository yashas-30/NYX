import { useMemo } from 'react';

/**
 * Ultra-fast, zero-lag streaming text renderer with automatic markdown code-fence balancing.
 *
 * Designed for lightning-fast 100+ tokens/sec cloud & local LLM streams.
 * Eliminates artificial character pacing bottlenecks while ensuring code blocks
 * and markdown elements render cleanly without syntax glitches mid-stream.
 */
export function useSmoothTypewriter(text: string, isStreaming: boolean): string {
  return useMemo(() => {
    if (!isStreaming || !text) {
      return text;
    }

    // Balance unclosed code fences so markdown/highlight.js never crashes or flashes
    const fences = text.match(/```/g);
    if (fences && fences.length % 2 !== 0) {
      return text + '\n```';
    }

    return text;
  }, [text, isStreaming]);
}
