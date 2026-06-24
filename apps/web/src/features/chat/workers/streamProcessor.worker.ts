// streamProcessor.worker.ts
/// <reference lib="webworker" />

let accumulatedText = '';
let accumulatedReasoning = '';
let lastFlushTime = 0;
const FLUSH_INTERVAL_MS = 50;
let hasEmittedFirstChunk = false;
let lastProcessedLength = 0;
let cachedBlocks: string[] = [];

function splitIntoBlocks(text: string): string[] {
  const blocks: string[] = [];
  let inCodeBlock = false;
  let currentBlock: string[] = [];
  
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }
    
    currentBlock.push(line);
    
    // Split by double newline if not in a code block
    if (!inCodeBlock && line.trim() === '' && currentBlock.length > 0) {
      if (currentBlock.some(l => l.trim() !== '')) {
        blocks.push(currentBlock.join('\n'));
      }
      currentBlock = [];
    }
  }
  
  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'));
  }
  
  return blocks;
}

self.onmessage = (event) => {
  const { type, payload } = event.data;

  if (type === 'reset') {
    accumulatedText = '';
    accumulatedReasoning = '';
    lastFlushTime = 0;
    hasEmittedFirstChunk = false;
    self.postMessage({ type: 'reset_done' });
    return;
  }

  if (type === 'sync') {
    const blocks = splitIntoBlocks(accumulatedText);
    self.postMessage({
      type: 'update',
      payload: {
        text: accumulatedText,
        reasoning: accumulatedReasoning,
        blocks: blocks,
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
      const delta = chunk.chunk || '';
      if (delta) {
        accumulatedText += delta;
        hasNewContent = true;
      }
    }

    const now = Date.now();
    if (hasNewContent) {
      if (!hasEmittedFirstChunk) {
        shouldFlush = true;
        lastFlushTime = now;
        hasEmittedFirstChunk = true;
      } else if (
        now - lastFlushTime >= FLUSH_INTERVAL_MS ||
        chunk.type === 'done' ||
        chunk.type === 'finish'
      ) {
        shouldFlush = true;
        lastFlushTime = now;
      }
    }

    if (shouldFlush) {
      const blocks = splitIntoBlocks(accumulatedText);
      self.postMessage({
        type: 'update',
        payload: {
          text: accumulatedText,
          reasoning: accumulatedReasoning,
          blocks: blocks,
          isDone: chunk.type === 'done' || chunk.type === 'finish',
          originalChunk: chunk
        }
      });
    }
  }
};
