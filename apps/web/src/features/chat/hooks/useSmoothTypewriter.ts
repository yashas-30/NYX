import { useState, useEffect, useRef } from 'react';

/**
 * A hook that progressively reveals text to create a smooth, fluent typewriter effect.
 * It intelligently throttles updates to prevent ReactMarkdown from thrashing the main thread.
 * It also balances markdown code blocks to prevent layout jumping.
 */
export function useSmoothTypewriter(text: string, isStreaming: boolean): string {
  const [displayedText, setDisplayedText] = useState(isStreaming ? '' : text);
  
  const textRef = useRef(text);
  const displayedRef = useRef(isStreaming ? '' : text);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    textRef.current = text;
    
    if (!isStreaming) {
      setDisplayedText(text);
      displayedRef.current = text;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      return;
    }

    // Reset if a new stream starts
    if (text.length < displayedRef.current.length) {
      setDisplayedText(text);
      displayedRef.current = text;
    }
  }, [text, isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;

    const flush = (time: number) => {
      // Throttle updates to roughly 60fps (~16ms)
      if (time - lastTimeRef.current < 16) {
        rafRef.current = requestAnimationFrame(flush);
        return;
      }
      
      const currentLen = displayedRef.current.length;
      const targetLen = textRef.current.length;
      
      if (currentLen < targetLen) {
        lastTimeRef.current = time;
        const remaining = targetLen - currentLen;
        
        // Organic typewriter chunking: 
        // 1-2 chars when caught up, scaling up smoothly when falling behind
        const chunk = remaining > 200 ? Math.ceil(remaining / 4) :
                      remaining > 50 ? 5 :
                      remaining > 15 ? 2 : 1;
                      
        const charsToAdd = Math.min(remaining, chunk);
        const nextText = textRef.current.slice(0, currentLen + charsToAdd);
        displayedRef.current = nextText;

        let safeText = nextText;
        
        // Balance code blocks to prevent markdown parsing glitches (UI thrashing)
        const codeBlockMatches = nextText.match(/```/g);
        if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
          safeText += '\n```';
        }

        setDisplayedText(safeText);
      }
      
      rafRef.current = requestAnimationFrame(flush);
    };

    rafRef.current = requestAnimationFrame(flush);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isStreaming]);

  return displayedText;
}
