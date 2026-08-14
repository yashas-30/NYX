import { useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ChatMessage } from '@src/infrastructure/types';

/**
 * Wraps @tanstack/react-virtual with dynamic height measurement for chat messages.
 *
 * Uses `measureElement` to record actual rendered heights so the virtualizer can
 * maintain accurate scroll position even with variable-height messages (tool calls,
 * images, reasoning blocks, etc.).
 *
 * @param messages    - The array of messages to virtualize (history + stream message)
 * @param scrollRef   - Ref to the scrollable container div
 * @param overscan    - Number of items to render beyond the visible window (default: 6)
 */
export function useVirtualMessages(
  messages: ChatMessage[],
  scrollRef: React.RefObject<HTMLDivElement | null>,
  overscan = 6
) {
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    // Initial estimate — will be overridden by measureElement for each row
    estimateSize: () => 120,
    overscan,
    // Dynamic measurement: called whenever a row's ref fires or content changes
    measureElement(element) {
      return element?.getBoundingClientRect().height ?? 120;
    },
  });

  /**
   * Scroll to the last message. Use `align: 'end'` so the bottom of the item
   * is visible — mirrors the behaviour of the old scrollHeight approach.
   */
  const scrollToBottom = useCallback(
    (smooth = false) => {
      if (messages.length === 0) return;
      virtualizer.scrollToIndex(messages.length - 1, {
        align: 'end',
        behavior: smooth ? 'smooth' : 'auto',
      });
    },
    [virtualizer, messages.length]
  );

  return { virtualizer, scrollToBottom };
}
