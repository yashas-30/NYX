import { useState, useEffect, useRef } from 'react';

/**
 * Balance unclosed markdown code fences so ReactMarkdown / syntax highlighters
 * don't crash, flicker, or shift layout mid-stream.
 */
function balanceCodeFences(str: string): string {
  const fences = str.match(/```/g);
  if (fences && fences.length % 2 !== 0) {
    return str + '\n```';
  }
  return str;
}

/**
 * High-performance, adaptive RAF typewriter hook for LLM streaming.
 *
 * Smoothly interpolates text chunk arrivals into a fluid 60/120fps stream:
 * - Dynamic catch-up: scales character speed based on queue depth to prevent lag
 * - Zero artificial bottleneck: small chunks stream smoothly, large chunks catch up in <100ms
 * - Auto fence-balancing: ensures unclosed ``` blocks don't tear the markdown parser
 * - Instant finish: immediately snaps to full text when streaming ends
 */
export function useSmoothTypewriter(text: string, isStreaming: boolean): string {
  const [displayedLength, setDisplayedLength] = useState(() =>
    isStreaming ? 0 : text?.length || 0
  );
  const textRef = useRef(text);
  textRef.current = text;

  const displayedLengthRef = useRef(displayedLength);
  displayedLengthRef.current = displayedLength;

  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    // If not streaming, immediately reveal all text
    if (!isStreaming) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      setDisplayedLength(text?.length || 0);
      return;
    }

    if (!text) {
      setDisplayedLength(0);
      return;
    }

    // If text was shortened or reset (e.g. new message / branch change)
    if (displayedLengthRef.current > text.length) {
      setDisplayedLength(text.length);
      return;
    }

    const animate = () => {
      const currentTarget = textRef.current;
      const targetLen = currentTarget ? currentTarget.length : 0;
      const currentLen = displayedLengthRef.current;

      if (currentLen < targetLen) {
        const backlog = targetLen - currentLen;
        // Adaptive step: 2 chars min at 60fps, accelerating aggressively when backlog grows
        // (e.g. 50 char backlog -> ~7 chars/frame -> catches up in ~7 frames / 110ms)
        const step = Math.max(2, Math.ceil(backlog / 6));
        const nextLen = Math.min(targetLen, currentLen + step);

        displayedLengthRef.current = nextLen;
        setDisplayedLength(nextLen);

        if (nextLen < targetLen) {
          rafIdRef.current = requestAnimationFrame(animate);
          return;
        }
      }

      rafIdRef.current = null;
    };

    if (rafIdRef.current === null && displayedLengthRef.current < text.length) {
      rafIdRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [text, isStreaming]);

  if (!isStreaming || !text) {
    return text || '';
  }

  const sliced = text.slice(0, displayedLength);
  return balanceCodeFences(sliced);
}
