import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSmoothTypewriter } from '../features/chat/hooks/useSmoothTypewriter';

describe('useSmoothTypewriter hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('immediately returns full text when isStreaming is false', () => {
    const text = 'Hello world, this is a complete message.';
    const { result } = renderHook(() => useSmoothTypewriter(text, false));

    expect(result.current).toBe(text);
  });

  it('immediately reveals full text when isStreaming transitions from true to false', () => {
    let streaming = true;
    let text = 'Streaming model response';

    const { result, rerender } = renderHook(({ t, s }) => useSmoothTypewriter(t, s), {
      initialProps: { t: text, s: streaming },
    });

    // Mid-stream it starts at 0 or small length
    expect(result.current.length).toBeLessThanOrEqual(text.length);

    // End streaming
    streaming = false;
    rerender({ t: text, s: streaming });

    expect(result.current).toBe(text);
  });

  it('types out character-by-character smoothly during streaming', () => {
    const text = 'Hello';
    const { result } = renderHook(() => useSmoothTypewriter(text, true));

    expect(result.current).toBe('');

    // Advance by 30ms (first character interval)
    act(() => {
      vi.advanceTimersByTime(30);
    });

    expect(result.current.length).toBeGreaterThanOrEqual(1);
    expect(text.startsWith(result.current)).toBe(true);

    // Advance enough time to complete all 5 characters
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe('Hello');
  });

  it('types each single character without jumping 3 to 4 words at once', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const { result } = renderHook(() => useSmoothTypewriter(text, true));

    const lengths: number[] = [];
    // Sample every 25ms over 300ms
    for (let i = 0; i < 12; i++) {
      act(() => {
        vi.advanceTimersByTime(25);
      });
      lengths.push(result.current.length);
    }

    // Verify lengths increase steadily without jumping by > 10 characters in a single 25ms tick
    for (let i = 1; i < lengths.length; i++) {
      const delta = lengths[i] - lengths[i - 1];
      expect(delta).toBeLessThanOrEqual(3);
    }
  });

  it('smoothly accepts new token deltas without jerky jumps or pauses', () => {
    let text = 'Quantum';
    const { result, rerender } = renderHook(({ t, s }) => useSmoothTypewriter(t, s), {
      initialProps: { t: text, s: true },
    });

    // Advance 60ms to type initial letters
    act(() => {
      vi.advanceTimersByTime(60);
    });
    const midLength = result.current.length;
    expect(midLength).toBeGreaterThan(0);
    expect(midLength).toBeLessThanOrEqual(text.length);

    // Next token chunk arrives from the model
    text = 'Quantum computing is';
    rerender({ t: text, s: true });

    // Advance time - should continue seamlessly typing single characters
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.length).toBeGreaterThan(midLength);
    expect(text.startsWith(result.current)).toBe(true);

    // Advance enough time to finish full text
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBe('Quantum computing is');
  });

  it('accelerates gracefully for large backlogs to prevent lag accumulation', () => {
    const longText = 'A'.repeat(200);
    const { result } = renderHook(() => useSmoothTypewriter(longText, true));

    // Advance 300ms - large backlog should accelerate and clear in < 500ms
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.length).toBeGreaterThan(30);

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(result.current.length).toBe(200);
  });

  it('properly balances unclosed markdown code fences mid-stream', () => {
    const textWithCode = '```typescript\nconst x = 10;';
    const { result } = renderHook(() => useSmoothTypewriter(textWithCode, true));

    // Fast-forward until part of the code block is typed
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Unclosed fence should be balanced with \n```
    if (result.current.includes('```')) {
      const fences = result.current.match(/```/g);
      expect(fences!.length % 2).toBe(0);
    }
  });

  it('handles empty or null text gracefully', () => {
    const { result } = renderHook(() => useSmoothTypewriter('', true));
    expect(result.current).toBe('');
  });

  it('handles text reset or shortening immediately', () => {
    let text = 'A long piece of text that gets cleared or replaced';
    const { result, rerender } = renderHook(({ t, s }) => useSmoothTypewriter(t, s), {
      initialProps: { t: text, s: true },
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.length).toBeGreaterThan(0);

    // Shorten text
    text = 'Short';
    rerender({ t: text, s: true });

    expect(result.current.length).toBeLessThanOrEqual('Short'.length);
  });
});
