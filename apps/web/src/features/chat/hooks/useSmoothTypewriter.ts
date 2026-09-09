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
 * Calculate adaptive interval per character in milliseconds based on buffer backlog.
 *
 * Pacing curve:
 * - Tiny backlog (1-5 chars): ~24ms per char (~42 chars/sec) to bridge inter-token arrival gaps smoothly.
 * - Small backlog (6-20 chars): smoothly ramps from ~24ms down to ~18ms (~55 chars/sec).
 * - Moderate backlog (21-50 chars): ramps from ~18ms down to ~12ms (~80 chars/sec).
 * - Large backlog (51-80 chars): ramps from ~12ms down to ~6ms (~160 chars/sec).
 * - Massive backlog (>80 chars): ramps from ~6ms down to 2-3ms (~300-500 chars/sec).
 */
function getCharIntervalMs(backlog: number): number {
  if (backlog <= 5) {
    return 24;
  }
  if (backlog <= 20) {
    return 24 - (backlog - 5) * 0.4;
  }
  if (backlog <= 50) {
    return 18 - (backlog - 20) * 0.2;
  }
  if (backlog <= 80) {
    return 12 - (backlog - 50) * 0.2;
  }
  if (backlog <= 150) {
    return Math.max(3, 6 - (backlog - 80) * 0.05);
  }
  return 2;
}

/**
 * High-performance, adaptive RAF typewriter hook for LLM streaming.
 *
 * Smoothly interpolates text chunk arrivals into a fluid, character-by-character stream:
 * - True typewriter cadence: types single letters continuously without chunky bursts
 * - High-precision accumulator: preserves millisecond fractions across frames for jitter-free cadence
 * - Continuous playback: incoming token chunks feed into the active loop without canceling or resetting RAF
 * - Dynamic pacing interpolation: adapts character interval based on backlog to eliminate inter-token pauses
 * - Zero lag accumulation: automatically accelerates if backlog grows (e.g. fast token bursts or prefill)
 * - Auto fence-balancing: ensures unclosed ``` blocks don't tear the markdown parser mid-stream
 * - Instant completion: immediately reveals all text when streaming finishes
 */
export function useSmoothTypewriter(text: string, isStreaming: boolean): string {
  const [displayedLength, setDisplayedLength] = useState(() =>
    isStreaming ? 0 : text?.length || 0
  );

  const textRef = useRef(text);
  textRef.current = text;

  const displayedLengthRef = useRef(displayedLength);
  displayedLengthRef.current = displayedLength;

  const lastFrameTimeRef = useRef<number>(0);
  const accumulatorRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    // 1. If not streaming, immediately reveal all text with zero delay
    if (!isStreaming) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      lastFrameTimeRef.current = 0;
      accumulatorRef.current = 0;
      setDisplayedLength(text?.length || 0);
      return;
    }

    // 2. Empty text handling
    if (!text) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      lastFrameTimeRef.current = 0;
      accumulatorRef.current = 0;
      setDisplayedLength(0);
      return;
    }

    // 3. If text was shortened or reset (e.g. new message / branch change)
    if (displayedLengthRef.current > text.length) {
      displayedLengthRef.current = text.length;
      setDisplayedLength(text.length);
      accumulatorRef.current = 0;
      return;
    }

    // 4. Animation loop: reads continuously from textRef.current
    const animate = (timestamp: number) => {
      const currentTarget = textRef.current || '';
      const targetLen = currentTarget.length;
      let currentLen = displayedLengthRef.current;

      if (currentLen >= targetLen) {
        rafIdRef.current = null;
        lastFrameTimeRef.current = 0;
        accumulatorRef.current = 0;
        return;
      }

      const now = timestamp || performance.now();
      const lastTime = lastFrameTimeRef.current || now;
      // Clamp elapsed time to 100ms to prevent huge runaway catchup if tab was backgrounded
      const elapsed = Math.min(100, Math.max(0, now - lastTime));
      lastFrameTimeRef.current = now;

      let accumulator = accumulatorRef.current + elapsed;
      const backlog = targetLen - currentLen;
      const charIntervalMs = getCharIntervalMs(backlog);

      let charsToAdvance = 0;
      const stepSize = backlog > 80 ? Math.max(1, Math.floor(backlog / 40)) : 1;

      // Consume accumulator time by advancing character-by-character
      while (accumulator >= charIntervalMs && currentLen + charsToAdvance < targetLen) {
        accumulator -= charIntervalMs;
        charsToAdvance += stepSize;
      }

      // If just starting out from 0 with backlog, immediately type the first character for snappy response
      if (charsToAdvance === 0 && currentLen === 0 && targetLen > 0) {
        charsToAdvance = 1;
        accumulator = 0;
      }

      if (charsToAdvance > 0) {
        const nextLen = Math.min(targetLen, currentLen + charsToAdvance);
        displayedLengthRef.current = nextLen;
        setDisplayedLength(nextLen);
        currentLen = nextLen;
      }

      accumulatorRef.current = accumulator;

      if (currentLen < targetLen) {
        rafIdRef.current = requestAnimationFrame(animate);
      } else {
        rafIdRef.current = null;
        lastFrameTimeRef.current = 0;
        accumulatorRef.current = 0;
      }
    };

    // 5. If loop is not currently active, launch it; if already running, let it continue seamlessly
    if (rafIdRef.current === null && displayedLengthRef.current < text.length) {
      lastFrameTimeRef.current = performance.now();
      rafIdRef.current = requestAnimationFrame(animate);
    }
  }, [text, isStreaming]);

  // Clean up RAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  if (!isStreaming || !text) {
    return text || '';
  }

  const sliced = text.slice(0, displayedLength);
  return balanceCodeFences(sliced);
}
