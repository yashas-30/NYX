import { useState, useEffect, useRef } from 'react';

/**
 * Smooth typewriter effect for streaming text.
 *
 * Key design decisions:
 *  - Hard cap of 80 chars/frame: prevents the "chunk dump" glitch seen in
 *    long (1min+) responses where remaining/4 could be hundreds of chars at once.
 *  - isStreamingRef: lets the RAF loop react to streaming ending without
 *    requiring a full restart, so any remaining buffered text flushes instantly.
 *  - Adaptive speed: 1 → 3 → 12 → 35 → 80 chars/frame based on lag,
 *    giving a smooth typewriter feel when caught up and fast catch-up when behind.
 */
export function useSmoothTypewriter(text: string, isStreaming: boolean): string {
  const [displayedText, setDisplayedText] = useState(isStreaming ? '' : text);

  const textRef = useRef(text);
  const displayedRef = useRef(isStreaming ? '' : text);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  // Ref-based streaming flag so the RAF loop sees updates without restarting
  const isStreamingRef = useRef(isStreaming);

  // Sync isStreamingRef and textRef without restarting the RAF loop
  useEffect(() => {
    isStreamingRef.current = isStreaming;
    textRef.current = text;

    if (!isStreaming) {
      // Streaming ended — immediately reveal the full final text
      if (displayedRef.current !== text) {
        displayedRef.current = text;
        setDisplayedText(text);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // New stream started with shorter text than what's displayed — hard reset
    if (text.length < displayedRef.current.length) {
      displayedRef.current = '';
      setDisplayedText('');
    }
  }, [text, isStreaming]);

  // Single RAF loop, started when streaming begins, cleaned up when it ends
  useEffect(() => {
    if (!isStreaming) return;

    const flush = (time: number) => {
      // If streaming has ended between frames, flush everything and stop
      if (!isStreamingRef.current) {
        const full = textRef.current;
        if (displayedRef.current !== full) {
          displayedRef.current = full;
          setDisplayedText(full);
        }
        return;
      }

      const currentLen = displayedRef.current.length;
      const targetLen = textRef.current.length;

      if (currentLen < targetLen) {
        // Throttle to ~60fps
        if (time - lastTimeRef.current >= 16) {
          lastTimeRef.current = time;
          const remaining = targetLen - currentLen;

          // Adaptive chunking — HARD MAX of 80 chars/frame to prevent
          // the jarring text-dump that occurs in long streaming responses.
          // Tier:  nearly caught up → slow, very far behind → fast (but capped).
          const chunk =
            remaining <= 10  ? 1  :
            remaining <= 40  ? 3  :
            remaining <= 150 ? 12 :
            remaining <= 400 ? 35 : 80;

          const nextText = textRef.current.slice(0, currentLen + chunk);
          displayedRef.current = nextText;

          // Balance open code fences to prevent markdown parsing glitches
          let safeText = nextText;
          const fences = nextText.match(/```/g);
          if (fences && fences.length % 2 !== 0) {
            safeText += '\n```';
          }

          setDisplayedText(safeText);
        }
      }

      rafRef.current = requestAnimationFrame(flush);
    };

    rafRef.current = requestAnimationFrame(flush);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // Only restart the loop when streaming state flips.
    // textRef is a ref and always current without being in the dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  return displayedText;
}
