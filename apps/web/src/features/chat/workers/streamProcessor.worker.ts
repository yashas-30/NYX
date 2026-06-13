// streamProcessor.worker.ts
/// <reference lib="webworker" />

let accumulatedText = '';
let accumulatedReasoning = '';
let lastFlushTime = 0;
const FLUSH_INTERVAL_MS = 50;

self.onmessage = (event) => {
  const { type, payload } = event.data;

  if (type === 'reset') {
    accumulatedText = '';
    accumulatedReasoning = '';
    lastFlushTime = 0;
    self.postMessage({ type: 'reset_done' });
    return;
  }

  if (type === 'sync') {
    // Always flush on sync so no text is lost
    self.postMessage({
      type: 'update',
      payload: {
        text: accumulatedText,
        reasoning: accumulatedReasoning,
        isDone: true,
        originalChunk: { type: 'text', content: '' }
      }
    });
    self.postMessage({ type: 'sync_done' });
    return;
  }

  if (type === 'chunk') {
    const chunk = payload;
    let shouldFlush = false;
    let hasNewContent = false;

    if (chunk.type === 'text') {
      const delta = chunk.content || '';
      if (delta) {
        accumulatedText += delta;
        hasNewContent = true;
      }
    } else if (chunk.type === 'thinking' || chunk.type === 'reasoning') {
      const delta = chunk.content || '';
      if (delta) {
        accumulatedReasoning += delta;
        hasNewContent = true;
      }
    } else if (chunk.chunk) {
      // Fallback: handle raw { chunk: "..." } format (server may emit this directly)
      const delta = chunk.chunk || '';
      if (delta) {
        accumulatedText += delta;
        hasNewContent = true;
      }
    }

    const now = Date.now();
    if (
      hasNewContent &&
      (now - lastFlushTime >= FLUSH_INTERVAL_MS ||
        chunk.type === 'done' ||
        chunk.type === 'finish')
    ) {
      shouldFlush = true;
      lastFlushTime = now;
    }

    if (shouldFlush) {
      self.postMessage({
        type: 'update',
        payload: {
          text: accumulatedText,
          reasoning: accumulatedReasoning,
          isDone: chunk.type === 'done' || chunk.type === 'finish',
          originalChunk: chunk
        }
      });
    }
  }
};
