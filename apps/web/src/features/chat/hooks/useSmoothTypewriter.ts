import { useState, useEffect, useRef } from 'react';

/**
 * A hook that progressively reveals text to create a smooth, fluent typewriter effect.
 * It intelligently accelerates when falling behind and stops when streaming is complete.
 * It also balances markdown code blocks to prevent layout thrashing during ReactMarkdown parsing.
 */
export function useSmoothTypewriter(text: string, isStreaming: boolean): string {
  const [displayedText, setDisplayedText] = useState(isStreaming ? '' : text);
  const textRef = useRef(text);
  const displayedRef = useRef(isStreaming ? '' : text);
  const requestRef = useRef<number | null>(null);

  useEffect(() => {
    textRef.current = text;
    
    // If we're not streaming, instantly snap to the full text
    if (!isStreaming) {
      setDisplayedText(text);
      displayedRef.current = text;
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      return;
    }

    // If a new stream starts (text is shorter than displayed), reset
    if (text.length < displayedRef.current.length) {
      setDisplayedText(text);
      displayedRef.current = text;
    }
  }, [text, isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;

    const animate = () => {
      const currentLen = displayedRef.current.length;
      const targetLen = textRef.current.length;
      
      if (currentLen < targetLen) {
        const remaining = targetLen - currentLen;
        
        // Elastic smooth catch-up over ~4 frames (~60ms)
        // If falling too far behind (e.g. fast local model streaming at 50+ tokens/sec),
        // skip the typewriter animation and snap to the current length.
        // This acts as a natural debounce, preventing massive React render lag.
        const charsToAdd = remaining > 40 ? remaining : Math.max(1, Math.ceil(remaining / 4));
        
        const nextText = textRef.current.slice(0, currentLen + charsToAdd);
        displayedRef.current = nextText;

        let safeText = nextText;
        
        // Balance code blocks to prevent markdown parsing glitches (UI thrashing)
        const codeBlockMatches = nextText.match(/```/g);
        if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
          // If we have an unclosed code block, append closing backticks so the parser doesn't freak out
          safeText += '\n```';
        }

        setDisplayedText(safeText);
      }
      
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isStreaming]);

  return displayedText;
}
