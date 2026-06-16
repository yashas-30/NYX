// streamProcessor.worker.ts
/// <reference lib="webworker" />

let accumulatedText = '';
let accumulatedReasoning = '';
let lastFlushTime = 0;
const FLUSH_INTERVAL_MS = 50;

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
      // Don't split if the block only contains empty lines
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
    self.postMessage({ type: 'reset_done' });
    return;
  }

  if (type === 'sync') {
    self.postMessage({
      type: 'update',
      payload: {
        text: accumulatedText,
        reasoning: accumulatedReasoning,
        blocks: splitIntoBlocks(accumulatedText),
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
          blocks: splitIntoBlocks(accumulatedText),
          isDone: chunk.type === 'done' || chunk.type === 'finish',
          originalChunk: chunk
        }
      });
    }
  }
};
